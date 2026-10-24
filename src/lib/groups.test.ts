import { expect, test } from "bun:test";
import type { El } from "../types/design";
import { normalizeElement } from "../types/design";
import { group, isOneGroup, pruneGroups, regroup, renameGroup, settleMoved, ungroup, units, withGroups } from "./groups";
import { distributeOffsets } from "./arrange";

const el = (id: string, groupId?: string) => normalizeElement({ type: "shape", groupId }, id) as El;
const ids = (els: El[]) => els.map((e) => e.id);

test("grouping gathers the members where the topmost was", () => {
  const els = [el("a"), el("b"), el("c"), el("d")];
  const out = group(els, ["a", "c"]);
  expect(ids(out)).toEqual(["b", "a", "c", "d"]);
  expect(out[1].groupId).toBeDefined();
  expect(out[1].groupId).toBe(out[2].groupId!);
  expect(out[0].groupId).toBeUndefined();
  expect(group(els, ["a"])).toBe(els);
});

test("selection expands to whole groups; ungroup and prune", () => {
  const els = [el("a", "g"), el("b", "g"), el("c")];
  expect(withGroups(els, ["b"])).toEqual(["a", "b"]);
  expect(isOneGroup(els, ["a", "b"])).toBe(true);
  expect(isOneGroup(els, ["a"])).toBe(false);
  expect(units(els, ["a", "b", "c"]).map(ids)).toEqual([["a", "b"], ["c"]]);
  expect(ungroup(els, ["a"]).every((e) => !e.groupId)).toBe(true);
  expect(pruneGroups([els[0], els[2]])[0].groupId).toBeUndefined();
});

test("copies of a whole group get a new group; a lone member leaves it", () => {
  const els = [el("a", "g"), el("b", "g")];
  const whole = regroup(els, els);
  expect(whole[0].groupId).toBe(whole[1].groupId!);
  expect(whole[0].groupId).not.toBe("g");
  expect(regroup([els[0]], els)[0].groupId).toBeUndefined();
});

test("a layer dragged into a group joins it, dragged away leaves it", () => {
  expect(settleMoved([el("a", "g"), el("x"), el("b", "g")], 1)[1].groupId).toBe("g");
  const away = settleMoved([el("a", "g"), el("y"), el("b", "g"), el("c", "g")], 0);
  expect(away.map((e) => e.groupId)).toEqual([undefined, undefined, "g", "g"]);
  // Moved within its group: unchanged. A pair split apart dissolves.
  const same = [el("a", "g"), el("b", "g"), el("c", "g")];
  expect(settleMoved(same, 2)).toBe(same);
  expect(settleMoved([el("a", "g"), el("y"), el("b", "g")], 2).every((e) => !e.groupId)).toBe(true);
});

test("a group's name lives on its members and goes with the group", () => {
  const named = renameGroup([el("a", "g"), el("b", "g"), el("c")], "g", "  Button ");
  expect(named.map((e) => e.groupName)).toEqual(["Button", "Button", undefined]);
  expect(regroup(named.slice(0, 2), named)[0].groupName).toBe("Button");
  expect(regroup([named[0]], named)[0].groupName).toBeUndefined();
  expect(ungroup(named, ["a"])[0].groupName).toBeUndefined();
  expect(renameGroup(named, "g", " ")[0].groupName).toBeUndefined();
});

test("distribute spaces boxes evenly between the outermost", () => {
  const boxes = [
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 100, y: 0, w: 20, h: 10 },
    { x: 20, y: 0, w: 10, h: 10 },
  ];
  // Span 0…120, 40 of boxes, so each of the 2 gaps is 40: x = 0, 50, 100.
  expect(distributeOffsets(boxes, "x")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 30, dy: 0 }]);
  expect(distributeOffsets(boxes.slice(0, 2), "x")).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
});
