/**
 * Shared knowledge base - Accumulate team knowledge and prevent repeated mistakes
 * Based on Boris Cherny's CLAUDE.md pattern
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { KnowledgeConfig, PrecursorConfig } from "./config.js";

export interface KnowledgeEntry {
  title: string;
  date: string;
  category: "mistake" | "pattern" | "quirk" | "practice" | "other";
  content: string;
  relatedIssues?: string[];
}

/**
 * Get knowledge base file path
 */
function getKnowledgePath(config: PrecursorConfig): string {
  const knowledgeCfg: KnowledgeConfig = config.knowledge ?? ({} as KnowledgeConfig);
  return (knowledgeCfg as any).file || ".cursor/PRECURSOR.md";
}

/**
 * Initialize knowledge base file if it doesn't exist
 */
export function initializeKnowledgeBase(config: PrecursorConfig): void {
  const knowledgeCfg: KnowledgeConfig = config.knowledge ?? ({} as KnowledgeConfig);
  if ((knowledgeCfg as any).enabled === false) {
    return;
  }

  const path = getKnowledgePath(config);
  if (existsSync(path)) {
    return;
  }

  // Ensure directory exists
  const dir = dirname(path);
  if (dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = `# Precursor Knowledge Base

> This file accumulates team knowledge and prevents repeated mistakes.  
> Similar to Boris Cherny's CLAUDE.md pattern for "Compounding Engineering"

## Purpose

This knowledge base documents:
- Common mistakes and their fixes
- Project-specific patterns and conventions
- Tool configuration quirks
- Best practices learned over time

## How to Use

- When you encounter an issue, document it here
- When you discover a pattern, add it here
- When you learn a best practice, share it here
- Reference this file before making changes

## Categories

- **Mistake**: Common errors and how to fix them
- **Pattern**: Project-specific patterns and conventions
- **Quirk**: Tool configuration quirks and workarounds
- **Practice**: Best practices and recommendations
- **Other**: Miscellaneous knowledge

---

## Entries

<!-- New entries will be added below this line -->

`;

  writeFileSync(path, content, "utf-8");
}

/**
 * Add a knowledge entry
 */
export function addKnowledgeEntry(
  entry: KnowledgeEntry,
  config: PrecursorConfig
): { success: boolean; message: string } {
  const knowledgeCfg: KnowledgeConfig = config.knowledge ?? ({} as KnowledgeConfig);
  if ((knowledgeCfg as any).enabled === false) {
    return {
      success: false,
      message: "Knowledge base is disabled",
    };
  }

  const path = getKnowledgePath(config);

  // Initialize if doesn't exist
  if (!existsSync(path)) {
    initializeKnowledgeBase(config);
  }

  const existing = readFileSync(path, "utf-8");

  // Format entry
  const relatedIssuesText =
    entry.relatedIssues && entry.relatedIssues.length > 0
      ? `\n\n**Related Issues**: ${entry.relatedIssues.join(", ")}`
      : "";

  const entryText = `### ${entry.date} — ${entry.title}

**Category**: ${entry.category}

${entry.content}${relatedIssuesText}

---

`;

  // Insert before the "<!-- New entries..." comment
  const insertMarker = "<!-- New entries will be added below this line -->";
  const insertIndex = existing.indexOf(insertMarker);

  if (insertIndex === -1) {
    // Append to end if marker not found
    const newContent = existing + "\n" + entryText;
    writeFileSync(path, newContent, "utf-8");
  } else {
    const newContent = existing.slice(0, insertIndex) + entryText + existing.slice(insertIndex);
    writeFileSync(path, newContent, "utf-8");
  }

  return {
    success: true,
    message: `Knowledge entry added: ${entry.title}`,
  };
}

/**
 * Read knowledge base content
 */
export function readKnowledgeBase(config: PrecursorConfig): string | null {
  const knowledgeCfg: KnowledgeConfig = config.knowledge ?? ({} as KnowledgeConfig);
  if ((knowledgeCfg as any).enabled === false) {
    return null;
  }

  const path = getKnowledgePath(config);
  if (!existsSync(path)) {
    return null;
  }

  return readFileSync(path, "utf-8");
}

/**
 * Generate knowledge base rule
 */
export function generateKnowledgeRule(): string {
  return `---
description: Shared knowledge base - Check PRECURSOR.md before making changes
alwaysApply: true
---

# Knowledge Base

## Principle

Before making changes, check \`.cursor/PRECURSOR.md\` (or the configured knowledge base file) for:
- Common mistakes and their fixes
- Project-specific patterns
- Tool configuration quirks
- Best practices

## Usage

1. **Before changes**: Read relevant sections of PRECURSOR.md
2. **After mistakes**: Document the issue and fix in PRECURSOR.md
3. **After learning**: Add new patterns and practices to PRECURSOR.md

## Integration

Precursor automatically initializes PRECURSOR.md during setup. Use the \`add_knowledge_entry\` MCP tool to add entries programmatically.

## Philosophy

This implements "Compounding Engineering" - the AI gets smarter about your codebase over time through accumulated team knowledge, similar to Boris Cherny's CLAUDE.md pattern.
`;
}
