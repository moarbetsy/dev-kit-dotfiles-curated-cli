/**
 * Deep merge engine for JSON/JSONC/YAML files
 * Preserves unknown keys, handles arrays intelligently
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface MergeOptions {
  backup?: boolean;
  backupDir?: string;
  atomic?: boolean;
}

/**
 * Deep merge two objects, with array append-unique behavior
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
  options: { arrayStrategy?: "replace" | "append-unique" } = {}
): T & Record<string, unknown> {
  const { arrayStrategy = "append-unique" } = options;
  // Use a mutable type during merge to allow property assignment
  const result: Record<string, unknown> = { ...target };

  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const sourceValue = source[key];
    const targetValue = result[key];

    if (sourceValue === null || sourceValue === undefined) {
      // Skip null/undefined in source
      continue;
    }

    if (Array.isArray(sourceValue)) {
      if (arrayStrategy === "append-unique" && Array.isArray(targetValue)) {
        // Append unique values, preserve order
        const existing = new Set(targetValue);
        const toAdd = sourceValue.filter((item) => !existing.has(item));
        result[key] = [...targetValue, ...toAdd];
      } else {
        result[key] = sourceValue;
      }
    } else if (
      typeof sourceValue === "object" &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue) &&
      !Array.isArray(sourceValue)
    ) {
      // Recursive merge for nested objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
        options
      );
    } else {
      // Replace primitive or different types
      result[key] = sourceValue;
    }
  }

  return result as T & Record<string, unknown>;
}

/**
 * Load and parse a file (JSON, JSONC, or YAML)
 */
export function loadFile(filePath: string): unknown {
  if (!existsSync(filePath)) {
    return null;
  }

  const content = readFileSync(filePath, "utf-8");

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYaml(content);
  } else {
    // JSON or JSONC
    return parseJsonc(content);
  }
}

/**
 * Write file with atomic operation and optional backup
 */
export async function writeFile(
  filePath: string,
  data: unknown,
  options: MergeOptions = {}
): Promise<void> {
  const { backup = true, backupDir = ".precursor/backups", atomic = true } = options;

  // Create backup if requested
  if (backup && existsSync(filePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resolvedFilePath = resolve(filePath);
    // Use basename to avoid absolute paths in backup directory
    const backupPath = resolve(backupDir, timestamp, basename(resolvedFilePath));
    const backupDirPath = dirname(backupPath);
    if (!existsSync(backupDirPath)) {
      mkdirSync(backupDirPath, { recursive: true });
    }
    const existingContent = readFileSync(resolvedFilePath, "utf-8");
    writeFileSync(backupPath, existingContent, "utf-8");
  }

  // Serialize based on file extension
  let serialized: string;
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    serialized = stringifyYaml(data, { indent: 2, lineWidth: 100 });
  } else {
    // JSON or JSONC - use standard JSON.stringify
    serialized = JSON.stringify(data, undefined, 2);
  }

  // Resolve to absolute path to handle relative paths correctly
  const resolvedPath = resolve(filePath);
  const dir = dirname(resolvedPath);

  // Only create directory if it doesn't exist and is not the current directory
  // For root-level files, dirname returns the current directory which already exists
  if (!existsSync(dir) && dir !== resolve(".")) {
    mkdirSync(dir, { recursive: true });
  }

  // Atomic write: write to temp file, then rename
  if (atomic) {
    const tempPath = `${resolvedPath}.tmp`;
    writeFileSync(tempPath, serialized, "utf-8");
    // On Windows, we need to remove target first if it exists
    if (existsSync(resolvedPath)) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(resolvedPath);
    }
    const { renameSync } = await import("node:fs");
    renameSync(tempPath, resolvedPath);
  } else {
    writeFileSync(resolvedPath, serialized, "utf-8");
  }
}

/**
 * Merge file with new data
 */
export async function mergeFile(
  filePath: string,
  newData: unknown,
  options: MergeOptions = {}
): Promise<void> {
  const existing = loadFile(filePath);
  const merged = existing
    ? deepMerge(existing as Record<string, unknown>, newData as Record<string, unknown>)
    : newData;

  await writeFile(filePath, merged, options);
}
