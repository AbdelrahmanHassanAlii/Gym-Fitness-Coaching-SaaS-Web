import { describe, expect, test } from "bun:test";
import { supportedLocales } from "./locales";
import { messages } from "./messages";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix === "" ? key : `${prefix}.${key}`;

    return flattenKeys(nestedValue, nextPrefix);
  });
}

describe("translation messages", () => {
  test("has messages for every supported locale", () => {
    expect(Object.keys(messages).sort()).toEqual([...supportedLocales].sort());
  });

  test("keeps Arabic and English message keys in parity", () => {
    expect(flattenKeys(messages.ar).sort()).toEqual(flattenKeys(messages.en).sort());
  });
});
