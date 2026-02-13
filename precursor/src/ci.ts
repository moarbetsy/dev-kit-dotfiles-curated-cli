/**
 * GitHub Actions workflow generation
 */

import { mkdirSync } from "node:fs";
import { mergeFile } from "./merge.js";
import type { PrecursorConfig } from "./config.js";
import type { PrecursorOptions } from "./index.js";

/**
 * Generate GitHub Actions workflows based on detected stacks
 */
export async function generateWorkflows(
  config: PrecursorConfig,
  stacks: string[],
  _options: PrecursorOptions = {}
): Promise<void> {
  if (config.ci?.enabled === false) {
    return;
  }

  mkdirSync(".github/workflows", { recursive: true });

  // Generate workflow for each stack
  for (const stack of stacks) {
    const workflowConfig = config.ci?.workflows?.[stack];
    if (workflowConfig?.enabled === false) {
      continue;
    }

    await generateStackWorkflow(stack, config, workflowConfig);
  }

  // Generate main Precursor CI workflow
  await generatePrecursorWorkflow(config, stacks);
}

/**
 * Generate workflow for a specific stack
 */
async function generateStackWorkflow(
  stack: string,
  config: PrecursorConfig,
  workflowConfig?: { os?: string[]; matrix?: Record<string, unknown> }
): Promise<void> {
  const os = workflowConfig?.os || ["ubuntu-latest"];
  const workflowPath = `.github/workflows/${stack}.yml`;

  let workflow: unknown;

  switch (stack) {
    case "python":
      workflow = generatePythonWorkflow(config, os);
      break;
    case "web":
      workflow = generateWebWorkflow(config, os);
      break;
    case "rust":
      workflow = generateRustWorkflow(config, os);
      break;
    case "cpp":
      workflow = generateCppWorkflow(config, os);
      break;
    case "docker":
      workflow = generateDockerWorkflow(config, os);
      break;
    default:
      return;
  }

  await mergeFile(workflowPath, workflow, { backup: true });
}

/**
 * Generate Python workflow
 */
function generatePythonWorkflow(config: PrecursorConfig, os: string[]): Record<string, unknown> {
  const pythonCfg = config.python || {};
  const typechecker = pythonCfg.typechecker || "pyright";

  return {
    name: "Python CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      test: {
        "runs-on": os[0],
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Install uv",
            uses: "astral-sh/setup-uv@v4",
            with: { "uv-version": "latest" },
          },
          {
            name: "Install dependencies",
            run: "uv sync",
          },
          {
            name: "Ruff check",
            run: "uv run ruff check .",
          },
          {
            name: "Ruff format check",
            run: "uv run ruff format --check .",
          },
          ...(typechecker !== "none"
            ? [
                {
                  name: "Type check",
                  run: `uv run ${typechecker} .`,
                },
              ]
            : []),
          {
            name: "Run tests",
            run: "uv run pytest || true",
            "continue-on-error": true,
          },
        ],
      },
    },
  };
}

/**
 * Generate Web/JS/TS workflow
 */
function generateWebWorkflow(config: PrecursorConfig, os: string[]): Record<string, unknown> {
  const webCfg = config.web || {};

  return {
    name: "Web CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      test: {
        "runs-on": os[0],
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Setup Bun",
            uses: "oven-sh/setup-bun@v2",
            with: { "bun-version": "latest" },
          },
          {
            name: "Install dependencies",
            run: "bun install",
          },
          {
            name: "Biome check",
            run: "bunx biome check .",
          },
          ...(webCfg.typechecker !== "none"
            ? [
                {
                  name: "TypeScript check",
                  run: "bunx tsc --noEmit",
                },
              ]
            : []),
          {
            name: "Run tests",
            run: "bun test || true",
            "continue-on-error": true,
          },
        ],
      },
    },
  };
}

/**
 * Generate Rust workflow
 */
function generateRustWorkflow(_config: PrecursorConfig, os: string[]): Record<string, unknown> {
  return {
    name: "Rust CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      test: {
        "runs-on": os[0],
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Install Rust",
            uses: "dtolnay/rust-toolchain@stable",
          },
          {
            name: "Cache cargo",
            uses: "actions/cache@v4",
            with: {
              path: "~/.cargo",
              key: "${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}",
            },
          },
          {
            name: "Format check",
            run: "cargo fmt --check",
          },
          {
            name: "Clippy",
            run: "cargo clippy -- -D warnings",
          },
          {
            name: "Run tests",
            run: "cargo test",
          },
        ],
      },
    },
  };
}

/**
 * Generate C/C++ workflow
 */
function generateCppWorkflow(_config: PrecursorConfig, os: string[]): Record<string, unknown> {
  return {
    name: "C/C++ CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      test: {
        "runs-on": os[0],
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Install clang tools",
            run: os[0].includes("ubuntu")
              ? "sudo apt-get update && sudo apt-get install -y clang-format clang-tidy"
              : "brew install llvm",
          },
          {
            name: "Configure CMake",
            run: "cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
          },
          {
            name: "Build",
            run: "cmake --build build",
          },
          {
            name: "Format check",
            run: "find . -name '*.cpp' -o -name '*.hpp' | xargs clang-format --dry-run --Werror || true",
            "continue-on-error": true,
          },
          {
            name: "Run tests",
            run: "cd build && ctest || true",
            "continue-on-error": true,
          },
        ],
      },
    },
  };
}

/**
 * Generate Docker workflow
 */
function generateDockerWorkflow(_config: PrecursorConfig, os: string[]): Record<string, unknown> {
  return {
    name: "Docker CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      test: {
        "runs-on": os[0],
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Build Docker image",
            run: "docker build -t test-image . || true",
            "continue-on-error": true,
          },
        ],
      },
    },
  };
}

/**
 * Generate main Precursor CI workflow
 */
async function generatePrecursorWorkflow(
  _config: PrecursorConfig,
  _stacks: string[]
): Promise<void> {
  const workflow = {
    name: "Precursor CI",
    on: {
      push: { branches: ["main", "master"] },
      pull_request: { branches: ["main", "master"] },
    },
    jobs: {
      precursor: {
        "runs-on": "ubuntu-latest",
        steps: [
          {
            name: "Checkout",
            uses: "actions/checkout@v4",
          },
          {
            name: "Setup Bun",
            uses: "oven-sh/setup-bun@v2",
          },
          {
            name: "Run Precursor",
            run: "bun run precursor.ps1 -Scan --json",
          },
        ],
      },
    },
  };

  await mergeFile(".github/workflows/precursor.yml", workflow, { backup: true });
}
