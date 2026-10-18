//! Anthropic Messages API (raw HTTP, streaming).
use super::{ChatRequest, ChatResult, Message, Part, Role, check_status, parse_tool_input, push_text, sse};
use crate::error::{AppError, AppResult};
use crate::keys;
use serde_json::{Map, Value, json};

const DEFAULT_BASE: &str = "https://api.anthropic.com";
/// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS: [&str; 4] = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

fn first_party(req: &ChatRequest) -> bool {
    req.base_url.as_deref().is_none_or(|b| b.trim().is_empty() || b.contains("api.anthropic.com"))
}

pub fn build_body(req: &ChatRequest) -> Value {
    let mut body = json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(64000),
        "stream": true,
        "messages": req.messages.iter().map(to_wire).collect::<Vec<_>>(),
    });
    if let Some(system) = req.system.as_deref().filter(|s| !s.is_empty()) {
        body["system"] = json!(system);
    }
    if !req.tools.is_empty() {
        body["tools"] = req
            .tools
            .iter()
            .map(|t| {
                json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.parameters,
                    "eager_input_streaming": true,
                })
            })
            .collect();
    }
    if first_party(req) && FALLBACK_MODELS.contains(&req.model.as_str()) {
        body["fallbacks"] = json!("default");
    }
    body
}

fn to_wire(m: &Message) -> Value {
    let mut blocks: Vec<Value> = Vec::new();
    // Tool results must lead a user turn.
    if m.role == Role::User {
        for p in &m.content {
            if let Part::ToolResult { id, content, is_error, .. } = p {
                blocks.push(json!({ "type": "tool_result", "tool_use_id": id, "content": content, "is_error": is_error }));
            }
        }
    }
    for p in &m.content {
        match p {
            Part::Text { text } if !text.is_empty() => blocks.push(json!({ "type": "text", "text": text })),
            Part::Image { media_type, data } => blocks.push(json!({
                "type": "image",
                "source": { "type": "base64", "media_type": media_type, "data": data },
            })),
            Part::ToolCall { id, name, input, .. } => blocks.push(json!({ "type": "tool_use", "id": id, "name": name, "input": input })),
            Part::Opaque { provider, block } if provider == "anthropic" => blocks.push(block.clone()),
            _ => {}
        }
    }
    let role = if m.role == Role::User { "user" } else { "assistant" };
    json!({ "role": role, "content": blocks })
}

enum Block {
    Text(String),
    Tool { id: String, name: String, json: String },
    Other(Value),
}

#[derive(Default)]
pub struct StreamState {
    blocks: Vec<(u64, Block)>,
    stop_reason: Option<String>,
}

impl StreamState {
    fn block(&mut self, index: u64) -> Option<&mut Block> {
        self.blocks.iter_mut().find(|(i, _)| *i == index).map(|(_, b)| b)
    }

    /// Applies one SSE payload; returns a text delta to surface, if any.
    pub fn handle(&mut self, data: &Value) -> AppResult<Option<String>> {
        let index = data["index"].as_u64().unwrap_or(0);
        match data["type"].as_str().unwrap_or("") {
            "content_block_start" => {
                let cb = &data["content_block"];
                let block = match cb["type"].as_str() {
                    Some("text") => Block::Text(cb["text"].as_str().unwrap_or("").to_string()),
                    Some("tool_use") => Block::Tool {
                        id: cb["id"].as_str().unwrap_or("").to_string(),
                        name: cb["name"].as_str().unwrap_or("").to_string(),
                        json: String::new(),
                    },
                    _ => Block::Other(cb.clone()),
                };
                self.blocks.push((index, block));
            }
            "content_block_delta" => {
                let d = &data["delta"];
                match (d["type"].as_str().unwrap_or(""), self.block(index)) {
                    ("text_delta", Some(Block::Text(t))) => {
                        let s = d["text"].as_str().unwrap_or("");
                        t.push_str(s);
                        return Ok(Some(s.to_string()));
                    }
                    ("input_json_delta", Some(Block::Tool { json, .. })) => json.push_str(d["partial_json"].as_str().unwrap_or("")),
                    ("thinking_delta", Some(Block::Other(b))) => append_str(b, "thinking", &d["thinking"]),
                    ("signature_delta", Some(Block::Other(b))) => append_str(b, "signature", &d["signature"]),
                    _ => {}
                }
            }
            "message_delta" => {
                if let Some(r) = data["delta"]["stop_reason"].as_str() {
                    self.stop_reason = Some(r.to_string());
                }
            }
            "error" => {
                let msg = data["error"]["message"].as_str().unwrap_or("stream error");
                return Err(AppError::msg(format!("Anthropic: {msg}")));
            }
            _ => {}
        }
        Ok(None)
    }

