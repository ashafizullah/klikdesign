import { expect, test } from "bun:test";
import { hashOf } from "./versions";
import { ago } from "../components/dialogs/HistoryDialog";

test("hash is stable and tells designs apart", () => {
  expect(hashOf('{"a":1}')).toBe(hashOf('{"a":1}'));
  expect(hashOf('{"a":1}')).not.toBe(hashOf('{"a":2}'));
});

test("relative time in the app's language", () => {
  const now = Date.UTC(2026, 0, 2, 12);
  expect(ago(now - 5 * 60_000, "en", now)).toBe("5 minutes ago");
  expect(ago(now - 3 * 3600_000, "id", now)).toBe("3 jam yang lalu");
  expect(ago(now - 86400_000, "en", now)).toBe("yesterday");
  expect(ago(now - 10_000, "en", now)).toBe("now");
});
