import { ChildProcess, SpawnOptions } from "child_process";
import { EventEmitter } from "events";
import * as http from "http";
import {
  OpenCodeSettings,
  ServerEndpoint,
  createServerEndpoint,
  getExplicitCustomCommand,
  usesExplicitCustomCommand,
} from "../types";
import { ServerState } from "./types";
import { OpenCodeProcess } from "./process/OpenCodeProcess";
import { WindowsProcess } from "./process/WindowsProcess";
import { PosixProcess } from "./process/PosixProcess";
import { ExecutableResolver } from "./ExecutableResolver";
import { createLogger } from "../debug/RuntimeDiagnostics";

export type { ServerState } from "./types";

type StartMode = "path" | "custom";

interface StartPlan {
  mode: StartMode;
  command: string;
  args: string[];
  spawnOptions: SpawnOptions;
  displayCommand: string;
  usesShell: boolean;
  cwd: string;
}

export interface ServerDiagnostics {
  state: ServerState;
  lastError: string | null;
  lastHealthError: string | null;
  lastCommand: string | null;
  lastCommandArgs: string[];
  lastDisplayCommand: string | null;
  lastStartMode: StartMode | null;
  lastCwd: string | null;
  lastStdout: string | null;
  lastStderr: string | null;
  lastExitCode: number | null;
  lastExitSignal: NodeJS.Signals | null;
  lastProcessErrorStack: string | null;
  hint: string | null;
}

const MAX_PROCESS_OUTPUT_CHARS = 4000;