    pub fn finish(self) -> ChatResult {
        // After a mid-output fallback only text from before the last fallback
        // marker may be echoed back; the marker itself is dropped.
        let last_fallback = self.blocks.iter().rposition(|(_, b)| matches!(b, Block::Other(v) if v["type"] == "fallback"));
        let mut parts = Vec::new();
        for (pos, (_, block)) in self.blocks.into_iter().enumerate() {
            let before_boundary = last_fallback.is_some_and(|f| pos <= f);
            match block {
                Block::Text(t) => {
                    if !t.is_empty() {
                        push_text(&mut parts, &t)
                    }
                }
                _ if before_boundary => {}
                Block::Tool { id, name, json } => parts.push(Part::ToolCall { id, name, input: parse_tool_input(&json), meta: None }),
                Block::Other(block) => parts.push(Part::Opaque { provider: "anthropic".into(), block }),
            }
        }
        ChatResult {
            message: Message { role: Role::Assistant, content: parts },
            stop_reason: self.stop_reason.unwrap_or_else(|| "end_turn".into()),
        }
    }
}

fn append_str(block: &mut Value, key: &str, delta: &Value) {
    let add = delta.as_str().unwrap_or("");
    if let Some(obj) = block.as_object_mut() {
        let cur = obj.get(key).and_then(Value::as_str).unwrap_or("").to_string();
        obj.insert(key.to_string(), Value::String(cur + add));
    } else {
        *block = Value::Object(Map::new());
    }
}

pub async fn chat(client: &reqwest::Client, req: &ChatRequest, on_text: &mut (dyn FnMut(&str) + Send)) -> AppResult<ChatResult> {
    let key = keys::require(&req.profile_id)?;
    let base = req.base_url.as_deref().filter(|b| !b.trim().is_empty()).unwrap_or(DEFAULT_BASE);
    let body = build_body(req);
    let mut http = client
        .post(format!("{}/v1/messages", base.trim_end_matches('/')))
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body);
    if body.get("fallbacks").is_some() {
        http = http.header("anthropic-beta", "server-side-fallback-2026-07-01");
    }
    let resp = check_status(http.send().await?).await?;
    let mut state = StreamState::default();
    sse::for_each_event(resp, |ev| {
        let data: Value = serde_json::from_str(&ev.data)?;
        if let Some(t) = state.handle(&data)? {
            on_text(&t);
        }
        Ok(())
    })
    .await?;
    Ok(state.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(events: &[Value]) -> ChatResult {
        let mut s = StreamState::default();
        for e in events {
            s.handle(e).unwrap();
        }
        s.finish()
    }

    #[test]
    fn accumulates_text_tools_and_thinking() {
        let r = feed(&[
            json!({"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig"}}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hai"}}),
            json!({"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"t1","name":"add_text","input":{}}}),
            json!({"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"text\":"}}),
            json!({"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"\"x\"}"}}),
            json!({"type":"message_delta","delta":{"stop_reason":"tool_use"}}),
        ]);
        assert_eq!(r.stop_reason, "tool_use");
        assert!(matches!(&r.message.content[0], Part::Opaque { block, .. } if block["signature"] == "sig"));
        assert!(matches!(&r.message.content[1], Part::Text { text } if text == "Hai"));
        assert!(matches!(&r.message.content[2], Part::ToolCall { input, .. } if input["text"] == "x"));
    }

    #[test]
    fn drops_non_text_before_fallback_boundary() {
        let r = feed(&[
            json!({"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"text","text":"a"}}),
            json!({"type":"content_block_start","index":2,"content_block":{"type":"fallback","from":{},"to":{}}}),
            json!({"type":"content_block_start","index":3,"content_block":{"type":"text","text":"b"}}),
        ]);
        assert_eq!(r.message.content.len(), 1);
        assert!(matches!(&r.message.content[0], Part::Text { text } if text == "ab"));
    }

    #[test]
    fn body_puts_tool_results_first_and_enables_fallbacks() {
        let req = ChatRequest {
            format: "anthropic".into(),
            profile_id: "p1".into(),
            model: "claude-opus-5-5".into(),
            base_url: None,
            system: Some("sys".into()),
            messages: vec![Message {
                role: Role::User,
                content: vec![
                    Part::Text { text: "lanjut".into() },
                    Part::ToolResult { id: "t1".into(), name: "x".into(), content: "ok".into(), is_error: false },
                ],
            }],
            tools: vec![],
            max_tokens: None,
        };
        let b = build_body(&req);
        assert_eq!(b["messages"][0]["content"][0]["type"], "tool_result");
        assert_eq!(b["fallbacks"], "default");
        assert_eq!(b["system"], "sys");
    }
}
