import { expect, test } from "bun:test";
import { numberedPath } from "./export";

test("per-page export files are numbered before the extension", () => {
  expect(numberedPath("/Users/me/Kopi Senja.png", 2)).toBe("/Users/me/Kopi Senja-2.png");
  expect(numberedPath("C:\\out\\poster.v2.jpg", 1)).toBe("C:\\out\\poster.v2-1.jpg");
  expect(numberedPath("/tmp/poster", 3)).toBe("/tmp/poster-3");
  expect(numberedPath("/tmp/my.folder/poster", 1)).toBe("/tmp/my.folder/poster-1");
});
