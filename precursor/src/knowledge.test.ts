/**
 * Tests for knowledge base
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  initializeKnowledgeBase,
  addKnowledgeEntry,
  readKnowledgeBase,
  generateKnowledgeRule,
} from "./knowledge.js";
import { writeFileSync, unlinkSync, existsSync, rmSync, mkdirSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("knowledge", () => {
  beforeEach(() => {
    if (existsSync(".cursor/PRECURSOR.md")) {
      unlinkSync(".cursor/PRECURSOR.md");
    }
    if (existsSync(".cursor")) {
      rmSync(".cursor", { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(".cursor/PRECURSOR.md")) {
      unlinkSync(".cursor/PRECURSOR.md");
    }
    if (existsSync(".cursor")) {
      rmSync(".cursor", { recursive: true });
    }
  });

  test("initializes knowledge base", () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    initializeKnowledgeBase(config);

    expect(existsSync(".cursor/PRECURSOR.md")).toBe(true);
    const content = require("node:fs").readFileSync(".cursor/PRECURSOR.md", "utf-8");
    expect(content).toContain("Precursor Knowledge Base");
  });

  test("skips initialization when disabled", () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: false },
    };

    initializeKnowledgeBase(config);

    expect(existsSync(".cursor/PRECURSOR.md")).toBe(false);
  });

  test("does not overwrite existing knowledge base", () => {
    mkdirSync(".cursor", { recursive: true });
    writeFileSync(".cursor/PRECURSOR.md", "# Existing content", "utf-8");

    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    initializeKnowledgeBase(config);

    const content = require("node:fs").readFileSync(".cursor/PRECURSOR.md", "utf-8");
    expect(content).toBe("# Existing content");
  });

  test("adds knowledge entry", () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    initializeKnowledgeBase(config);

    const entry = {
      title: "Test Entry",
      date: "2026-01-24",
      category: "mistake" as const,
      content: "This is a test entry",
    };

    const result = addKnowledgeEntry(entry, config);

    expect(result.success).toBe(true);
    const content = require("node:fs").readFileSync(".cursor/PRECURSOR.md", "utf-8");
    expect(content).toContain("Test Entry");
    expect(content).toContain("This is a test entry");
  });

  test("fails to add entry when disabled", () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: false },
    };

    const entry = {
      title: "Test Entry",
      date: "2026-01-24",
      category: "mistake" as const,
      content: "This is a test entry",
    };

    const result = addKnowledgeEntry(entry, config);

    expect(result.success).toBe(false);
    expect(result.message).toContain("disabled");
  });

  test("reads knowledge base", () => {
    mkdirSync(".cursor", { recursive: true });
    writeFileSync(".cursor/PRECURSOR.md", "# Test Knowledge Base", "utf-8");

    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    const content = readKnowledgeBase(config);

    expect(content).toBe("# Test Knowledge Base");
  });

  test("returns null when knowledge base doesn't exist", () => {
    const config: PrecursorConfig = {
      knowledge: { enabled: true },
    };

    const content = readKnowledgeBase(config);

    expect(content).toBeNull();
  });

  test("generates knowledge rule", () => {
    const rule = generateKnowledgeRule();

    expect(rule).toContain("Knowledge Base");
    expect(rule).toContain("PRECURSOR.md");
  });

  test("uses custom knowledge file path", () => {
    const config: PrecursorConfig = {
      knowledge: {
        enabled: true,
        file: "custom-knowledge.md",
      },
    };

    initializeKnowledgeBase(config);

    expect(existsSync("custom-knowledge.md")).toBe(true);
    unlinkSync("custom-knowledge.md");
  });
});
