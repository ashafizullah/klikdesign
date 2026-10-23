import { expect, test } from "bun:test";
import type { El } from "../../types/design";
import { moveLayer } from "./Layers";

// Elements are stored bottom first; the layers list shows them top first.
const els = ["a", "b", "c", "d"].map((id) => ({ id }) as El);
const topFirst = (list: El[]) => [...list].reverse().map((e) => e.id).join("");

test("moves a layer up or down the top-first list", () => {
  expect(topFirst(els)).toBe("dcba");
  expect(topFirst(moveLayer(els, 3, 0))).toBe("adcb"); // bottom layer to the top
  expect(topFirst(moveLayer(els, 0, 4))).toBe("cbad"); // top layer to the bottom
  expect(topFirst(moveLayer(els, 1, 3))).toBe("dbca"); // c down one
  expect(topFirst(moveLayer(els, 2, 1))).toBe("dbca"); // b up one
});
