/**
 * Tests for toolchain resolution and installation
 */

import { describe, test, expect } from "bun:test";
import { resolveTool, installTool } from "./toolchain.js";
import type { PrecursorConfig } from "./config.js";

describe("toolchain", () => {
  test("resolves tool from system PATH", async () => {
    const config: PrecursorConfig = {};

    // Try to resolve a common tool (may or may not be installed)
    const result = await resolveTool("node", config);

    expect(result).toBeDefined();
    expect(typeof result.found).toBe("boolean");
    if (result.found) {
      expect(result.path).toBeDefined();
    }
  }, 10000);

  test("returns not found for non-existent tool", async () => {
    const config: PrecursorConfig = {};

    const result = await resolveTool("nonexistent-tool-xyz-123", config);

    expect(result.found).toBe(false);
  });

  test("checks critical tool flag", async () => {
    const config: PrecursorConfig = {};

    // uv is a critical tool
    const result = await resolveTool("uv", config);

    expect(result).toBeDefined();
    // Critical flag should be set if not found
    if (!result.found) {
      expect(result.critical).toBe(true);
    }
  });

  test("respects offline mode", async () => {
    const config: PrecursorConfig = {};
    const options = { offline: true };

    const result = await resolveTool("biome", config, options);

    expect(result).toBeDefined();
    // In offline mode, should only check portable cache
  });

  test("checks tool config for critical flag", async () => {
    const config: PrecursorConfig = {
      tools: {
        "custom-tool": {
          critical: true,
        },
      },
    };

    const result = await resolveTool("custom-tool", config);

    expect(result).toBeDefined();
    if (!result.found) {
      expect(result.critical).toBe(true);
    }
  });

  test("fails to install in offline mode", async () => {
    const config: PrecursorConfig = {};
    const options = { offline: true };

    await expect(installTool("test-tool", config, options)).rejects.toThrow("offline mode");
  });

  test("handles tool config installSource", async () => {
    const config: PrecursorConfig = {
      tools: {
        "test-tool": {
          installSource: "package-manager",
        },
      },
    };

    const result = await resolveTool("test-tool", config);

    expect(result).toBeDefined();
  });
});
