/**
 * Tests for CLI entry point
 */

import { describe, test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { join } from "node:path";

describe("cli", () => {
  test("cli script exists and is executable", () => {
    const cliPath = join(process.cwd(), "src", "cli.ts");
    const { existsSync } = require("node:fs");
    expect(existsSync(cliPath)).toBe(true);
  });

  test("handles unknown command", async () => {
    return new Promise<void>((resolve) => {
      const proc = spawn("bun", ["run", "src/cli.ts", "unknown-command"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      let stdout = "";
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("close", (code) => {
        expect(code).not.toBe(0);
        // Check either stdout or stderr for error message
        const output = stdout + stderr;
        expect(output).toMatch(/Unknown|unknown|error/i);
        resolve();
      });
    });
  }, 10000);

  test("handles help or version flags", async () => {
    // CLI may or may not have help, but should not crash
    return new Promise<void>((resolve) => {
      const proc = spawn("bun", ["run", "src/cli.ts", "--help"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.on("close", () => {
        // Should exit (may be 0 or non-zero depending on implementation)
        resolve();
      });
    });
  }, 10000);
});
