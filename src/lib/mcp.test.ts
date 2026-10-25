import { describe, expect, test } from "bun:test";
import { agentName, setupSnippet } from "./mcp";

const info = { url: "http://127.0.0.1:47822/mcp", token: "secret" };

describe("setupSnippet", () => {
  test("Claude Code gets an mcp add command", () => {
    expect(setupSnippet("claude", info)).toBe(
      'claude mcp add --transport http --scope user klikdesign http://127.0.0.1:47822/mcp --header "Authorization: Bearer secret"',
    );
  });

  test("Codex gets a config.toml table", () => {
    const parsed = Bun.TOML.parse(setupSnippet("codex", info)) as any;
    expect(parsed.mcp_servers.klikdesign).toEqual({ url: info.url, http_headers: { Authorization: "Bearer secret" } });
  });

  test("other clients get mcpServers JSON", () => {
    expect(JSON.parse(setupSnippet("other", info)).mcpServers.klikdesign).toEqual({ url: info.url, headers: { Authorization: "Bearer secret" } });
  });
});

test("agentName", () => {
  expect(agentName("claude-code 2.1.0")).toBe("Claude Code");
  expect(agentName("codex-mcp-client 0.40.0")).toBe("Codex");
  expect(agentName("gemini-cli-mcp-client 1.2")).toBe("gemini-cli-mcp-client");
  expect(agentName(null)).toBe("MCP");
});
