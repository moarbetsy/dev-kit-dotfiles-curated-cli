/**
 * Configuration loading and validation
 */

import Ajv from "ajv";
import { parse as parseJsonc } from "jsonc-parser";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export interface PrecursorConfig {
  $schema?: string;
  tools?: Record<string, ToolConfig>;
  python?: PythonConfig;
  web?: WebConfig;
  rust?: RustConfig;
  cpp?: CppConfig;
  docker?: DockerConfig;
  workspace?: WorkspaceConfig;
  ci?: CiConfig;
  mcp?: McpConfig;
  secrets?: SecretsConfig;
  update?: UpdateConfig;
  backup?: BackupConfig;
  strict?: StrictConfig;
  report?: ReportConfig;
  verification?: VerificationConfig;
  hooks?: HooksConfig;
  knowledge?: KnowledgeConfig;
  [key: string]: unknown; // Allow additional properties
}

export interface ToolConfig {
  enabled?: boolean;
  runtime?: string;
  linter?: string;
  formatter?: string;
  typechecker?: string;
  version?: string;
  installSource?: "system" | "package-manager" | "portable" | "auto";
  critical?: boolean;
  [key: string]: unknown;
}

export interface PythonConfig {
  runtime?: "uv" | "pip" | "poetry";
  linter?: string;
  formatter?: string;
  typechecker?: "pyright" | "basedpyright" | "none";
  venvPath?: string;
  [key: string]: unknown;
}

export interface WebConfig {
  runtime?: "bun" | "node" | "npm" | "pnpm" | "yarn";
  linter?: "biome" | "eslint" | "none";
  formatter?: "biome" | "prettier" | "none";
  typechecker?: "tsc" | "none";
  migrateFrom?: string[];
  [key: string]: unknown;
}

export interface RustConfig {
  toolchain?: string;
  linter?: string;
  formatter?: string;
  audit?: boolean;
  deny?: boolean;
  [key: string]: unknown;
}

export interface CppConfig {
  buildSystem?: "cmake" | "meson" | "make";
  formatter?: string;
  linter?: string;
  compileCommands?: boolean;
  [key: string]: unknown;
}

export interface DockerConfig {
  enabled?: boolean;
  lint?: boolean;
  [key: string]: unknown;
}

export interface WorkspaceConfig {
  mode?: "root" | "subproject" | "auto";
  root?: string;
  [key: string]: unknown;
}

export interface CiConfig {
  enabled?: boolean;
  workflows?: Record<string, WorkflowConfig>;
  [key: string]: unknown;
}

export interface WorkflowConfig {
  enabled?: boolean;
  os?: string[];
  matrix?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpConfig {
  enabled?: boolean;
  port?: number;
  [key: string]: unknown;
}

export interface SecretsConfig {
  enabled?: boolean;
  ignorePatterns?: string[];
  highEntropyThreshold?: number;
  [key: string]: unknown;
}

export interface UpdateConfig {
  enabled?: boolean;
  endpoint?: string;
  version?: "latest" | "pinned";
  pinnedVersion?: string;
  verifySha256?: boolean;
  [key: string]: unknown;
}

export interface BackupConfig {
  enabled?: boolean;
  maxBackups?: number;
  [key: string]: unknown;
}

export interface StrictConfig {
  failOnWarnings?: boolean;
  failOnMissingTools?: boolean;
  requireAllChecks?: boolean;
  [key: string]: unknown;
}

export interface ReportConfig {
  enabled?: boolean;
  reportsDir?: string;
  autoCollect?: boolean;
  projectName?: string;
  [key: string]: unknown;
}

export interface VerificationConfig {
  enabled?: boolean;
  commands?: Record<string, string[]>;
  browserTesting?: boolean;
  failOnError?: boolean;
  [key: string]: unknown;
}

export interface HookConfig {
  name: string;
  command: string;
  stack?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface HooksConfig {
  postScaffold?: HookConfig[];
  [key: string]: unknown;
}

export interface KnowledgeConfig {
  enabled?: boolean;
  file?: string;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: Partial<PrecursorConfig> = {
  python: {
    runtime: "uv",
    linter: "ruff",
    formatter: "ruff",
    typechecker: "pyright",
    venvPath: ".venv",
  },
  web: {
    runtime: "bun",
    linter: "biome",
    formatter: "biome",
    typechecker: "tsc",
  },
  rust: {
    toolchain: "stable",
    linter: "clippy",
    formatter: "rustfmt",
  },
  cpp: {
    buildSystem: "cmake",
    formatter: "clang-format",
    linter: "clang-tidy",
    compileCommands: true,
  },
  workspace: {
    mode: "auto",
  },
  ci: {
    enabled: true,
  },
  mcp: {
    enabled: true,
  },
  secrets: {
    enabled: true,
    ignorePatterns: [
      "**/node_modules/**",
      "**/.venv/**",
      "**/target/**",
      "**/dist/**",
      "**/*.lock",
      "**/*.lockb",
    ],
    highEntropyThreshold: 0.7,
  },
  backup: {
    enabled: true,
    maxBackups: 10,
  },
};

let schemaCache: unknown = null;

/**
 * Load configuration from file with fallback to defaults
 */
export async function loadConfig(configPath?: string): Promise<PrecursorConfig> {
  const paths = configPath
    ? [configPath]
    : ["precursor.json", "precursor.jsonc", "precursor.yaml", "precursor.yml"];

  for (const path of paths) {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      let parsed: unknown;

      if (path.endsWith(".yaml") || path.endsWith(".yml")) {
        parsed = parseYaml(content);
      } else {
        // JSON or JSONC
        parsed = parseJsonc(content);
      }

      const config = deepMerge(DEFAULT_CONFIG, parsed as PrecursorConfig) as PrecursorConfig;
      return config;
    }
  }

  // Return defaults if no config found
  return DEFAULT_CONFIG as PrecursorConfig;
}

/**
 * Validate configuration against schema
 */
export async function validateConfig(config: PrecursorConfig): Promise<void> {
  if (!schemaCache) {
    const schemaPath = join(process.cwd(), "precursor.schema.json");
    if (existsSync(schemaPath)) {
      const schemaContent = readFileSync(schemaPath, "utf-8");
      schemaCache = parseJsonc(schemaContent);
    } else {
      // Skip validation if schema not found
      return;
    }
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schemaCache as object);

  const valid = validate(config);
  if (!valid) {
    const errors = validate.errors?.map((e) => `${e.instancePath}: ${e.message}`).join(", ");
    throw new Error(`Configuration validation failed: ${errors}`);
  }
}

/**
 * Deep merge helper (used by config loader)
 */
function deepMerge(target: unknown, source: unknown): unknown {
  if (source === null || source === undefined) {
    return target;
  }

  if (typeof source !== "object" || Array.isArray(source)) {
    return source;
  }

  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return source;
  }

  const result = { ...(target as Record<string, unknown>) };
  const src = source as Record<string, unknown>;

  for (const key in src) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      if (typeof src[key] === "object" && src[key] !== null && !Array.isArray(src[key])) {
        result[key] = deepMerge(result[key], src[key]);
      } else {
        result[key] = src[key];
      }
    }
  }

  return result;
}
