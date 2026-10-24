// Groups are flat: elements that share a `groupId` select, move and arrange as
// one, while each keeps its own place in the stack and its own properties.
import type { El } from "../types/design";
import { newId } from "./ids";

/** `ids` plus every other member of the groups they belong to. */
export function withGroups(elements: El[], ids: string[]): string[] {
  const picked = new Set(ids);
  const groups = new Set(elements.filter((e) => picked.has(e.id) && e.groupId).map((e) => e.groupId));
  return elements.filter((e) => picked.has(e.id) || (e.groupId && groups.has(e.groupId))).map((e) => e.id);
}

/** Whether `ids` is exactly one whole group. */
export function isOneGroup(elements: El[], ids: string[]): boolean {
  const sel = elements.filter((e) => ids.includes(e.id));
  const g = sel[0]?.groupId;
  return !!g && sel.every((e) => e.groupId === g) && elements.filter((e) => e.groupId === g).length === sel.length;
}

/**
 * Groups `ids` (and the groups they touch) under a new id. The members move
 * together in the stack, to where the topmost of them was.
 */
export function group(elements: El[], ids: string[]): El[] {
  const all = new Set(withGroups(elements, ids));
  if (all.size < 2) return elements;
  const groupId = newId("grp");
  const top = elements.reduce((t, e, i) => (all.has(e.id) ? i : t), -1);
  const members = elements.filter((e) => all.has(e.id)).map((e) => ({ ...e, groupId, groupName: undefined }));
  const below = elements.slice(0, top + 1).filter((e) => !all.has(e.id));
  return [...below, ...members, ...elements.slice(top + 1)];
}

/** Dissolves every group that `ids` touch. */
export function ungroup(elements: El[], ids: string[]): El[] {
  const all = new Set(withGroups(elements, ids));
  return elements.map((e) => (all.has(e.id) && e.groupId ? { ...e, groupId: undefined, groupName: undefined } : e));
}

/** Names group `groupId`; an empty name clears it. */
export function renameGroup(elements: El[], groupId: string, name: string): El[] {
  const groupName = name.trim().slice(0, 60) || undefined;
  return elements.map((e) => (e.groupId === groupId ? { ...e, groupName } : e));
}

/** Drops the group id of groups left with a single member (after a delete). */
export function pruneGroups(elements: El[]): El[] {
  const count = new Map<string, number>();
  for (const e of elements) if (e.groupId) count.set(e.groupId, (count.get(e.groupId) ?? 0) + 1);
  return elements.some((e) => e.groupId && count.get(e.groupId) === 1)
    ? elements.map((e) => (e.groupId && count.get(e.groupId) === 1 ? { ...e, groupId: undefined, groupName: undefined } : e))
    : elements;
}

/**
 * Keeps groups together after the element at stack index `i` was dragged to a
 * new place: dropped inside a group it joins it, dropped away from its own
 * group it leaves it.
 */
export function settleMoved(elements: El[], i: number): El[] {
  const el = elements[i];
  const below = elements[i - 1]?.groupId;
  const above = elements[i + 1]?.groupId;
  let groupId = el.groupId;
  if (below && below === above) groupId = below;
  else if (groupId && below !== groupId && above !== groupId) groupId = undefined;
  if (groupId === el.groupId) return elements;
  const groupName = groupId ? elements[i - 1].groupName : undefined;
  return pruneGroups(elements.map((e, j) => (j === i ? { ...e, groupId, groupName } : e)));
}

/**
 * Group ids for copies of `copies` (taken from `elements`): a group copied
 * whole becomes a new group, a member copied alone leaves its group.
 */
export function regroup<T extends Pick<El, "groupId">>(copies: (T & { id?: string })[], elements: El[]): T[] {
  const fresh = new Map<string, string>();
  return copies.map((c) => {
    if (!c.groupId) return c;
    const whole = elements.filter((e) => e.groupId === c.groupId).every((e) => copies.some((x) => x.id === e.id));
    if (!whole) return { ...c, groupId: undefined, groupName: undefined };
    if (!fresh.has(c.groupId)) fresh.set(c.groupId, newId("grp"));
    return { ...c, groupId: fresh.get(c.groupId) };
  });
}

/** The selection split into units that arrange as one: each group, and each ungrouped element. */
export function units(elements: El[], ids: string[]): El[][] {
  const out = new Map<string, El[]>();
  for (const e of elements) {
    if (!ids.includes(e.id)) continue;
    const key = e.groupId ?? e.id;
    out.set(key, [...(out.get(key) ?? []), e]);
  }
  return [...out.values()];
}
