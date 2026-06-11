import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { OpenCodeProcess } from "./OpenCodeProcess";
import { createLogger } from "../../debug/RuntimeDiagnostics";

const logger = createLogger("posix-process");

export class PosixProcess implements OpenCodeProcess {
  start(command: string, args: string[], options: SpawnOptions): ChildProcess {
    return spawn(command, args, {
      ...options,
      detached: true,
    });
  }

  async stop(process: ChildProcess): Promise<void> {
    const pid = process.pid;
    if (!pid) {
      return;
    }

    logger.info("stopping server process tree", { pid });

    await this.killProcessGroup(pid, "SIGTERM");
    const gracefulExited = await this.waitForExit(process, 2000);

    if (gracefulExited) {
      logger.info("server stopped gracefully", { pid });
      return;
    }

    logger.warn("process did not exit gracefully; sending SIGKILL", { pid });

    await this.killProcessGroup(pid, "SIGKILL");
    const forceExited = await this.waitForExit(process, 3000);

    if (forceExited) {
      logger.info("server stopped with SIGKILL", { pid });
    } else {
      logger.error("failed to stop server within timeout", { pid });
    }
  }

  async verifyCommand(command: string): Promise<string | null> {
    if (command.startsWith("/") || command.startsWith("./")) {
      const fs = require("fs");
      try {
        fs.accessSync(command, fs.constants.X_OK);
        return null;
      } catch {
        if (existsSync(command)) {
          return `'${command}' exists but is not executable. Run: chmod +x ${command}`;
        }
        return `Executable not found at '${command}'. Check Settings → OpenCode path, or click "Autodetect"`;
      }
    }
    return null;
  }

  private async killProcessGroup(pid: number, signal: "SIGTERM" | "SIGKILL"): Promise<void> {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      logger.warn("signal failed", { pid, signal, error: String(error) });
    }
  }

  private async waitForExit(process: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (process.exitCode !== null || process.signalCode !== null) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeoutMs);

      const onExit = () => {
        cleanup();
        resolve(true);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        process.off("exit", onExit);
        process.off("error", onExit);
      };

      process.once("exit", onExit);
      process.once("error", onExit);
    });
  }
}
