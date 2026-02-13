/**
 * Tests for commands system
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getAllCommands,
  executeCommand,
  ensureCommandsDirectory,
  generateCommandsRule,
} from "./commands.js";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("commands", () => {
  beforeEach(() => {
    if (existsSync(".precursor/commands")) {
      rmSync(".precursor/commands", { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(".precursor/commands")) {
      rmSync(".precursor/commands", { recursive: true });
    }
  });

  test("loads commands from config", () => {
    const config: PrecursorConfig = {
      commands: {
        "test-command": {
          description: "Test command",
          steps: [{ type: "shell", command: "echo test" }],
        },
      },
    };

    const commands = getAllCommands(config);
    expect(commands.length).toBe(1);
    expect(commands[0].name).toBe("test-command");
    expect(commands[0].description).toBe("Test command");
  });

  test("returns empty array when no commands", () => {
    const config: PrecursorConfig = {};
    const commands = getAllCommands(config);
    expect(commands).toEqual([]);
  });

  test("executes shell command", async () => {
    const config: PrecursorConfig = {
      commands: {
        "echo-test": {
          description: "Echo test",
          steps: [{ type: "shell", command: "echo hello" }],
        },
      },
    };

    const result = await executeCommand("echo-test", config);
    expect(result.success).toBe(true);
    expect(result.output).toContain("hello");
  });

  test("returns error for unknown command", async () => {
    const config: PrecursorConfig = {};
    const result = await executeCommand("unknown", config);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("handles interactive steps", async () => {
    const config: PrecursorConfig = {
      commands: {
        "interactive-test": {
          description: "Interactive test",
          steps: [{ type: "interactive", prompt: "Enter value" }],
        },
      },
    };

    const result = await executeCommand("interactive-test", config, {
      "Enter value": "test-input",
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("test-input");
  });

  test("skips interactive steps without input", async () => {
    const config: PrecursorConfig = {
      commands: {
        "interactive-test": {
          description: "Interactive test",
          steps: [{ type: "interactive", prompt: "Enter value" }],
        },
      },
    };

    const result = await executeCommand("interactive-test", config);

    expect(result.success).toBe(true);
    expect(result.output).toContain("Skipped");
  });

  test("ensures commands directory exists", () => {
    ensureCommandsDirectory();
    expect(existsSync(".precursor/commands")).toBe(true);
  });

  test("generates commands rule", () => {
    const config: PrecursorConfig = {
      commands: {
        test: {
          description: "Test command",
          steps: [{ type: "shell", command: "echo test" }],
        },
      },
    };

    const commands = getAllCommands(config);
    const rule = generateCommandsRule(commands);

    expect(rule).toContain("Slash Commands");
    expect(rule).toContain("test");
  });

  test("generates empty rule when no commands", () => {
    const rule = generateCommandsRule([]);
    expect(rule).toContain("No custom commands");
  });
});
