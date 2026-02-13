/**
 * Scaffold/update project files (rules, settings, etc.)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { ensureCommandsDirectory, generateCommandsRule, getAllCommands } from "./commands.js";
import type { PrecursorConfig } from "./config.js";
import type { PrecursorOptions } from "./index.js";
import { generateKnowledgeRule, initializeKnowledgeBase as initKnowledge } from "./knowledge.js";
import { mergeFile } from "./merge.js";

/**
 * Run scaffold to generate/update files
 */
export async function runScaffold(
  config: PrecursorConfig,
  stacks: string[],
  _options: PrecursorOptions = {}
): Promise<void> {
  // Ensure directories exist
  mkdirSync(".cursor/rules", { recursive: true });
  mkdirSync(".vscode", { recursive: true });

  // Ensure package.json exists (for web/TypeScript projects)
  if (stacks.includes("web")) {
    await ensurePackageJson(config);
  }

  // Generate stack-specific rules
  for (const stack of stacks) {
    await generateRule(stack, config);
  }

  // Update VS Code settings
  await updateVSCodeSettings(config, stacks);

  // Update extensions.json
  await updateExtensions(config, stacks);

  // Update .cursor/mcp.json
  if (config.mcp?.enabled !== false) {
    await updateMcpConfig(config);
  }

  // Update .gitignore and .cursorignore
  await updateIgnoreFiles(config, stacks);

  // Generate verification rule
  await generateVerificationRule(config, stacks);

  // Initialize knowledge base
  await initializeKnowledgeBase(config, stacks);

  // Setup commands directory and generate rule
  await setupCommands(config);
}

/**
 * Generate .cursor/rules/*.mdc file for a stack
 */
async function generateRule(stack: string, config: PrecursorConfig): Promise<void> {
  const rulePath = `.cursor/rules/${stack}.mdc`;
  const content = getRuleContent(stack, config);

  if (!existsSync(rulePath)) {
    // Create new rule file
    writeFileSync(rulePath, content, "utf-8");
  } else {
    // Merge with existing (preserve user additions)
    await mergeFile(rulePath, { content }, { backup: true });
  }
}

/**
 * Get rule content for a stack
 */
function getRuleContent(stack: string, config: PrecursorConfig): string {
  switch (stack) {
    case "python": {
      const pythonCfg = config.python || {};
      return `# Python Development Rules

## Toolchain
- Runtime: ${pythonCfg.runtime || "uv"}
- Linter: ${pythonCfg.linter || "ruff"}
- Formatter: ${pythonCfg.formatter || "ruff"}
- Type Checker: ${pythonCfg.typechecker || "pyright"}

## Commands
- Install: \`uv sync\`
- Lint: \`ruff check .\`
- Format: \`ruff format .\`
- Type Check: \`${pythonCfg.typechecker === "basedpyright" ? "basedpyright" : "pyright"} .\`

## Virtual Environment
- Path: \`${pythonCfg.venvPath || ".venv"}\`
- Activate: \`.\\${pythonCfg.venvPath || ".venv"}\\Scripts\\activate\` (Windows) or \`source ${pythonCfg.venvPath || ".venv"}/bin/activate\` (Unix)
`;
    }

    case "web": {
      const webCfg = config.web || {};
      return `# Web/JS/TS Development Rules

## Toolchain
- Runtime: ${webCfg.runtime || "bun"}
- Linter: ${webCfg.linter || "biome"}
- Formatter: ${webCfg.formatter || "biome"}
- Type Checker: ${webCfg.typechecker || "tsc"}

## Commands
- Install: \`bun install\`
- Lint: \`bunx biome check .\`
- Format: \`bunx biome format --write .\`
- Type Check: \`bunx tsc --noEmit\`

## Lockfile
- Prefer: \`bun.lock\` (text format)
- Legacy: \`bun.lockb\` (binary, accepted but not preferred)
`;
    }

    case "rust": {
      const rustCfg = config.rust || {};
      return `# Rust Development Rules

## Toolchain
- Toolchain: ${rustCfg.toolchain || "stable"}
- Linter: ${rustCfg.linter || "clippy"}
- Formatter: ${rustCfg.formatter || "rustfmt"}

## Commands
- Format: \`cargo fmt\`
- Lint: \`cargo clippy -- -D warnings\`
- Test: \`cargo test\`
- Build: \`cargo build\`
`;
    }

    case "cpp": {
      const cppCfg = config.cpp || {};
      return `# C/C++ Development Rules

## Toolchain
- Build System: ${cppCfg.buildSystem || "cmake"}
- Formatter: ${cppCfg.formatter || "clang-format"}
- Linter: ${cppCfg.linter || "clang-tidy"}

## Commands
- Format: \`clang-format -i **/*.{c,cc,cpp,h,hpp}\`
- Lint: \`clang-tidy **/*.{c,cc,cpp}\`
- Build: \`cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON && cmake --build build\`

## Compile Commands
- Generate: \`CMAKE_EXPORT_COMPILE_COMMANDS=ON cmake ...\`
- File: \`compile_commands.json\`
`;
    }

    case "docker": {
      return `# Docker Development Rules

## Best Practices
- Use multi-stage builds
- Minimize layers
- Use .dockerignore
- Pin base image versions
- Run as non-root when possible

## Commands
- Build: \`docker build -t <tag> .\`
- Run: \`docker run <tag>\`
`;
    }

    default:
      return `# ${stack} Development Rules\n\n(Add stack-specific rules here)`;
  }
}

