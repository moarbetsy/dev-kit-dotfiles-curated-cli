/**
 * Tests for state management
 */

import { describe, test, expect } from "bun:test";
import { computeHash, computeFileHash } from "./state.js";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

describe("state", () => {
  test("computes hash of string", () => {
    const hash1 = computeHash("test");
    const hash2 = computeHash("test");
    const hash3 = computeHash("different");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  test("computes hash of file", () => {
    const testFile = ".precursor/test-hash.txt";
    mkdirSync(".precursor", { recursive: true });
    writeFileSync(testFile, "test content", "utf-8");

    try {
      const hash1 = computeFileHash(testFile);
      const hash2 = computeFileHash(testFile);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Modify file
      writeFileSync(testFile, "different content", "utf-8");
      const hash3 = computeFileHash(testFile);

      expect(hash3).not.toBe(hash1);
    } finally {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    }
  });

  test("returns null for non-existent file", () => {
    const hash = computeFileHash(".precursor/non-existent.txt");
    expect(hash).toBeNull();
  });
});
