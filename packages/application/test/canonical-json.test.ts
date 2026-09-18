import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalSha256 } from "../src/index.js";

describe("canonical JSON digests", () => {
  it("does not depend on object key insertion order, including nested values", () => {
    const left = { z: 1, nested: { second: true, first: [3, 2, 1] }, a: "value" };
    const right = { a: "value", nested: { first: [3, 2, 1], second: true }, z: 1 };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalSha256(left)).toBe(canonicalSha256(right));
    expect(canonicalSha256(left)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects non-JSON values instead of producing an ambiguous digest", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(TypeError);
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
  });
});
