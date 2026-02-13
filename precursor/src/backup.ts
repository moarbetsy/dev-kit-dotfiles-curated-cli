/**
 * Backup and rollback functionality
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PrecursorConfig } from "./config.js";

const BACKUP_DIR = ".precursor/backups";
const FILES_TO_BACKUP = [
  ".vscode/settings.json",
  ".vscode/extensions.json",
  ".cursor/mcp.json",
  ".cursor/rules",
  ".github/workflows",
  ".gitignore",
  ".cursorignore",
];

/**
 * Ensure backup before writes
 */
export async function ensureBackup(config: PrecursorConfig): Promise<string> {
  if (config.backup?.enabled === false) {
    return "";
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(BACKUP_DIR, timestamp);

  mkdirSync(backupPath, { recursive: true });

  for (const file of FILES_TO_BACKUP) {
    if (existsSync(file)) {
      const stat = statSync(file);
      const dest = join(backupPath, file);

      if (stat.isDirectory()) {
        copyDirectory(file, dest);
      } else {
        mkdirSync(join(dest, ".."), { recursive: true });
        copyFileSync(file, dest);
      }
    }
  }

  // Clean up old backups
  await cleanupOldBackups(config);

  return backupPath;
}

/**
 * Restore from latest backup
 */
export async function restoreBackup(
  _config: PrecursorConfig
): Promise<{ success: boolean; message: string; backupPath?: string }> {
  if (!existsSync(BACKUP_DIR)) {
    return { success: false, message: "No backups found" };
  }

  const backups = readdirSync(BACKUP_DIR)
    .map((name) => ({
      name,
      path: join(BACKUP_DIR, name),
      mtime: statSync(join(BACKUP_DIR, name)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (backups.length === 0) {
    return { success: false, message: "No backups found" };
  }

  const latest = backups[0];

  // Restore files
  for (const file of FILES_TO_BACKUP) {
    const backupFile = join(latest.path, file);
    if (existsSync(backupFile)) {
      const stat = statSync(backupFile);
      if (stat.isDirectory()) {
        // Remove existing and copy backup
        const { rmSync } = await import("node:fs");
        if (existsSync(file)) {
          rmSync(file, { recursive: true });
        }
        copyDirectory(backupFile, file);
      } else {
        const { dirname } = await import("node:path");
        const fileDir = dirname(file);
        if (fileDir !== "." && !existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }
        copyFileSync(backupFile, file);
      }
    }
  }

  return {
    success: true,
    message: `Restored from backup: ${latest.name}`,
    backupPath: latest.path,
  };
}

/**
 * Copy directory recursively
 */
function copyDirectory(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Clean up old backups
 */
async function cleanupOldBackups(config: PrecursorConfig): Promise<void> {
  const maxBackups = config.backup?.maxBackups || 10;

  if (!existsSync(BACKUP_DIR)) {
    return;
  }

  const backups = readdirSync(BACKUP_DIR)
    .map((name) => ({
      name,
      path: join(BACKUP_DIR, name),
      mtime: statSync(join(BACKUP_DIR, name)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (backups.length > maxBackups) {
    const toDelete = backups.slice(maxBackups);
    const { rmSync } = await import("node:fs");

    for (const backup of toDelete) {
      try {
        if (existsSync(backup.path)) {
          rmSync(backup.path, { recursive: true });
        }
      } catch (error) {
        // Ignore errors when deleting backups (directory might already be gone)
        // This prevents issues with tools trying to access deleted backup directories
      }
    }
  }
}
