import { ChildProcess, SpawnOptions } from "child_process";
import { EventEmitter } from "events";
import * as http from "http";
import {
  OpenCodeSettings,
  ServerEndpoint,
  createServerEndpoint,
  getCustomCommandTemplate,
} from "../types";
import { ServerState } from "./types";
import { OpenCodeProcess } from "./process/OpenCodeProcess";
import { WindowsProcess } from "./process/WindowsProcess";
import { PosixProcess } from "./process/PosixProcess";
import { ExecutableResolver } from "./ExecutableResolver";
import { createLogger } from "../debug/RuntimeDiagnostics";

export type { ServerState } from "./types";

export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private state: ServerState = "stopped";
  private lastError: string | null = null;
  private lastHealthError: string | null = null;
  private earlyExitCode: number | null = null;
  private settings: OpenCodeSettings;
  private projectDirectory: string;
  private processImpl: OpenCodeProcess;
  private logger = createLogger("server");

  constructor(settings: OpenCodeSettings, projectDirectory: string) {
    super();
    this.settings = settings;
    this.projectDirectory = projectDirectory;
    this.processImpl =
      process.platform === "win32" ? new WindowsProcess() : new PosixProcess();
  }

  updateSettings(settings: OpenCodeSettings): void {
    this.settings = settings;
  }

  updateProjectDirectory(directory: string): void {
    this.projectDirectory = directory;
    this.emit("projectDirectoryChanged", directory);
  }

  getState(): ServerState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLastHealthError(): string | null {
    return this.lastHealthError;
  }

  getPid(): number | null {
    return this.process?.pid ?? null;
  }

  getUrl(): string {
    return this.getEndpoint().uiBaseUrl;
  }

  getHealthUrl(): string {
    return this.getEndpoint().healthUrl;
  }

  async start(): Promise<boolean> {
    if (this.state === "running" || this.state === "starting") {
      return true;
    }

    this.setState("starting");
    this.lastError = null;
    this.lastHealthError = null;
    this.earlyExitCode = null;

    if (!this.projectDirectory) {
      return this.setError("Project directory (vault) not configured");
    }

    const endpoint = this.getEndpoint();
    let executablePath: string;
    let spawnOptions: SpawnOptions;
    
    if (this.settings.useCustomCommand) {
      const resolvedCommand = this.resolveCustomCommand(endpoint);
      if (typeof resolvedCommand !== "string") {
        return this.setError(resolvedCommand.message);
      }
      executablePath = resolvedCommand;
      spawnOptions = {
        cwd: this.projectDirectory,
        env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      };
    } else {
      executablePath = ExecutableResolver.resolve(this.settings.opencodePath);
      
      const commandError = await this.processImpl.verifyCommand(executablePath);
      if (commandError) {
        return this.setError(commandError);
      }
      
      spawnOptions = {
        cwd: this.projectDirectory,
        env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      };
    }

    if (await this.checkServerHealth()) {
      this.logger.info("server already running", {
        port: this.settings.port,
        hostname: endpoint.hostname,
      });
      this.setState("running");
      return true;
    }

    this.logger.info("starting server", {
      mode: this.settings.useCustomCommand ? "custom" : "path",
      command: executablePath,
      port: endpoint.port,
      hostname: endpoint.hostname,
      cwd: this.projectDirectory,
      projectDirectory: this.projectDirectory,
    });

    if (this.settings.useCustomCommand) {
      this.process = this.processImpl.start(
        executablePath,
        [],
        spawnOptions
      );
    } else {
      this.process = this.processImpl.start(
        executablePath,
        [
          "serve",
          "--port",
          endpoint.port.toString(),
          "--hostname",
          endpoint.hostname,
          "--cors",
          "app://obsidian.md",
        ],
        spawnOptions
      );
    }

    this.logger.info("process spawned", { pid: this.process.pid });

    this.process.stdout?.on("data", (data) => {
      this.logger.info("process stdout", { text: data.toString().trim() });
    });

    this.process.stderr?.on("data", (data) => {
      this.logger.error("process stderr", { text: data.toString().trim() });
    });

    this.process.on("exit", (code, signal) => {
      this.logger.info("process exited", { code, signal });
      this.process = null;

      if (this.state === "starting" && code !== null && code !== 0) {
        this.earlyExitCode = code;
      }

      if (this.state === "running") {
        this.setState("stopped");
      }
    });

    this.process.on("error", (err: NodeJS.ErrnoException) => {
      this.logger.error("failed to start process", err);
      this.process = null;

      if (err.code === "ENOENT") {
        const command = this.settings.useCustomCommand 
          ? this.settings.customCommand 
          : this.settings.opencodePath;
        this.setError(
          `Executable not found: '${command}'`
        );
      } else {
        this.setError(`Failed to start: ${err.message}`);
      }
    });

    const ready = await this.waitForServerOrExit(this.settings.startupTimeout);
    if (ready) {
      this.setState("running");
      return true;
    }

    if (this.state === "error") {
      return false;
    }

    if (this.earlyExitCode !== null) {
      return this.setError(
        `Process exited unexpectedly (exit code ${this.earlyExitCode})`
      );
    }

    if (!this.process) {
      return this.setError("Process exited before server became ready");
    }

    const healthError = this.lastHealthError;
    await this.stop();

    return this.setError(
      healthError
        ? `Server failed to start within timeout; last health check: ${healthError}`
        : "Server failed to start within timeout"
    );
  }

  async stop(): Promise<void> {
    if (!this.process) {
      this.setState("stopped");
      return;
    }

    const proc = this.process;

    this.setState("stopped");
    this.process = null;

    await this.processImpl.stop(proc);
  }

  private setState(state: ServerState): void {
    this.state = state;
    this.emit("stateChange", state);
  }

  private setError(message: string): false {
    this.lastError = message;
    this.logger.error("server error", { message });
    this.setState("error");
    return false;
  }

  private getEndpoint(): ServerEndpoint {
    return createServerEndpoint(this.settings, this.projectDirectory);
  }

  private resolveCustomCommand(
    endpoint: ServerEndpoint
  ): string | { message: string } {
    const command = getCustomCommandTemplate(this.settings);

    if (!command.includes("{hostname}")) {
      return {
        message: "Custom command must include {hostname} so the plugin can use one server endpoint",
      };
    }

    if (!command.includes("{port}")) {
      return {
        message: "Custom command must include {port} so the plugin can use one server endpoint",
      };
    }

    return command
      .replace(/\{hostname\}/g, endpoint.hostname)
      .replace(/\{port\}/g, endpoint.port.toString())
      .replace(/\{cors\}/g, "app://obsidian.md")
      .replace(/\{projectDirectory\}/g, this.projectDirectory);
  }

  private async checkServerHealth(): Promise<boolean> {
    const healthUrl = this.getEndpoint().healthUrl;

    return new Promise((resolve) => {
      const request = http.get(healthUrl, (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode !== 200) {
            this.lastHealthError = `${healthUrl} returned HTTP ${response.statusCode}`;
            resolve(false);
            return;
          }

          try {
            const payload = JSON.parse(body) as { healthy?: unknown };
            if (payload.healthy === true) {
              this.lastHealthError = null;
              resolve(true);
              return;
            }
            this.lastHealthError = `${healthUrl} returned an unhealthy payload`;
          } catch {
            this.lastHealthError = `${healthUrl} returned a non-JSON response`;
          }
          resolve(false);
        });
      });

      request.setTimeout(2000, () => {
        this.lastHealthError = `${healthUrl} timed out`;
        request.destroy();
        resolve(false);
      });

      request.on("error", (error: Error) => {
        this.lastHealthError = `${healthUrl} is not reachable: ${error.message}`;
        resolve(false);
      });
    });
  }

  private async waitForServerOrExit(timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      if (!this.process) {
        this.logger.warn("process exited before server became ready");
        return false;
      }

      if (await this.checkServerHealth()) {
        return true;
      }
      await this.sleep(pollInterval);
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
