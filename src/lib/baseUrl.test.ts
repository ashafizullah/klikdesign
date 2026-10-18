import { expect, test } from "bun:test";
import { suggestBaseUrl } from "./baseUrl";

test("suggests the API root for websocket and endpoint URLs", () => {
  expect(suggestBaseUrl("wss://api.x.ai/v1/realtime")).toBe("https://api.x.ai/v1");
  expect(suggestBaseUrl("wss://api.x.ai/v1/realtime?model=grok-voice-latest")).toBe("https://api.x.ai/v1");
  expect(suggestBaseUrl("https://api.openai.com/v1/chat/completions")).toBe("https://api.openai.com/v1");
  expect(suggestBaseUrl("https://api.x.ai/v1/")).toBe("https://api.x.ai/v1");
  expect(suggestBaseUrl("https://api.x.ai/v1")).toBeNull();
  expect(suggestBaseUrl("")).toBeNull();
});
