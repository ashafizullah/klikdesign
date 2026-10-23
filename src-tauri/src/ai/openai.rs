//! OpenAI Chat Completions and compatible APIs (OpenRouter, Ollama, LM Studio, Groq...).
use super::{ChatRequest, ChatResult, Message, ModelsRequest, Part, Role, check_status, parse_tool_input, push_text, sse};
use crate::error::{AppError, AppResult};
use crate::keys;
use serde_json::{Value, json};

pub const DEFAULT_BASE: &str = "https://api.openai.com/v1";

/// Base URL for an OpenAI-compatible request.
pub fn base_url(configured: Option<&str>) -> &str {
    configured.filter(|b| !b.trim().is_empty()).unwrap_or(DEFAULT_BASE).trim_end_matches('/')
}

pub fn build_body(req: &ChatRequest) -> Value {
    let mut messages = Vec::new();
    if let Some(system) = req.system.as_deref().filter(|s| !s.is_empty()) {
        messages.push(json!({ "role": "system", "content": system }));
    }
    for m in &req.messages {
        push_wire(&mut messages, m);
    }
    let mut body = json!({ "model": req.model, "stream": true, "messages": messages });
    if !req.tools.is_empty() {
        body["tools"] = req
            .tools
            .iter()
            .map(|t| {
                json!({
                    "type": "function",
                    "function": { "name": t.name, "description": t.description, "parameters": t.parameters },
                })
            })
            .collect();
    }
    if let Some(max) = req.max_tokens {
        body["max_completion_tokens"] = json!(max);
    }
    if let Some(effort) = req.effort() {
        body["reasoning_effort"] = json!(effort);
    }
    body
}

fn push_wire(out: &mut Vec<Value>, m: &Message) {
    match m.role {
        Role::User => {
            // Tool results become `tool` messages that must directly follow the assistant turn.
            for p in &m.content {
                if let Part::ToolResult { id, content, is_error, .. } = p {
                    let content = if *is_error { format!("ERROR: {content}") } else { content.clone() };
                    out.push(json!({ "role": "tool", "tool_call_id": id, "content": content }));
                }
            }
            let mut parts = Vec::new();
            for p in &m.content {
                match p {
                    Part::Text { text } if !text.is_empty() => parts.push(json!({ "type": "text", "text": text })),
                    Part::Image { media_type, data } => parts.push(json!({
                        "type": "image_url",
                        "image_url": { "url": format!("data:{media_type};base64,{data}") },
                    })),
                    _ => {}
                }
            }
            if parts.is_empty() {
                return;
            }
            let only_text = parts.iter().all(|p| p["type"] == "text");
            let content = if only_text {
                json!(parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("\n"))
            } else {
                json!(parts)
            };
            out.push(json!({ "role": "user", "content": content }));
        }
        Role::Assistant => {
            let text: String =
                m.content.iter().filter_map(|p| if let Part::Text { text } = p { Some(text.as_str()) } else { None }).collect();
            let calls: Vec<Value> = m
                .content
                .iter()
                .filter_map(|p| match p {
                    Part::ToolCall { id, name, input, .. } => Some(json!({
                        "id": id,
                        "type": "function",
                        "function": { "name": name, "arguments": input.to_string() },
                    })),
                    _ => None,
                })
                .collect();
            let mut msg = json!({ "role": "assistant", "content": if text.is_empty() { Value::Null } else { json!(text) } });
            if !calls.is_empty() {
                msg["tool_calls"] = json!(calls);
            }
            out.push(msg);
        }
    }
}

#[derive(Default)]
pub struct StreamState {
    parts: Vec<Part>,
    calls: Vec<(u64, String, String, String)>, // index, id, name, arguments
    finish: Option<String>,
}

impl StreamState {
    pub fn handle(&mut self, data: &Value) -> AppResult<Option<String>> {
        if let Some(err) = data.get("error") {
            let msg = err["message"].as_str().unwrap_or("stream error");
            return Err(AppError::msg(msg.to_string()));
        }
        let Some(choice) = data["choices"].get(0) else { return Ok(None) };
        if let Some(f) = choice["finish_reason"].as_str() {
            self.finish = Some(f.to_string());
        }
        let delta = &choice["delta"];
        for tc in delta["tool_calls"].as_array().into_iter().flatten() {
            let index = tc["index"].as_u64().unwrap_or(self.calls.len() as u64);
            let pos = match self.calls.iter().position(|c| c.0 == index) {
                Some(p) => p,
                None => {
                    self.calls.push((index, String::new(), String::new(), String::new()));
                    self.calls.len() - 1
                }
            };
            let call = &mut self.calls[pos];
            if let Some(id) = tc["id"].as_str() {
                call.1 = id.to_string();
            }
            if let Some(name) = tc["function"]["name"].as_str() {
                call.2.push_str(name);
            }
            if let Some(args) = tc["function"]["arguments"].as_str() {
                call.3.push_str(args);
            }
        }
        match delta["content"].as_str() {
            Some(t) if !t.is_empty() => {
                push_text(&mut self.parts, t);
                Ok(Some(t.to_string()))
            }
            _ => Ok(None),
        }
    }

