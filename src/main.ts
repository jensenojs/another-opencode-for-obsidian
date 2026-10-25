import { MarkdownView, Notice, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  OPENCODE_VIEW_TYPE,
  normalizeOpenCodeSettings,
  type OpenCodeSettings,
  type WebViewTheme,
} from "./types";
import { OpenCodeView } from "./ui/OpenCodeView";
import { ViewManager } from "./ui/ViewManager";
import { OpenCodeSettingTab } from "./settings/SettingsTab";
import {
  attachService as attachToService,
  defaultServiceDir,
  discoverServices,
  summarizeService,
  type ServiceHandle,
  type ServiceSummary,
} from "./server/ServiceDiscovery";
import type { ServiceState, ServiceStatus } from "./server/types";
import { registerOpenCodeIcons, OPENCODE_ICON_NAME } from "./icons";
import { OpenCodeClient } from "./client/OpenCodeClient";
import { ContextManager } from "./context/ContextManager";
import { ContextItemNavigator } from "./context/ContextItemNavigator";
import { CurrentContextSession } from "./context/ContextSessionResolver";
import { ContextStatusBar } from "./context/ContextStatusBar";
import { getSelectionLineRange } from "./context/SelectionLineRange";
import type { GraphIndex } from "./graph/GraphIndex";
import { createObsidianGraphIndex, isMarkdownTFile, toGraphFile } from "./graph/ObsidianGraphIndex";
import { OpenCodeWebUiProxy, extractPromptSessionId } from "./bridge/OpenCodeWebUiProxy";
import { OpenCodeBridge, describeEventLoss } from "./bridge/OpenCodeBridge";
import {
  createLogger,
  getRuntimePaths,
  type RuntimeDiagnosticsSnapshot,
  writeRuntimeStatus,
} from "./debug/RuntimeDiagnostics";
import {
  formatServiceDiagnosticsForClipboard,
  type ServiceDiagnosticsSnapshot,
} from "./debug/ServiceDiagnosticsText";
import { BRIDGE_MESSAGES, isBridgeMessage, isVaultFileOpenPayload } from "./bridge/BridgeProtocol";
import { captureObsidianWebViewTheme, findObsidianWebViewThemeSource } from "./theme/WebViewTheme";
import { getText } from "./i18n";

