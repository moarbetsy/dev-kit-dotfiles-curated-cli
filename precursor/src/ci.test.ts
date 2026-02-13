/**
 * Tests for CI workflow generation
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { generateWorkflows } from "./ci.js";
import { existsSync, unlinkSync, rmSync, readFileSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("ci", () => {
  beforeEach(() => {
    if (existsSync(".github/workflows")) {
      rmSync(".github/workflows", { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(".github/workflows")) {
      rmSync(".github/workflows", { recursive: true });
    }
  });

  test("generates workflows for python stack", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv", typechecker: "pyright" },
      ci: { enabled: true },
    };

    await generateWorkflows(config, ["python"]);

    expect(existsSync(".github/workflows/python.yml")).toBe(true);
    const content = readFileSync(".github/workflows/python.yml", "utf-8");
    expect(content).toContain("Python CI");
  });

  test("generates workflows for web stack", async () => {
    const config: PrecursorConfig = {
      web: { runtime: "bun" },
      ci: { enabled: true },
    };

    await generateWorkflows(config, ["web"]);

    expect(existsSync(".github/workflows/web.yml")).toBe(true);
    const content = readFileSync(".github/workflows/web.yml", "utf-8");
    expect(content).toContain("Web CI");
  });

  test("generates workflows for rust stack", async () => {
    const config: PrecursorConfig = {
      rust: {},
      ci: { enabled: true },
    };

    await generateWorkflows(config, ["rust"]);

    expect(existsSync(".github/workflows/rust.yml")).toBe(true);
    const content = readFileSync(".github/workflows/rust.yml", "utf-8");
    expect(content).toContain("Rust CI");
  });

  test("generates precursor workflow", async () => {
    const config: PrecursorConfig = {
      ci: { enabled: true },
    };

    await generateWorkflows(config, []);

    expect(existsSync(".github/workflows/precursor.yml")).toBe(true);
    const content = readFileSync(".github/workflows/precursor.yml", "utf-8");
    expect(content).toContain("Precursor CI");
  });

  test("skips workflow generation when CI disabled", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      ci: { enabled: false },
    };

    await generateWorkflows(config, ["python"]);

    expect(existsSync(".github/workflows/python.yml")).toBe(false);
  });

  test("skips disabled workflow configs", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      ci: {
        enabled: true,
        workflows: {
          python: { enabled: false },
        },
      },
    };

    await generateWorkflows(config, ["python"]);

    expect(existsSync(".github/workflows/python.yml")).toBe(false);
  });

  test("generates multiple workflows", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
      web: { runtime: "bun" },
      ci: { enabled: true },
    };

    await generateWorkflows(config, ["python", "web"]);

    expect(existsSync(".github/workflows/python.yml")).toBe(true);
    expect(existsSync(".github/workflows/web.yml")).toBe(true);
    expect(existsSync(".github/workflows/precursor.yml")).toBe(true);
  });
});
