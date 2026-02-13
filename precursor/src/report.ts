/**
 * Report collection and merging
 * Collects reports from various sources and merges them into a single folder for training/learning
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PrecursorConfig } from "./config.js";

export interface ReportEntry {
  timestamp: string;
  title: string;
  context: string;
  command?: string;
  observed: string;
  rootCause?: string;
  fix?: string;
  prevention?: string;
  status: "resolved" | "mitigated" | "unresolved";
  followUps?: string[];
  source?: string; // Source file path
  project?: string; // Project name/identifier
}

export interface ReportCollectionResult {
  success: boolean;
  message: string;
  collected: number;
  merged: number;
  duplicates: number;
  errors?: string[];
}

/**
 * Get the reports directory path
 */
function getReportsDir(config?: PrecursorConfig): string {
  // Use custom reportsDir from config if specified
  if (config?.report?.reportsDir) {
    return config.report.reportsDir;
  }

  // Default to .precursor/reports in the current working directory
  // If config has a workspace root, use that
  const root = config?.workspace?.root || process.cwd();
  return join(root, ".precursor", "reports");
}

/**
 * Parse a REPORT.md file and extract all entries
 */
export function parseReportFile(filePath: string, projectName?: string): ReportEntry[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf-8");
  const entries: ReportEntry[] = [];

  // Match report entries in the format:
  // ### YYYY-MM-DD HH:MM (local) — <title>
  // - **Context**: ...
  // - **Command / action**: ...
  // - **Observed**: ...
  // - **Root cause**: ...
  // - **Fix**: ...
  // - **Prevention**: ...
  // - **Status**: ...
  let currentEntry: Partial<ReportEntry> | null = null;

  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for new entry header
    const headerMatch = line.match(
      /^###\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+\(local\)\s+—\s+(.+)$/
    );
    if (headerMatch) {
      // Save previous entry if exists
      if (currentEntry && currentEntry.timestamp && currentEntry.title) {
        entries.push({
          timestamp: currentEntry.timestamp,
          title: currentEntry.title,
          context: currentEntry.context || "",
          command: currentEntry.command,
          observed: currentEntry.observed || "",
          rootCause: currentEntry.rootCause,
          fix: currentEntry.fix,
          prevention: currentEntry.prevention,
          status: (currentEntry.status as "resolved" | "mitigated" | "unresolved") || "unresolved",
          followUps: currentEntry.followUps,
          source: filePath,
          project: projectName,
        });
      }

      // Start new entry
      currentEntry = {
        timestamp: headerMatch[1],
        title: headerMatch[2].trim(),
        source: filePath,
        project: projectName,
      };
      i++;
      continue;
    }

    // Check for field markers
    if (currentEntry) {
      const fieldMatch = line.match(/^-\s+\*\*(\w+(?:\s+\/\s+\w+)?):\*\*\s+(.+)$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1].toLowerCase().replace(/\s+\/\s+/g, "");
        const fieldValue = fieldMatch[2].trim();

        switch (fieldName) {
          case "context":
            currentEntry.context = fieldValue;
            break;
          case "commandaction":
            currentEntry.command = fieldValue.replace(/^`|`$/g, "");
            break;
          case "observed":
            currentEntry.observed = fieldValue;
            break;
          case "rootcause":
            currentEntry.rootCause = fieldValue;
            break;
          case "fix":
            currentEntry.fix = fieldValue;
            break;
          case "prevention":
            currentEntry.prevention = fieldValue;
            break;
          case "status":
            currentEntry.status = fieldValue.toLowerCase() as
              | "resolved"
              | "mitigated"
              | "unresolved";
            break;
        }
        i++;
        continue;
      }

      // Check for follow-up entries
      const followUpMatch = line.match(
        /^-\s+\*\*Follow-up\s+\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\):\*\*\s+(.+)$/
      );
      if (followUpMatch) {
        if (!currentEntry.followUps) {
          currentEntry.followUps = [];
        }
        currentEntry.followUps.push(`${followUpMatch[1]}: ${followUpMatch[2].trim()}`);
        i++;
        continue;
      }
    }

    i++;
  }

  // Save last entry
  if (currentEntry && currentEntry.timestamp && currentEntry.title) {
    entries.push({
      timestamp: currentEntry.timestamp,
      title: currentEntry.title,
      context: currentEntry.context || "",
      command: currentEntry.command,
      observed: currentEntry.observed || "",
      rootCause: currentEntry.rootCause,
      fix: currentEntry.fix,
      prevention: currentEntry.prevention,
      status: (currentEntry.status as "resolved" | "mitigated" | "unresolved") || "unresolved",
      followUps: currentEntry.followUps,
      source: filePath,
      project: projectName,
    });
  }

  return entries;
}

/**
 * Generate a unique hash for a report entry to detect duplicates
 */
function hashEntry(entry: ReportEntry): string {
  const key = `${entry.timestamp}|${entry.title}|${entry.context}|${entry.observed}`;
  return createHash("sha256").update(key).digest("hex").substring(0, 16);
}

/**
 * Save a report entry to the reports directory
 */
function saveReportEntry(entry: ReportEntry, reportsDir: string): string {
  // Ensure directory exists
  mkdirSync(reportsDir, { recursive: true });

  // Create filename from timestamp and title (sanitized)
  const sanitizedTitle = entry.title
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
  const timestamp = entry.timestamp.replace(/[:\s]/g, "-");
  const hash = hashEntry(entry);
  const filename = `${timestamp}_${sanitizedTitle}_${hash}.json`;

  const filePath = join(reportsDir, filename);
  writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");

  return filePath;
}

/**
 * Check if an entry already exists (by hash)
 */
