//! Provider-neutral chat layer. The frontend speaks this format; each
//! provider module translates it to and from its own wire protocol.
pub mod anthropic;
pub mod openai;
pub mod sse;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    /// Wire format: "openai" (OpenAI-compatible) or "anthropic".
    pub format: String,
    /// AI profile whose keychain entry holds the API key.
    pub profile_id: String,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub system: Option<String>,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub tools: Vec<ToolDef>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Message {
    pub role: Role,
    pub content: Vec<Part>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Part {
    Text {
        text: String,
    },
    Image {
        media_type: String,
        data: String,
    },
    ToolCall {
        id: String,
        name: String,
        input: Value,
        /// Provider-specific extras that must be echoed back.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        meta: Option<Value>,
    },
    ToolResult {
        id: String,
        name: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
    /// A provider-native block (e.g. Anthropic thinking) replayed verbatim to the same provider.
    Opaque {
        provider: String,
        block: Value,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatResult {
    pub message: Message,
    /// Normalized: end_turn | tool_use | max_tokens | refusal | <provider value>
    pub stop_reason: String,
}

/// Base URLs must be HTTP(S) roots such as https://api.x.ai/v1, not
/// WebSocket or endpoint URLs.
pub fn validate_base_url(url: Option<&str>) -> AppResult<()> {
    let Some(url) = url.map(str::trim).filter(|u| !u.is_empty()) else { return Ok(()) };
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(AppError::msg(format!("Base URL must start with http:// or https:// (got {url}). For xAI use https://api.x.ai/v1")));
    }
    Ok(())
}

/// Streams a chat completion, calling `on_text` for every text delta.
pub async fn chat(req: &ChatRequest, on_text: &mut (dyn FnMut(&str) + Send)) -> AppResult<ChatResult> {
    validate_base_url(req.base_url.as_deref())?;
    // A stalled stream would otherwise hang the job forever (cancel is only checked between steps).
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .read_timeout(std::time::Duration::from_secs(120))
        .build()?;
    match req.format.as_str() {
        "anthropic" => anthropic::chat(&client, req, on_text).await,
        "openai" => openai::chat(&client, req, on_text).await,
        f => Err(AppError::msg(format!("Unknown API format: {f}"))),
    }
}

/// Fails with the response body when the HTTP status is not 2xx.
pub async fn check_status(resp: reqwest::Response) -> AppResult<reqwest::Response> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v.pointer("/error/message").or_else(|| v.pointer("/0/error/message")).and_then(Value::as_str).map(str::to_string))
        .unwrap_or(body);
    Err(AppError::msg(format!("HTTP {status}: {detail}")))
}

pub fn parse_tool_input(raw: &str) -> Value {
    if raw.trim().is_empty() {
        return Value::Object(Default::default());
    }
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({ "__invalid_json": raw }))
}

/// Appends text to the last Text part, or starts a new one.
pub fn push_text(parts: &mut Vec<Part>, delta: &str) {
    if let Some(Part::Text { text }) = parts.last_mut() {
        text.push_str(delta);
    } else {
        parts.push(Part::Text { text: delta.to_string() });
    }
}

#[cfg(test)]
mod tests {
    use super::validate_base_url;

    #[test]
    fn rejects_websocket_base_urls() {
        assert!(validate_base_url(Some("https://api.x.ai/v1")).is_ok());
        assert!(validate_base_url(Some("http://localhost:11434/v1")).is_ok());
        assert!(validate_base_url(None).is_ok());
        let err = validate_base_url(Some("wss://api.x.ai/v1/realtime")).unwrap_err().to_string();
        assert!(err.contains("https://api.x.ai/v1"));
    }
}
