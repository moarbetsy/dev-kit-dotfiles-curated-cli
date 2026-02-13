/**
 * Secret scanning (best-effort)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PrecursorConfig } from "./config.js";

export interface SecretScanResult {
  found: SecretFinding[];
  scanned: number;
  ignored: number;
}

export interface SecretFinding {
  path: string;
  line: number;
  pattern: string;
  entropy?: number;
}

/**
 * Scan for secrets in codebase
 */
export async function scanSecrets(config: PrecursorConfig): Promise<SecretScanResult> {
  const result: SecretScanResult = {
    found: [],
    scanned: 0,
    ignored: 0,
  };

  const ignorePatterns = config.secrets?.ignorePatterns || [];
  const threshold = config.secrets?.highEntropyThreshold || 0.7;

  // Known token patterns
  const tokenPatterns = [
    /(?:api[_-]?key|apikey)\s*[=:]\s*["']?([a-zA-Z0-9_\-]{20,})["']?/i,
    /(?:secret|password|token)\s*[=:]\s*["']?([a-zA-Z0-9_\-]{16,})["']?/i,
    /(?:aws[_-]?access[_-]?key[_-]?id)\s*[=:]\s*["']?(AKIA[0-9A-Z]{16})["']?/i,
    /(?:aws[_-]?secret[_-]?access[_-]?key)\s*[=:]\s*["']?([a-zA-Z0-9/+=]{40})["']?/i,
    /(?:ghp_[a-zA-Z0-9]{36})/i,
    /(?:xox[baprs]-[0-9a-zA-Z-]{10,})/i,
  ];

  await scanDirectory(".", ignorePatterns, tokenPatterns, threshold, result);

  return result;
}

/**
 * Scan directory recursively
 */
async function scanDirectory(
  dir: string,
  ignorePatterns: string[],
  tokenPatterns: RegExp[],
  threshold: number,
  result: SecretScanResult
): Promise<void> {
  // Check if directory should be ignored
  if (shouldIgnore(dir, ignorePatterns)) {
    result.ignored++;
    return;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip hidden dirs except .git
      if (entry.name.startsWith(".") && entry.name !== ".git" && entry.isDirectory()) {
        continue;
      }

      // Skip common ignore dirs
      const skipDirs = ["node_modules", ".venv", "venv", "target", "dist", "build", ".precursor"];
      if (entry.isDirectory() && skipDirs.includes(entry.name)) {
        result.ignored++;
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, ignorePatterns, tokenPatterns, threshold, result);
      } else if (entry.isFile()) {
        if (shouldIgnore(fullPath, ignorePatterns)) {
          result.ignored++;
          continue;
        }

        // Skip binary files
        if (isTextFile(fullPath)) {
          result.scanned++;
          await scanFile(fullPath, tokenPatterns, threshold, result);
        }
      }
    }
  } catch {
    // Ignore permission errors
  }
}

/**
 * Scan a single file for secrets
 */
async function scanFile(
  filePath: string,
  tokenPatterns: RegExp[],
  threshold: number,
  result: SecretScanResult
): Promise<void> {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check token patterns
      for (const pattern of tokenPatterns) {
        const match = line.match(pattern);
        if (match) {
          const value = match[1] || match[0];
          const entropy = calculateEntropy(value);

          // High entropy suggests it's a secret
          if (entropy >= threshold) {
            result.found.push({
              path: filePath,
              line: lineNum,
              pattern: pattern.source,
              entropy,
            });
          }
        }
      }

      // Check for high-entropy strings (potential secrets)
      const highEntropyStrings = extractHighEntropyStrings(line, threshold);
      for (const str of highEntropyStrings) {
        result.found.push({
          path: filePath,
          line: lineNum,
          pattern: "high-entropy",
          entropy: calculateEntropy(str),
        });
      }
    }
  } catch {
    // Ignore read errors
  }
}

/**
 * Check if path should be ignored
 */
function shouldIgnore(path: string, patterns: string[]): boolean {
  // Simple glob matching (basic implementation)
  for (const pattern of patterns) {
    const regex = globToRegex(pattern);
    if (regex.test(path)) {
      return true;
    }
  }
  return false;
}

/**
 * Convert glob pattern to regex (basic)
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "___DOUBLE_STAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___DOUBLE_STAR___/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if file is text (basic heuristic)
 */
function isTextFile(filePath: string): boolean {
  const textExtensions = [
    ".ts",
    ".js",
    ".tsx",
    ".jsx",
    ".json",
    ".jsonc",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".txt",
    ".py",
    ".rs",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".sh",
    ".ps1",
    ".bat",
    ".cmd",
  ];

  return textExtensions.some((ext) => filePath.endsWith(ext));
}

/**
 * Calculate Shannon entropy of a string
 */
function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  // Normalize to 0-1 range (assuming max entropy ~8 for alphanumeric)
  return Math.min(entropy / 8, 1);
}

/**
 * Extract high-entropy strings from a line
 */
function extractHighEntropyStrings(line: string, threshold: number): string[] {
  const strings: string[] = [];
  // Match quoted strings and long alphanumeric sequences
  const stringPattern = /["']([^"']{16,})["']|([a-zA-Z0-9_\-]{20,})/g;
  let match;

  while ((match = stringPattern.exec(line)) !== null) {
    const str = match[1] || match[2];
    if (str && calculateEntropy(str) >= threshold) {
      strings.push(str);
    }
  }

  return strings;
}