    pub fn finish(mut self) -> ChatResult {
        let has_calls = !self.calls.is_empty();
        for (i, (_, id, name, args)) in self.calls.into_iter().enumerate() {
            let id = if id.is_empty() { format!("call_{i}_{}", uuid::Uuid::new_v4().simple()) } else { id };
            self.parts.push(Part::ToolCall { id, name, input: parse_tool_input(&args), meta: None });
        }
        let stop_reason = match self.finish.as_deref() {
            _ if has_calls => "tool_use".to_string(),
            Some("stop") | None => "end_turn".to_string(),
            Some("length") => "max_tokens".to_string(),
            Some("content_filter") => "refusal".to_string(),
            Some(other) => other.to_string(),
        };
        ChatResult { message: Message { role: Role::Assistant, content: self.parts }, stop_reason }
    }
}

pub async fn chat(client: &reqwest::Client, req: &ChatRequest, on_text: &mut (dyn FnMut(&str) + Send)) -> AppResult<ChatResult> {
    // Local servers (Ollama, LM Studio) usually need no key.
    let mut http = client
        .post(format!("{}/chat/completions", base_url(req.base_url.as_deref())))
        .header("X-Title", "KlikDesign")
        .json(&build_body(req));
    if let Some(key) = keys::get(&req.profile_id)? {
        http = http.bearer_auth(key);
    }
    let resp = check_status(http.send().await?).await?;
    let mut state = StreamState::default();
    sse::for_each_event(resp, |ev| {
        if ev.data.trim() == "[DONE]" {
            return Ok(());
        }
        let data: Value = serde_json::from_str(&ev.data)?;
        if let Some(t) = state.handle(&data)? {
            on_text(&t);
        }
        Ok(())
    })
    .await?;
    Ok(state.finish())
}

/// Model ids from GET /models, sorted.
pub async fn models(client: &reqwest::Client, req: &ModelsRequest) -> AppResult<Vec<String>> {
    let mut http = client.get(format!("{}/models", base_url(req.base_url.as_deref()))).header("X-Title", "KlikDesign");
    if let Some(key) = keys::get(&req.profile_id)? {
        http = http.bearer_auth(key);
    }
    let body: Value = check_status(http.send().await?).await?.json().await?;
    Ok(parse_models(&body))
}

fn parse_models(body: &Value) -> Vec<String> {
    let mut ids: Vec<String> = body["data"]
        .as_array()
        .into_iter()
        .flatten()
        // Gemini reports "models/gemini-2.5-pro"; chat expects the bare id.
        .filter_map(|m| m["id"].as_str().map(|id| id.strip_prefix("models/").unwrap_or(id).to_string()))
        .collect();
    ids.sort();
    ids.dedup();
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_model_lists() {
        let body = json!({ "object": "list", "data": [{ "id": "gpt-5" }, { "id": "models/gemini-2.5-pro" }, { "id": "gpt-5" }, { "object": "model" }] });
        assert_eq!(parse_models(&body), vec!["gemini-2.5-pro", "gpt-5"]);
        assert!(parse_models(&json!({ "error": "nope" })).is_empty());
    }

    #[test]
    fn merges_tool_call_fragments() {
        let mut s = StreamState::default();
        for e in [
            json!({"choices":[{"delta":{"content":"Ok"}}]}),
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"split_clip","arguments":"{\"at\""}}]}}]}),
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":2}"}}]}}]}),
            json!({"choices":[{"delta":{},"finish_reason":"tool_calls"}]}),
        ] {
            s.handle(&e).unwrap();
        }
        let r = s.finish();
        assert_eq!(r.stop_reason, "tool_use");
        assert!(matches!(&r.message.content[1], Part::ToolCall { id, input, .. } if id == "c1" && input["at"] == 2));
    }

    #[test]
    fn tool_results_become_tool_messages() {
        let mut out = Vec::new();
        push_wire(
            &mut out,
            &Message {
                role: Role::User,
                content: vec![Part::ToolResult { id: "c1".into(), name: "x".into(), content: "done".into(), is_error: false }],
            },
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0]["role"], "tool");
        assert_eq!(out[0]["tool_call_id"], "c1");
    }
}
