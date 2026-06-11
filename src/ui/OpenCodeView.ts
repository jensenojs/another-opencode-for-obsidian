import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { OPENCODE_VIEW_TYPE } from "../types";
import { OPENCODE_ICON_NAME } from "../icons";
import type OpenCodePlugin from "../main";
import type { ServerState } from "../server/types";
import { createLogger } from "../debug/RuntimeDiagnostics";

export class OpenCodeView extends ItemView {
  plugin: OpenCodePlugin;
  private iframeEl: HTMLIFrameElement | null = null;
  private iframeProbeEl: HTMLIFrameElement | null = null;
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
    if (this.iframeProbeEl) {
      this.iframeProbeEl.remove();
      this.iframeProbeEl = null;
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

    this.iframeEl.addEventListener("load", () => {
      this.scheduleIframeDiagnostics("opencode-load");
    });

    this.iframeEl.addEventListener("focus", () => {
      this.plugin.refreshContextForView(this);
    });

    this.iframeEl.addEventListener("pointerdown", () => {
      this.plugin.refreshContextForView(this);
    });

    void this.plugin.ensureSessionUrl(this);
    this.createIframeProbe(iframeContainer);
    this.scheduleIframeDiagnostics("opencode-created");
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
      void this.plugin.copyServerDiagnosticsToClipboard();
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

  private createIframeProbe(container: HTMLElement): void {
    this.iframeProbeEl?.remove();

    this.iframeProbeEl = container.createEl("iframe", {
      cls: "opencode-iframe-probe",
      attr: {
        srcdoc:
          "<!doctype html><html><head><style>html,body{margin:0;background:transparent;color-scheme:light dark}</style></head><body></body></html>",
        frameborder: "0",
        allowtransparency: "true",
        tabindex: "-1",
      },
    });

    this.iframeProbeEl.addEventListener("load", () => {
      this.scheduleIframeDiagnostics("srcdoc-probe-load");
    });
  }

  private scheduleIframeDiagnostics(reason: string): void {
    window.setTimeout(() => {
      this.plugin.recordIframeDiagnostics(this.createIframeDiagnostics(reason));
    }, 120);
  }

  private createIframeDiagnostics(reason: string): Record<string, unknown> {
    // Parent-side iframe composition is sampled here; OpenCode DOM internals are
    // sampled by the proxy script because the loaded iframe is not same-origin.
    return {
      reason,
      appearance: this.plugin.getSettings().webViewAppearance,
      iframe: this.describeElement(this.iframeEl),
      probeIframe: this.describeElement(this.iframeProbeEl),
      ancestors: this.collectAncestors(this.iframeEl, 16),
      iframeDocumentRoots: this.sampleIframeDocumentRoots(this.iframeEl),
      srcdocProbeRoots: this.sampleIframeDocumentRoots(this.iframeProbeEl),
    };
  }

  private sampleIframeDocumentRoots(iframe: HTMLIFrameElement | null): unknown {
    let doc: Document | null | undefined;
    try {
      doc = iframe?.contentDocument;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!doc) {
      return [];
    }

    return [doc.documentElement, doc.body, doc.getElementById("root")]
      .filter((element): element is HTMLElement => Boolean(element))
      .map((element) => this.describeElement(element));
  }

  private collectAncestors(element: HTMLElement | null, limit: number): unknown[] {
    const ancestors: unknown[] = [];
    let current: HTMLElement | null = element?.parentElement ?? null;
    while (current && ancestors.length < limit) {
      ancestors.push(this.describeElement(current));
      current = current.parentElement;
    }
    return ancestors;
  }

  private describeElement(element: HTMLElement | null): Record<string, unknown> | null {
    if (!element) {
      return null;
    }

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      className: typeof element.className === "string" ? element.className.slice(0, 220) : null,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      opacity: style.opacity,
      backdropFilter: style.backdropFilter,
      mixBlendMode: style.mixBlendMode,
      isolation: style.isolation,
      colorScheme: style.colorScheme,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      area: Math.round(rect.width * rect.height),
    };
  }
}
