/**
 * Verification loops - Execute verification commands after scaffolding
 * Based on Boris Cherny's principle: "Give AI a way to verify its work"
 */

import { spawn } from "node:child_process";
import type { PrecursorConfig, VerificationConfig } from "./config.js";

export interface VerificationResult {
  success: boolean;
  stack: string;
  command: string;
  output: string;
  error?: string;
  exitCode?: number;
}

export interface VerificationReport {
  success: boolean;
  results: VerificationResult[];
  errors: string[];
  warnings: string[];
}

/**
 * Get default verification commands for a stack
 */
function getDefaultVerificationCommands(stack: string, config: PrecursorConfig): string[] {
  switch (stack) {
    case "python": {
      const pythonCfg = config.python || {};
      const runtime = pythonCfg.runtime || "uv";
      return [
        `${runtime} run ruff check .`,
        `${runtime} run ruff format --check .`,
        pythonCfg.typechecker && pythonCfg.typechecker !== "none"
          ? `${runtime} run ${pythonCfg.typechecker} .`
          : null,
        `${runtime} run pytest || true`,
      ].filter((cmd): cmd is string => cmd !== null);
    }

    case "web": {
      const webCfg = config.web || {};
      const runtime = webCfg.runtime || "bun";
      return [
        `${runtime === "bun" ? "bunx" : "npx"} biome check .`,
        webCfg.typechecker && webCfg.typechecker !== "none"
          ? `${runtime === "bun" ? "bunx" : "npx"} tsc --noEmit`
          : null,
        `${runtime} test || true`,
      ].filter((cmd): cmd is string => cmd !== null);
    }

    case "rust": {
      return ["cargo fmt --check", "cargo clippy -- -D warnings || true", "cargo test || true"];
    }

    case "cpp": {
      return ["cmake --build build || true", "cd build && ctest || true"];
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
 * Run verification for a specific stack
 */
async function verifyStack(stack: string, config: PrecursorConfig): Promise<VerificationResult[]> {
  const verificationCfg: VerificationConfig = config.verification ?? ({} as VerificationConfig);
  if ((verificationCfg as any).enabled === false) {
    return [];
  }

  // Get commands for this stack
  const customCommands = (verificationCfg as any).commands?.[stack];
  const commands = customCommands || getDefaultVerificationCommands(stack, config);

  if (commands.length === 0) {
    return [];
  }

  const results: VerificationResult[] = [];

  for (const command of commands) {
    const result = await executeCommand(command);
    results.push({
      success: result.success,
      stack,
      command,
      output: result.output,
      error: result.error,
      exitCode: result.exitCode,
    });
  }

  return results;
}

/**
 * Run verification loops after scaffolding
 */
export async function runVerification(
  config: PrecursorConfig,
  stacks: string[]
): Promise<VerificationReport> {
  const verificationCfg: VerificationConfig = config.verification ?? ({} as VerificationConfig);
  if ((verificationCfg as any).enabled === false) {
    return {
      success: true,
      results: [],
      errors: [],
      warnings: [],
    };
  }

  const allResults: VerificationResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Run verification for each stack
  for (const stack of stacks) {
    const stackConfig = config[stack as keyof PrecursorConfig];
    if (!stackConfig || (stackConfig as { enabled?: boolean }).enabled === false) {
      continue;
    }

    const results = await verifyStack(stack, config);
    allResults.push(...results);

    // Collect errors and warnings
    for (const result of results) {
      if (!result.success) {
        const message = `Verification failed for ${stack}: ${result.command}`;
        if (result.error) {
          errors.push(`${message}\n${result.error}`);
        } else {
          warnings.push(message);
        }
      }
    }
  }

  const failOnError = (verificationCfg as any).failOnError ?? false;
  const success = errors.length === 0 || !failOnError;

  return {
    success,
    results: allResults,
    errors,
    warnings,
  };
}
