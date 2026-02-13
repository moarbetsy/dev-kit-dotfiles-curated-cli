/**
 * Tests for system information detection
 */

import { describe, test, expect } from "bun:test";
import { getSystemInfo, isToolInPath, getToolsInPath } from "./system.js";

describe("system", () => {
  test("gets system information", async () => {
    const info = await getSystemInfo();

    expect(info).toBeDefined();
    expect(info.platform).toBeDefined();
    expect(info.arch).toBeDefined();
    expect(info.hostname).toBeDefined();
    expect(info.cpu).toBeDefined();
    expect(info.memory).toBeDefined();
    expect(info.path).toBeDefined();
    expect(info.environment).toBeDefined();
  }, 20000);

  test("cpu info has required fields", async () => {
    const info = await getSystemInfo();

    expect(info.cpu.model).toBeDefined();
    expect(info.cpu.cores).toBeGreaterThan(0);
    expect(info.cpu.threads).toBeGreaterThanOrEqual(0);
  });

  test("memory info has required fields", async () => {
    const info = await getSystemInfo();

    expect(info.memory.total).toBeGreaterThan(0);
    expect(info.memory.free).toBeGreaterThanOrEqual(0);
    expect(info.memory.used).toBeGreaterThanOrEqual(0);
    expect(info.memory.totalGB).toBeGreaterThan(0);
    expect(info.memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(info.memory.usagePercent).toBeLessThanOrEqual(100);
  }, 15000);

  test("path info has required fields", async () => {
    const info = await getSystemInfo();

    expect(Array.isArray(info.path.paths)).toBe(true);
    expect(info.path.count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(info.path.duplicates)).toBe(true);
    expect(Array.isArray(info.path.missing)).toBe(true);
    expect(Array.isArray(info.path.dangerous)).toBe(true);
    expect(Array.isArray(info.path.issues)).toBe(true);
  });

  test("environment info has tool versions", async () => {
    const info = await getSystemInfo();

    expect(info.environment).toBeDefined();
    // Versions may or may not be present depending on what's installed
    expect(info.environment.nodeVersion || info.environment.bunVersion).toBeDefined();
  }, 15000);

  test("checks if tool is in PATH", async () => {
    // Test with a common tool that should exist
    const result = await isToolInPath("node");
    // Result depends on what's installed, but should be a boolean
    expect(typeof result).toBe("boolean");
  });

  test("gets tools in PATH", async () => {
    const tools = await getToolsInPath();

    expect(Array.isArray(tools)).toBe(true);
    // Should return an array (may be empty if no tools found)
  });

  test("detects PATH duplicates", async () => {
    const info = await getSystemInfo();

    // If there are duplicates, they should be reported
    expect(Array.isArray(info.path.duplicates)).toBe(true);
  }, 15000);

  test("detects missing PATH entries", async () => {
    const info = await getSystemInfo();

    // Missing entries should be reported
    expect(Array.isArray(info.path.missing)).toBe(true);
  });

  test("detects dangerous PATH entries", async () => {
    const info = await getSystemInfo();

    // Dangerous entries should be reported
    expect(Array.isArray(info.path.dangerous)).toBe(true);
  }, 15000);
});
