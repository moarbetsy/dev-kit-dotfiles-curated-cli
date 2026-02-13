/**
 * Post-processing hooks - Execute commands after scaffolding
 * Based on Boris Cherny's PostToolUse hook pattern
 */

import { spawn } from "node:child_process";
import type { HooksConfig, PrecursorConfig } from "./config.js";

export interface HookResult {
  name: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

export interface HooksReport {
  success: boolean;
  results: HookResult[];
  errors: string[];
  warnings: string[];
}

/**
 * Get default post-scaffold hooks for a stack
 */
function getDefaultHooks(
  stack: string,
  config: PrecursorConfig
): Array<{ name: string; command: string }> {
  switch (stack) {
    case "python": {
      const pythonCfg = config.python || {};
      const runtime = pythonCfg.runtime || "uv";
      const hooks: Array<{ name: string; command: string }> = [];

      if (pythonCfg.formatter === "ruff") {
        hooks.push({
          name: "ruff-format",
          command: `${runtime} run ruff format .`,
        });
      }

      return hooks;
    }

    case "web": {
      const webCfg = config.web || {};
      const runtime = webCfg.runtime || "bun";
      const hooks: Array<{ name: string; command: string }> = [];

      if (webCfg.formatter === "biome") {
        hooks.push({
          name: "biome-format",
          command: `${runtime === "bun" ? "bunx" : "npx"} biome format --write .`,
        });
      }

      return hooks;
    }

    case "rust": {
      return [
        {
          name: "rustfmt",
          command: "cargo fmt",
        },
      ];
    }

    case "cpp": {
      return [
        {
          name: "clang-format",
          command:
            "find . -name '*.cpp' -o -name '*.hpp' -o -name '*.c' -o -name '*.h' | xargs clang-format -i || true",
        },
      ];
    }

    default:
      return [];
  }
}

/**
 * Execute a shell command and return result
 */
async function executeCommand(
  command: string,
  cwd: string = process.cwd()
): Promise<{ success: boolean; output: string; error?: string; exitCode?: number }> {
  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(/\s+/);
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || undefined,
        exitCode: code ?? undefined,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        output: stdout,
        error: err.message,
        exitCode: undefined,
      });
    });
  });
}

/**
 * Run post-scaffold hooks
 */
export async function runPostScaffoldHooks(
  config: PrecursorConfig,
  stacks: string[]
): Promise<HooksReport> {
  const hooksCfg: HooksConfig = config.hooks ?? ({} as HooksConfig);
  const postScaffoldHooks = (hooksCfg as any).postScaffold || [];

  const allResults: HookResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Run stack-specific default hooks
  for (const stack of stacks) {
    const stackConfig = config[stack as keyof PrecursorConfig];
    if (!stackConfig || (stackConfig as { enabled?: boolean }).enabled === false) {
      continue;
    }

    const defaultHooks = getDefaultHooks(stack, config);
    for (const hook of defaultHooks) {
      const result = await executeCommand(hook.command);
      allResults.push({
        name: hook.name,
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
      });

      if (!result.success) {
        warnings.push(`Hook ${hook.name} failed: ${result.error || "Unknown error"}`);
      }
    }
  }

  // Run custom hooks from config
  for (const hook of postScaffoldHooks) {
    if (hook.enabled === false) {
      continue;
    }

    // If hook has a stack filter, only run for that stack
    if (hook.stack && !stacks.includes(hook.stack)) {
      continue;
    }

    const result = await executeCommand(hook.command);
    allResults.push({
      name: hook.name,
      success: result.success,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
    });

    if (!result.success) {
      const message = `Hook ${hook.name} failed: ${result.error || "Unknown error"}`;
      if (hook.stack) {
        warnings.push(message);
      } else {
        errors.push(message);
      }
    }
  }

  const success = errors.length === 0;

  return {
    success,
    results: allResults,
    errors,
    warnings,
  };
}
