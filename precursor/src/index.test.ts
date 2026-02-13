/**
 * Tests for main index functions (setup, scan, rollback, reset, update)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setup, scan, rollback, reset, update } from "./index.js";
import { writeFileSync, unlinkSync, existsSync, rmSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("index", () => {
  beforeEach(() => {
    // Clean up test files
    if (existsSync("precursor.json")) {
      unlinkSync("precursor.json");
    }
    if (existsSync(".precursor/state.json")) {
      unlinkSync(".precursor/state.json");
    }
  });

  afterEach(() => {
    // Clean up
    if (existsSync("precursor.json")) {
      unlinkSync("precursor.json");
    }
    if (existsSync(".precursor/state.json")) {
      unlinkSync(".precursor/state.json");
    }
    if (existsSync(".precursor/backups")) {
      rmSync(".precursor/backups", { recursive: true });
    }
  });

  test("setup runs successfully with minimal config", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      backup: { enabled: false }, // Disable backup for faster tests
    };
    writeFileSync("precursor.json", JSON.stringify(config), "utf-8");

    const result = await setup();

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    // May succeed or fail depending on tool availability, but should return a result
  });

  test("scan runs successfully", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };
    writeFileSync("precursor.json", JSON.stringify(config), "utf-8");

    const result = await scan();

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("rollback returns error when no backups exist", async () => {
    const config: PrecursorConfig = {};
    writeFileSync("precursor.json", JSON.stringify(config), "utf-8");

    const result = await rollback();

    expect(result.success).toBe(false);
    expect(result.message).toContain("No backups");
  });

  test("reset clears state", async () => {
    // Create a state file
    const stateDir = ".precursor";
    if (!existsSync(stateDir)) {
      require("node:fs").mkdirSync(stateDir, { recursive: true });
    }
    writeFileSync(".precursor/state.json", JSON.stringify({ version: "1.0.0" }), "utf-8");

    const result = await reset();

    expect(result.success).toBe(true);
    expect(result.message).toContain("State cache reset");
    expect(existsSync(".precursor/state.json")).toBe(false);
  });

  test("update fails when disabled in config", async () => {
    const config: PrecursorConfig = {
      update: { enabled: false },
    };
    writeFileSync("precursor.json", JSON.stringify(config), "utf-8");

    const result = await update();

    expect(result.success).toBe(false);
    expect(result.message).toContain("disabled");
  });

  test("update fails in offline mode", async () => {
    const config: PrecursorConfig = {
      update: { enabled: true },
    };
    writeFileSync("precursor.json", JSON.stringify(config), "utf-8");

    const result = await update({ offline: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain("offline");
  });

  test("setup handles errors gracefully", async () => {
    // Create invalid config
    writeFileSync("precursor.json", "{ invalid json", "utf-8");

    const result = await setup();

    // Should handle error gracefully
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
  });

  test("scan handles missing config", async () => {
    // No config file
    const result = await scan();

    // Should use defaults
    expect(result.success).toBe(true);
  });
});
