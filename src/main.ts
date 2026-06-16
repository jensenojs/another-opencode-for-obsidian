import { MarkdownView, Notice, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  OPENCODE_VIEW_TYPE,
  createServerEndpoint,
  type OpenCodeSettings,
} from "./types";
import { OpenCodeView } from "./ui/OpenCodeView";
import { ViewManager } from "./ui/ViewManager";
import { OpenCodeSettingTab } from "./settings/SettingsTab";
import { ServerManager, type ServerDiagnostics, type ServerState } from "./server/ServerManager";
import { registerOpenCodeIcons, OPENCODE_ICON_NAME } from "./icons";
import { OpenCodeClient } from "./client/OpenCodeClient";
import { ContextManager } from "./context/ContextManager";
import { ContextItemNavigator } from "./context/ContextItemNavigator";
import { CurrentContextSession } from "./context/ContextSessionResolver";
import { ContextStatusBar } from "./context/ContextStatusBar";
import { getSelectionLineRange } from "./context/SelectionLineRange";
import type { GraphIndex } from "./graph/GraphIndex";
import { createObsidianGraphIndex, isMarkdownTFile, toGraphFile } from "./graph/ObsidianGraphIndex";
import { ExecutableResolver } from "./server/ExecutableResolver";
import { OpenCodeProxy } from "./proxy/OpenCodeProxy";
import {
  createLogger,
  getRuntimePaths,
  type RuntimeDiagnosticsSnapshot,
  writeRuntimeStatus,
} from "./debug/RuntimeDiagnostics";
import {
  formatServerDiagnosticsForClipboard,
  formatStartFailureNotice,
} from "./debug/ServerDiagnosticsText";
import { BRIDGE_MESSAGES, isBridgeMessage } from "./bridge/BridgeProtocol";
import { captureObsidianWebViewTheme } from "./theme/WebViewTheme";

export default class OpenCodePlugin extends Plugin {
  settings: OpenCodeSettings = DEFAULT_SETTINGS;
  private processManager: ServerManager;
  private stateChangeCallbacks: Array<(state: ServerState) => void> = [];
  private openCodeClient: OpenCodeClient;
  private currentContextSession: CurrentContextSession;
  private contextManager: ContextManager;
  private contextItemNavigator: ContextItemNavigator;
  private contextStatusBar: ContextStatusBar;
  private graphIndex: GraphIndex;
  private viewManager: ViewManager;
  private cachedIframeUrl: string | null = null;
  private lastBaseUrl: string | null = null;
  private lastApiBaseUrl: string | null = null;
  private runtimeDiagnostics: RuntimeDiagnosticsSnapshot = {
    theme: null,
    iframe: null,
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
    this.currentContextSession = new CurrentContextSession({
      getCachedIframeUrl: () => this.cachedIframeUrl,
      setCachedIframeUrl: (url) => this.setCachedIframeUrl(url),
      resolveSessionId: (url) => this.openCodeClient.resolveSessionId(url),
    });
    this.graphIndex = createObsidianGraphIndex(this.app);
    this.graphIndex.bootstrap();
    this.registerGraphIndexEvents();

    this.contextManager = new ContextManager({
      app: this.app,
      settings: this.settings,
      client: this.openCodeClient,
      getServerState: () => this.getServerState(),
      currentSession: this.currentContextSession,
      registerEvent: (ref) => this.registerEvent(ref),
    });
    this.contextItemNavigator = new ContextItemNavigator(this.app, this.graphIndex);
    this.contextStatusBar = new ContextStatusBar({
      addStatusBarItem: () => this.addStatusBarItem(),
      getItems: () => this.contextManager.getItems(),
      onItemsChanged: (callback) => this.contextManager.onItemsChanged(callback),
      resolveItem: (item) => this.contextItemNavigator.resolve(item),
      openItem: (item) => this.contextItemNavigator.open(item),
      removeItem: (itemId) => this.contextManager.removeItemForCurrentSession(itemId),
    });

    this.viewManager = new ViewManager({
      app: this.app,
      settings: this.settings,
      client: this.openCodeClient,
      contextManager: this.contextManager,
      currentSession: this.currentContextSession,
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
      id: "open-opencode-view",
      name: "Open OpenCode panel",
      callback: () => {
        void this.viewManager.activateView();
      },
    });

    this.addCommand({
      id: "copy-opencode-diagnostics",
      name: "Copy OpenCode diagnostics",
      callback: () => {
        void this.copyServerDiagnosticsToClipboard();
      },
    });

    this.addCommand({
      id: "add-selection-to-context",
      name: "Add selection to OpenCode context",
      editorCallback: (editor, ctx) => {
        const sourcePath = ctx.file?.path;
        const selectedText = editor.getSelection();
        if (!sourcePath || !selectedText.trim()) {
          new Notice("Select text in a note before adding OpenCode context");
          return;
        }

        const range = getSelectionLineRange(editor.listSelections()[0]);
        void this.contextManager
          .addSelectionForCurrentSession(
            selectedText,
            sourcePath,
            range.selectionStartLine,
            range.selectionEndLine
          )
          .then((item) => {
            if (!item) {
              new Notice("OpenCode context was not added. Open an active OpenCode session first.");
            }
          });
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "Enter",
        },
      ],
    });

