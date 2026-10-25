//! Local MCP server (Streamable HTTP, JSON responses) that lets the user's own
//! coding agent (Claude Code, Codex or any MCP client) edit the open design.
//! The user adds it to their agent themselves; this server only answers tool calls. Tool definitions and their
//! execution live in the frontend: each call is relayed over a channel and
//! answered with `mcp_reply`.
use crate::error::AppResult;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio::sync::oneshot;

/// Preferred port, so the server the user added keeps working across restarts.
const PORT: u16 = 47822;
/// Long calls (large exports) get plenty of time.
const CALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const PROTOCOLS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
/// A client that made a request this recently still counts as connected without an open stream.
const RECENT: Duration = Duration::from_secs(90);
const KEEPALIVE: Duration = Duration::from_secs(15);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpCall {
    id: u64,
    name: String,
    arguments: Value,
}

/// Whether a client (the user's agent) is talking to the server.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpLink {
    running: bool,
    connected: bool,
    /// `clientInfo` from the last initialize, e.g. "claude-code 2.1.0".
    client: Option<String>,
    /// Seconds since the last request.
    idle_secs: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    url: String,
    token: String,
}

struct Inner {
    token: String,
    tools: Mutex<Value>,
    instructions: Mutex<String>,
    bridge: Mutex<Option<Channel<McpCall>>>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
    /// Open GET streams; agents such as Claude Code keep one open for as long as their session runs.
    streams: AtomicUsize,
    last_seen: Mutex<Option<Instant>>,
    client: Mutex<Option<String>>,
}

/// Counts an open stream until the client hangs up.
struct StreamGuard(Arc<Inner>);

impl Drop for StreamGuard {
    fn drop(&mut self) {
        self.0.streams.fetch_sub(1, Ordering::Relaxed);
        *self.0.last_seen.lock().unwrap() = Some(Instant::now());
    }
}

pub struct Mcp {
    inner: Arc<Inner>,
    running: Mutex<Option<(u16, oneshot::Sender<()>)>>,
}

/// Secret shared with the agent; kept in the app data folder so the added server survives restarts.
fn load_token(dir: &PathBuf) -> String {
    let path = dir.join("mcp-token");
    if let Ok(t) = std::fs::read_to_string(&path) {
        let t = t.trim().to_string();
        if t.len() >= 32 {
            return t;
        }
    }
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(&path, &token);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    token
}

impl Mcp {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            inner: Arc::new(Inner {
                token: load_token(&dir),
                tools: Mutex::new(json!([])),
                instructions: Mutex::new(String::new()),
                bridge: Mutex::new(None),
                pending: Mutex::new(HashMap::new()),
                next_id: AtomicU64::new(1),
                streams: AtomicUsize::new(0),
                last_seen: Mutex::new(None),
                client: Mutex::new(None),
            }),
            running: Mutex::new(None),
        }
    }

    fn info(&self, port: u16) -> McpInfo {
        McpInfo { url: format!("http://127.0.0.1:{port}/mcp"), token: self.inner.token.clone() }
    }

    pub fn status(&self) -> Option<McpInfo> {
        self.running.lock().unwrap().as_ref().map(|(port, _)| self.info(*port))
    }

    pub fn link(&self) -> McpLink {
        let running = self.running.lock().unwrap().is_some();
        let idle = self.inner.last_seen.lock().unwrap().map(|t| t.elapsed());
        let streaming = self.inner.streams.load(Ordering::Relaxed) > 0;
        McpLink {
            running,
            connected: running && (streaming || idle.is_some_and(|d| d < RECENT)),
            client: self.inner.client.lock().unwrap().clone(),
            idle_secs: idle.map(|d| d.as_secs()),
        }
    }

    /// Starts the server (or just refreshes the tools and bridge when it already runs).
    pub async fn start(&self, tools: Value, instructions: String, on_call: Channel<McpCall>) -> AppResult<McpInfo> {
        *self.inner.tools.lock().unwrap() = tools;
        *self.inner.instructions.lock().unwrap() = instructions;
        *self.inner.bridge.lock().unwrap() = Some(on_call);
        if let Some(info) = self.status() {
            return Ok(info);
        }
        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
            Ok(l) => l,
            Err(_) => tokio::net::TcpListener::bind(("127.0.0.1", 0)).await?,
        };
        let port = listener.local_addr()?.port();
        let (stop, stopped) = oneshot::channel::<()>();
        let app = Router::new().route("/mcp", post(handle).get(stream).delete(not_allowed)).with_state(self.inner.clone());
        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await;
        });
        *self.running.lock().unwrap() = Some((port, stop));
        Ok(self.info(port))
    }

    pub fn stop(&self) {
        if let Some((_, stop)) = self.running.lock().unwrap().take() {
            let _ = stop.send(());
        }
        *self.inner.bridge.lock().unwrap() = None;
        *self.inner.last_seen.lock().unwrap() = None;
        // Dropping the senders fails the calls still waiting.
        self.inner.pending.lock().unwrap().clear();
    }

    pub fn reply(&self, id: u64, result: Value) {
        if let Some(tx) = self.inner.pending.lock().unwrap().remove(&id) {
            let _ = tx.send(result);
        }
    }
}

