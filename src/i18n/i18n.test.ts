import { expect, test } from "bun:test";
import en from "./en";
import id from "./id";
import { translate, useLocale, localizeMessage } from "./index";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("Indonesian has every key with the same placeholders as English", () => {
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect({ key, has: key in id }).toEqual({ key, has: true });
    expect({ key, vars: vars(id[key]) }).toEqual({ key, vars: vars(en[key]) });
  }
});

test("translate fills variables and defaults to English", () => {
  expect(useLocale.getState().locale).toBe("en");
  expect(translate("en", "layers.title", { n: 3 })).toBe("Layers (3)");
  expect(translate("id", "layers.title", { n: 3 })).toBe("Layer (3)");
});

test("backend errors are localized for Indonesian only", () => {
  expect(localizeMessage("Invalid id")).toBe("Invalid id");
  useLocale.getState().setLocale("id");
  expect(localizeMessage("Invalid id")).toBe("ID tidak valid");
  expect(localizeMessage("something else")).toBe("something else");
  useLocale.getState().setLocale("en");
});
