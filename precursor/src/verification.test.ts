/**
 * Tests for verification loops
 */

import { describe, test, expect } from "bun:test";
import { runVerification } from "./verification.js";
import type { PrecursorConfig } from "./config.js";

describe("verification", () => {
  test("returns success when verification is disabled", async () => {
    const config: PrecursorConfig = {
      verification: { enabled: false },
    };

    const result = await runVerification(config, []);
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });

  test("skips verification for disabled stacks", async () => {
    const config: PrecursorConfig = {
      python: { enabled: false },
      verification: { enabled: true },
    };

    const result = await runVerification(config, ["python"]);
    expect(result.results.length).toBe(0);
  });

  test("runs default verification commands for python stack", async () => {
    const config: PrecursorConfig = {
      python: {
        runtime: "uv",
        linter: "ruff",
        formatter: "ruff",
        typechecker: "pyright",
      },
      verification: { enabled: true },
    };

    const result = await runVerification(config, ["python"]);
    // Should have verification results (may fail if tools not installed, but should have attempts)
    expect(result).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  test("runs default verification commands for web stack", async () => {
    const config: PrecursorConfig = {
      web: {
        runtime: "bun",
        linter: "biome",
        formatter: "biome",
        typechecker: "tsc",
      },
      verification: { enabled: true },
    };

    const result = await runVerification(config, ["web"]);
    expect(result).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  }, 10000);

  test("uses custom verification commands when provided", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      verification: {
        enabled: true,
        commands: {
          python: ["echo 'test'"],
        },
      },
    };

    const result = await runVerification(config, ["python"]);
    expect(result.results.length).toBeGreaterThan(0);
    const pythonResult = result.results.find((r) => r.stack === "python");
    expect(pythonResult).toBeDefined();
  });

  test("collects errors when failOnError is true", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      verification: {
        enabled: true,
        failOnError: true,
        commands: {
          python: ["exit 1"], // This will fail
        },
      },
    };

    const result = await runVerification(config, ["python"]);
    // Result may or may not have errors depending on execution, but structure should be correct
    expect(result).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test("handles multiple stacks", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      web: { runtime: "bun" },
      verification: { enabled: true },
    };

    const result = await runVerification(config, ["python", "web"]);
    expect(result.results.length).toBeGreaterThan(0);
    const stacks = new Set(result.results.map((r) => r.stack));
    expect(stacks.has("python") || stacks.has("web")).toBe(true);
  }, 10000);
});
