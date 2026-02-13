/**
 * Tests for stack detection
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { detectStacks } from "./detector.js";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import type { PrecursorConfig } from "./config.js";

describe("detector", () => {
  const testConfig: PrecursorConfig = {
    workspace: { mode: "auto" },
  };

  beforeEach(() => {
    // Clean up test files
    const testFiles = [
      "pyproject.toml",
      "package.json",
      "Cargo.toml",
      "CMakeLists.txt",
      "Dockerfile",
    ];

    for (const file of testFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  });

  test("detects Python stack", async () => {
    writeFileSync("pyproject.toml", "[project]\nname = 'test'", "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("python");

    unlinkSync("pyproject.toml");
  });

  test("detects Web stack", async () => {
    writeFileSync("package.json", '{"name": "test"}', "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("web");

    unlinkSync("package.json");
  });

  test("detects Rust stack", async () => {
    writeFileSync("Cargo.toml", "[package]\nname = 'test'", "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("rust");

    unlinkSync("Cargo.toml");
  });

  test("detects C++ stack", async () => {
    writeFileSync("CMakeLists.txt", "cmake_minimum_required(VERSION 3.10)", "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("cpp");

    unlinkSync("CMakeLists.txt");
  });

  test("detects Docker stack", async () => {
    writeFileSync("Dockerfile", "FROM alpine", "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("docker");

    unlinkSync("Dockerfile");
  });

  test("detects multiple stacks", async () => {
    writeFileSync("pyproject.toml", "[project]\nname = 'test'", "utf-8");
    writeFileSync("package.json", '{"name": "test"}', "utf-8");

    const stacks = await detectStacks(testConfig);
    expect(stacks).toContain("python");
    expect(stacks).toContain("web");

    unlinkSync("pyproject.toml");
    unlinkSync("package.json");
  });
});
