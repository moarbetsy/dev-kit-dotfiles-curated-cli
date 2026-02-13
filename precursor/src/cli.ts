#!/usr/bin/env bun

/**
 * CLI entry point for Precursor
 */

import { reset, rollback, scan, setup, update } from "./index.js";

const args = process.argv.slice(2);

const options: {
  strict?: boolean;
  offline?: boolean;
  json?: boolean;
  noColor?: boolean;
} = {};

let command: string | null = null;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "setup" || arg === "--setup" || arg === "-Setup") {
    command = "setup";
  } else if (arg === "scan" || arg === "--scan" || arg === "-Scan") {
    command = "scan";
  } else if (arg === "rollback" || arg === "--rollback" || arg === "-Rollback") {
    command = "rollback";
  } else if (arg === "reset" || arg === "--reset" || arg === "-ResetState") {
    command = "reset";
  } else if (arg === "update" || arg === "--update" || arg === "-Update") {
    command = "update";
  } else if (arg === "--strict" || arg === "-Strict") {
    options.strict = true;
  } else if (arg === "--offline" || arg === "-Offline") {
    options.offline = true;
  } else if (arg === "--json" || arg === "-Json") {
    options.json = true;
  } else if (arg === "--no-color" || arg === "-NoColor") {
    options.noColor = true;
  }
}

// Execute command
async function main() {
  let result;

  try {
    switch (command) {
      case "setup":
        result = await setup(options);
        break;
      case "scan":
        result = await scan(options);
        break;
      case "rollback":
        result = await rollback(options);
        break;
      case "reset":
        result = await reset(options);
        break;
      case "update":
        result = await update(options);
        break;
      default:
        console.error("Unknown command. Use: setup, scan, rollback, reset, or update");
        process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        console.log(`✓ ${result.message || "Success"}`);
        if (result.data && !options.json) {
          console.log(JSON.stringify(result.data, null, 2));
        }
      } else {
        console.error(`✗ ${result.message || "Failed"}`);
        if (result.errors) {
          for (const error of result.errors) {
            console.error(`  ${error}`);
          }
        }
        process.exit(1);
      }
    }

    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.warn(`⚠ ${warning}`);
      }
      if (options.strict) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
