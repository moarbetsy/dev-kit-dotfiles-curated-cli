/**
 * Tests for merge engine
 */

import { describe, test, expect } from "bun:test";
import { deepMerge } from "./merge.js";

describe("deepMerge", () => {
  test("merges simple objects", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3, c: 4 };
    const result = deepMerge(target, source);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  test("merges nested objects", () => {
    const target = { a: { x: 1, y: 2 }, b: 3 };
    const source = { a: { y: 4, z: 5 }, c: 6 };
    const result = deepMerge(target, source);

    expect(result).toEqual({ a: { x: 1, y: 4, z: 5 }, b: 3, c: 6 } as any);
  });

  test("appends unique array values", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [3, 4, 5] };
    const result = deepMerge(target, source, { arrayStrategy: "append-unique" });

    expect(result.items).toEqual([1, 2, 3, 4, 5]);
  });

  test("replaces arrays when strategy is replace", () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = deepMerge(target, source, { arrayStrategy: "replace" });

    expect(result.items).toEqual([4, 5]);
  });

  test("preserves unknown keys", () => {
    const target = { a: 1, _unknown: "preserved" };
    const source = { b: 2 };
    const result = deepMerge(target, source);

    expect(result).toHaveProperty("_unknown", "preserved");
    expect(result).toEqual({ a: 1, _unknown: "preserved", b: 2 });
  });
});
