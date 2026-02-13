/**
 * System and hardware detection
 * Detects PATH environment, computer configuration, and hardware specs
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { arch, cpus, freemem, homedir, hostname, platform, totalmem } from "node:os";

export interface SystemInfo {
  platform: string;
  arch: string;
  hostname: string;
  homeDir: string;
  osVersion?: string;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk?: DiskInfo[];
  path: PathInfo;
  environment: EnvironmentInfo;
  hardware?: HardwareInfo;
}

export interface CpuInfo {
  model: string;
  cores: number;
  threads: number;
  speed?: number;
}

export interface MemoryInfo {
  total: number; // bytes
  free: number; // bytes
  used: number; // bytes
  totalGB: number;
  freeGB: number;
  usedGB: number;
  usagePercent: number;
}

export interface DiskInfo {
  drive: string;
  total: number; // bytes
  free: number; // bytes
  used: number; // bytes
  totalGB: number;
  freeGB: number;
  usedGB: number;
  usagePercent: number;
}

export interface PathInfo {
  paths: string[];
  count: number;
  duplicates: string[];
  missing: string[];
  dangerous: string[];
  issues: string[];
}

export interface EnvironmentInfo {
  shell?: string;
  terminal?: string;
  editor?: string;
  nodeVersion?: string;
  bunVersion?: string;
  pythonVersion?: string;
  gitVersion?: string;
  powershellVersion?: string;
}

export interface HardwareInfo {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  biosVersion?: string;
  motherboard?: string;
}

/**
 * Get comprehensive system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const cpuInfo = getCpuInfo();
  const memoryInfo = getMemoryInfo();
  const pathInfo = await getPathInfo();
  const environmentInfo = await getEnvironmentInfo();
  const hardwareInfo = await getHardwareInfo();
  const diskInfo = await getDiskInfo();
  const osVersion = await getOsVersion();

  return {
    platform: platform(),
    arch: arch(),
    hostname: hostname(),
    homeDir: homedir(),
    osVersion,
    cpu: cpuInfo,
    memory: memoryInfo,
    disk: diskInfo.length > 0 ? diskInfo : undefined,
    path: pathInfo,
    environment: environmentInfo,
    hardware: hardwareInfo,
  };
}

/**
 * Get CPU information
 */
function getCpuInfo(): CpuInfo {
  const cpusInfo = cpus();
  const firstCpu = cpusInfo[0];

  return {
    model: firstCpu?.model || "Unknown",
    cores: cpusInfo.length,
    threads: cpusInfo.reduce((sum, cpu) => sum + (cpu.speed ? 1 : 0), 0),
    speed: firstCpu?.speed,
  };
}

/**
 * Get memory information
 */
function getMemoryInfo(): MemoryInfo {
  const total = totalmem();
  const free = freemem();
  const used = total - free;

  return {
    total,
    free,
    used,
    totalGB: Math.round((total / 1024 / 1024 / 1024) * 100) / 100,
    freeGB: Math.round((free / 1024 / 1024 / 1024) * 100) / 100,
    usedGB: Math.round((used / 1024 / 1024 / 1024) * 100) / 100,
    usagePercent: Math.round((used / total) * 100),
  };
}

/**
 * Get PATH information
 */
