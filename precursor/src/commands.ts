/**
 * Slash commands system - Automate repeated workflows
 * Based on Boris Cherny's slash commands pattern
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

export interface CommandStep {
  type: "shell" | "interactive";
  command?: string;
  prompt?: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  steps: CommandStep[];
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Execute a shell command
 */
async function executeShellCommand(
  command: string,
  cwd: string = process.cwd()
): Promise<{ success: boolean; output: string; error?: string }> {
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
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        output: stdout,
        error: err.message,
      });
    });
  });
}

/**
 * Load commands from config
 */
export function loadCommandsFromConfig(config: PrecursorConfig): CommandDefinition[] {
  const commandsCfg = config.commands || {};
  const commands: CommandDefinition[] = [];

  for (const [name, def] of Object.entries(commandsCfg)) {
    const cmdDef = def as { description?: string; steps?: CommandStep[] };
    if (cmdDef.description && cmdDef.steps) {
      commands.push({
        name,
        description: cmdDef.description,
        steps: cmdDef.steps,
      });
    }
  }

  return commands;
}

/**
 * Load commands from .precursor/commands/*.json files
 */
export function loadCommandsFromFiles(): CommandDefinition[] {
  const commandsDir = ".precursor/commands";
  if (!existsSync(commandsDir)) {
    return [];
  }

  const commands: CommandDefinition[] = [];

  // In a real implementation, we'd read all JSON files in the directory
  // For now, we'll just return empty array as the directory structure is created during scaffold
  return commands;
}

/**
 * Get all available commands
 */
export function getAllCommands(config: PrecursorConfig): CommandDefinition[] {
  const configCommands = loadCommandsFromConfig(config);
  const fileCommands = loadCommandsFromFiles();
  return [...configCommands, ...fileCommands];
}

/**
 * Execute a command
 */
export async function executeCommand(
  commandName: string,
  config: PrecursorConfig,
  interactiveInputs?: Record<string, string>
): Promise<CommandResult> {
  const commands = getAllCommands(config);
  const command = commands.find((cmd) => cmd.name === commandName);

  if (!command) {
    return {
      success: false,
      output: "",
      error: `Command not found: ${commandName}`,
    };
  }

  let output = "";
  let error = "";

  for (const step of command.steps) {
    if (step.type === "shell" && step.command) {
      const result = await executeShellCommand(step.command);
      output += result.output;
      if (result.error) {
        error += result.error;
      }
      if (!result.success) {
        return {
          success: false,
          output,
          error,
        };
      }
    } else if (step.type === "interactive" && step.prompt) {
      // For interactive steps, use provided input or skip
      const input = interactiveInputs?.[step.prompt];
      if (input) {
        output += `[Interactive: ${step.prompt}] ${input}\n`;
      } else {
        // Skip interactive steps if no input provided
        output += `[Skipped: ${step.prompt}]\n`;
      }
    }
  }

  return {
    success: error.length === 0,
    output,
    error: error || undefined,
  };
}

/**
 * Generate commands rule
 */
export function generateCommandsRule(commands: CommandDefinition[]): string {
  if (commands.length === 0) {
    return `---
description: Slash commands - Custom workflows
alwaysApply: false
---

# Slash Commands

No custom commands are configured. Add commands to \`precursor.json\` or \`.precursor/commands/*.json\` files.

See documentation for command format.
`;
  }

  const commandsList = commands
    .map((cmd) => {
      const stepsPreview = cmd.steps
        .slice(0, 3)
        .map((s) => (s.type === "shell" ? s.command : `[${s.prompt}]`))
        .join(" → ");

      return `- **\`/${cmd.name}\`**: ${cmd.description}\n  - Steps: ${stepsPreview}${cmd.steps.length > 3 ? " ..." : ""}`;
    })
    .join("\n");

  return `---
description: Slash commands - Custom workflows
alwaysApply: false
---

# Slash Commands

> Automate repeated workflows that are performed many times daily.  
> Based on Boris Cherny's slash commands pattern.

## Available Commands

${commandsList}

## Usage

Use commands via the \`execute_command\` MCP tool or define them in:
- \`precursor.json\` under the \`commands\` section
- \`.precursor/commands/*.json\` files

## Command Format

\`\`\`json
{
  "command-name": {
    "description": "Command description",
    "steps": [
      { "type": "shell", "command": "git status" },
      { "type": "interactive", "prompt": "Commit message" }
    ]
  }
}
\`\`\`
`;
}

/**
 * Ensure commands directory exists
 */
export function ensureCommandsDirectory(): void {
  const commandsDir = ".precursor/commands";
  if (!existsSync(commandsDir)) {
    mkdirSync(commandsDir, { recursive: true });
  }
}
