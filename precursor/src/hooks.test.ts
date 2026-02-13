/**
 * Tests for post-scaffold hooks
 */

import { describe, test, expect } from "bun:test";
import { runPostScaffoldHooks } from "./hooks.js";
import type { PrecursorConfig } from "./config.js";

describe("hooks", () => {
  test("runs hooks for python stack", async () => {
    const config: PrecursorConfig = {
      python: {
        runtime: "uv",
        formatter: "ruff",
      },
    };

    const result = await runPostScaffoldHooks(config, ["python"]);

    expect(result).toBeDefined();
    expect(result.success).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  }, 10000);

  test("runs hooks for web stack", async () => {
    const config: PrecursorConfig = {
      web: {
        runtime: "bun",
        formatter: "biome",
      },
    };

    const result = await runPostScaffoldHooks(config, ["web"]);

    expect(result).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  test("runs hooks for rust stack", async () => {
    const config: PrecursorConfig = {
      rust: {},
    };

    const result = await runPostScaffoldHooks(config, ["rust"]);

    expect(result).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
  });

  test("skips disabled stacks", async () => {
    const config: PrecursorConfig = {
      python: { enabled: false },
    };

    const result = await runPostScaffoldHooks(config, ["python"]);

    // Should not run hooks for disabled stack
    expect(result.results.length).toBe(0);
  });

  test("runs custom hooks from config", async () => {
    const config: PrecursorConfig = {
      hooks: {
        postScaffold: [
          {
            name: "custom-hook",
            command: "echo test",
            enabled: true,
          },
        ],
      },
    };

    const result = await runPostScaffoldHooks(config, []);

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((r) => r.name === "custom-hook")).toBe(true);
  });

  test("skips disabled custom hooks", async () => {
    const config: PrecursorConfig = {
      hooks: {
        postScaffold: [
          {
            name: "disabled-hook",
            command: "echo test",
            enabled: false,
          },
        ],
      },
    };

    const result = await runPostScaffoldHooks(config, []);

    expect(result.results.some((r) => r.name === "disabled-hook")).toBe(false);
  });

  test("filters hooks by stack", async () => {
    const config: PrecursorConfig = {
      hooks: {
        postScaffold: [
          {
            name: "python-hook",
            command: "echo python",
            stack: "python",
            enabled: true,
          },
          {
            name: "web-hook",
            command: "echo web",
            stack: "web",
            enabled: true,
          },
        ],
      },
    };

    const result = await runPostScaffoldHooks(config, ["python"]);

    expect(result.results.some((r) => r.name === "python-hook")).toBe(true);
    expect(result.results.some((r) => r.name === "web-hook")).toBe(false);
  });

  test("collects errors and warnings", async () => {
    const config: PrecursorConfig = {
      hooks: {
        postScaffold: [
          {
            name: "failing-hook",
            command: "exit 1",
            enabled: true,
          },
        ],
      },
    };

    const result = await runPostScaffoldHooks(config, []);

    expect(result.results.length).toBeGreaterThan(0);
    const failingHook = result.results.find((r) => r.name === "failing-hook");
    if (failingHook) {
      expect(failingHook.success).toBe(false);
    }
  });
});
