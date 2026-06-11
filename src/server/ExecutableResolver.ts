import { existsSync } from "fs";
import { homedir, platform } from "os";
import { join, basename, isAbsolute } from "path";
import { execSync } from "child_process";
import { createLogger } from "../debug/RuntimeDiagnostics";

const logger = createLogger("executable-resolver");

export class ExecutableResolver {
  static resolve(configuredPath: string): string {
    if (isAbsolute(configuredPath) && existsSync(configuredPath)) {
      return configuredPath;
    }

    const execName = basename(configuredPath) || configuredPath;
    
    const searchDirs = this.getSearchDirectories();
    
    for (const dir of searchDirs) {
      const fullPath = join(dir, execName);
      if (existsSync(fullPath)) {
        logger.info("found executable", { path: fullPath });
        return fullPath;
      }
    }

    logger.warn("executable not found in common paths; using configured path", {
      path: configuredPath,
    });
    return configuredPath;
  }

  static resolveFromPath(execName: string): string | null {
    try {
      const command = platform() === "win32" ? "where" : "which";
      const result = execSync(`${command} "${execName}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
      const path = result.trim().split("\n")[0];
      if (path && existsSync(path)) {
        return path;
      }
    } catch {
    }
    return null;
  }

  private static getSearchDirectories(): string[] {
    const currentPlatform = platform();
    const homeDir = homedir();
    const searchDirs: string[] = [];

    if (currentPlatform === "linux" || currentPlatform === "darwin") {
      searchDirs.push(
        join(homeDir, ".local", "bin"),
        join(homeDir, ".opencode", "bin"),
        join(homeDir, ".bun", "bin"),
        join(homeDir, ".npm-global", "bin")
      );

      const nvmDirs = this.expandNvmDirectories(homeDir);
      searchDirs.push(...nvmDirs);

      searchDirs.push("/usr/local/bin", "/usr/bin");

      if (currentPlatform === "darwin") {
        searchDirs.push("/opt/homebrew/bin");
      }
    } else if (currentPlatform === "win32") {
      const localAppData = process.env.LOCALAPPDATA || join(homeDir, "AppData", "Local");
      const userProfile = process.env.USERPROFILE || homeDir;

      searchDirs.push(
        join(localAppData, "opencode", "bin"),
        join(userProfile, ".bun", "bin"),
        join(userProfile, ".local", "bin")
      );
    }

    return searchDirs;
  }

  private static expandNvmDirectories(homeDir: string): string[] {
    const nvmBaseDir = join(homeDir, ".nvm", "versions", "node");
    const nvmDirs: string[] = [];

    try {
      if (existsSync(nvmBaseDir)) {
        const { readdirSync } = require("fs");
        const versions = readdirSync(nvmBaseDir, { withFileTypes: true });
        for (const version of versions) {
          if (version.isDirectory()) {
            nvmDirs.push(join(nvmBaseDir, version.name, "bin"));
          }
        }
      }
    } catch {
    }

    return nvmDirs;
  }
}