async fn not_allowed() -> StatusCode {
    StatusCode::METHOD_NOT_ALLOWED
}

fn same_secret(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Only local, non-browser clients (or pages on localhost) may call in.
fn local_origin(headers: &HeaderMap) -> bool {
    match headers.get(header::ORIGIN).and_then(|o| o.to_str().ok()) {
        None => true,
        Some(o) => ["http://127.0.0.1", "http://localhost"].iter().any(|p| o == *p || o.starts_with(&format!("{p}:"))),
    }
}

/// Rejects foreign origins and wrong tokens; records the client as seen otherwise.
fn authorize(inner: &Inner, headers: &HeaderMap) -> Result<(), (StatusCode, &'static str)> {
    if !local_origin(headers) {
        return Err((StatusCode::FORBIDDEN, "Forbidden origin"));
    }
    let auth = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).unwrap_or("");
    let given = auth.strip_prefix("Bearer ").unwrap_or("");
    if !same_secret(given.as_bytes(), inner.token.as_bytes()) {
        return Err((StatusCode::UNAUTHORIZED, "Invalid KlikDesign MCP token"));
    }
    *inner.last_seen.lock().unwrap() = Some(Instant::now());
    Ok(())
}

/// Server-to-client SSE stream. KlikDesign sends nothing on it but keepalives;
/// it is how the app knows the agent is still connected.
async fn stream(State(inner): State<Arc<Inner>>, headers: HeaderMap) -> Response {
    if let Err(r) = authorize(&inner, &headers) {
        return r.into_response();
    }
    inner.streams.fetch_add(1, Ordering::Relaxed);
    let guard = StreamGuard(inner);
    let ticks = futures::stream::unfold(guard, |guard| async move {
        tokio::time::sleep(KEEPALIVE).await;
        Some((Ok::<_, std::convert::Infallible>(Bytes::from_static(b": keepalive\n\n")), guard))
    });
    let first = futures::stream::once(async { Ok(Bytes::from_static(b": connected\n\n")) });
    (
        [(header::CONTENT_TYPE, "text/event-stream"), (header::CACHE_CONTROL, "no-cache")],
        axum::body::Body::from_stream(futures::StreamExt::chain(first, ticks)),
    )
        .into_response()
}

