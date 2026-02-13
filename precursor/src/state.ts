/**
 * State management with hash-based caching
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { PrecursorConfig } from "./config.js";

export interface State {
  version: string;
  lastUpdate: string;
  hashes: Record<string, string>;
  stacks: string[];
  tools: Record<string, ToolState>;
  [key: string]: unknown;
}

export interface ToolState {
  version?: string;
  path?: string;
  installed?: boolean;
  lastCheck?: string;
}

const STATE_FILE = ".precursor/state.json";
const STATE_VERSION = "1.0.0";

/**
 * Compute SHA-256 hash of file content or string
 */
export function computeHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute hash of a file
 */
export function computeFileHash(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath);
    return computeHash(content);
  } catch {
    return null;
  }
}

/**
 * Load state from disk
 */
export function loadState(): State | null {
  if (!existsSync(STATE_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(content) as State;
  } catch {
    return null;
  }
}

/**
 * Save state to disk
 */
export function saveState(state: State): void {
  mkdirSync(join(STATE_FILE, ".."), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Get current state (load or create new)
 */
export function getState(): State {
  const existing = loadState();
  if (existing && existing.version === STATE_VERSION) {
    return existing;
  }

  return {
    version: STATE_VERSION,
    lastUpdate: new Date().toISOString(),
    hashes: {},
    stacks: [],
    tools: {},
  };
}

/**
 * Update state with new information
 */
export async function updateState(_config: PrecursorConfig, stacks: string[]): Promise<void> {
  const state = getState();

  // Update hashes for key files
  const filesToHash = [
    "precursor.json",
    "precursor.jsonc",
    "precursor.yaml",
    "precursor.yml",
    "precursor.schema.json",
    "pyproject.toml",
    "package.json",
    "Cargo.toml",
    "uv.lock",
    "bun.lock",
    "bun.lockb",
    "Cargo.lock",
    ".vscode/settings.json",
    ".cursor/mcp.json",
  ];

  for (const file of filesToHash) {
    const hash = computeFileHash(file);
    if (hash) {
      state.hashes[file] = hash;
    }
  }

  state.stacks = stacks;
  state.lastUpdate = new Date().toISOString();

  saveState(state);
}

/**
 * Check if file has changed since last state
 */
export function hasFileChanged(filePath: string): boolean {
  const state = getState();
  const currentHash = computeFileHash(filePath);
  const lastHash = state.hashes[filePath];

  if (!currentHash) {
    return lastHash !== undefined; // File deleted
  }

  return currentHash !== lastHash;
}

/**
 * Check if any of the tracked files changed
 */
export function hasAnyFileChanged(filePaths: string[]): boolean {
  return filePaths.some((file) => hasFileChanged(file));
}

/**
 * Reset state cache
 */
export function resetState(): void {
  if (existsSync(STATE_FILE)) {
    const { unlinkSync } = require("node:fs");
    unlinkSync(STATE_FILE);
  }
}
