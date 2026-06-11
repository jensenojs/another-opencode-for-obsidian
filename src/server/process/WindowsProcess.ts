import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { OpenCodeProcess } from "./OpenCodeProcess";
import { createLogger } from "../../debug/RuntimeDiagnostics";

const logger = createLogger("windows-process");

export class WindowsProcess implements OpenCodeProcess {
  private static currentProcess: ChildProcess | null = null;
  private static cleanupHandlerRegistered = false;

  start(command: string, args: string[], options: SpawnOptions): ChildProcess {
    const process = spawn(command, args, {
      ...options,
      shell: true,
      windowsHide: true,
    });

    WindowsProcess.currentProcess = process;
    WindowsProcess.registerCleanupHandler();

    return process;
  }

  async stop(process: ChildProcess): Promise<void> {
    const pid = process.pid;
    if (!pid) {
      WindowsProcess.currentProcess = null;
      return;
    }

    logger.info("stopping server process tree", { pid });

    // shell:true spawns cmd.exe -> node.exe; kill the child first or OpenCode survives.
    this.killChildProcesses(pid);
    await this.execAsync(`taskkill /F /PID ${pid}`).catch((error: Error) => {
      logger.warn("failed to stop server process", { pid, error: error.message });
    });

    WindowsProcess.currentProcess = null;

    await this.waitForExit(process, 5000);
  }

  private static registerCleanupHandler(): void {
    if (WindowsProcess.cleanupHandlerRegistered) {
      return;
    }

    if (typeof window !== "undefined" && !process.env.CI) {
      window.addEventListener("beforeunload", () => {
        if (WindowsProcess.currentProcess?.pid) {
          WindowsProcess.killProcessSync(WindowsProcess.currentProcess.pid);
        }
      });
      WindowsProcess.cleanupHandlerRegistered = true;
    }
  }

  private static killProcessSync(pid: number): void {
    WindowsProcess.killChildProcesses(pid);
    WindowsProcess.execSyncQuiet(`taskkill /F /PID ${pid}`);
  }

  async verifyCommand(command: string): Promise<string | null> {
    try {
      await this.execAsync(`where "${command}"`);
      return null;
    } catch {
      return `Executable not found at '${command}'. Check Settings → OpenCode path, or click "Autodetect"`;
    }
  }

  private async waitForExit(process: ChildProcess, timeoutMs: number): Promise<void> {
    if (process.exitCode !== null || process.signalCode !== null) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, timeoutMs);

      const onExit = () => {
        cleanup();
        resolve();
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

  private execAsync(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require("child_process");
      exec(command, (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private static killChildProcesses(pid: number): void {
    const output = WindowsProcess.execSyncQuiet(
      `powershell -Command "Get-CimInstance Win32_Process -Filter \\"ParentProcessId=${pid}\\" | Select-Object ProcessId"`
    );
    if (!output) {
      return;
    }

    const lines = output.split("\n").slice(3);
    for (const line of lines) {
      const childPid = line.trim();
      if (childPid && !isNaN(parseInt(childPid))) {
        WindowsProcess.execSyncQuiet(`taskkill /F /PID ${childPid}`);
      }
    }
  }

  private killChildProcesses(pid: number): void {
    WindowsProcess.killChildProcesses(pid);
  }

  private static execSyncQuiet(command: string): string | null {
    try {
      const { execSync } = require("child_process");
      return execSync(command, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
    } catch (error) {
      logger.warn("windows process command failed", { command, error: String(error) });
      return null;
    }
  }
}
