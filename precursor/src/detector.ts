/**
 * Stack detection based on marker files
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { PrecursorConfig } from "./config.js";

export type StackType = "python" | "web" | "rust" | "cpp" | "docker";

/**
 * Detect all stacks present in the project
 */
export async function detectStacks(config: PrecursorConfig): Promise<StackType[]> {
  const stacks: StackType[] = [];
  const workspaceRoot = await getWorkspaceRoot(config);

  if (detectPython(workspaceRoot)) {
    stacks.push("python");
  }

  if (detectWeb(workspaceRoot)) {
    stacks.push("web");
  }

  if (detectRust(workspaceRoot)) {
    stacks.push("rust");
  }

  if (detectCpp(workspaceRoot)) {
    stacks.push("cpp");
  }

  if (detectDocker(workspaceRoot)) {
    stacks.push("docker");
  }

  return stacks;
}

/**
 * Get workspace root (git root or explicit config)
 */
async function getWorkspaceRoot(config: PrecursorConfig): Promise<string> {
  if (config.workspace?.root) {
    return config.workspace.root;
  }

  if (config.workspace?.mode === "subproject") {
    return process.cwd();
  }

  // Try to find git root
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (config.workspace?.mode === "root" || config.workspace?.mode === "auto") {
      return gitRoot;
    }
  } catch {
    // Not a git repo or git not available
  }

  return process.cwd();
}

/**
 * Detect Python stack
 */
function detectPython(root: string): boolean {
  const markers = [
    "pyproject.toml",
    "uv.lock",
    "requirements.txt",
    "poetry.lock",
    "Pipfile.lock",
    "setup.py",
    "setup.cfg",
  ];

  return markers.some((marker) => existsSync(join(root, marker)));
}

/**
 * Detect Web/JS/TS stack
 */
function detectWeb(root: string): boolean {
  const markers = [
    "package.json",
    "bun.lock",
    "bun.lockb",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.ts",
    "svelte.config.js",
    "svelte.config.ts",
    "astro.config.js",
    "astro.config.ts",
  ];

  if (markers.some((marker) => existsSync(join(root, marker)))) {
    return true;
  }

  // Check for HTML/CSS files in common locations
  const htmlFiles = findFiles(root, /\.html$/i, 2);
  const cssFiles = findFiles(root, /\.css$/i, 2);

  return htmlFiles.length > 0 || cssFiles.length > 0;
}

/**
 * Detect Rust stack
 */
function detectRust(root: string): boolean {
  return existsSync(join(root, "Cargo.toml")) || existsSync(join(root, "Cargo.lock"));
}

/**
 * Detect C/C++ stack
 */
function detectCpp(root: string): boolean {
  const markers = [
    "CMakeLists.txt",
    "meson.build",
    "Makefile",
    ".clang-format",
    ".clang-tidy",
    "compile_commands.json",
    "vcpkg.json",
  ];

  if (markers.some((marker) => existsSync(join(root, marker)))) {
    return true;
  }

  // Check for C/C++ source files
  const cppFiles = findFiles(root, /\.(c|cc|cpp|cxx|h|hpp|hxx)$/i, 2);
  return cppFiles.length > 0;
}

/**
 * Detect Docker stack
 */
function detectDocker(root: string): boolean {
  return (
    existsSync(join(root, "Dockerfile")) ||
    existsSync(join(root, "docker-compose.yml")) ||
    existsSync(join(root, "docker-compose.yaml"))
  );
}

/**
 * Find files matching pattern (limited depth)
 */
function findFiles(root: string, pattern: RegExp, maxDepth: number): string[] {
  const results: string[] = [];

  function search(dir: string, depth: number): void {
    if (depth > maxDepth) {
      return;
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip hidden dirs and common ignore patterns
        if (entry.name.startsWith(".") && entry.name !== ".git") {
          continue;
        }

        if (entry.isDirectory()) {
          // Skip common ignore dirs
          const skipDirs = ["node_modules", ".venv", "venv", "target", "dist", "build", ".git"];
          if (!skipDirs.includes(entry.name)) {
            search(join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(join(dir, entry.name));
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  search(root, 0);
  return results;
}