async function getPathInfo(): Promise<PathInfo> {
  const pathEnv = process.env.PATH || "";
  const paths = pathEnv.split(platform() === "win32" ? ";" : ":").filter((p) => p.trim());

  // Find duplicates
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const path of paths) {
    const normalized = normalizePath(path);
    if (seen.has(normalized)) {
      duplicates.push(path);
    } else {
      seen.add(normalized);
    }
  }

  // Check for missing directories
  const missing: string[] = [];
  const dangerous: string[] = [];
  const issues: string[] = [];
  const homeDir = homedir();

  for (const path of paths) {
    if (!existsSync(path)) {
      missing.push(path);
      issues.push(`PATH entry does not exist: ${path}`);
    }

    // Check for dangerous patterns (node_modules\.bin in root/home directories)
    const normalizedPath = normalizePath(path);
    if (
      normalizedPath.includes("node_modules/.bin") ||
      normalizedPath.includes("node_modules\\.bin")
    ) {
      // Check if it's in a dangerous location (root drive or user home root)
      const isRootLevel =
        /^[a-z]:\/$/.test(normalizedPath) || /^[a-z]:\/node_modules/.test(normalizedPath);
      const isHomeRoot =
        normalizedPath.startsWith(normalizePath(homeDir) + "/node_modules") ||
        normalizedPath.startsWith(normalizePath(homeDir) + "\\node_modules");

      if (isRootLevel || isHomeRoot) {
        dangerous.push(path);
        issues.push(`Dangerous PATH entry (node_modules in root/home): ${path}`);
      }
    }
  }

  // Check for common issues
  if (paths.length === 0) {
    issues.push("PATH environment variable is empty");
  }

  if (paths.length > 100) {
    issues.push(`PATH has ${paths.length} entries (may cause performance issues)`);
  }

  return {
    paths,
    count: paths.length,
    duplicates: [...new Set(duplicates)],
    missing: [...new Set(missing)],
    dangerous: [...new Set(dangerous)],
    issues,
  };
}

/**
 * Normalize path for comparison (case-insensitive on Windows)
 */
function normalizePath(path: string): string {
  if (platform() === "win32") {
    return path.toLowerCase().replace(/\\/g, "/");
  }
  return path;
}

/**
 * Get environment information
 */
async function getEnvironmentInfo(): Promise<EnvironmentInfo> {
  const info: EnvironmentInfo = {};

  // Shell
  if (platform() === "win32") {
    info.shell = process.env.COMSPEC || "cmd.exe";
    info.powershellVersion = (await getVersion("pwsh")) || (await getVersion("powershell"));
  } else {
    info.shell = process.env.SHELL || "/bin/sh";
  }

  // Terminal
  info.terminal = process.env.TERM || process.env.TERM_PROGRAM || "unknown";

  // Editor
  info.editor = process.env.EDITOR || process.env.VISUAL || undefined;

  // Tool versions
  info.nodeVersion = process.version;
  info.bunVersion = await getVersion("bun");
  info.pythonVersion = (await getVersion("python")) || (await getVersion("python3"));
  info.gitVersion = await getVersion("git");

  return info;
}

/**
 * Get version of a command
 */
