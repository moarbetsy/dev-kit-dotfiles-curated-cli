#!/usr/bin/env bun

/**
 * MCP Server for Precursor
 * Provides doctor_diagnose, doctor_fix, scaffold_rule, and collect_report tools
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from "@modelcontextprotocol/sdk/types.js";
import { executeCommand, getAllCommands } from "../../src/commands.js";
import { loadConfig } from "../../src/config.js";
import { detectStacks } from "../../src/detector.js";
import { doctorFix } from "../../src/doctor.js";
import { scan } from "../../src/index.js";
import { addKnowledgeEntry, readKnowledgeBase } from "../../src/knowledge.js";
import { collectReport, collectReports, generateMergedReport } from "../../src/report.js";
import { runScaffold } from "../../src/scaffold.js";
import { runVerification } from "../../src/verification.js";

const server = new Server(
  {
    name: "precursor",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "doctor_diagnose",
        description: "Run Precursor doctor scan and return JSON report",
        inputSchema: {
          type: "object",
          properties: {
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            },
            offline: {
              type: "boolean",
              description: "Run in offline mode",
              default: false
            }
          }
        }
      },
      {
        name: "doctor_fix",
        description: "Apply a specific fix (e.g., scaffold-ruff-config, scaffold-biome-config)",
        inputSchema: {
          type: "object",
          properties: {
            fixKey: {
              type: "string",
              description: "Fix key to apply",
              enum: [
                "scaffold-ruff-config",
                "scaffold-biome-config",
                "scaffold-clang-format"
              ]
            },
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            }
          },
          required: ["fixKey"]
        }
      },
      {
        name: "scaffold_rule",
        description: "Generate a new .cursor/rules/<tech>.mdc file",
        inputSchema: {
          type: "object",
          properties: {
            stack: {
              type: "string",
              description: "Stack type",
              enum: ["python", "web", "rust", "cpp", "docker"]
            },
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            }
          },
          required: ["stack"]
        }
      },
      {
        name: "collect_report",
        description: "Collect and merge report entries from REPORT.md or other report files into a single folder for training/learning",
        inputSchema: {
          type: "object",
          properties: {
            reportPath: {
              type: "string",
              description: "Path to report file (e.g., REPORT.md). Can be a single file or comma-separated list of paths"
            },
            projectName: {
              type: "string",
              description: "Project name/identifier for the reports (optional)"
            },
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            },
            generateMerged: {
              type: "boolean",
              description: "Generate a merged markdown report file",
              default: false
            }
          },
          required: ["reportPath"]
        }
      },
      {
        name: "run_verification",
        description: "Run verification loops to verify code changes (tests, linting, type checking)",
        inputSchema: {
          type: "object",
          properties: {
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            },
            stacks: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Specific stacks to verify (optional, verifies all detected stacks if not provided)"
            }
          }
        }
      },
      {
        name: "add_knowledge_entry",
        description: "Add an entry to the shared knowledge base (PRECURSOR.md)",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Entry title"
            },
            category: {
              type: "string",
              enum: ["mistake", "pattern", "quirk", "practice", "other"],
              description: "Entry category"
            },
            content: {
              type: "string",
              description: "Entry content (markdown supported)"
            },
            relatedIssues: {
              type: "array",
              items: {
                type: "string"
              },
              description: "Related issue references (optional)"
            },
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            }
          },
          required: ["title", "category", "content"]
        }
      },
      {
        name: "read_knowledge_base",
        description: "Read the shared knowledge base (PRECURSOR.md)",
        inputSchema: {
          type: "object",
          properties: {
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            }
          }
        }
      },
      {
        name: "execute_command",
        description: "Execute a custom slash command",
        inputSchema: {
          type: "object",
          properties: {
            commandName: {
              type: "string",
              description: "Name of the command to execute"
            },
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            },
            interactiveInputs: {
              type: "object",
              description: "Inputs for interactive steps (optional)",
              additionalProperties: {
                type: "string"
              }
            }
          },
          required: ["commandName"]
        }
      },
      {
        name: "list_commands",
        description: "List all available slash commands",
        inputSchema: {
          type: "object",
          properties: {
            configPath: {
              type: "string",
              description: "Path to precursor.json (optional)"
            }
          }
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "doctor_diagnose": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const stacks = await detectStacks(config);
        const result = await scan({
          configPath: args?.configPath as string | undefined,
          offline: args?.offline as boolean | undefined
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2)
            }
          ]
        };
      }

      case "doctor_fix": {
        const fixKey = args?.fixKey as string;
        if (!fixKey) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "fixKey is required"
          );
        }

        const config = await loadConfig(args?.configPath as string | undefined);
        const result = await doctorFix(fixKey, config);

        // Run verification after fix (Boris method)
        let verificationOutput = "";
        if (result.success) {
          const stacks = await detectStacks(config);
          const verificationReport = await runVerification(config, stacks);
          if (!verificationReport.success) {
            verificationOutput = `\n\n⚠ Verification found issues:\n${verificationReport.errors.join("\n")}`;
            if (verificationReport.warnings.length > 0) {
              verificationOutput += `\n${verificationReport.warnings.join("\n")}`;
            }
          } else {
            verificationOutput = "\n\n✓ Verification passed";
          }
        }

        return {
          content: [
            {
              type: "text",
              text: result.success
                ? `Fix applied: ${result.message}${verificationOutput}`
                : `Fix failed: ${result.message}`
            }
          ]
        };
      }

      case "scaffold_rule": {
        const stack = args?.stack as string;
        if (!stack) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "stack is required"
          );
        }

        const config = await loadConfig(args?.configPath as string | undefined);
        const stacks = [stack as "python" | "web" | "rust" | "cpp" | "docker"];
        await runScaffold(config, stacks);

        // Run verification after scaffolding (Boris method)
        const verificationReport = await runVerification(config, stacks);
        let verificationOutput = "";
        if (!verificationReport.success) {
          verificationOutput = `\n\n⚠ Verification found issues:\n${verificationReport.errors.join("\n")}`;
          if (verificationReport.warnings.length > 0) {
            verificationOutput += `\n${verificationReport.warnings.join("\n")}`;
          }
        } else {
          verificationOutput = "\n\n✓ Verification passed";
        }

        return {
          content: [
            {
              type: "text",
              text: `Rule scaffolded for ${stack}${verificationOutput}`
            }
          ]
        };
      }

      case "collect_report": {
        const reportPath = args?.reportPath as string;
        if (!reportPath) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "reportPath is required"
          );
        }

        const config = await loadConfig(args?.configPath as string | undefined);
        const projectName = (args?.projectName as string | undefined) || config.report?.projectName;
        const generateMerged = args?.generateMerged as boolean | undefined;

        // Support comma-separated paths
        const paths = reportPath.split(",").map(p => p.trim()).filter(p => p);
        
        let result;
        if (paths.length === 1) {
          result = await collectReport(paths[0], config, projectName);
        } else {
          result = await collectReports(paths, config, projectName);
        }

        let output = result.message;
        if (result.errors && result.errors.length > 0) {
          output += `\n\nErrors:\n${result.errors.join("\n")}`;
        }

        // Generate merged report if requested
        if (generateMerged) {
          const mergedReport = generateMergedReport(config);
          output += `\n\nMerged report generated (${mergedReport.split("\n").length} lines)`;
        }

        return {
          content: [
            {
              type: "text",
              text: output
            }
          ]
        };
      }

      case "run_verification": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const stacks = (args?.stacks as string[] | undefined) || await detectStacks(config);
        const result = await runVerification(config, stacks);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                results: result.results,
                errors: result.errors,
                warnings: result.warnings
              }, null, 2)
            }
          ]
        };
      }

      case "add_knowledge_entry": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const title = args?.title as string;
        const category = args?.category as "mistake" | "pattern" | "quirk" | "practice" | "other";
        const content = args?.content as string;
        const relatedIssues = args?.relatedIssues as string[] | undefined;

        if (!title || !category || !content) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "title, category, and content are required"
          );
        }

        const date = new Date().toISOString().split("T")[0];
        const result = addKnowledgeEntry(
          {
            title,
            date,
            category,
            content,
            relatedIssues
          },
          config
        );

        return {
          content: [
            {
              type: "text",
              text: result.success
                ? `Knowledge entry added: ${title}`
                : `Failed to add entry: ${result.message}`
            }
          ]
        };
      }

      case "read_knowledge_base": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const content = readKnowledgeBase(config);

        return {
          content: [
            {
              type: "text",
              text: content || "Knowledge base is empty or disabled"
            }
          ]
        };
      }

      case "execute_command": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const commandName = args?.commandName as string;
        const interactiveInputs = args?.interactiveInputs as Record<string, string> | undefined;

        if (!commandName) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "commandName is required"
          );
        }

        const result = await executeCommand(commandName, config, interactiveInputs);

        return {
          content: [
            {
              type: "text",
              text: result.success
                ? `Command executed successfully:\n${result.output}`
                : `Command failed:\n${result.error || result.output}`
            }
          ]
        };
      }

      case "list_commands": {
        const config = await loadConfig(args?.configPath as string | undefined);
        const commands = getAllCommands(config);

        if (commands.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No commands available. Add commands to precursor.json or .precursor/commands/*.json"
              }
            ]
          };
        }

        const commandsList = commands.map(cmd => {
          const steps = cmd.steps.map(s => 
            s.type === "shell" ? `  - ${s.command}` : `  - [Interactive: ${s.prompt}]`
          ).join("\n");
          return `**/${cmd.name}**: ${cmd.description}\n${steps}`;
        }).join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Available commands:\n\n${commandsList}`
            }
          ]
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Precursor MCP server running on stdio");
}

main().catch(console.error);
