import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";

export const pluginId = "another-opencode-for-obsidian";

export interface CheckResult {
  path: string;
  ok: boolean;
  action: unknown;
}

export function defaultVaultPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveHarnessPath(env.ANOTHER_OPENCODE_FOR_OBSIDIAN_VAULT ?? "~/obsidian");
}

export function defaultOpenCodeSourcePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveHarnessPath(env.OPENCODE_SOURCE ?? "~/Projects/ai-cli/opencode");
}

export function resolveHarnessPath(path: string): string {
  return resolve(expandHomePath(path));
}

export function expandHomePath(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

export function formatHomePath(path: string): string {
  const home = homedir();
  if (path === home) {
    return "~";
  }

  const normalizedHome = home.endsWith(sep) ? home : `${home}${sep}`;
  if (path.startsWith(normalizedHome)) {
    return `~${sep}${path.slice(normalizedHome.length)}`;
  }

  return path;
}

export function pluginDir(vault: string): string {
  return join(vault, ".obsidian", "plugins", pluginId);
}

export function linkFile(target: string, linkPath: string, force: boolean): CheckResult {
  if (!existsSync(target)) {
    return { path: linkPath, ok: false, action: `missing target ${target}` };
  }

  if (existsSync(linkPath)) {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      if (force) {
        unlinkSync(linkPath);
      } else {
        return { path: linkPath, ok: true, action: "symlink already exists" };
      }
    } else {
      return {
        path: linkPath,
        ok: false,
        action: "existing non-symlink file; remove or move it explicitly",
      };
    }
  }

  symlinkSync(target, linkPath);
  return { path: linkPath, ok: true, action: `linked -> ${target}` };
}

export function describePath(path: string): unknown {
  if (!existsSync(path)) {
    return { exists: false, path };
  }
  const stat = lstatSync(path);
  return {
    exists: true,
    path,
    type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
  };
}

export function readJson(path: string): any | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function tailFile(path: string, lines: number): string {
  return tailFileLines(path, lines).join("\n");
}

export function tailFileLines(path: string, lines: number): string[] {
  if (!existsSync(path)) {
    return [];
  }
  const content = readFileSync(path, "utf8");
  return content.split(/\r?\n/).filter(Boolean).slice(-lines);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}
