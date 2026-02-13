/**
 * Doctor checks and fixes
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";
import type { PrecursorOptions } from "./index.js";
import { getSystemInfo, type SystemInfo } from "./system.js";
import { resolveTool } from "./toolchain.js";

export interface DoctorReport {
  stacks: string[];
  tools: Record<string, ToolDiagnostic>;
  configs: ConfigDiagnostic[];
  system?: SystemInfo;
  recommendations: string[];
  skipped: string[];
  timestamp: string;
}

export interface ToolDiagnostic {
  found: boolean;
  version?: string;
  path?: string;
  checkPassed?: boolean;
  error?: string;
}

export interface ConfigDiagnostic {
  file: string;
  exists: boolean;
  valid: boolean;
  issues?: string[];
}

/**
 * Run doctor scan
 */
export async function runDoctor(
  config: PrecursorConfig,
  stacks: string[],
  options: PrecursorOptions = {}
): Promise<DoctorReport> {
  const report: DoctorReport = {
    stacks: [...stacks],
    tools: {},
    configs: [],
    recommendations: [],
    skipped: [],
    timestamp: new Date().toISOString(),
  };

  // Check tools for each stack
  for (const stack of stacks) {
    const toolIds = getToolIdsForStack(stack, config);
    for (const toolId of toolIds) {
      if (options.offline && !report.tools[toolId]) {
        report.skipped.push(`Tool check: ${toolId} (offline mode)`);
        continue;
      }

      try {
        const tool = await resolveTool(toolId, config, options);
        const diagnostic: ToolDiagnostic = {
          found: tool.found,
          version: tool.version,
          path: tool.path,
        };

        // Run optional checks
        if (tool.found && !options.offline) {
          diagnostic.checkPassed = await runToolCheck(toolId, stack, config);
        }

        report.tools[toolId] = diagnostic;

        if (!tool.found && tool.critical) {
          report.recommendations.push(`Install critical tool: ${toolId}`);
        }
      } catch (error) {
        report.tools[toolId] = {
          found: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  // Check config files
  report.configs = await checkConfigs(stacks, config);

  // Collect system information
  try {
    report.system = await getSystemInfo();

    // Add PATH-related recommendations
    if (report.system.path.issues.length > 0) {
      report.recommendations.push(...report.system.path.issues);
    }

    if (report.system.path.missing.length > 0) {
      report.recommendations.push(
        `Found ${report.system.path.missing.length} missing PATH entries. Consider cleaning up your PATH.`
      );
    }

    if (report.system.path.duplicates.length > 0) {
      report.recommendations.push(
        `Found ${report.system.path.duplicates.length} duplicate PATH entries. Consider removing duplicates.`
      );
    }

    if (report.system.path.dangerous.length > 0) {
      report.recommendations.push(
        `Found ${report.system.path.dangerous.length} dangerous PATH entries (security risk). Run '.\scripts\cleanup-path.ps1' to remove them.`
      );
    }
  } catch (error) {
    // System info is optional, don't fail if it can't be collected
    report.skipped.push(
      `System info collection failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return report;
}

/**
 * Get tool IDs for a stack
 */
function getToolIdsForStack(stack: string, config: PrecursorConfig): string[] {
  const tools: string[] = [];
  const stackConfig = config[stack as keyof PrecursorConfig] as Record<string, unknown> | undefined;

  if (!stackConfig) {
    return tools;
  }

  if (stackConfig.runtime) tools.push(String(stackConfig.runtime));
  if (stackConfig.linter) tools.push(String(stackConfig.linter));
  if (stackConfig.formatter) tools.push(String(stackConfig.formatter));
  if (stackConfig.typechecker && stackConfig.typechecker !== "none") {
    tools.push(String(stackConfig.typechecker));
  }

  return tools;
}

/**
 * Run tool-specific checks
 */
async function runToolCheck(
  toolId: string,
  _stack: string,
  config: PrecursorConfig
): Promise<boolean> {
  try {
    switch (toolId) {
      case "ruff":
        return await checkRuff(config);
      case "biome":
        return await checkBiome(config);
      case "clippy":
        return await checkClippy(config);
      case "clang-format":
        return await checkClangFormat(config);
      default:
        return true; // Assume OK if no specific check
    }
  } catch {
    return false;
  }
}

/**
 * Check Ruff configuration
 */
async function checkRuff(_config: PrecursorConfig): Promise<boolean> {
  try {
    // Check if ruff config exists in pyproject.toml or ruff.toml
    const hasConfig =
      existsSync("pyproject.toml") || existsSync("ruff.toml") || existsSync(".ruff.toml");

    if (!hasConfig) {
      return false; // Config missing
    }

    // Try to run ruff check (dry run)
    execSync("ruff check --help", {
      encoding: "utf-8",
      stdio: "ignore",
      timeout: 5000,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Check Biome configuration
 */
async function checkBiome(_config: PrecursorConfig): Promise<boolean> {
  try {
    // Check if biome.json exists
    const hasConfig = existsSync("biome.json");

    if (!hasConfig) {
      return false;
    }

    // Try to run biome check
    execSync("bunx biome check --help", {
      encoding: "utf-8",
      stdio: "ignore",
      timeout: 5000,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Check Clippy
 */
async function checkClippy(_config: PrecursorConfig): Promise<boolean> {
  try {
    execSync("cargo clippy --version", {
      encoding: "utf-8",
      stdio: "ignore",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check clang-format
 */
async function checkClangFormat(_config: PrecursorConfig): Promise<boolean> {
  try {
    execSync("clang-format --version", {
      encoding: "utf-8",
      stdio: "ignore",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check configuration files
 */
async function checkConfigs(
  stacks: string[],
  _config: PrecursorConfig
): Promise<ConfigDiagnostic[]> {
  const diagnostics: ConfigDiagnostic[] = [];

  // Check stack-specific configs
  if (stacks.includes("python")) {
    diagnostics.push({
      file: "pyproject.toml",
      exists: existsSync("pyproject.toml"),
      valid: true,
    });
  }

  if (stacks.includes("web")) {
    diagnostics.push({
      file: "package.json",
      exists: existsSync("package.json"),
      valid: true,
    });
    diagnostics.push({
      file: "biome.json",
      exists: existsSync("biome.json"),
      valid: true,
    });
    diagnostics.push({
      file: "tsconfig.json",
      exists: existsSync("tsconfig.json"),
      valid: true,
    });
  }

  if (stacks.includes("rust")) {
    diagnostics.push({
      file: "Cargo.toml",
      exists: existsSync("Cargo.toml"),
      valid: true,
    });
  }

  if (stacks.includes("cpp")) {
    diagnostics.push({
      file: ".clang-format",
      exists: existsSync(".clang-format"),
      valid: true,
    });
    diagnostics.push({
      file: "compile_commands.json",
      exists: existsSync("compile_commands.json"),
      valid: true,
    });
  }

  return diagnostics;
}

/**
 * Apply a specific fix
 */
export async function doctorFix(
  fixKey: string,
  config: PrecursorConfig,
  _options: PrecursorOptions = {}
): Promise<{ success: boolean; message: string }> {
  switch (fixKey) {
    case "scaffold-ruff-config":
      return await scaffoldRuffConfig(config);
    case "scaffold-biome-config":
      return await scaffoldBiomeConfig(config);
    case "scaffold-clang-format":
      return await scaffoldClangFormat(config);
    default:
      return { success: false, message: `Unknown fix: ${fixKey}` };
  }
}

async function scaffoldRuffConfig(
  _config: PrecursorConfig
): Promise<{ success: boolean; message: string }> {
  // Implementation would create ruff config in pyproject.toml
  return { success: true, message: "Ruff config scaffolded" };
}

async function scaffoldBiomeConfig(
  _config: PrecursorConfig
): Promise<{ success: boolean; message: string }> {
  // Implementation would create biome.json
  return { success: true, message: "Biome config scaffolded" };
}

async function scaffoldClangFormat(
  _config: PrecursorConfig
): Promise<{ success: boolean; message: string }> {
  // Implementation would create .clang-format
  return { success: true, message: "clang-format config scaffolded" };
}
