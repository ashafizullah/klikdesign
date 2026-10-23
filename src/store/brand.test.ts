import { expect, test } from "bun:test";
import { isEmptyBrand, normalizeBrand } from "./brand";

test("brand kits are cleaned: deduped, trimmed, capped and lower-case hex", () => {
  const kit = normalizeBrand({ colors: ["#7A3E1D", " #7a3e1d ", "", 5, "rgb(0,0,0)"], fonts: ["Poppins", "Poppins"], logos: "x", voice: "  Warm  " });
  expect(kit).toEqual({ colors: ["#7a3e1d", "rgb(0,0,0)"], fonts: ["Poppins"], logos: [], voice: "Warm" });
  expect(normalizeBrand({ colors: Array.from({ length: 30 }, (_, i) => `#${String(i).padStart(6, "0")}`) }).colors).toHaveLength(16);
  expect(isEmptyBrand(normalizeBrand(null))).toBe(true);
  expect(isEmptyBrand(kit)).toBe(false);
});