function entryExists(entry: ReportEntry, reportsDir: string): boolean {
  if (!existsSync(reportsDir)) {
    return false;
  }

  const entryHash = hashEntry(entry);
  const files = readdirSync(reportsDir);

  for (const file of files) {
    if (file.endsWith(`_${entryHash}.json`)) {
      // Verify it's actually the same entry
      try {
        const existingContent = readFileSync(join(reportsDir, file), "utf-8");
        const existing: ReportEntry = JSON.parse(existingContent);
        if (hashEntry(existing) === entryHash) {
          return true;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return false;
}

/**
 * Collect reports from a file and merge into reports directory
 */
export async function collectReport(
  reportPath: string,
  config?: PrecursorConfig,
  projectName?: string
): Promise<ReportCollectionResult> {
  const errors: string[] = [];
  let collected = 0;
  let merged = 0;
  let duplicates = 0;

  try {
    // Parse the report file
    const entries = parseReportFile(reportPath, projectName);
    collected = entries.length;

    if (entries.length === 0) {
      return {
        success: true,
        message: `No report entries found in ${reportPath}`,
        collected: 0,
        merged: 0,
        duplicates: 0,
      };
    }

    // Get reports directory
    const reportsDir = getReportsDir(config);
    mkdirSync(reportsDir, { recursive: true });

    // Process each entry
    for (const entry of entries) {
      if (entryExists(entry, reportsDir)) {
        duplicates++;
        continue;
      }

      try {
        saveReportEntry(entry, reportsDir);
        merged++;
      } catch (error) {
        errors.push(
          `Failed to save entry "${entry.title}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success: errors.length === 0,
      message: `Collected ${collected} entries, merged ${merged} new entries, skipped ${duplicates} duplicates`,
      collected,
      merged,
      duplicates,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to collect report: ${error instanceof Error ? error.message : String(error)}`,
      collected,
      merged,
      duplicates,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Collect reports from multiple files
 */
export async function collectReports(
  reportPaths: string[],
  config?: PrecursorConfig,
  projectName?: string
): Promise<ReportCollectionResult> {
  const errors: string[] = [];
  let totalCollected = 0;
  let totalMerged = 0;
  let totalDuplicates = 0;

  for (const reportPath of reportPaths) {
    try {
      const result = await collectReport(reportPath, config, projectName);
      totalCollected += result.collected;
      totalMerged += result.merged;
      totalDuplicates += result.duplicates;
      if (result.errors) {
        errors.push(...result.errors);
      }
    } catch (error) {
      errors.push(
        `Failed to process ${reportPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    success: errors.length === 0,
    message: `Collected ${totalCollected} entries from ${reportPaths.length} files, merged ${totalMerged} new entries, skipped ${totalDuplicates} duplicates`,
    collected: totalCollected,
    merged: totalMerged,
    duplicates: totalDuplicates,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Get all collected reports from the reports directory
 */
export function getAllReports(config?: PrecursorConfig): ReportEntry[] {
  const reportsDir = getReportsDir(config);
  if (!existsSync(reportsDir)) {
    return [];
  }

  const entries: ReportEntry[] = [];
  const files = readdirSync(reportsDir);

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const content = readFileSync(join(reportsDir, file), "utf-8");
        const entry: ReportEntry = JSON.parse(content);
        entries.push(entry);
      } catch {
        // Ignore invalid JSON files
      }
    }
  }

  // Sort by timestamp (newest first)
  entries.sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime();
    const dateB = new Date(b.timestamp).getTime();
    return dateB - dateA;
  });

  return entries;
}

/**
 * Generate a merged report file from all collected reports
 */
export function generateMergedReport(config?: PrecursorConfig, outputPath?: string): string {
  const entries = getAllReports(config);

  if (entries.length === 0) {
    const emptyReport = "# Merged Reports\n\nNo reports collected yet.\n";
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, emptyReport, "utf-8");
    }
    return emptyReport;
  }

  // Group by project
  const byProject = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const project = entry.project || "unknown";
    if (!byProject.has(project)) {
      byProject.set(project, []);
    }
    byProject.get(project)!.push(entry);
  }

  // Generate markdown
  let markdown = "# Merged Reports\n\n";
  markdown += `Total entries: ${entries.length}\n`;
  markdown += `Projects: ${byProject.size}\n\n`;
  markdown += "---\n\n";

  // Sort projects
  const sortedProjects = Array.from(byProject.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [project, projectEntries] of sortedProjects) {
    markdown += `## Project: ${project}\n\n`;
    markdown += `Entries: ${projectEntries.length}\n\n`;

    for (const entry of projectEntries) {
      markdown += `### ${entry.timestamp} (local) — ${entry.title}\n`;
      markdown += `- **Context**: ${entry.context}\n`;
      if (entry.command) {
        markdown += `- **Command / action**: \`${entry.command}\`\n`;
      }
      markdown += `- **Observed**: ${entry.observed}\n`;
      if (entry.rootCause) {
        markdown += `- **Root cause**: ${entry.rootCause}\n`;
      }
      if (entry.fix) {
        markdown += `- **Fix**: ${entry.fix}\n`;
      }
      if (entry.prevention) {
        markdown += `- **Prevention**: ${entry.prevention}\n`;
      }
      markdown += `- **Status**: ${entry.status}\n`;
      if (entry.source) {
        markdown += `- **Source**: ${entry.source}\n`;
      }
      if (entry.followUps && entry.followUps.length > 0) {
        for (const followUp of entry.followUps) {
          markdown += `- **Follow-up**: ${followUp}\n`;
        }
      }
      markdown += "\n";
    }
    markdown += "---\n\n";
  }

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, "utf-8");
  }

  return markdown;
}