/**
 * Update VS Code settings
 */
async function updateVSCodeSettings(_config: PrecursorConfig, stacks: string[]): Promise<void> {
  const settings: Record<string, unknown> = {
    "files.watcherExclude": {
      "**/.git/objects/**": true,
      "**/.git/subtree-cache/**": true,
      "**/node_modules/**": true,
      "**/.venv/**": true,
      "**/venv/**": true,
      "**/target/**": true,
      "**/dist/**": true,
      "**/build/**": true,
      "**/.precursor/**": true,
    },
    "files.exclude": {
      "**/.precursor/bin/**": true,
    },
  };

  // Add stack-specific settings
  if (stacks.includes("python")) {
    settings["python.defaultInterpreterPath"] = "${workspaceFolder}/.venv/Scripts/python.exe";
    settings["python.analysis.typeCheckingMode"] = "basic";
  }

  if (stacks.includes("web")) {
    settings["typescript.tsdk"] = "node_modules/typescript/lib";
    settings["typescript.enablePromptUseWorkspaceTsdk"] = true;
  }

  if (stacks.includes("rust")) {
    settings["rust-analyzer.checkOnSave.command"] = "clippy";
  }

  if (stacks.includes("cpp")) {
    settings["C_Cpp.default.compileCommands"] = "${workspaceFolder}/compile_commands.json";
  }

  await mergeFile(".vscode/settings.json", settings, { backup: true });
}

/**
 * Update extensions.json
 */
async function updateExtensions(_config: PrecursorConfig, stacks: string[]): Promise<void> {
  const extensions: string[] = [];

  if (stacks.includes("python")) {
    extensions.push("ms-python.python");
    extensions.push("ms-python.vscode-pylance");
    extensions.push("charliermarsh.ruff");
  }

  if (stacks.includes("web")) {
    extensions.push("biomejs.biome");
    extensions.push("dbaeumer.vscode-eslint");
  }

  if (stacks.includes("rust")) {
    extensions.push("rust-lang.rust-analyzer");
  }

  if (stacks.includes("cpp")) {
    extensions.push("ms-vscode.cpptools");
    extensions.push("llvm-vs-code-extensions.vscode-clangd");
  }

  const extensionsConfig = {
    recommendations: extensions,
  };

  await mergeFile(".vscode/extensions.json", extensionsConfig, { backup: true });
}

/**
 * Update MCP config
 */
async function updateMcpConfig(_config: PrecursorConfig): Promise<void> {
  mkdirSync(".cursor", { recursive: true });

  const mcpConfig = {
    mcpServers: {
      precursor: {
        command: "bun",
        args: [".precursor/mcp/server.ts"],
        env: {},
      },
    },
  };

  await mergeFile(".cursor/mcp.json", mcpConfig, { backup: true });
}

/**
 * Write text file with optional backup
 */