export default class OpenCodePlugin extends Plugin {
  settings: OpenCodeSettings = DEFAULT_SETTINGS;
  private serviceStatus: ServiceStatus | null = null;
  private serviceChangeCallbacks: Array<(state: ServiceState) => void> = [];
  private attachRetryTimer: ReturnType<typeof setInterval> | null = null;
  private openCodeClient: OpenCodeClient;
  private openCodeBridge: OpenCodeBridge;
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
    opencodeEvents: null,
  };
  private openCodeWebUiProxy: OpenCodeWebUiProxy;
  private eventStatusWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private logger = createLogger("plugin");

  async onload(): Promise<void> {
    const text = getText();
    this.logger.info("loading plugin");

    registerOpenCodeIcons();

    await this.loadSettings();
    this.cachedIframeUrl = this.settings.lastSessionUrl || null;

    const projectDirectory = this.getProjectDirectory();

    this.openCodeWebUiProxy = new OpenCodeWebUiProxy("127.0.0.1", 0);
    this.openCodeWebUiProxy.setAuthPasswordProvider(() => this.attachedHandle?.password ?? null);
    this.refreshProxyAppearance();
    const proxyStarted = await this.openCodeWebUiProxy.start();
    if (!proxyStarted) {
      this.logger.error("proxy failed to start");
    }

    this.registerDomEvent(window, "message", (event: MessageEvent) => {
      if (event.origin !== this.openCodeWebUiProxy.getOrigin() || !isBridgeMessage(event.data)) {
        return;
      }
      if (event.data.type === BRIDGE_MESSAGES.proxyLoaded) {
        this.logger.info("bridge script loaded", { origin: event.origin });
        this.syncOpenCodeViewThemes("proxy-loaded");
      }
      if (event.data.type === BRIDGE_MESSAGES.themeDiagnostics) {
        this.runtimeDiagnostics.theme = event.data.payload ?? null;
        this.logger.info(
          "theme diagnostics",
          summarizeDiagnosticPayload(this.runtimeDiagnostics.theme)
        );
        this.writeStatus("theme-diagnostics");
      }
      if (event.data.type === BRIDGE_MESSAGES.vaultFileOpen) {
        void this.openVaultFileFromBridge(event.data.payload);
      }
    });

    this.openCodeClient = new OpenCodeClient(
      this.getApiBaseUrl(),
      this.getServerUrl(),
      projectDirectory,
      () => this.attachedHandle?.password ?? null
    );
    this.lastBaseUrl = this.getServerUrl();
    this.lastApiBaseUrl = this.getApiBaseUrl();
    this.currentContextSession = new CurrentContextSession({
      getCachedIframeUrl: () => this.cachedIframeUrl,
      setCachedIframeUrl: (url) => this.setCachedIframeUrl(url),
      resolveSessionId: (url) => this.openCodeClient.resolveSessionId(url),
    });
    this.openCodeBridge = new OpenCodeBridge({
      apiBaseUrl: this.getApiBaseUrl(),
      projectDirectory,
      getCurrentSessionId: () => this.currentContextSession.getCurrentSessionId(),
      getAuthPassword: () => this.attachedHandle?.password ?? null,
      onEventSnapshot: (snapshot) => {
        this.runtimeDiagnostics.opencodeEvents = snapshot;
        this.scheduleEventStatusWrite();
        const loss = describeEventLoss(snapshot);
        if (loss && this.getServiceState() === "attached") {
          this.applyServiceStatus({ state: "unavailable", reason: loss });
        }
      },
    });
    this.graphIndex = createObsidianGraphIndex(this.app);
    this.graphIndex.bootstrap();
    this.registerGraphIndexEvents();

    this.contextManager = new ContextManager({
      app: this.app,
      settings: this.settings,
      getServiceState: () => this.getServiceState(),
      currentSession: this.currentContextSession,
      registerEvent: (ref) => this.registerEvent(ref),
    });
    this.installPromptContextHook();
    this.contextItemNavigator = new ContextItemNavigator(this.app, this.graphIndex);
    this.contextStatusBar = new ContextStatusBar({
      addStatusBarItem: () => this.addStatusBarItem(),
      getCandidates: () => this.contextManager.getCandidates(),
      onCandidatesChanged: (callback) => this.contextManager.onCandidatesChanged(callback),
      toggleCandidate: (candidateId) => this.contextManager.toggleCandidate(candidateId),
      removeCandidate: (candidateId) => this.contextManager.removeCandidate(candidateId),
      getLastPromptDelivery: () => this.contextManager.getLastPromptDelivery(),
      resolveCandidate: (candidate) => this.contextItemNavigator.resolve(candidate),
      openCandidate: (candidate) => this.contextItemNavigator.open(candidate),
    });

    this.viewManager = new ViewManager({
      app: this.app,
      settings: this.settings,
      client: this.openCodeClient,
      contextManager: this.contextManager,
      currentSession: this.currentContextSession,
      getServiceState: () => this.getServiceState(),
    });

    this.logger.info("configured project directory", { projectDirectory });

    this.registerView(OPENCODE_VIEW_TYPE, (leaf) => new OpenCodeView(leaf, this));
    this.addSettingTab(
      new OpenCodeSettingTab(
        this.app,
        this,
        this.settings,
        () => this.getServiceStatus(),
        () => this.saveSettings()
      )
    );

    this.addRibbonIcon(OPENCODE_ICON_NAME, text.commands.ribbonTooltip, () => {
      void this.viewManager.activateView();
    });

    this.addCommand({
      id: "toggle-opencode-view",
      name: text.commands.togglePanel,
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
      id: "toggle-opencode-deep-view",
      name: text.commands.toggleDeepView,
      callback: () => {
        void this.viewManager.toggleDeepView();
      },
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: "l",
        },
      ],
    });

    this.addCommand({
      id: "open-opencode-view",
      name: text.commands.openPanel,
      callback: () => {
        void this.viewManager.activateView();
      },
    });

    this.addCommand({
      id: "copy-opencode-diagnostics",
      name: text.commands.copyDiagnostics,
      callback: () => {
        void this.copyServiceDiagnosticsToClipboard();
      },
    });

    this.addCommand({
      id: "add-selection-to-context",
      name: text.commands.addSelectionToContext,
      editorCallback: (editor, ctx) => {
        const sourcePath = ctx.file?.path;
        const selectedText = editor.getSelection();
        if (!sourcePath || !selectedText.trim()) {
          new Notice(getText().notices.selectTextBeforeAdding);
          return;
        }

        const range = getSelectionLineRange(editor.listSelections()[0]);
        const candidate = this.contextManager.includeSelection({
          text: selectedText,
          sourcePath,
          selectionStartLine: range.selectionStartLine,
          selectionEndLine: range.selectionEndLine,
        });
        if (!candidate) {
          new Notice(getText().notices.contextCandidateNotQueued);
        }
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
      name: text.commands.addCurrentNoteToContext,
      callback: () => {
        void this.addCurrentNoteToContext();
      },
    });

    this.contextManager.updateSettings(this.settings);

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

    await this.attachService();
  }

  async onunload(): Promise<void> {
    this.writeStatus("unloading");
    this.openCodeBridge?.stop();
    if (this.eventStatusWriteTimer) {
      clearTimeout(this.eventStatusWriteTimer);
      this.eventStatusWriteTimer = null;
    }
    this.openCodeWebUiProxy?.stop();
    this.contextStatusBar?.destroy();
    this.contextManager.destroy();
    this.stopAttachRetry();
    this.app.workspace.detachLeavesOfType(OPENCODE_VIEW_TYPE);
    this.writeStatus("unloaded");
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeOpenCodeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.contextManager.updateSettings(this.settings);
    this.viewManager.updateSettings(this.settings);
    await this.attachService();
  }

  async attachService(): Promise<boolean> {
    const dir = defaultServiceDir();
    const prefer = this.settings.serviceName || "auto";
    const handle = await attachToService({ dir, prefer });

    if (!handle) {
      const reason = await describeUnavailableService(dir, prefer);
      if (this.serviceStatus?.state === "unavailable" && this.serviceStatus.reason === reason) {
        return false;
      }
      this.applyServiceStatus({ state: "unavailable", reason });
      return false;
    }

    const url = new URL(handle.url);
    this.openCodeWebUiProxy.updateTarget(url.hostname, Number(url.port));
    this.applyServiceStatus({ state: "attached", handle });
    return true;
  }

  private applyServiceStatus(status: ServiceStatus): void {
    this.serviceStatus = status;
    this.refreshClientState();

    if (status.state === "attached") {
      this.stopAttachRetry();
      void this.handleServiceAttached();
    } else {
      this.startAttachRetry();
    }

    this.openCodeBridge.syncServiceState(status.state);

    for (const callback of this.serviceChangeCallbacks) {
      callback(status.state);
    }

    this.writeStatus(`service:${status.state}`);
  }

  private async handleServiceAttached(): Promise<void> {
    const initialized = await this.openCodeClient.initializeProject();
    if (initialized === false) {
      this.logger.warn("failed to initialize project on service");
    }
    await this.contextManager.handleServiceAttached();
  }

  private startAttachRetry(): void {
    if (this.attachRetryTimer) {
      return;
    }
    this.attachRetryTimer = setInterval(() => {
      void this.attachService();
    }, ATTACH_RETRY_INTERVAL_MS);
  }

  private stopAttachRetry(): void {
    if (!this.attachRetryTimer) {
      return;
    }
    clearInterval(this.attachRetryTimer);
    this.attachRetryTimer = null;
  }

  private async addCurrentNoteToContext(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!file) {
      new Notice(getText().notices.openNoteBeforeAdding);
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
      new Notice(getText().notices.currentNoteReadFailed);
      return;
    }

    if (!text.trim()) {
      new Notice(getText().notices.currentNoteEmpty);
      return;
    }

    const candidate = this.contextManager.includeNote({ path: file.path, text });
    if (!candidate) {
      new Notice(getText().notices.contextCandidateNotQueued);
    }
  }

  getServiceState(): ServiceState {
    return this.serviceStatus?.state ?? "unavailable";
  }

  getServiceStatus(): ServiceStatus | null {
    return this.serviceStatus;
  }

  private get attachedHandle(): ServiceHandle | null {
    return this.serviceStatus?.state === "attached" ? this.serviceStatus.handle : null;
  }

  getSettings(): OpenCodeSettings {
    return this.settings;
  }

  getServiceDiagnostics(): ServiceDiagnosticsSnapshot {
    return {
      state: this.getServiceState(),
      service: summarizeAttachedHandle(this.attachedHandle),
      reason: this.serviceStatus?.state === "unavailable" ? this.serviceStatus.reason : null,
      runtimeDiagnostics: this.runtimeDiagnostics,
    };
  }

  async copyServiceDiagnosticsToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(
        formatServiceDiagnosticsForClipboard(this.getServiceDiagnostics())
      );
      new Notice(getText().notices.diagnosticsCopied);
      return true;
    } catch (error) {
      this.logger.error("failed to copy diagnostics", {
        error: error instanceof Error ? error.message : String(error),
      });
      new Notice(getText().notices.diagnosticsCopyFailed);
      return false;
    }
  }

  getServerUrl(): string {
    return this.openCodeWebUiProxy.getV2ServerUrl();
  }

  getApiBaseUrl(): string {
    return this.attachedHandle?.url ?? "";
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

  onServiceStateChange(callback: (state: ServiceState) => void): () => void {
    this.serviceChangeCallbacks.push(callback);
    return () => {
      const index = this.serviceChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.serviceChangeCallbacks.splice(index, 1);
      }
    };
  }

  private refreshClientState(): void {
    this.refreshProxyAppearance();

    const nextUiBaseUrl = this.getServerUrl();
    const nextApiBaseUrl = this.getApiBaseUrl();
    const projectDirectory = this.getProjectDirectory();
    this.openCodeClient.updateBaseUrl(nextApiBaseUrl, nextUiBaseUrl, projectDirectory);
    this.openCodeBridge.updateOpenCodeLocation(nextApiBaseUrl, projectDirectory);

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
      this.settings.webViewAppearance === "obsidian" ? () => this.getWebViewTheme() : null;
    this.openCodeWebUiProxy.updateAppearance(this.settings.webViewAppearance, theme);
  }

  private installPromptContextHook(): void {
    this.openCodeWebUiProxy.updatePromptRequestHook(
      async ({ path, body }) => {
        const sessionId = extractPromptSessionId(path);
        if (!sessionId) {
          return null;
        }

        let requestBody: unknown;
        try {
          requestBody = JSON.parse(body.toString("utf8"));
        } catch (error) {
          this.logger.warn("prompt context injection skipped for non-json body", {
            path,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }

        const plan = this.contextManager.preparePromptContext(sessionId, requestBody);
        if (!plan) {
          return null;
        }

        return {
          body: Buffer.from(JSON.stringify(plan.requestBody), "utf8"),
          headers: { "content-type": "application/json" },
          planId: plan.id,
        };
      },
      (planId, outcome) => {
        if (outcome.ok) {
          this.contextManager.completePromptContext(planId);
          this.writeStatus("prompt-context-injected");
          return;
        }

        const reason =
          outcome.error ??
          (outcome.statusCode
            ? `OpenCode prompt returned HTTP ${outcome.statusCode}`
            : "OpenCode prompt failed");
        this.contextManager.failPromptContext(planId, reason);
        this.logger.warn("prompt context injection failed", {
          planId,
          statusCode: outcome.statusCode,
          error: outcome.error,
        });
        this.writeStatus("prompt-context-injection-failed");
      }
    );
  }

  getWebViewTheme(paneSource?: HTMLElement): WebViewTheme {
    return captureObsidianWebViewTheme(findObsidianWebViewThemeSource(), { paneSource });
  }

  refreshOpenCodeViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE)) {
      if (leaf.view instanceof OpenCodeView) {
        leaf.view.refreshAppearance();
      }
    }
  }

  syncOpenCodeViewThemes(reason: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE)) {
      if (leaf.view instanceof OpenCodeView) {
        leaf.view.syncThemeToIframe(reason);
      }
    }
  }

  getProxyOrigin(): string | null {
    return this.openCodeWebUiProxy.getPort() > 0 ? this.openCodeWebUiProxy.getOrigin() : null;
  }

  recordIframeDiagnostics(payload: unknown): void {
    this.runtimeDiagnostics.iframe = payload;
    this.logger.info("iframe diagnostics", summarizeDiagnosticPayload(payload));
    this.writeStatus("iframe-diagnostics");
  }

  private async openVaultFileFromBridge(payload: unknown): Promise<void> {
    if (!isVaultFileOpenPayload(payload)) {
      this.logger.warn(
        "ignored invalid vault file open payload",
        summarizeDiagnosticPayload(payload)
      );
      this.writeStatus("vault-file-open-invalid");
      return;
    }

    const result = await this.contextItemNavigator.openSource(payload.path, payload.line);
    this.logger.info("vault file open requested from web ui", result);
    this.writeStatus(result.status === "opened" ? "vault-file-opened" : "vault-file-unresolved");
  }

  private scheduleEventStatusWrite(): void {
    if (this.eventStatusWriteTimer) {
      return;
    }
    this.eventStatusWriteTimer = setTimeout(() => {
      this.eventStatusWriteTimer = null;
      this.writeStatus("opencode-event");
    }, 1000);
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
        this.stopAttachRetry();
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
    const projectDirectory = this.resolveProjectDirectory();
    const proxyPort = this.openCodeWebUiProxy?.getPort() || null;

    writeRuntimeStatus({
      lifecycle,
      serviceState: this.getServiceState(),
      service: summarizeAttachedHandle(this.attachedHandle),
      serviceError: this.serviceStatus?.state === "unavailable" ? this.serviceStatus.reason : null,
      proxyUrl: proxyPort && proxyPort > 0 ? this.openCodeWebUiProxy.getV2ServerUrl() : null,
      proxyPort,
      projectDirectory,
      webViewAppearance: this.settings.webViewAppearance,
      runtimeDiagnostics: this.runtimeDiagnostics,
      logFile: getRuntimePaths().logFile,
      statusFile: getRuntimePaths().statusFile,
    });
  }
}

const ATTACH_RETRY_INTERVAL_MS = 10_000;

function summarizeAttachedHandle(handle: ServiceHandle | null): ServiceSummary | null {
  return handle ? summarizeService(handle) : null;
}

async function describeUnavailableService(dir: string, prefer: string): Promise<string> {
  const candidates = await discoverServices(dir);
  if (candidates.length === 0) {
    return `no service*.json in ${dir}`;
  }
  const names = candidates.map((candidate) => candidate.name).join(", ");
  return prefer === "auto"
    ? `no reachable service among ${names} in ${dir}`
    : `no reachable service among ${names} in ${dir} (preferred ${prefer})`;
}

function summarizeDiagnosticPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    if (key === "reason" || key === "url" || key === "error") {
      summary[key] = nested;
      continue;
    }
    summary[key] = summarizeDiagnosticValue(nested);
  }
  return summary;
}

function summarizeDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { count: value.length };
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return { keyCount: keys.length, keys: keys.slice(0, 16) };
  }
  return value;
}