async fn handle(State(inner): State<Arc<Inner>>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(r) = authorize(&inner, &headers) {
        return r.into_response();
    }
    let Ok(msg) = serde_json::from_slice::<Value>(&body) else {
        return axum::Json(rpc_error(Value::Null, -32700, "Parse error")).into_response();
    };
    let out = match msg {
        Value::Array(batch) => {
            let mut replies = Vec::new();
            for m in batch {
                if let Some(r) = dispatch(&inner, m).await {
                    replies.push(r);
                }
            }
            (!replies.is_empty()).then_some(Value::Array(replies))
        }
        m => dispatch(&inner, m).await,
    };
    match out {
        Some(v) => axum::Json(v).into_response(),
        // Notifications and client responses.
        None => StatusCode::ACCEPTED.into_response(),
    }
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn tool_error(text: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": true })
}

async fn dispatch(inner: &Arc<Inner>, msg: Value) -> Option<Value> {
    let method = msg.get("method")?.as_str()?.to_string();
    let id = msg.get("id").cloned()?;
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    let result = match method.as_str() {
        "initialize" => {
            let info = params.get("clientInfo");
            let name = info.and_then(|c| c.get("name")).and_then(Value::as_str);
            let version = info.and_then(|c| c.get("version")).and_then(Value::as_str);
            *inner.client.lock().unwrap() = name.map(|n| version.map_or(n.to_string(), |v| format!("{n} {v}")));
            let asked = params.get("protocolVersion").and_then(Value::as_str).unwrap_or("");
            let version = if PROTOCOLS.contains(&asked) { asked } else { PROTOCOLS[0] };
            json!({
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "klikdesign", "title": "KlikDesign", "version": env!("CARGO_PKG_VERSION") },
                "instructions": *inner.instructions.lock().unwrap(),
            })
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": *inner.tools.lock().unwrap() }),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
            let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            call_tool(inner, name, arguments).await
        }
        _ => return Some(rpc_error(id, -32601, &format!("Method not found: {method}"))),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

async fn call_tool(inner: &Arc<Inner>, name: String, arguments: Value) -> Value {
    let id = inner.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    inner.pending.lock().unwrap().insert(id, tx);
    let sent = inner.bridge.lock().unwrap().as_ref().is_some_and(|ch| ch.send(McpCall { id, name, arguments }).is_ok());
    if !sent {
        inner.pending.lock().unwrap().remove(&id);
        return tool_error("KlikDesign is not ready. Open the KlikDesign app and try again.");
    }
    match tokio::time::timeout(CALL_TIMEOUT, rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => tool_error("KlikDesign stopped the MCP server before the call finished."),
        Err(_) => {
            inner.pending.lock().unwrap().remove(&id);
            tool_error("The call timed out in KlikDesign.")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::ipc::InvokeResponseBody;

    async fn post(info: &McpInfo, token: &str, body: Value) -> (u16, Value) {
        let res = reqwest::Client::new().post(&info.url).bearer_auth(token).json(&body).send().await.unwrap();
        let status = res.status().as_u16();
        (status, res.json().await.unwrap_or(Value::Null))
    }

    #[tokio::test]
    async fn speaks_mcp_over_http_and_relays_tool_calls() {
        let dir = std::env::temp_dir().join(format!("klikdesign-mcp-test-{}", uuid::Uuid::new_v4().simple()));
        let mcp = Arc::new(Mcp::new(dir.clone()));
        let relay = mcp.clone();
        // Stands in for the frontend: echoes the tool name back.
        let channel = Channel::new(move |body| {
            let InvokeResponseBody::Json(s) = body else { return Ok(()) };
            let call: Value = serde_json::from_str(&s).unwrap();
            let text = format!("ran {}", call["name"].as_str().unwrap());
            relay.reply(call["id"].as_u64().unwrap(), json!({ "content": [{ "type": "text", "text": text }] }));
            Ok(())
        });
        let tools = json!([{ "name": "get_storyboard", "description": "d", "inputSchema": { "type": "object" } }]);
        let info = mcp.start(tools, "hello".into(), channel).await.unwrap();
        let token = info.token.clone();

        let (status, _) = post(&info, "wrong", json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" })).await;
        assert_eq!(status, 401);

        assert!(!mcp.link().connected);
        let (_, init) = post(&info, &token, json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-03-26", "clientInfo": { "name": "claude-code", "version": "2.1.0" } } })).await;
        assert!(mcp.link().connected);
        assert_eq!(mcp.link().client.as_deref(), Some("claude-code 2.1.0"));
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(init["result"]["instructions"], "hello");

        let (status, _) = post(&info, &token, json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).await;
        assert_eq!(status, 202);

        let (_, list) = post(&info, &token, json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).await;
        assert_eq!(list["result"]["tools"][0]["name"], "get_storyboard");

        let (_, call) = post(
            &info,
            &token,
            json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "get_storyboard", "arguments": {} } }),
        )
        .await;
        assert_eq!(call["result"]["content"][0]["text"], "ran get_storyboard");

        let (_, unknown) = post(&info, &token, json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" })).await;
        assert_eq!(unknown["error"]["code"], -32601);

        let foreign = reqwest::Client::new()
            .post(&info.url)
            .bearer_auth(&token)
            .header("Origin", "https://evil.example")
            .json(&json!({}))
            .send()
            .await
            .unwrap();
        assert_eq!(foreign.status().as_u16(), 403);

        let mut sse = reqwest::Client::new().get(&info.url).bearer_auth(&token).send().await.unwrap();
        assert_eq!(sse.headers()["content-type"], "text/event-stream");
        assert!(sse.chunk().await.unwrap().is_some());
        assert_eq!(mcp.inner.streams.load(Ordering::Relaxed), 1);
        drop(sse);
        tokio::time::sleep(Duration::from_millis(100)).await;
        // Closing is noticed at the next keepalive write at the latest.

        // The token survives a restart.
        assert_eq!(Mcp::new(dir.clone()).inner.token, token);
        mcp.stop();
        assert!(mcp.status().is_none());
        let _ = std::fs::remove_dir_all(dir);
    }
}
