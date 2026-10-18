import { expect, test } from "bun:test";
import { changelog } from "./updater";

test("update notes keep the changelog before the download section", () => {
  expect(changelog("\n- Thumbnails\n- Batch delete\n\n## Download\n\n**macOS**: run install.sh")).toBe("- Thumbnails\n- Batch delete");
  expect(changelog("## Download\n\nget it")).toBe("");
  expect(changelog(undefined)).toBe("");
});