async function writeTextFile(
  filePath: string,
  content: string,
  options: { backup?: boolean; backupDir?: string } = {}
): Promise<void> {
  const { backup = true, backupDir = ".precursor/backups" } = options;
  const resolvedPath = resolve(filePath);

  // Create backup if requested and file exists
  if (backup && existsSync(resolvedPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = resolve(backupDir, timestamp, basename(resolvedPath));
    const backupDirPath = dirname(backupPath);
    if (!existsSync(backupDirPath)) {
      mkdirSync(backupDirPath, { recursive: true });
    }
    const existingContent = readFileSync(resolvedPath, "utf-8");
    writeFileSync(backupPath, existingContent, "utf-8");
  }

  // Ensure directory exists
  const dir = dirname(resolvedPath);
  if (!existsSync(dir) && dir !== resolve(".")) {
    mkdirSync(dir, { recursive: true });
  }

  // Write the file
  writeFileSync(resolvedPath, content, "utf-8");
}

/**
 * Update .gitignore and .cursorignore
 */
async function updateIgnoreFiles(_config: PrecursorConfig, stacks: string[]): Promise<void> {
  const ignorePatterns = [".precursor/state.json", ".precursor/backups/", ".precursor/bin/"];

  // Stack-specific ignores
  if (stacks.includes("python")) {
    ignorePatterns.push(".venv/", "venv/", "__pycache__/", "*.pyc");
  }

  if (stacks.includes("web")) {
    ignorePatterns.push("node_modules/", "dist/", ".next/", ".svelte-kit/");
  }

  if (stacks.includes("rust")) {
    ignorePatterns.push("target/", "Cargo.lock");
  }

  if (stacks.includes("cpp")) {
    ignorePatterns.push("build/", "compile_commands.json");
  }

  // Update .gitignore - append new patterns if they don't exist
  const newPatterns = ignorePatterns.join("\n") + "\n";
  if (existsSync(".gitignore")) {
    const existing = readFileSync(".gitignore", "utf-8");
    const existingLines = new Set(existing.split("\n").map((line) => line.trim()));
    const patternsToAdd = ignorePatterns.filter((p) => !existingLines.has(p.trim()));
    if (patternsToAdd.length > 0) {
      const contentToAdd = "\n# Precursor patterns\n" + patternsToAdd.join("\n") + "\n";
      await writeTextFile(".gitignore", existing + contentToAdd, { backup: true });
    }
  } else {
    await writeTextFile(".gitignore", newPatterns, { backup: false });
  }

  // Update .cursorignore similarly
  if (existsSync(".cursorignore")) {
    const existing = readFileSync(".cursorignore", "utf-8");
    const existingLines = new Set(existing.split("\n").map((line) => line.trim()));
    const patternsToAdd = ignorePatterns.filter((p) => !existingLines.has(p.trim()));
    if (patternsToAdd.length > 0) {
      const contentToAdd = "\n# Precursor patterns\n" + patternsToAdd.join("\n") + "\n";
      await writeTextFile(".cursorignore", existing + contentToAdd, { backup: true });
    }
  } else {
    await writeTextFile(".cursorignore", newPatterns, { backup: false });
  }
}

/**
 * Generate verification rule
 */
async function generateVerificationRule(config: PrecursorConfig, stacks: string[]): Promise<void> {
  const verificationCfg = (config.verification || {}) as {
    enabled?: boolean;
    browserTesting?: boolean;
  };
  if (verificationCfg.enabled === false) {
    return;
  }

  const rulePath = ".cursor/rules/verification.mdc";

  // Build stack-specific verification sections
  const stackSections: string[] = [];
  for (const stack of stacks) {
    const stackConfig = config[stack as keyof PrecursorConfig];
    if (!stackConfig) continue;

    let commands: string[] = [];
    switch (stack) {
      case "python": {
        const pythonCfg = config.python || {};
        const runtime = pythonCfg.runtime || "uv";
        commands = [
          `${runtime} run ruff check .`,
          `${runtime} run ruff format --check .`,
          pythonCfg.typechecker && pythonCfg.typechecker !== "none"
            ? `${runtime} run ${pythonCfg.typechecker} .`
            : null,
          `${runtime} run pytest`,
        ].filter((cmd): cmd is string => cmd !== null);
        break;
      }
      case "web": {
        const webCfg = config.web || {};
        const runtime = webCfg.runtime || "bun";
        commands = [
          `${runtime === "bun" ? "bunx" : "npx"} biome check .`,
          webCfg.typechecker && webCfg.typechecker !== "none"
            ? `${runtime === "bun" ? "bunx" : "npx"} tsc --noEmit`
            : null,
          `${runtime} test`,
        ].filter((cmd): cmd is string => cmd !== null);
        break;
      }
      case "rust": {
        commands = ["cargo fmt --check", "cargo clippy -- -D warnings", "cargo test"];
        break;
      }
      case "cpp": {
        commands = ["cmake --build build", "cd build && ctest"];
        break;
      }
    }

    if (commands.length > 0) {
      stackSections.push(`### ${stack.toUpperCase()}\n\`\`\`bash\n${commands.join("\n")}\n\`\`\``);
    }
  }

  const browserTestingNote = verificationCfg.browserTesting
    ? "Browser-based UI testing is enabled. Use the cursor-ide-browser MCP tools to verify UI changes."
    : "Browser testing is disabled. Enable in precursor.json to use browser-based verification.";

  const content = `---
description: Verification loops - Always verify your work
alwaysApply: true
---

# Verification Loops

> "Probably the most important thing to get great results - give AI a way to verify its work. If AI has that feedback loop, it will 2-3x the quality of the final result." - Boris Cherny

## Principle

Always verify changes after making them. This includes:
- Running tests
- Checking linting/formatting
- Type checking
- Manual verification when appropriate

## Stack-Specific Verification

${stackSections.join("\n\n")}

## Browser Testing

${browserTestingNote}

## Best Practices

1. **Always verify after changes**: Run relevant tests and checks
2. **Fix issues immediately**: Don't leave broken code
3. **Use verification loops**: Iterate until verification passes
4. **Document failures**: Add to PRECURSOR.md if verification reveals patterns

## Integration

Precursor automatically runs verification after scaffolding. Results are included in the setup output.
`;

  if (!existsSync(rulePath)) {
    writeFileSync(rulePath, content, "utf-8");
  } else {
    // Merge with existing (preserve user additions)
    await mergeFile(rulePath, { content }, { backup: true });
  }
}

/**
 * Initialize knowledge base
 */
async function initializeKnowledgeBase(config: PrecursorConfig, _stacks: string[]): Promise<void> {
  const knowledgeCfg = (config.knowledge || {}) as { enabled?: boolean };
  if (knowledgeCfg.enabled === false) {
    return;
  }

  // Initialize knowledge base file
  initKnowledge(config);

  // Generate knowledge base rule
  const rulePath = ".cursor/rules/knowledge-base.mdc";
  const content = generateKnowledgeRule();

  if (!existsSync(rulePath)) {
    writeFileSync(rulePath, content, "utf-8");
  } else {
    // Merge with existing (preserve user additions)
    await mergeFile(rulePath, { content }, { backup: true });
  }
}

/**
 * Setup commands system
 */
async function setupCommands(config: PrecursorConfig): Promise<void> {
  // Ensure commands directory exists
  ensureCommandsDirectory();

  // Generate commands rule
  const commands = getAllCommands(config);
  const rulePath = ".cursor/rules/commands.mdc";
  const content = generateCommandsRule(commands);

  if (!existsSync(rulePath)) {
    writeFileSync(rulePath, content, "utf-8");
  } else {
    // Merge with existing (preserve user additions)
    await mergeFile(rulePath, { content }, { backup: true });
  }
}

/**
 * Ensure package.json exists with proper scripts
 */
async function ensurePackageJson(_config: PrecursorConfig): Promise<void> {
  const packageJsonPath = "package.json";

  if (existsSync(packageJsonPath)) {
    // File exists, verify it has required scripts
    try {
      const content = readFileSync(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      // Check if required scripts exist
      const requiredScripts = ["setup", "scan", "typecheck", "lint", "format"];
      const hasAllScripts = requiredScripts.every(
        (script) => packageJson.scripts && packageJson.scripts[script]
      );

      if (hasAllScripts) {
        // package.json is valid, no action needed
        return;
      }

      // Missing scripts - merge them in
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }

      const defaultScripts = getDefaultPackageJsonScripts();
      for (const [key, value] of Object.entries(defaultScripts.scripts)) {
        if (!packageJson.scripts[key]) {
          packageJson.scripts[key] = value;
        }
      }

      // Write updated package.json with backup
      await mergeFile(packageJsonPath, packageJson, { backup: true });
    } catch (error) {
      // Invalid JSON or read error - restore from template
      const defaultPackageJson = getDefaultPackageJson();
      await mergeFile(packageJsonPath, defaultPackageJson, { backup: true });
    }
  } else {
    // File doesn't exist - create it
    const defaultPackageJson = getDefaultPackageJson();
    writeFileSync(packageJsonPath, JSON.stringify(defaultPackageJson, null, 2) + "\n", "utf-8");
  }
}

/**
 * Get default package.json structure
 */
function getDefaultPackageJson(): Record<string, unknown> {
  return {
    name: "precursor",
    version: "1.0.0",
    description: "Config-driven project doctor + scaffolder for Cursor",
    type: "module",
    scripts: getDefaultPackageJsonScripts().scripts,
    devDependencies: {
      "@biomejs/biome": "^1.9.4",
      typescript: "^5.7.2",
    },
    engines: {
      bun: ">=1.0.0",
    },
  };
}

/**
 * Get default package.json scripts
 */
function getDefaultPackageJsonScripts(): { scripts: Record<string, string> } {
  return {
    scripts: {
      setup: "bun run src/cli.ts setup",
      scan: "bun run src/cli.ts scan",
      typecheck: "bunx tsc --noEmit",
      lint: "bunx @biomejs/biome check .",
      format: "bunx @biomejs/biome format --write .",
      "format:check": "bunx @biomejs/biome format .",
      test: "bun test",
    },
  };
}
