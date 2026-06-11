import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import { OPENCODE_VIEW_TYPE } from "../types";
import { OPENCODE_ICON_NAME } from "../icons";
import type OpenCodePlugin from "../main";
import type { ServerState } from "../server/types";
import { createLogger } from "../debug/RuntimeDiagnostics";

export class OpenCodeView extends ItemView {
  plugin: OpenCodePlugin;
  private iframeEl: HTMLIFrameElement | null = null;
  private currentState: ServerState = "stopped";
  private unsubscribeStateChange: (() => void) | null = null;
  private logger = createLogger("view");

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return OPENCODE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "OpenCode";
  }

  getIcon(): string {
    return OPENCODE_ICON_NAME;
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("opencode-container");

    this.unsubscribeStateChange = this.plugin.onServerStateChange((state: ServerState) => {
      this.currentState = state;
      this.updateView();
    });

    this.currentState = this.plugin.getServerState();
    this.updateView();

    if (this.currentState === "stopped") {
      this.plugin.startServer();
    }
  }

  async onClose(): Promise<void> {
    if (this.unsubscribeStateChange) {
      this.unsubscribeStateChange();
      this.unsubscribeStateChange = null;
    }
    
    if (this.iframeEl) {
      const iframeUrl = this.iframeEl.src;
      if (iframeUrl.includes("/session/")) {
        this.plugin.setCachedIframeUrl(iframeUrl);
      }
      this.iframeEl.src = "about:blank";
      this.iframeEl = null;
    }
  }

  private updateView(): void {
    this.applyAppearanceClass();

    switch (this.currentState) {
      case "stopped":
        this.renderStoppedState();
        break;
      case "starting":
        this.renderStartingState();
        break;
      case "running":
        this.renderRunningState();
        break;
      case "error":
        this.renderErrorState();
        break;
    }
  }

  private renderStoppedState(): void {
    this.contentEl.empty();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container",
    });

    const iconEl = statusContainer.createDiv({ cls: "opencode-status-icon" });
    setIcon(iconEl, "power-off");

    statusContainer.createEl("h3", { text: "OpenCode is stopped" });
    statusContainer.createEl("p", {
      text: "Click the button below to start the OpenCode server.",
      cls: "opencode-status-message",
    });

    const startButton = statusContainer.createEl("button", {
      text: "Start OpenCode",
      cls: "mod-cta",
    });
    startButton.addEventListener("click", () => {
      this.plugin.startServer();
    });
  }

  private renderStartingState(): void {
    this.contentEl.empty();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container",
    });

    const loadingEl = statusContainer.createDiv({ cls: "opencode-loading" });
    loadingEl.createDiv({ cls: "opencode-spinner" });

    statusContainer.createEl("h3", { text: "Starting OpenCode..." });
    statusContainer.createEl("p", {
      text: "Please wait while the server starts up.",
      cls: "opencode-status-message",
    });
  }

  private renderRunningState(): void {
    this.contentEl.empty();

    const headerEl = this.contentEl.createDiv({ cls: "opencode-header" });

    const titleSection = headerEl.createDiv({ cls: "opencode-header-title" });
    const iconEl = titleSection.createSpan();
    setIcon(iconEl, OPENCODE_ICON_NAME);
    titleSection.createSpan({ text: "OpenCode" });

    const actionsEl = headerEl.createDiv({ cls: "opencode-header-actions" });

    const reloadButton = actionsEl.createEl("button", {
      attr: { "aria-label": "Reload" },
    });
    setIcon(reloadButton, "refresh-cw");
    reloadButton.addEventListener("click", () => {
      this.reloadIframe();
    });

    const stopButton = actionsEl.createEl("button", {
      attr: { "aria-label": "Stop server" },
    });
    setIcon(stopButton, "square");
    stopButton.addEventListener("click", () => {
      this.plugin.stopServer();
    });

    const iframeContainer = this.contentEl.createDiv({
      cls: "opencode-iframe-container",
    });

    const iframeUrl = this.plugin.getStoredIframeUrl() ?? this.plugin.getServerUrl();
    this.logger.info("loading iframe", { url: iframeUrl });

    this.iframeEl = iframeContainer.createEl("iframe", {
      cls: "opencode-iframe",
      attr: {
          src: iframeUrl,
          frameborder: "0",
          allow: "clipboard-read; clipboard-write",
          allowtransparency: "true",
        },
      });

    this.iframeEl.addEventListener("error", () => {
      console.error("Failed to load OpenCode iframe");
    });

    this.iframeEl.addEventListener("focus", () => {
      this.plugin.refreshContextForView(this);
    });

    this.iframeEl.addEventListener("pointerdown", () => {
      this.plugin.refreshContextForView(this);
    });

    void this.plugin.ensureSessionUrl(this);
  }

  getIframeUrl(): string | null {
    return this.iframeEl?.src ?? null;
  }

  setIframeUrl(url: string): void {
    if (this.iframeEl && this.iframeEl.src !== url) {
      this.iframeEl.src = url;
    }
  }

  focusIframe(): void {
    this.iframeEl?.focus();
  }

  refreshAppearance(): void {
    this.applyAppearanceClass();
    if (this.currentState === "running") {
      this.reloadIframe();
    }
  }

  private renderErrorState(): void {
    this.contentEl.empty();
    const diagnostics = this.plugin.getServerDiagnostics();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container opencode-error",
    });

    const iconEl = statusContainer.createDiv({ cls: "opencode-status-icon" });
    setIcon(iconEl, "alert-circle");

    statusContainer.createEl("h3", { text: "Failed to start OpenCode" });
    
    const errorMessage = diagnostics.lastError;
    if (errorMessage) {
      statusContainer.createEl("p", {
        text: errorMessage,
        cls: "opencode-status-message opencode-error-message",
      });
    } else {
      statusContainer.createEl("p", {
        text: "There was an error starting the OpenCode server.",
        cls: "opencode-status-message",
      });
    }

    if (diagnostics.hint) {
      statusContainer.createEl("p", {
        text: diagnostics.hint,
        cls: "opencode-status-message opencode-diagnostic-hint",
      });
    }

    const detailsContainer = statusContainer.createDiv({
      cls: "opencode-diagnostics",
    });

    this.createDiagnosticRow(detailsContainer, "Mode", diagnostics.lastStartMode);
    this.createDiagnosticRow(detailsContainer, "Command", diagnostics.lastDisplayCommand);
    this.createDiagnosticRow(detailsContainer, "Working directory", diagnostics.lastCwd);
    this.createDiagnosticRow(detailsContainer, "Health check", diagnostics.lastHealthError);
    this.createDiagnosticRow(detailsContainer, "Stderr", diagnostics.lastStderr, true);
    this.createDiagnosticRow(detailsContainer, "Log", diagnostics.logFile);
    this.createDiagnosticRow(detailsContainer, "Status", diagnostics.statusFile);

    const buttonContainer = statusContainer.createDiv({
      cls: "opencode-button-group",
    });

    const retryButton = buttonContainer.createEl("button", {
      text: "Retry",
      cls: "mod-cta",
    });
    retryButton.addEventListener("click", () => {
      this.plugin.startServer();
    });

    const settingsButton = buttonContainer.createEl("button", {
      text: "Open Settings",
    });
    settingsButton.addEventListener("click", () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById("obsidian-opencode");
    });

    const copyButton = buttonContainer.createEl("button", {
      text: "Copy diagnostics",
    });
    copyButton.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.formatDiagnosticsForClipboard()).then(
        () => new Notice("OpenCode diagnostics copied"),
        () => new Notice("Failed to copy OpenCode diagnostics")
      );
    });
  }

  private createDiagnosticRow(
    container: HTMLElement,
    label: string,
    value: string | number | null | undefined,
    multiline = false
  ): void {
    if (value === null || typeof value === "undefined" || value === "") {
      return;
    }

    const row = container.createDiv({ cls: "opencode-diagnostic-row" });
    row.createDiv({ text: label, cls: "opencode-diagnostic-label" });

    if (multiline) {
      row.createEl("pre", {
        text: String(value),
        cls: "opencode-diagnostic-value opencode-diagnostic-pre",
      });
      return;
    }

    row.createEl("code", {
      text: String(value),
      cls: "opencode-diagnostic-value",
    });
  }

  private formatDiagnosticsForClipboard(): string {
    const diagnostics = this.plugin.getServerDiagnostics();
    return JSON.stringify(diagnostics, null, 2);
  }

  private applyAppearanceClass(): void {
    const appearance = this.plugin.getSettings().webViewAppearance;
    this.contentEl.removeClass("opencode-appearance-opencode");
    this.contentEl.removeClass("opencode-appearance-obsidian");
    this.contentEl.addClass(`opencode-appearance-${appearance}`);
  }

  private reloadIframe(): void {
    if (this.iframeEl) {
      const src = this.iframeEl.src;
      this.iframeEl.src = "about:blank";
      setTimeout(() => {
        if (this.iframeEl) {
          this.iframeEl.src = src;
        }
      }, 100);
    }
  }
}
