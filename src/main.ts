import { Plugin, WorkspaceLeaf, Notice, EventRef, MarkdownView } from "obsidian";
import {
  OpenCodeSettings,
  DEFAULT_SETTINGS,
  OPENCODE_VIEW_TYPE,
  createServerEndpoint,
} from "./types";
import { OpenCodeView } from "./ui/OpenCodeView";
import { ViewManager } from "./ui/ViewManager";
import { OpenCodeSettingTab } from "./settings/SettingsTab";
import { ServerDiagnostics, ServerManager, ServerState } from "./server/ServerManager";
import { registerOpenCodeIcons, OPENCODE_ICON_NAME } from "./icons";
import { OpenCodeClient } from "./client/OpenCodeClient";
import { ContextManager } from "./context/ContextManager";
import { ExecutableResolver } from "./server/ExecutableResolver";
import { OpenCodeProxy } from "./proxy/OpenCodeProxy";
import {
  createLogger,
  getRuntimePaths,
  type RuntimeDiagnosticsSnapshot,
  writeRuntimeStatus,
} from "./debug/RuntimeDiagnostics";
import { BRIDGE_MESSAGES, isBridgeMessage } from "./bridge/BridgeProtocol";
import { captureObsidianWebViewTheme } from "./theme/WebViewTheme";

export default class OpenCodePlugin extends Plugin {
  settings: OpenCodeSettings = DEFAULT_SETTINGS;
  private processManager: ServerManager;
  private stateChangeCallbacks: Array<(state: ServerState) => void> = [];
  private openCodeClient: OpenCodeClient;
  private contextManager: ContextManager;
  private viewManager: ViewManager;
  private cachedIframeUrl: string | null = null;
  private lastBaseUrl: string | null = null;
  private lastApiBaseUrl: string | null = null;
  private runtimeDiagnostics: RuntimeDiagnosticsSnapshot = {
    theme: null,
  };
  private openCodeProxy: OpenCodeProxy;
  private logger = createLogger("plugin");