    this.addCommand({
      id: "add-current-note-to-context",
      name: "Add current note to OpenCode context",
      callback: () => {
        void this.addCurrentNoteToContext();
      },
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
    this.contextStatusBar?.destroy();
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
      new Notice(formatStartFailureNotice(this.getServerDiagnostics()), 15000);
    }
    this.writeStatus(success ? "start-success" : "start-failed");
    return success;
  }

  async stopServer(): Promise<void> {
    await this.processManager.stop();
    new Notice("OpenCode server stopped");
    this.writeStatus("stop");
  }

  private async addCurrentNoteToContext(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!file) {
      new Notice("Open a note before adding it to OpenCode context");
      return;
    }

    let text: string;
    try {
      text = await this.app.vault.cachedRead(file);
    } catch (error) {
      this.logger.error("failed to read current note", {
        path: file.path,
        error: error instanceof Error ? error.message : String(error),
      });
      new Notice("OpenCode could not read the current note. Check the plugin log.");
      return;
    }

    if (!text.trim()) {
      new Notice("Current note is empty");
      return;
    }

    const item = await this.contextManager.addCurrentNoteForCurrentSession(file.path, text);
    if (!item) {
      new Notice("OpenCode context was not added. Open an active OpenCode session first.");
    }
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

  async copyServerDiagnosticsToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(
        formatServerDiagnosticsForClipboard(this.getServerDiagnostics())
      );
      new Notice("OpenCode diagnostics copied");
      return true;
    } catch (error) {
      this.logger.error("failed to copy diagnostics", {
        error: error instanceof Error ? error.message : String(error),
      });
      new Notice("Failed to copy OpenCode diagnostics");
      return false;
    }
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

  recordIframeDiagnostics(payload: unknown): void {
    this.runtimeDiagnostics.iframe = payload;
    this.logger.info("iframe diagnostics", payload);
    this.writeStatus("iframe-diagnostics");
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

  private registerGraphIndexEvents(): void {
    this.registerEvent(
      this.app.metadataCache.on("changed", (file, _data, cache) => {
        this.graphIndex.changed(toGraphFile(file), cache);
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("resolve", () => {
        this.graphIndex.resolve();
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("deleted", (file) => {
        this.graphIndex.deleted(toGraphFile(file));
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (isMarkdownTFile(file)) {
          this.graphIndex.created(toGraphFile(file));
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (isMarkdownTFile(file)) {
          this.graphIndex.renamed(toGraphFile(file), oldPath);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (isMarkdownTFile(file)) {
          this.graphIndex.deleted(toGraphFile(file));
        }
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
      lastUsesShell: diagnostics.lastUsesShell,
      lastCwd: diagnostics.lastCwd,
      lastStdout: diagnostics.lastStdout,
      lastStderr: diagnostics.lastStderr,
      lastExitCode: diagnostics.lastExitCode,
      lastExitSignal: diagnostics.lastExitSignal,
      lastProcessErrorStack: diagnostics.lastProcessErrorStack,
      processEnvironment: diagnostics.processEnvironment,
      lastSpawnEnvironment: diagnostics.lastSpawnEnvironment,
      lastResolvedExecutable: diagnostics.lastResolvedExecutable,
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
