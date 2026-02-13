#!/usr/bin/env bun

/**
 * Precursor - Config-driven project doctor + scaffolder for Cursor
 * Main entry point for the TypeScript core
 */

export * from "./backup.js";
export * from "./ci.js";
export * from "./commands.js";
export * from "./config.js";
export * from "./detector.js";
export * from "./doctor.js";
export * from "./hooks.js";
export * from "./knowledge.js";
export * from "./merge.js";
export * from "./report.js";
export * from "./scaffold.js";
export * from "./secrets.js";
export * from "./state.js";
export * from "./system.js";
export * from "./toolchain.js";
export * from "./verification.js";

import { ensureBackup, restoreBackup } from "./backup.js";
import { generateWorkflows } from "./ci.js";
import type { PrecursorConfig } from "./config.js";
import { loadConfig, validateConfig } from "./config.js";
import { detectStacks } from "./detector.js";
import { runDoctor } from "./doctor.js";
import { runPostScaffoldHooks } from "./hooks.js";
import { runScaffold } from "./scaffold.js";
import { scanSecrets } from "./secrets.js";
import { resetState, updateState } from "./state.js";
import { installTool, resolveTool } from "./toolchain.js";
import { runVerification } from "./verification.js";

export interface PrecursorOptions {
  configPath?: string;
  strict?: boolean;
  offline?: boolean;
  json?: boolean;
  noColor?: boolean;
}

export interface PrecursorResult {
  success: boolean;
  message?: string;
  data?: unknown;
  errors?: string[];
  warnings?: string[];
}

/**
 * Main setup function - idempotent bootstrap
 */
export async function setup(options: PrecursorOptions = {}): Promise<PrecursorResult> {
  try {
    const config = await loadConfig(options.configPath);
    await validateConfig(config);

    // Ensure backup before any writes
    if (config.backup?.enabled !== false) {
      await ensureBackup(config);
    }

    // Detect stacks
    const stacks = await detectStacks(config);

    // Resolve and install tools
    const toolResults = await resolveAndInstallTools(config, stacks, options);

    // Generate/update files
    await runScaffold(config, stacks, options);

    // Run post-scaffold hooks (formatting, etc.)
    await runPostScaffoldHooks(config, stacks);

    // Run verification loops
    const verificationReport = await runVerification(config, stacks);
    const verificationCfg = (config.verification || {}) as { failOnError?: boolean };
    if (!verificationReport.success && verificationCfg.failOnError === true) {
      return {
        success: false,
        message: "Verification failed",
        data: verificationReport,
        errors: verificationReport.errors,
        warnings: verificationReport.warnings,
      };
    }

    // Generate CI workflows
    if (config.ci?.enabled !== false) {
      await generateWorkflows(config, stacks, options);
    }

    // Scan for secrets
    if (config.secrets?.enabled !== false) {
      const secretResults = await scanSecrets(config);
      if (secretResults.found.length > 0) {
        return {
          success: false,
          message: "Secrets detected in codebase",
          data: secretResults,
          warnings: secretResults.found.map((s) => `Secret found: ${s.path}`),
        };
      }
    }

    // Update state
    await updateState(config, stacks);

    return {
      success: true,
      message: "Setup completed successfully",
      data: { stacks, tools: toolResults },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      errors: [error instanceof Error ? error.stack || error.message : String(error)],
    };
  }
}

/**
 * Scan-only doctor mode
 */
export async function scan(options: PrecursorOptions = {}): Promise<PrecursorResult> {
  try {
    const config = await loadConfig(options.configPath);
    await validateConfig(config);

    const stacks = await detectStacks(config);
    const doctorReport = await runDoctor(config, stacks, options);

    return {
      success: true,
      message: "Scan completed",
      data: doctorReport,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      errors: [error instanceof Error ? error.stack || error.message : String(error)],
    };
  }
}

/**
 * Rollback to latest backup
 */
export async function rollback(options: PrecursorOptions = {}): Promise<PrecursorResult> {
  try {
    const config = await loadConfig(options.configPath);
    const result = await restoreBackup(config);

    return {
      success: result.success,
      message: result.message,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      errors: [error instanceof Error ? error.stack || error.message : String(error)],
    };
  }
}

/**
 * Reset state cache
 */
