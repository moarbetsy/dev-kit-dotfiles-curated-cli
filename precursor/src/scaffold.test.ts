/**
 * Tests for scaffold functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runScaffold } from "./scaffold.js";
import { writeFileSync, unlinkSync, existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("scaffold", () => {
  beforeEach(() => {
    // Clean up scaffolded files
    const cleanupDirs = [".cursor", ".vscode", ".github"];
    for (const dir of cleanupDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    }
    if (existsSync("package.json")) {
      unlinkSync("package.json");
    }
  });

  afterEach(() => {
    // Clean up
    const cleanupDirs = [".cursor", ".vscode", ".github"];
    for (const dir of cleanupDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    }
    if (existsSync("package.json")) {
      unlinkSync("package.json");
    }
  });

  test("creates rule files for stacks", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };

    await runScaffold(config, ["python"], {});

    expect(existsSync(".cursor/rules/python.mdc")).toBe(true);
    const content = readFileSync(".cursor/rules/python.mdc", "utf-8");
    expect(content).toContain("Python Development Rules");
  });

  test("creates VS Code settings", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };

    await runScaffold(config, ["python"], {});

    expect(existsSync(".vscode/settings.json")).toBe(true);
    const content = JSON.parse(readFileSync(".vscode/settings.json", "utf-8"));
    expect(content["files.watcherExclude"]).toBeDefined();
  });

  test("creates extensions.json", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };

    await runScaffold(config, ["python"], {});

    expect(existsSync(".vscode/extensions.json")).toBe(true);
    const content = JSON.parse(readFileSync(".vscode/extensions.json", "utf-8"));
    expect(Array.isArray(content.recommendations)).toBe(true);
  });

  test("creates MCP config when enabled", async () => {
    const config: PrecursorConfig = {
      mcp: { enabled: true },
    };

    await runScaffold(config, [], {});

    expect(existsSync(".cursor/mcp.json")).toBe(true);
    const content = JSON.parse(readFileSync(".cursor/mcp.json", "utf-8"));
    expect(content.mcpServers).toBeDefined();
  });

  test("updates .gitignore", async () => {
    const config: PrecursorConfig = {
      python: { runtime: "uv" },
    };

    await runScaffold(config, ["python"], {});

    if (existsSync(".gitignore")) {
      const content = readFileSync(".gitignore", "utf-8");
      expect(content).toContain(".venv");
    }
  });

  test("creates package.json for web stack", async () => {
    const config: PrecursorConfig = {
      web: { runtime: "bun" },
    };

    await runScaffold(config, ["web"], {});

    expect(existsSync("package.json")).toBe(true);
    const content = JSON.parse(readFileSync("package.json", "utf-8"));
    expect(content.scripts).toBeDefined();
  });

  test("generates verification rule", async () => {
    const config: PrecursorConfig = {
      verification: { enabled: true },
      python: { runtime: "uv" },
    };

    await runScaffold(config, ["python"], {});

    expect(existsSync(".cursor/rules/verification.mdc")).toBe(true);
    const content = readFileSync(".cursor/rules/verification.mdc", "utf-8");
    expect(content).toContain("Verification Loops");
  });

  test("initializes knowledge base", async () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    await runScaffold(config, [], {});

    expect(existsSync(".cursor/PRECURSOR.md")).toBe(true);
    const content = readFileSync(".cursor/PRECURSOR.md", "utf-8");
    expect(content).toContain("Precursor Knowledge Base");
  });

  test("sets up commands directory", async () => {
    const config: PrecursorConfig = {};

    await runScaffold(config, [], {});

    expect(existsSync(".precursor/commands")).toBe(true);
  });

  test("generates commands rule", async () => {
    const config: PrecursorConfig = {};

    await runScaffold(config, [], {});

    expect(existsSync(".cursor/rules/commands.mdc")).toBe(true);
  });
});
