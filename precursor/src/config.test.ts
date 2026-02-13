/**
 * Tests for configuration loading and validation
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, validateConfig } from "./config.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("config", () => {
  beforeEach(() => {
    // Clean up test files
    const testFiles = ["precursor.json", "precursor.jsonc", "precursor.yaml", "precursor.yml"];
    for (const file of testFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  });

  afterEach(() => {
    // Clean up after tests
    const testFiles = ["precursor.json", "precursor.jsonc", "precursor.yaml", "precursor.yml"];
    for (const file of testFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  });

  test("loads default config when no file exists", async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    expect(config.python).toBeDefined();
    expect(config.web).toBeDefined();
  });

  test("loads JSON config file", async () => {
    const testConfig = {
      python: { runtime: "uv", linter: "ruff" },
      web: { runtime: "bun" },
    };
    writeFileSync("precursor.json", JSON.stringify(testConfig), "utf-8");

    const config = await loadConfig();
    expect(config.python?.runtime).toBe("uv");
    expect(config.python?.linter).toBe("ruff");
    expect(config.web?.runtime).toBe("bun");
  });

  test("loads JSONC config file with comments", async () => {
    const testConfig = `{
      // This is a comment
      "python": { "runtime": "uv" }
    }`;
    writeFileSync("precursor.jsonc", testConfig, "utf-8");

    const config = await loadConfig();
    expect(config.python?.runtime).toBe("uv");
  });

  test("loads YAML config file", async () => {
    const testConfig = `python:
  runtime: uv
  linter: ruff
web:
  runtime: bun`;
    writeFileSync("precursor.yaml", testConfig, "utf-8");

    const config = await loadConfig();
    expect(config.python?.runtime).toBe("uv");
    expect(config.web?.runtime).toBe("bun");
  });

  test("merges config with defaults", async () => {
    const testConfig = {
      python: { runtime: "pip" },
    };
    writeFileSync("precursor.json", JSON.stringify(testConfig), "utf-8");

    const config = await loadConfig();
    expect(config.python?.runtime).toBe("pip");
    expect(config.python?.linter).toBe("ruff"); // From defaults
    expect(config.python?.formatter).toBe("ruff"); // From defaults
  });

  test("prefers JSON over YAML", async () => {
    writeFileSync("precursor.json", JSON.stringify({ python: { runtime: "json" } }), "utf-8");
    writeFileSync("precursor.yaml", "python:\n  runtime: yaml", "utf-8");

    const config = await loadConfig();
    expect(config.python?.runtime).toBe("json");
  });

  test("validates config when schema exists", async () => {
    // Create a minimal schema
    const schema = {
      type: "object",
      properties: {
        python: {
          type: "object",
          properties: {
            runtime: { type: "string", enum: ["uv", "pip", "poetry"] },
          },
        },
      },
    };
    writeFileSync("precursor.schema.json", JSON.stringify(schema), "utf-8");

    const validConfig: PrecursorConfig = {
      python: { runtime: "uv" },
    };
    writeFileSync("precursor.json", JSON.stringify(validConfig), "utf-8");

    const config = await loadConfig();
    await expect(validateConfig(config)).resolves.not.toThrow();
  });

  test("loads config from custom path", async () => {
    const testConfig = { python: { runtime: "custom" } };
    writeFileSync("custom-config.json", JSON.stringify(testConfig), "utf-8");

    const config = await loadConfig("custom-config.json");
    expect(config.python?.runtime).toBe("custom");

    unlinkSync("custom-config.json");
  });
});