async function getVersion(command: string): Promise<string | undefined> {
  try {
    const output = execSync(`${command} --version`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    // Extract version number
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : output.split("\n")[0].trim();
  } catch {
    return undefined;
  }
}

/**
 * Get hardware information (platform-specific)
 */
async function getHardwareInfo(): Promise<HardwareInfo | undefined> {
  if (platform() === "win32") {
    return await getWindowsHardwareInfo();
  } else if (platform() === "linux") {
    return await getLinuxHardwareInfo();
  } else if (platform() === "darwin") {
    return await getMacHardwareInfo();
  }
  return undefined;
}

/**
 * Get Windows hardware information
 */
async function getWindowsHardwareInfo(): Promise<HardwareInfo> {
  const info: HardwareInfo = {};

  try {
    // Manufacturer
    const manufacturer = execSync("wmic computersystem get manufacturer /value", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const manufacturerMatch = manufacturer.match(/Manufacturer=(.+)/);
    if (manufacturerMatch) {
      info.manufacturer = manufacturerMatch[1].trim();
    }

    // Model
    const model = execSync("wmic computersystem get model /value", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const modelMatch = model.match(/Model=(.+)/);
    if (modelMatch) {
      info.model = modelMatch[1].trim();
    }

    // Serial number
    const serial = execSync("wmic bios get serialnumber /value", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const serialMatch = serial.match(/SerialNumber=(.+)/);
    if (serialMatch && serialMatch[1].trim() !== "") {
      info.serialNumber = serialMatch[1].trim();
    }

    // BIOS version
    const bios = execSync("wmic bios get version /value", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const biosMatch = bios.match(/Version=(.+)/);
    if (biosMatch) {
      info.biosVersion = biosMatch[1].trim();
    }

    // Motherboard
    const motherboard = execSync("wmic baseboard get product /value", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    const mbMatch = motherboard.match(/Product=(.+)/);
    if (mbMatch) {
      info.motherboard = mbMatch[1].trim();
    }
  } catch {
    // Ignore errors - hardware info is optional
  }

  return info;
}

/**
 * Get Linux hardware information
 */
async function getLinuxHardwareInfo(): Promise<HardwareInfo> {
  const info: HardwareInfo = {};

  try {
    // Manufacturer and model from DMI
    if (existsSync("/sys/class/dmi/id/sys_vendor")) {
      info.manufacturer = execSync("cat /sys/class/dmi/id/sys_vendor", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    }

    if (existsSync("/sys/class/dmi/id/product_name")) {
      info.model = execSync("cat /sys/class/dmi/id/product_name", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    }

    if (existsSync("/sys/class/dmi/id/board_name")) {
      info.motherboard = execSync("cat /sys/class/dmi/id/board_name", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    }

    if (existsSync("/sys/class/dmi/id/product_serial")) {
      info.serialNumber = execSync("cat /sys/class/dmi/id/product_serial", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    }

    if (existsSync("/sys/class/dmi/id/bios_version")) {
      info.biosVersion = execSync("cat /sys/class/dmi/id/bios_version", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
    }
  } catch {
    // Ignore errors
  }

  return info;
}

/**
 * Get macOS hardware information
 */
async function getMacHardwareInfo(): Promise<HardwareInfo> {
  const info: HardwareInfo = {};

  try {
    // Manufacturer (always Apple on Mac)
    info.manufacturer = "Apple";

    // Model
    const model = execSync("sysctl -n hw.model", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
    if (model) {
      info.model = model;
    }

    // Serial number
    const serial = execSync(
      "system_profiler SPHardwareDataType | grep 'Serial Number' | awk '{print $4}'",
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
        shell: "/bin/bash",
      }
    ).trim();
    if (serial) {
      info.serialNumber = serial;
    }
  } catch {
    // Ignore errors
  }

  return info;
}

/**
 * Get OS version
 */
async function getOsVersion(): Promise<string | undefined> {
  if (platform() === "win32") {
    try {
      const version = execSync("ver", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      return version;
    } catch {
      // Try PowerShell
      try {
        const version = execSync(
          'powershell -Command "[System.Environment]::OSVersion.VersionString"',
          {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
          }
        ).trim();
        return version;
      } catch {
        return undefined;
      }
    }
  } else if (platform() === "linux") {
    try {
      // Try /etc/os-release first
      if (existsSync("/etc/os-release")) {
        const content = execSync("cat /etc/os-release", {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        });
        const nameMatch = content.match(/PRETTY_NAME="(.+)"/);
        if (nameMatch) {
          return nameMatch[1];
        }
      }
      // Fallback to uname
      const version = execSync("uname -r", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      return `Linux ${version}`;
    } catch {
      return undefined;
    }
  } else if (platform() === "darwin") {
    try {
      const version = execSync("sw_vers -productVersion", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      const name = execSync("sw_vers -productName", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      return `${name} ${version}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Get disk information
 */
async function getDiskInfo(): Promise<DiskInfo[]> {
  const disks: DiskInfo[] = [];

  if (platform() === "win32") {
    try {
      // Get disk info using wmic
      const output = execSync("wmic logicaldisk get size,freespace,caption /format:list", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10000,
      });

      const lines = output.split("\n").filter((line) => line.trim());
      let currentDisk: Partial<DiskInfo> = {};

      for (const line of lines) {
        if (line.startsWith("Caption=")) {
          if (
            currentDisk.drive &&
            currentDisk.total !== undefined &&
            currentDisk.free !== undefined
          ) {
            disks.push(currentDisk as DiskInfo);
          }
          currentDisk = { drive: line.split("=")[1].trim() };
        } else if (line.startsWith("Size=")) {
          const size = parseInt(line.split("=")[1].trim(), 10);
          if (!isNaN(size) && size > 0) {
            currentDisk.total = size;
          }
        } else if (line.startsWith("FreeSpace=")) {
          const free = parseInt(line.split("=")[1].trim(), 10);
          if (!isNaN(free) && free >= 0) {
            currentDisk.free = free;
          }
        }
      }

      if (currentDisk.drive && currentDisk.total !== undefined && currentDisk.free !== undefined) {
        disks.push(currentDisk as DiskInfo);
      }

      // Calculate used and percentages
      for (const disk of disks) {
        if (disk.total && disk.free !== undefined) {
          disk.used = disk.total - disk.free;
          disk.totalGB = Math.round((disk.total / 1024 / 1024 / 1024) * 100) / 100;
          disk.freeGB = Math.round((disk.free / 1024 / 1024 / 1024) * 100) / 100;
          disk.usedGB = Math.round((disk.used / 1024 / 1024 / 1024) * 100) / 100;
          disk.usagePercent = Math.round((disk.used / disk.total) * 100);
        }
      }
    } catch {
      // Ignore errors
    }
  } else {
    // Unix-like systems
    try {
      const output = execSync("df -h", {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10000,
      });

      const lines = output.split("\n").slice(1); // Skip header
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const drive = parts[parts.length - 1];
          const totalStr = parts[1];
          const usedStr = parts[2];
          const freeStr = parts[3];

          // Parse sizes (handles K, M, G, T suffixes)
          const total = parseSize(totalStr);
          const used = parseSize(usedStr);
          const free = parseSize(freeStr);

          if (total && used !== undefined && free !== undefined) {
            disks.push({
              drive,
              total,
              used,
              free,
              totalGB: Math.round((total / 1024 / 1024 / 1024) * 100) / 100,
              freeGB: Math.round((free / 1024 / 1024 / 1024) * 100) / 100,
              usedGB: Math.round((used / 1024 / 1024 / 1024) * 100) / 100,
              usagePercent: Math.round((used / total) * 100),
            });
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return disks;
}

/**
 * Parse size string (e.g., "10G", "500M") to bytes
 */
function parseSize(sizeStr: string): number | undefined {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT])?$/i);
  if (!match) {
    return undefined;
  }

  const value = parseFloat(match[1]);
  const unit = match[2]?.toUpperCase() || "";

  const multipliers: Record<string, number> = {
    "": 1,
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024,
  };

  return Math.round(value * (multipliers[unit] || 1));
}

/**
 * Check if a tool is in PATH
 */
export async function isToolInPath(toolName: string): Promise<boolean> {
  try {
    execSync(`which ${toolName}`, {
      encoding: "utf-8",
      stdio: "ignore",
      timeout: 2000,
    });
    return true;
  } catch {
    // Try Windows where command
    if (platform() === "win32") {
      try {
        execSync(`where ${toolName}`, {
          encoding: "utf-8",
          stdio: "ignore",
          timeout: 2000,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Get all tools found in PATH
 */
export async function getToolsInPath(): Promise<string[]> {
  const tools: string[] = [];
  const commonTools = [
    "git",
    "node",
    "npm",
    "bun",
    "python",
    "python3",
    "rustc",
    "cargo",
    "uv",
    "ruff",
    "biome",
    "clang-format",
    "clang-tidy",
    "cmake",
    "docker",
    "pwsh",
    "powershell",
    "bash",
    "zsh",
    "fish",
  ];

  for (const tool of commonTools) {
    if (await isToolInPath(tool)) {
      tools.push(tool);
    }
  }

  return tools;
}