export async function reset(_options: PrecursorOptions = {}): Promise<PrecursorResult> {
  try {
    await resetState();
    return {
      success: true,
      message: "State cache reset",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      errors: [error instanceof Error ? error.stack || error.message : String(error)],
    };
  }
}

/**
 * Self-update Precursor core/scripts
 */
export async function update(options: PrecursorOptions = {}): Promise<PrecursorResult> {
  try {
    const config = await loadConfig(options.configPath);
    const updateConfig = config.update || {};

    // Check if update is enabled
    if (updateConfig.enabled === false) {
      return {
        success: false,
        message: "Update is disabled in configuration",
        warnings: ["Set 'update.enabled: true' in precursor.json to enable updates"],
      };
    }

    // If offline mode, skip update
    if (options.offline) {
      return {
        success: false,
        message: "Cannot update in offline mode",
        warnings: ["Remove --offline flag to enable updates"],
      };
    }

    const warnings: string[] = [];
    const results: Record<string, unknown> = {};

    // Update dependencies
    try {
      const { spawn } = await import("node:child_process");
      const bunProcess = spawn("bun", ["install"], {
        cwd: process.cwd(),
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";

      bunProcess.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      bunProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      await new Promise<void>((resolve, reject) => {
        bunProcess.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`bun install failed with code ${code}: ${stderr}`));
          }
        });
        bunProcess.on("error", reject);
      });

      results.dependencies = { updated: true, output: stdout };
    } catch (error) {
      warnings.push(
        `Failed to update dependencies: ${error instanceof Error ? error.message : String(error)}`
      );
      results.dependencies = {
        updated: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // If endpoint is configured, check for remote updates
    if (updateConfig.endpoint) {
      try {
        const response = await fetch(updateConfig.endpoint);
        if (!response.ok) {
          throw new Error(`Update endpoint returned ${response.status}`);
        }

        const updateInfo = (await response.json()) as {
          version?: string;
          sha256?: string;
          url?: string;
        };

        const remoteInfo: Record<string, unknown> = {
          available: true,
          version: updateInfo.version,
          sha256: updateInfo.sha256,
        };

        // If SHA256 verification is enabled and provided, verify
        if (updateConfig.verifySha256 !== false && updateInfo.sha256) {
          // In a full implementation, we would download and verify the file
          // For now, we just report that verification would be performed
          remoteInfo.verification = "sha256 verification enabled";
        }

        results.remote = remoteInfo;

        warnings.push(
          "Remote update endpoint configured, but automatic download not yet implemented. Use git pull or manual update."
        );
      } catch (error) {
        warnings.push(
          `Failed to check remote updates: ${error instanceof Error ? error.message : String(error)}`
        );
        results.remote = {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      warnings.push("No update endpoint configured. Update only refreshed local dependencies.");
    }

    return {
      success: warnings.length === 0 || !options.strict,
      message: "Update completed",
      data: results,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      errors: [error instanceof Error ? error.stack || error.message : String(error)],
    };
  }
}

async function resolveAndInstallTools(
  config: PrecursorConfig,
  stacks: string[],
  options: PrecursorOptions
): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  for (const stack of stacks) {
    const stackConfig = config[stack as keyof PrecursorConfig];
    if (!stackConfig || (stackConfig as { enabled?: boolean }).enabled === false) {
      continue;
    }

    // Resolve tools for this stack
    const toolIds = getToolIdsForStack(stack, stackConfig);

    for (const toolId of toolIds) {
      try {
        const tool = await resolveTool(toolId, config, options);
        if (tool && !tool.found && !options.offline) {
          if (tool.critical) {
            throw new Error(`Critical tool ${toolId} not found`);
          }
          // Try to install
          await installTool(toolId, config, options);
        }
        results[toolId] = tool;
      } catch (error) {
        if (options.strict) {
          throw error;
        }
        results[toolId] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  return results;
}

function getToolIdsForStack(_stack: string, stackConfig: unknown): string[] {
  const tools: string[] = [];
  const cfg = stackConfig as Record<string, unknown>;

  if (cfg.runtime) tools.push(String(cfg.runtime));
  if (cfg.linter) tools.push(String(cfg.linter));
  if (cfg.formatter) tools.push(String(cfg.formatter));
  if (cfg.typechecker && cfg.typechecker !== "none") {
    tools.push(String(cfg.typechecker));
  }

  return tools;
}
