//! Minimal Server-Sent Events parser working on raw bytes so multi-byte
//! UTF-8 sequences split across network chunks decode correctly.
use crate::error::AppResult;
use futures::StreamExt;

#[derive(Debug, Default, PartialEq)]
pub struct SseEvent {
    pub event: Option<String>,
    pub data: String,
}

#[derive(Default)]
pub struct SseParser {
    buf: Vec<u8>,
}

impl SseParser {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<SseEvent> {
        self.buf.extend(chunk.iter().filter(|b| **b != b'\r'));
        let mut out = Vec::new();
        while let Some(pos) = self.buf.windows(2).position(|w| w == b"\n\n") {
            let block: Vec<u8> = self.buf.drain(..pos + 2).collect();
            if let Some(ev) = parse_block(&String::from_utf8_lossy(&block)) {
                out.push(ev);
            }
        }
        out
    }

    pub fn finish(&mut self) -> Option<SseEvent> {
        let rest = std::mem::take(&mut self.buf);
        parse_block(&String::from_utf8_lossy(&rest))
    }
}

fn parse_block(block: &str) -> Option<SseEvent> {
    let mut ev = SseEvent::default();
    let mut data_lines = Vec::new();
    for line in block.lines() {
        if let Some(v) = line.strip_prefix("event:") {
            ev.event = Some(v.trim_start().to_string());
        } else if let Some(v) = line.strip_prefix("data:") {
            data_lines.push(v.strip_prefix(' ').unwrap_or(v));
        }
    }
    if data_lines.is_empty() {
        return None;
    }
    ev.data = data_lines.join("\n");
    Some(ev)
}

/// Feeds every SSE event of a response body to `f`.
pub async fn for_each_event(resp: reqwest::Response, mut f: impl FnMut(SseEvent) -> AppResult<()>) -> AppResult<()> {
    let mut parser = SseParser::default();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        for ev in parser.push(&chunk?) {
            f(ev)?;
        }
    }
    if let Some(ev) = parser.finish() {
        f(ev)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_split_chunks_and_crlf() {
        let mut p = SseParser::default();
        assert!(p.push(b"event: a\r\ndata: {\"x\":").is_empty());
        let evs = p.push(b"1}\r\n\r\ndata: two\n\n");
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0].event.as_deref(), Some("a"));
        assert_eq!(evs[0].data, "{\"x\":1}");
        assert_eq!(evs[1].data, "two");
    }

    #[test]
    fn keeps_utf8_split_across_chunks() {
        let s = "data: héllo\n\n".as_bytes();
        let mut p = SseParser::default();
        assert!(p.push(&s[..8]).is_empty());
        assert_eq!(p.push(&s[8..])[0].data, "héllo");
    }

    #[test]
    fn ignores_comments_and_flushes_tail() {
        let mut p = SseParser::default();
        assert!(p.push(b": ping\n\n").is_empty());
        p.push(b"data: [DONE]");
        assert_eq!(p.finish().unwrap().data, "[DONE]");
    }
}
