import { expect, test } from "bun:test";
import { normalizeDesign } from "../store/design";
import { addPage, allPages, goToPage, movePage, pageAsDesign, pageCount, removePage } from "./pages";

const one = normalizeDesign({ background: "#111", elements: [{ id: "t1", type: "text", text: "A", x: 0, y: 0, w: 100 }] as never });
const ids = (d: ReturnType<typeof normalizeDesign>) => allPages(d).map((p) => p.id);

test("adding, switching, moving and removing pages keeps the open page in elements", () => {
  expect(pageCount(one)).toBe(1);
  const two = addPage(one, true);
  expect(pageCount(two)).toBe(2);
  expect(two.page).toBe(1);
  expect(two.elements[0].type === "text" && two.elements[0].text).toBe("A");
  expect(two.elements[0].id).not.toBe("t1"); // a copy gets new element ids
  const three = addPage(two); // blank, same background
  expect([three.page, three.elements.length, three.background]).toEqual([2, 0, "#111"]);

  const back = goToPage(three, 0);
  expect(back.elements[0].id).toBe("t1");
  expect(ids(back)).toEqual(ids(three)); // order unchanged by switching

  const moved = movePage(back, 0, 2);
  expect(ids(moved)).toEqual([ids(back)[1], ids(back)[2], ids(back)[0]]);
  expect(moved.page).toBe(2); // the open page moved with it
  expect(moved.elements[0].id).toBe("t1");

  const removed = removePage(moved, 0);
  expect(pageCount(removed)).toBe(2);
  expect(removed.elements[0].id).toBe("t1");
  const single = removePage(removePage(removed, 0), 0);
  expect(pageCount(single)).toBe(1);
  expect(single.pages).toBeUndefined();
  expect(removePage(single, 0)).toBe(single); // never removes the last page
});

test("pages survive saving and loading", () => {
  const d = goToPage(addPage(addPage(one), true), 1);
  const loaded = normalizeDesign(JSON.parse(JSON.stringify(d)));
  expect(ids(loaded)).toEqual(ids(d));
  expect(loaded.page).toBe(1);
  expect(pageAsDesign(loaded, 0).elements[0].id).toBe("t1");
});