export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private state: ServerState = "stopped";
  private lastError: string | null = null;
  private lastHealthError: string | null = null;
  private earlyExitCode: number | null = null;
  private lastCommand: string | null = null;
  private lastCommandArgs: string[] = [];
  private lastDisplayCommand: string | null = null;
  private lastStartMode: StartMode | null = null;
  private lastCwd: string | null = null;
  private lastStdout: string | null = null;
  private lastStderr: string | null = null;
  private lastExitCode: number | null = null;
  private lastExitSignal: NodeJS.Signals | null = null;
  private lastProcessErrorStack: string | null = null;
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

  getDiagnostics(): ServerDiagnostics {
    return {
      state: this.state,
      lastError: this.lastError,
      lastHealthError: this.lastHealthError,
      lastCommand: this.lastCommand,
      lastCommandArgs: [...this.lastCommandArgs],
      lastDisplayCommand: this.lastDisplayCommand,
      lastStartMode: this.lastStartMode,
      lastCwd: this.lastCwd,
      lastStdout: this.lastStdout,
      lastStderr: this.lastStderr,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      lastProcessErrorStack: this.lastProcessErrorStack,
      hint: this.getDiagnosticHint(),
    };
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
    this.resetProcessDiagnostics();

    if (!this.projectDirectory) {
      return this.setError("Project directory (vault) not configured");
    }

    const endpoint = this.getEndpoint();

    if (await this.checkServerHealth()) {
      this.logger.info("server already running", {
        port: this.settings.port,
        hostname: endpoint.hostname,
      });
      this.setState("running");
      return true;
    }

    const startPlan = await this.createStartPlan(endpoint);
    if ("message" in startPlan) {
      return this.setError(startPlan.message);
    }

    this.rememberStartPlan(startPlan);

    this.logger.info("starting server", {
      mode: startPlan.mode,
      command: startPlan.displayCommand,
      rawCommand: startPlan.command,
      args: startPlan.args,
      port: endpoint.port,
      hostname: endpoint.hostname,
      cwd: startPlan.cwd,
      projectDirectory: this.projectDirectory,
      shell: startPlan.usesShell,
    });

    this.process = this.processImpl.start(
      startPlan.command,
      startPlan.args,
      startPlan.spawnOptions
    );

    this.logger.info("process spawned", { pid: this.process.pid });

    this.process.stdout?.on("data", (data) => {
      const text = data.toString().trim();
      this.rememberProcessOutput("stdout", text);
      this.logger.info("process stdout", { text });
    });

    this.process.stderr?.on("data", (data) => {
      const text = data.toString().trim();
      this.rememberProcessOutput("stderr", text);
      this.logger.error("process stderr", { text });
    });

    this.process.on("exit", (code, signal) => {
      this.logger.info("process exited", { code, signal });
      this.lastExitCode = code;
      this.lastExitSignal = signal;
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
      this.lastProcessErrorStack = err.stack ?? null;
      this.process = null;

      if (err.code === "ENOENT") {
        this.setError(
          `Executable not found: '${this.lastDisplayCommand ?? this.settings.opencodePath}'`
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
      return this.setError(this.formatEarlyExitError(this.earlyExitCode));
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

  private async createStartPlan(
    endpoint: ServerEndpoint
  ): Promise<StartPlan | { message: string }> {
    const baseOptions: SpawnOptions = {
      cwd: this.projectDirectory,
      env: { ...process.env, NODE_USE_SYSTEM_CA: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    };

    if (usesExplicitCustomCommand(this.settings)) {
      const resolvedCommand = this.resolveCustomCommand(
        endpoint,
        getExplicitCustomCommand(this.settings)
      );
      if (typeof resolvedCommand !== "string") {
        return resolvedCommand;
      }

      return {
        mode: "custom",
        command: resolvedCommand,
        args: [],
        spawnOptions: {
          ...baseOptions,
          shell: true,
        },
        displayCommand: resolvedCommand,
        usesShell: true,
        cwd: this.projectDirectory,
      };
    }

    const executablePath = ExecutableResolver.resolve(this.settings.opencodePath);
    const commandError = await this.processImpl.verifyCommand(executablePath);
    if (commandError) {
      return { message: commandError };
    }

    const args = [
      "serve",
      "--port",
      endpoint.port.toString(),
      "--hostname",
      endpoint.hostname,
      "--cors",
      "app://obsidian.md",
    ];

    return {
      mode: "path",
      command: executablePath,
      args,
      spawnOptions: baseOptions,
      displayCommand: formatCommand(executablePath, args),
      usesShell: false,
      cwd: this.projectDirectory,
    };
  }

  private resolveCustomCommand(
    endpoint: ServerEndpoint,
    command: string
  ): string | { message: string } {
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

  private rememberStartPlan(startPlan: StartPlan): void {
    this.lastCommand = startPlan.command;
    this.lastCommandArgs = [...startPlan.args];
    this.lastDisplayCommand = startPlan.displayCommand;
    this.lastStartMode = startPlan.mode;
    this.lastCwd = startPlan.cwd;
  }

  private resetProcessDiagnostics(): void {
    this.lastCommand = null;
    this.lastCommandArgs = [];
    this.lastDisplayCommand = null;
    this.lastStartMode = null;
    this.lastCwd = null;
    this.lastStdout = null;
    this.lastStderr = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;
    this.lastProcessErrorStack = null;
  }

  private rememberProcessOutput(kind: "stdout" | "stderr", text: string): void {
    if (!text) {
      return;
    }

    const previous = kind === "stdout" ? this.lastStdout : this.lastStderr;
    const next = truncateProcessOutput(
      previous ? `${previous}\n${text}` : text
    );

    if (kind === "stdout") {
      this.lastStdout = next;
      return;
    }
    this.lastStderr = next;
  }

  private formatEarlyExitError(code: number): string {
    const stderr = this.lastStderr?.trim();
    if (!stderr) {
      return `Process exited unexpectedly (exit code ${code})`;
    }
    return `Process exited unexpectedly (exit code ${code}): ${collapseWhitespace(stderr)}`;
  }

  private getDiagnosticHint(): string | null {
    const evidence = [
      this.lastError,
      this.lastStderr,
      this.lastProcessErrorStack,
    ].filter(Boolean).join("\n");

    if (
      this.earlyExitCode === 127 ||
      this.lastExitCode === 127 ||
      /command not found|not recognized|ENOENT|executable not found/i.test(evidence)
    ) {
      if (this.lastStartMode === "custom") {
        return "Custom commands run through Obsidian's GUI shell. Use an absolute or leading-tilde executable path, or leave Custom command empty to use OpenCode executable path mode.";
      }
      return "OpenCode executable was not found. Set OpenCode executable path to an absolute path, or use Autodetect in Settings.";
    }

    if (this.lastStartMode === "custom" && this.lastHealthError) {
      return "The custom command started, but the configured health endpoint did not become healthy. Keep {hostname} and {port} wired to the same server the command starts.";
    }

    if (this.lastHealthError) {
      return `Last health check: ${this.lastHealthError}`;
    }

    return null;
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

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteCommandPart).join(" ");
}

function quoteCommandPart(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function truncateProcessOutput(value: string): string {
  if (value.length <= MAX_PROCESS_OUTPUT_CHARS) {
    return value;
  }
  return `...${value.slice(-MAX_PROCESS_OUTPUT_CHARS)}`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
