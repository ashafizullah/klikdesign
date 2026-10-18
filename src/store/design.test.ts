import { expect, test } from "bun:test";
import { normalizeDesign, reorder, useDesign, asOneStep } from "./design";
import type { El } from "../types/design";

test("normalizeDesign drops broken elements and fills defaults", () => {
  const d = normalizeDesign({ width: 500.4, elements: [{ type: "text", text: "a" }, { type: "bogus" }, { type: "image" }, { type: "shape", shape: "hexagon", fill: { kind: "linear", colors: ["#fff"] } }] as never });
  expect(d.width).toBe(500);
  expect(d.elements.map((e) => e.type)).toEqual(["text", "shape"]);
  const shape = d.elements[1];
  expect(shape.type === "shape" && shape.shape).toBe("rect");
  expect(shape.type === "shape" && shape.fill).toBe("#fff");
  expect(d.elements[0].id).toBeTruthy();
});

test("normalizeDesign rejects unsafe colors", () => {
  const d = normalizeDesign({ background: "url(javascript:x)" as never, elements: [] });
  expect(d.background).toBe("#ffffff");
});

const els = (...ids: string[]) => ids.map((id) => ({ id }) as El);
const order = (list: El[]) => list.map((e) => e.id).join("");

test("reorder moves selections and keeps their order", () => {
  const list = els("a", "b", "c", "d");
  expect(order(reorder(list, ["a", "c"], "front"))).toBe("bdac");
  expect(order(reorder(list, ["b", "d"], "back"))).toBe("bdac");
  expect(order(reorder(list, ["b"], "forward"))).toBe("acbd");
  expect(order(reorder(list, ["c", "d"], "forward"))).toBe("abcd");
  expect(order(reorder(list, ["b"], "backward"))).toBe("bacd");
});

test("asOneStep records an AI job as one undo step", async () => {
  const s = useDesign.getState();
  s.load(normalizeDesign({ elements: [] }));
  useDesign.temporal.getState().clear();
  await asOneStep(async () => {
    s.add([{ type: "shape", shape: "rect", fill: "#000", x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 }]);
    await new Promise((r) => setTimeout(r, 450));
    useDesign.getState().add([{ type: "shape", shape: "rect", fill: "#000", x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 }]);
  });
  expect(useDesign.getState().design.elements.length).toBe(2);
  expect(useDesign.temporal.getState().pastStates.length).toBe(1);
  useDesign.temporal.getState().undo();
  expect(useDesign.getState().design.elements.length).toBe(0);
});