  async onload(): Promise<void> {
    this.logger.info("loading plugin");

    registerOpenCodeIcons();

    await this.loadSettings();
    this.cachedIframeUrl = this.settings.lastSessionUrl || null;

    await this.attemptAutodetect();

    const projectDirectory = this.getProjectDirectory();

    this.processManager = new ServerManager(this.settings, projectDirectory);
    this.processManager.on("stateChange", (state: ServerState) => {
      this.notifyStateChange(state);
      this.writeStatus(`server:${state}`);
    });

    const endpoint = createServerEndpoint(this.settings, projectDirectory);

    this.openCodeProxy = new OpenCodeProxy(endpoint.hostname, endpoint.port);
    this.refreshProxyAppearance();
    const proxyStarted = await this.openCodeProxy.start();
    if (!proxyStarted) {
      this.logger.error("proxy failed to start");
    }

    this.registerDomEvent(window, "message", (event: MessageEvent) => {
      if (event.origin !== this.openCodeProxy.getOrigin() || !isBridgeMessage(event.data)) {
        return;
      }
      if (event.data.type === BRIDGE_MESSAGES.proxyLoaded) {
        this.logger.info("bridge script loaded", { origin: event.origin });
      }
      if (event.data.type === BRIDGE_MESSAGES.themeDiagnostics) {
        this.runtimeDiagnostics.theme = event.data.payload ?? null;
        this.logger.info("theme diagnostics", this.runtimeDiagnostics.theme);
        this.writeStatus("theme-diagnostics");
      }
      if (event.data.type === BRIDGE_MESSAGES.viewToggle) {
        void this.viewManager.toggleView();
      }
    });

    this.processManager.on("projectDirectoryChanged", async (newDirectory: string) => {
      this.settings.projectDirectory = newDirectory;
      await this.saveData(this.settings);
      this.refreshClientState();
      this.writeStatus("project-directory-changed");
      if (this.getServerState() === "running") {
        await this.stopServer();
        await this.startServer();
      }
    });

    this.openCodeClient = new OpenCodeClient(
      this.getApiBaseUrl(),
      this.getServerUrl(),
      projectDirectory
    );
    this.lastBaseUrl = this.getServerUrl();
    this.lastApiBaseUrl = this.getApiBaseUrl();

    this.contextManager = new ContextManager({
      app: this.app,
      settings: this.settings,
      client: this.openCodeClient,
      getServerState: () => this.getServerState(),
      getCachedIframeUrl: () => this.cachedIframeUrl,
      setCachedIframeUrl: (url) => this.setCachedIframeUrl(url),
      registerEvent: (ref) => this.registerEvent(ref),
    });

    this.viewManager = new ViewManager({
      app: this.app,
      settings: this.settings,
      client: this.openCodeClient,
      contextManager: this.contextManager,
      getCachedIframeUrl: () => this.cachedIframeUrl,
      setCachedIframeUrl: (url) => this.setCachedIframeUrl(url),
      getServerState: () => this.getServerState(),
    });

    this.logger.info("configured project directory", { projectDirectory });

    this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));
    this.addSettingTab(
      new OpenCodeSettingTab(this.app, this, this.settings, this.processManager, () =>
        this.saveSettings()
      )
    );

    this.addRibbonIcon(OPENCODE_ICON_NAME, "OpenCode", () => {
      void this.viewManager.activateView();
    });

    this.addCommand({
      id: "toggle-opencode-view",
      name: "Toggle OpenCode panel",
      callback: () => {
        void this.viewManager.toggleView();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "o",
        },
      ],
    });

    this.addCommand({
      id: "start-opencode-server",
      name: "Start OpenCode server",
      callback: () => {
        this.startServer();
      },
    });

    this.addCommand({
      id: "stop-opencode-server",
      name: "Stop OpenCode server",
      callback: () => {
        this.stopServer();
      },
    });

    if (this.settings.autoStart) {
      this.app.workspace.onLayoutReady(async () => {
        await this.startServer();
      });
    }

    this.contextManager.updateSettings(this.settings);
    this.processManager.on("stateChange", (state: ServerState) => {
      if (state === "running") {
        void this.contextManager.handleServerRunning();
      }
    });

    this.registerCleanupHandlers();
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.refreshProxyAppearance();
        this.refreshOpenCodeViews();
      })
    );

    this.writeStatus("loaded");
    this.logger.info("plugin loaded", {
      logFile: getRuntimePaths().logFile,
      statusFile: getRuntimePaths().statusFile,
    });
  }

  async onunload(): Promise<void> {
    this.writeStatus("unloading");
    this.openCodeProxy?.stop();
    this.contextManager.destroy();
    await this.stopServer();
    this.app.workspace.detachLeavesOfType(OPENCODE_VIEW_TYPE);
    this.writeStatus("unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  private async attemptAutodetect(): Promise<void> {
    if (this.settings.opencodePath || this.settings.useCustomCommand) {
      return;
    }

    this.logger.info("attempting to autodetect opencode executable");

    const detectedPath = ExecutableResolver.resolve("opencode");

    if (detectedPath && detectedPath !== "opencode") {
      this.logger.info("autodetected opencode executable", { path: detectedPath });
      this.settings.opencodePath = detectedPath;
      await this.saveData(this.settings);
      new Notice(`OpenCode executable found at ${detectedPath}`);
    } else {
      this.logger.warn("could not autodetect opencode executable");
      new Notice("Could not find opencode. Please check Settings");
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.processManager.updateSettings(this.settings);
    this.refreshClientState();
    this.contextManager.updateSettings(this.settings);
    this.viewManager.updateSettings(this.settings);
    this.writeStatus("settings-saved");
  }

  async startServer(): Promise<boolean> {
    const success = await this.processManager.start();
    if (success) {
      new Notice("OpenCode server started");
      const initialized = await this.openCodeClient.initializeProject();
      if (!initialized) {
        this.logger.warn("failed to initialize project on server");
      }
    } else {
      const error = this.processManager.getLastError();
      if (error) {
        new Notice(`OpenCode failed to start: ${error}`, 10000);
      } else {
        new Notice("OpenCode failed to start. Check Settings for details.", 5000);
      }
    }
    this.writeStatus(success ? "start-success" : "start-failed");
    return success;
  }

  async stopServer(): Promise<void> {
    await this.processManager.stop();
    new Notice("OpenCode server stopped");
    this.writeStatus("stop");
  }

  getServerState(): ServerState {
    return this.processManager.getState() ?? "stopped";
  }

  getLastError(): string | null {
    return this.processManager.getLastError() ?? null;
  }

  getSettings(): OpenCodeSettings {
    return this.settings;
  }

  getServerDiagnostics(): ServerDiagnostics & { logFile: string; statusFile: string } {
    const paths = getRuntimePaths();
    return {
      ...this.processManager.getDiagnostics(),
      logFile: paths.logFile,
      statusFile: paths.statusFile,
    };
  }

  getServerUrl(): string {
    const endpoint = createServerEndpoint(this.settings, this.getProjectDirectory());
    return this.openCodeProxy.getProxyUrl(endpoint.encodedProjectDirectory);
  }

  getApiBaseUrl(): string {
    return createServerEndpoint(this.settings, this.getProjectDirectory()).apiBaseUrl;
  }

  getStoredIframeUrl(): string | null {
    return this.cachedIframeUrl;
  }

  setCachedIframeUrl(url: string | null): void {
    this.cachedIframeUrl = url;
    const lastSessionUrl = url ?? "";
    if (this.settings.lastSessionUrl !== lastSessionUrl) {
      this.settings.lastSessionUrl = lastSessionUrl;
      void this.saveData(this.settings);
    }
  }

  onServerStateChange(callback: (state: ServerState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyStateChange(state: ServerState): void {
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  private refreshClientState(): void {
    this.openCodeProxy.updateTarget(this.settings.hostname, this.settings.port);
    this.refreshProxyAppearance();

    const nextUiBaseUrl = this.getServerUrl();
    const nextApiBaseUrl = this.getApiBaseUrl();
    const projectDirectory = this.getProjectDirectory();
    this.openCodeClient.updateBaseUrl(nextApiBaseUrl, nextUiBaseUrl, projectDirectory);

    if (
      (this.lastBaseUrl && this.lastBaseUrl !== nextUiBaseUrl) ||
      (this.lastApiBaseUrl && this.lastApiBaseUrl !== nextApiBaseUrl)
    ) {
      this.setCachedIframeUrl(null);
    }

    this.lastBaseUrl = nextUiBaseUrl;
    this.lastApiBaseUrl = nextApiBaseUrl;
    this.writeStatus("client-state-refreshed");
  }

  private refreshProxyAppearance(): void {
    const theme =
      this.settings.webViewAppearance === "obsidian" ? captureObsidianWebViewTheme() : null;
    this.openCodeProxy.updateAppearance(this.settings.webViewAppearance, theme);
  }

  refreshOpenCodeViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE)) {
      if (leaf.view instanceof OpenCodeView) {
        leaf.view.refreshAppearance();
      }
    }
  }

  refreshContextForView(view: OpenCodeView): void {
    void this.contextManager.refreshContextForView(view);
  }

  async ensureSessionUrl(view: OpenCodeView): Promise<void> {
    await this.viewManager.ensureSessionUrl(view);
  }

  getProjectDirectory(): string {
    return this.resolveProjectDirectory();
  }

  private registerCleanupHandlers(): void {
    this.registerEvent(
      this.app.workspace.on("quit", () => {
        this.logger.info("obsidian quitting; performing cleanup");
        this.stopServer();
      })
    );
  }

  private resolveProjectDirectory(): string {
    if (this.settings.projectDirectory) {
      return this.settings.projectDirectory;
    }
    const adapter = this.app.vault.adapter as any;
    return adapter.basePath || "";
  }

  private writeStatus(lifecycle: string): void {
    if (!this.processManager) {
      return;
    }

    const projectDirectory = this.resolveProjectDirectory();
    const endpoint = createServerEndpoint(this.settings, projectDirectory);
    const proxyPort = this.openCodeProxy?.getPort() || null;
    const diagnostics = this.processManager.getDiagnostics();
    const proxyUrl =
      proxyPort && proxyPort > 0
        ? this.openCodeProxy.getProxyUrl(endpoint.encodedProjectDirectory)
        : null;

    writeRuntimeStatus({
      lifecycle,
      serverState: this.getServerState(),
      lastError: diagnostics.lastError,
      lastHealthError: diagnostics.lastHealthError,
      lastCommand: diagnostics.lastCommand,
      lastDisplayCommand: diagnostics.lastDisplayCommand,
      lastStartMode: diagnostics.lastStartMode,
      lastCwd: diagnostics.lastCwd,
      lastStdout: diagnostics.lastStdout,
      lastStderr: diagnostics.lastStderr,
      lastExitCode: diagnostics.lastExitCode,
      lastExitSignal: diagnostics.lastExitSignal,
      lastProcessErrorStack: diagnostics.lastProcessErrorStack,
      diagnosticHint: diagnostics.hint,
      pid: this.processManager.getPid(),
      hostname: endpoint.hostname,
      port: endpoint.port,
      apiBaseUrl: endpoint.apiBaseUrl,
      uiBaseUrl: endpoint.uiBaseUrl,
      healthUrl: endpoint.healthUrl,
      proxyUrl,
      proxyPort,
      projectDirectory,
      useCustomCommand: this.settings.useCustomCommand,
      webViewAppearance: this.settings.webViewAppearance,
      runtimeDiagnostics: this.runtimeDiagnostics,
      autoStart: this.settings.autoStart,
      logFile: getRuntimePaths().logFile,
      statusFile: getRuntimePaths().statusFile,
    });
  }
}
