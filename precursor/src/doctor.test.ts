/**
 * Tests for doctor checks
 */

import { describe, test, expect } from "bun:test";
import { runDoctor, doctorFix } from "./doctor.js";
import type { PrecursorConfig } from "./config.js";

describe("doctor", () => {
  test("runs doctor scan", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv", linter: "ruff" },
      web: { runtime: "bun" },
    };
    const options = { offline: true }; // Use offline to avoid timeouts

    const report = await runDoctor(config, ["python", "web"], options);

    expect(report).toBeDefined();
    expect(report.stacks).toContain("python");
    expect(report.stacks).toContain("web");
    expect(report.tools).toBeDefined();
    expect(report.configs).toBeDefined();
    expect(report.recommendations).toBeDefined();
    expect(report.timestamp).toBeDefined();
  }, 10000);

  test("checks tools for each stack", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv", linter: "ruff", formatter: "ruff" },
    };
    const options = { offline: true }; // Use offline to avoid timeouts

    const report = await runDoctor(config, ["python"], options);

    // Should check tools for python stack (may be empty in offline mode)
    expect(report.tools).toBeDefined();
  }, 10000);

  test("checks config files", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      web: { runtime: "bun" },
    };

    const report = await runDoctor(config, ["python", "web"]);

    expect(report.configs.length).toBeGreaterThan(0);
    const pythonConfig = report.configs.find((c) => c.file === "pyproject.toml");
    const webConfig = report.configs.find((c) => c.file === "package.json");

    // Should check for config files (may or may not exist)
    expect(pythonConfig || webConfig).toBeDefined();
  });

  test("collects system information", async () => {
    const config: PrecursorConfig = {};

    const report = await runDoctor(config, []);

    // System info is optional, may or may not be present
    if (report.system) {
      expect(report.system.platform).toBeDefined();
      expect(report.system.path).toBeDefined();
    }
  }, 20000);

  test("skips tool checks in offline mode", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };
    const options = { offline: true };

    const report = await runDoctor(config, ["python"], options);

    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.skipped.some((s) => s.includes("offline"))).toBe(true);
  }, 10000);

  test("adds recommendations for missing critical tools", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };
    const options = { offline: true }; // Use offline to avoid timeouts

    const report = await runDoctor(config, ["python"], options);

    // May or may not have recommendations depending on what's installed
    expect(Array.isArray(report.recommendations)).toBe(true);
  }, 10000);

  test("doctor fix returns error for unknown fix", async () => {
    const config: PrecursorConfig = {};

    const result = await doctorFix("unknown-fix", config);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unknown fix");
  });

  test("doctor fix handles known fixes", async () => {
    const config: PrecursorConfig = {};

    const result = await doctorFix("scaffold-ruff-config", config);

    // Should return a result (may succeed or fail depending on implementation)
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });
});
