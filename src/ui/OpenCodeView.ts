import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import {
  BRIDGE_MESSAGES,
  BRIDGE_NAMESPACE,
  BRIDGE_VERSION,
  type BridgeMessageType,
} from "../bridge/BridgeProtocol";
import { OPENCODE_VIEW_TYPE, type WebViewAppearance, type WebViewTheme } from "../types";
import { OPENCODE_ICON_NAME } from "../icons";
import type OpenCodePlugin from "../main";
import type { ServerState } from "../server/types";
import { createLogger } from "../debug/RuntimeDiagnostics";
import { getText } from "../i18n";

const THEME_SYNC_DELAYS_MS = [0, 250, 1000, 2500] as const;
const THEME_SYNC_HISTORY_LIMIT = 80;
const PARENT_EDITOR_BACKGROUND_SOURCE_SELECTORS = [
  ".workspace-leaf.mod-active .markdown-source-view .cm-editor",
  ".workspace-leaf.mod-active .markdown-reading-view",
  ".workspace-leaf.mod-active .markdown-preview-view",
  ".markdown-source-view .cm-editor",
  ".markdown-reading-view",
  ".markdown-preview-view",
] as const;

export class OpenCodeView extends ItemView {
  plugin: OpenCodePlugin;
  private iframeEl: HTMLIFrameElement | null = null;
  private currentState: ServerState = "stopped";
  private unsubscribeStateChange: (() => void) | null = null;
  private themeSyncTimerIds: number[] = [];
  private themeSourceObserver: MutationObserver | null = null;
  private themeLayoutObserver: ResizeObserver | null = null;
  private lastPostedThemeFingerprint: string | null = null;
  private lastObservedThemeSourceFingerprint: string | null = null;
  private themeSyncHistory: Array<Record<string, unknown>> = [];
  private themeSyncSequence = 0;
  private themeHistoryDiagnosticsTimerId: number | null = null;
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
    this.registerDomEvent(window, "resize", () => {
      this.scheduleThemeSync("window-resize");
    });
    this.startThemeSourceObserver();
    this.startThemeLayoutObserver();

    this.currentState = this.plugin.getServerState();
    this.updateView();
  }

  async onClose(): Promise<void> {
    this.clearThemeSyncTimers();
    this.clearThemeHistoryDiagnosticsTimer();
    this.stopThemeSourceObserver();
    this.stopThemeLayoutObserver();

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
    const text = getText();
    this.contentEl.empty();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container",
    });

    const iconEl = statusContainer.createDiv({ cls: "opencode-status-icon" });
    setIcon(iconEl, "power-off");

    statusContainer.createEl("h3", { text: text.view.stoppedTitle });
    statusContainer.createEl("p", {
      text: text.view.stoppedMessage,
      cls: "opencode-status-message",
    });

    const startButton = statusContainer.createEl("button", {
      text: text.view.startOpenCode,
      cls: "mod-cta",
    });
    startButton.addEventListener("click", () => {
      this.plugin.startServer();
    });
  }

  private renderStartingState(): void {
    const text = getText();
    this.contentEl.empty();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container",
    });

    const loadingEl = statusContainer.createDiv({ cls: "opencode-loading" });
    loadingEl.createDiv({ cls: "opencode-spinner" });

    statusContainer.createEl("h3", { text: text.view.startingTitle });
    statusContainer.createEl("p", {
      text: text.view.startingMessage,
      cls: "opencode-status-message",
    });
  }

  private renderRunningState(): void {
    this.clearThemeSyncTimers();
    this.resetThemeDeliveryState();
    this.contentEl.empty();

    const iframeContainer = this.contentEl.createDiv({
      cls: "opencode-iframe-container",
    });

    const iframeUrl = resolveInitialOpenCodeIframeUrl(
      this.plugin.getStoredIframeUrl(),
      this.plugin.getServerUrl()
    );
    this.logger.info("loading iframe", { url: iframeUrl });

    this.iframeEl = iframeContainer.createEl("iframe", {
      cls: "opencode-iframe",
      attr: {
        src: iframeUrl,
        frameborder: "0",
        allow: "clipboard-read; clipboard-write",
      },
    });

    this.iframeEl.addEventListener("error", () => {
      console.error("Failed to load OpenCode iframe");
    });

    this.iframeEl.addEventListener("load", () => {
      this.resetThemeDeliveryState();
      this.scheduleIframeDiagnostics("opencode-load");
      this.scheduleThemeSync("iframe-load");
    });

    void this.plugin.ensureSessionUrl(this);
    this.scheduleIframeDiagnostics("opencode-created");
    this.scheduleThemeSync("iframe-created");
  }

  getIframeUrl(): string | null {
    return this.iframeEl?.src ?? null;
  }

  setIframeUrl(url: string): void {
    if (this.iframeEl && this.iframeEl.src !== url) {
      this.resetThemeDeliveryState();
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

  syncThemeToIframe(reason: string): void {
    if (this.plugin.getSettings().webViewAppearance !== "obsidian") {
      this.recordThemeSyncHistory(reason, "skipped", {
        cause: "appearance-not-obsidian",
      });
      return;
    }

    if (!this.iframeEl?.contentWindow) {
      this.recordThemeSyncHistory(reason, "skipped", {
        cause: "iframe-unavailable",
      });
      return;
    }

    const proxyOrigin = this.plugin.getProxyOrigin();
    if (!proxyOrigin) {
      this.recordThemeSyncHistory(reason, "skipped", {
        cause: "proxy-origin-unavailable",
      });
      return;
    }

    const iframeRect = this.iframeEl.getBoundingClientRect();
    const syncVisibility = this.currentThemeSyncVisibility(iframeRect);
    const iframe = summarizeRect(iframeRect);
    if (syncVisibility !== "iframe-visible") {
      this.recordThemeSyncHistory(reason, "skipped", {
        cause: "iframe-hidden",
        syncVisibility,
        iframe,
      });
      this.scheduleThemeHistoryDiagnostics(`theme-sync-skipped:${reason}`);
      return;
    }

    const theme = this.createIframeTheme(this.plugin.getWebViewTheme(this.contentEl));
    const fingerprint = themeFingerprint(theme);
    const changed = fingerprint !== this.lastPostedThemeFingerprint;
    if (!changed) {
      this.recordThemeSyncHistory(reason, "skipped", {
        cause: "theme-unchanged",
        fingerprint,
        proxyOrigin,
        themeVariableCount: Object.keys(theme.variables).length,
        syncVisibility,
        iframe,
      });
      this.scheduleThemeHistoryDiagnostics(`theme-sync-skipped:${reason}`);
      return;
    }

    this.iframeEl.contentWindow.postMessage(
      {
        ns: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type: BRIDGE_MESSAGES.themeUpdate,
        payload: theme,
      },
      proxyOrigin
    );
    this.recordThemeSyncHistory(reason, "posted", {
      changed,
      fingerprint,
      previousFingerprint: this.lastPostedThemeFingerprint,
      proxyOrigin,
      themeVariableCount: Object.keys(theme.variables).length,
      syncVisibility,
      iframe,
    });
    this.lastPostedThemeFingerprint = fingerprint;
    this.scheduleIframeDiagnostics(`theme-sync:${reason}`);
  }

  postBridgeMessage(type: BridgeMessageType, payload?: unknown): void {
    if (!this.iframeEl?.contentWindow) {
      return;
    }
    const proxyOrigin = this.plugin.getProxyOrigin();
    if (!proxyOrigin) {
      return;
    }
    this.iframeEl.contentWindow.postMessage(
      {
        ns: BRIDGE_NAMESPACE,
        version: BRIDGE_VERSION,
        type,
        payload,
      },
      proxyOrigin
    );
  }

  private renderErrorState(): void {
    const text = getText();
    this.contentEl.empty();
    const diagnostics = this.plugin.getServerDiagnostics();

    const statusContainer = this.contentEl.createDiv({
      cls: "opencode-status-container opencode-error",
    });

    const iconEl = statusContainer.createDiv({ cls: "opencode-status-icon" });
    setIcon(iconEl, "alert-circle");

    statusContainer.createEl("h3", { text: text.view.failedTitle });

    const errorMessage = diagnostics.lastError;
    if (errorMessage) {
      statusContainer.createEl("p", {
        text: errorMessage,
        cls: "opencode-status-message opencode-error-message",
      });
    } else {
      statusContainer.createEl("p", {
        text: text.view.genericStartError,
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

    this.createDiagnosticRow(detailsContainer, text.view.diagnosticMode, diagnostics.lastStartMode);
    this.createDiagnosticRow(
      detailsContainer,
      text.view.diagnosticCommand,
      diagnostics.lastDisplayCommand
    );
    this.createDiagnosticRow(
      detailsContainer,
      text.view.diagnosticWorkingDirectory,
      diagnostics.lastCwd
    );
    this.createDiagnosticRow(
      detailsContainer,
      text.view.diagnosticHealthCheck,
      diagnostics.lastHealthError
    );
    this.createDiagnosticRow(
      detailsContainer,
      text.view.diagnosticStderr,
      diagnostics.lastStderr,
      true
    );
    this.createDiagnosticRow(detailsContainer, text.view.diagnosticLog, diagnostics.logFile);
    this.createDiagnosticRow(detailsContainer, text.view.diagnosticStatus, diagnostics.statusFile);

    const buttonContainer = statusContainer.createDiv({
      cls: "opencode-button-group",
    });

    const retryButton = buttonContainer.createEl("button", {
      text: text.view.retry,
      cls: "mod-cta",
    });
    retryButton.addEventListener("click", () => {
      this.plugin.startServer();
    });

    const settingsButton = buttonContainer.createEl("button", {
      text: text.view.openSettings,
    });
    settingsButton.addEventListener("click", () => {
      (this.app as any).setting.open();
      (this.app as any).setting.openTabById("another-opencode-for-obsidian");
    });

    const copyButton = buttonContainer.createEl("button", {
      text: text.view.copyDiagnostics,
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
    this.contentEl.removeClass("opencode-view-running");
    this.contentEl.addClass(`opencode-appearance-${appearance}`);
    this.applyHostTheme(appearance);
    if (this.currentState === "running") {
      this.contentEl.addClass("opencode-view-running");
    }
  }

  private applyHostTheme(appearance: WebViewAppearance): void {
    if (appearance !== "obsidian") {
      this.clearHostTheme();
      return;
    }

    this.contentEl.style.colorScheme = this.plugin.getWebViewTheme(this.contentEl).colorScheme;
  }

  private createIframeTheme(theme: WebViewTheme): WebViewTheme {
    // Maintenance guard: theme sync is a token bridge, not a geometry bridge.
    // Do not read getBoundingClientRect() here or send parent/iframe plane
    // variables. Background paint belongs to the iframe-local CSS contract in
    // ProxyInjection; geometry belongs to temporary diagnostics only.
    return {
      colorScheme: theme.colorScheme,
      variables: theme.variables,
    };
  }

  private clearHostTheme(): void {
    this.contentEl.style.colorScheme = "";
  }

  private reloadIframe(): void {
    if (this.iframeEl) {
      const src = this.iframeEl.src;
      this.resetThemeDeliveryState();
      this.iframeEl.src = "about:blank";
      setTimeout(() => {
        if (this.iframeEl) {
          this.iframeEl.src = src;
        }
      }, 100);
    }
  }

  private scheduleIframeDiagnostics(reason: string): void {
    window.setTimeout(() => {
      this.plugin.recordIframeDiagnostics(this.createIframeDiagnostics(reason));
    }, 120);
  }

  private scheduleThemeHistoryDiagnostics(reason: string): void {
    if (this.themeHistoryDiagnosticsTimerId !== null) {
      return;
    }

    this.themeHistoryDiagnosticsTimerId = window.setTimeout(() => {
      this.themeHistoryDiagnosticsTimerId = null;
      this.plugin.recordIframeDiagnostics(this.createIframeDiagnostics(reason));
    }, 180);
  }

  private clearThemeHistoryDiagnosticsTimer(): void {
    if (this.themeHistoryDiagnosticsTimerId === null) {
      return;
    }

    window.clearTimeout(this.themeHistoryDiagnosticsTimerId);
    this.themeHistoryDiagnosticsTimerId = null;
  }

  private resetThemeDeliveryState(): void {
    this.lastPostedThemeFingerprint = null;
    this.lastObservedThemeSourceFingerprint = null;
  }

  private createIframeDiagnostics(reason: string): Record<string, unknown> {
    // Parent-side iframe composition is sampled here; OpenCode DOM internals are
    // sampled by the proxy script because the loaded iframe is not same-origin.
    return {
      reason,
      appearance: this.plugin.getSettings().webViewAppearance,
      syncVisibility: this.currentThemeSyncVisibility(),
      iframe: this.describeElement(this.iframeEl),
      appearanceRoot: this.describeElement(this.contentEl),
      appearanceBackground: this.describePseudoElement(this.contentEl, "::before"),
      appearanceImageBackground: this.describePseudoElement(this.contentEl, "::after"),
      appearanceVariables: this.collectAppearanceVariables(this.contentEl),
      editorBackgroundVariables: this.collectEditorBackgroundVariables(this.contentEl),
      themeSyncHistory: this.themeSyncHistory.slice(),
      workspaceFocus: this.collectWorkspaceFocus(),
      externalEditorBackgroundLayers: this.collectExternalEditorBackgroundLayers(),
      externalEditorBackgroundRules: this.collectExternalEditorBackgroundRules(),
      ancestors: this.collectAncestors(this.iframeEl, 16),
      iframeDocumentRoots: this.sampleIframeDocumentRoots(this.iframeEl),
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

  private collectEditorBackgroundVariables(element: HTMLElement): Record<string, string> {
    const style = getComputedStyle(element);
    const names = [
      "--obsidian-editor-background-image",
      "--obsidian-editor-background-opacity",
      "--obsidian-editor-background-bluriness",
      "--obsidian-editor-background-position",
      "--obsidian-editor-background-input-contrast",
    ];
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }

  private collectExternalEditorBackgroundLayers(): unknown[] {
    const seen = new Set<HTMLElement>();
    const layers: unknown[] = [];

    for (const selector of PARENT_EDITOR_BACKGROUND_SOURCE_SELECTORS) {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement) || seen.has(element)) {
        continue;
      }

      seen.add(element);
      layers.push({
        selector,
        element: this.describeElement(element),
        variables: this.collectEditorBackgroundVariables(element),
        before: this.describePseudoElement(element, "::before"),
        after: this.describePseudoElement(element, "::after"),
      });

      if (layers.length >= 4) {
        break;
      }
    }

    return layers;
  }

  private collectWorkspaceFocus(): Record<string, unknown> {
    const activeLeaf = this.plugin.app.workspace.activeLeaf;
    const activeView = activeLeaf?.view ?? null;
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return {
      documentHasFocus: document.hasFocus(),
      activeLeafViewType: activeView?.getViewType() ?? null,
      openCodeLeafIsActive: activeLeaf === this.leaf,
      iframeIsDocumentActiveElement: activeElement === this.iframeEl,
      focusedIframeWithoutActiveOpenCodeLeaf:
        activeElement === this.iframeEl && activeLeaf !== this.leaf,
      activeElement: this.describeElement(activeElement),
      activeElementAncestors: this.collectAncestors(activeElement, 8),
      activeLeafView: this.describeElement(activeView?.containerEl ?? null),
      openCodeLeafView: this.describeElement(this.containerEl),
      activeLeafRoot: this.describeElement(workspaceItemContainerEl(activeLeaf?.getRoot())),
      openCodeLeafRoot: this.describeElement(workspaceItemContainerEl(this.leaf.getRoot())),
    };
  }

  private collectExternalEditorBackgroundRules(): unknown[] {
    const rules: unknown[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue;
      }

      for (const rule of Array.from(cssRules)) {
        const text = rule.cssText;
        if (!isExternalEditorBackgroundRule(text)) {
          continue;
        }

        rules.push({
          href: sheet.href ?? null,
          owner: describeStyleOwner(sheet.ownerNode),
          text: text.slice(0, 800),
        });

        if (rules.length >= 8) {
          return rules;
        }
      }
    }

    return rules;
  }

  private collectAppearanceVariables(element: HTMLElement): Record<string, string> {
    const style = getComputedStyle(element);
    const names = [
      "--another-opencode-for-obsidian-page-background",
      "--another-opencode-for-obsidian-background-primary",
      "--another-opencode-for-obsidian-background-primary-alt",
      "--another-opencode-for-obsidian-background-secondary",
    ];
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
  }

  private currentThemeSyncVisibility(rect?: DOMRect): string {
    if (!this.iframeEl) {
      return "iframe-missing";
    }

    const iframeRect = rect ?? this.iframeEl.getBoundingClientRect();
    if (!this.iframeEl.isConnected || iframeRect.width <= 0 || iframeRect.height <= 0) {
      return "iframe-hidden";
    }

    return "iframe-visible";
  }

  private scheduleThemeSync(reason: string): void {
    const clearedTimerCount = this.themeSyncTimerIds.length;
    this.clearThemeSyncTimers();
    // All sync reasons share the same delay ladder. Geometry-specific retry
    // queues previously made layout timing look like a rendering contract.
    const delaysMs = THEME_SYNC_DELAYS_MS;
    this.recordThemeSyncHistory(reason, "scheduled", {
      clearedTimerCount,
      delaysMs: [...delaysMs],
      state: this.currentState,
    });
    for (const delay of delaysMs) {
      const timerId = window.setTimeout(() => {
        this.syncThemeToIframe(reason);
      }, delay);
      this.themeSyncTimerIds.push(timerId);
    }
  }

  private clearThemeSyncTimers(): void {
    for (const timerId of this.themeSyncTimerIds) {
      window.clearTimeout(timerId);
    }
    this.themeSyncTimerIds = [];
  }

  private recordThemeSyncHistory(
    reason: string,
    phase: "scheduled" | "posted" | "skipped",
    detail: Record<string, unknown>
  ): void {
    this.themeSyncSequence += 1;
    this.themeSyncHistory.push({
      sequence: this.themeSyncSequence,
      timestamp: Date.now(),
      reason,
      phase,
      ...detail,
    });

    if (this.themeSyncHistory.length > THEME_SYNC_HISTORY_LIMIT) {
      this.themeSyncHistory.splice(0, this.themeSyncHistory.length - THEME_SYNC_HISTORY_LIMIT);
    }
  }

  private startThemeSourceObserver(): void {
    if (this.themeSourceObserver) {
      return;
    }

    const observer = new MutationObserver((mutations) => {
      this.scheduleThemeSyncForObservedSourceMutation(mutations);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    this.themeSourceObserver = observer;
  }

  private scheduleThemeSyncForObservedSourceMutation(mutations: MutationRecord[]): void {
    if (this.currentState !== "running") {
      this.recordThemeSyncHistory("obsidian-theme-source-mutated", "skipped", {
        cause: "view-not-running",
        state: this.currentState,
      });
      return;
    }

    const nextFingerprint = this.currentThemeSourceFingerprint();
    const changed =
      this.lastObservedThemeSourceFingerprint === null ||
      nextFingerprint !== this.lastObservedThemeSourceFingerprint;
    this.lastObservedThemeSourceFingerprint = nextFingerprint;

    if (changed) {
      this.scheduleThemeSync("obsidian-theme-source-mutated");
      return;
    }

    this.recordThemeSyncHistory("obsidian-theme-source-mutated", "skipped", {
      cause: "theme-source-unchanged",
      fingerprint: nextFingerprint,
      mutations: summarizeMutations(mutations),
    });
    this.scheduleThemeHistoryDiagnostics("obsidian-theme-source-mutated:unchanged");
  }

  private currentThemeSourceFingerprint(): string {
    return themeFingerprint(this.createIframeTheme(this.plugin.getWebViewTheme(this.contentEl)));
  }

  private stopThemeSourceObserver(): void {
    this.themeSourceObserver?.disconnect();
    this.themeSourceObserver = null;
  }

  private startThemeLayoutObserver(): void {
    if (this.themeLayoutObserver || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (this.currentState === "running") {
        this.scheduleThemeSync("opencode-layout-resized");
      }
    });
    observer.observe(this.contentEl);
    this.themeLayoutObserver = observer;
  }

  private stopThemeLayoutObserver(): void {
    this.themeLayoutObserver?.disconnect();
    this.themeLayoutObserver = null;
  }

  private describePseudoElement(
    element: HTMLElement | null,
    pseudoElement: string
  ): Record<string, unknown> | null {
    if (!element) {
      return null;
    }

    const style = getComputedStyle(element, pseudoElement);
    return {
      pseudoElement,
      content: style.content,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      position: style.position,
      backgroundPosition: style.backgroundPosition,
      backgroundSize: style.backgroundSize,
      left: style.left,
      top: style.top,
      right: style.right,
      bottom: style.bottom,
      width: style.width,
      height: style.height,
      opacity: style.opacity,
      filter: style.filter,
      boxShadow: style.boxShadow,
      zIndex: style.zIndex,
    };
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
      dataType: element.dataset.type ?? null,
      dataComponent: element.dataset.component ?? null,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      opacity: style.opacity,
      allowTransparency:
        element instanceof HTMLIFrameElement ? element.getAttribute("allowtransparency") : null,
      backdropFilter: style.backdropFilter,
      filter: style.filter,
      boxShadow: style.boxShadow,
      mixBlendMode: style.mixBlendMode,
      isolation: style.isolation,
      position: style.position,
      zIndex: style.zIndex,
      transform: style.transform,
      overflow: style.overflow,
      colorScheme: style.colorScheme,
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      area: Math.round(rect.width * rect.height),
    };
  }
}

export function resolveInitialOpenCodeIframeUrl(
  storedUrl: string | null,
  serverUrl: string
): string {
  if (!storedUrl) {
    return serverUrl;
  }

  try {
    const stored = new URL(storedUrl);
    const currentServer = new URL(serverUrl);
    const sessionPath = stored.pathname.match(/\/session\/[^/?#]+\/?$/)?.[0];
    if (!sessionPath) {
      return serverUrl;
    }

    currentServer.pathname = `${currentServer.pathname.replace(/\/$/, "")}${sessionPath}`;
    currentServer.search = stored.search;
    currentServer.hash = stored.hash;
    return currentServer.toString();
  } catch {
    return serverUrl;
  }
}

function isExternalEditorBackgroundRule(text: string): boolean {
  return (
    text.includes("--obsidian-editor-background") &&
    (text.includes(".cm-editor") ||
      text.includes(".markdown-reading-view") ||
      text.includes(".markdown-preview-view"))
  );
}

function describeStyleOwner(owner: Element | ProcessingInstruction | null): string | null {
  if (!(owner instanceof Element)) {
    return null;
  }

  return (
    owner.id ||
    owner.getAttribute("href") ||
    owner.getAttribute("data-plugin") ||
    owner.tagName.toLowerCase()
  );
}

function workspaceItemContainerEl(item: unknown): HTMLElement | null {
  const containerEl = (item as { containerEl?: unknown } | null | undefined)?.containerEl;
  return containerEl instanceof HTMLElement ? containerEl : null;
}

function summarizeMutations(mutations: MutationRecord[]): Array<Record<string, unknown>> {
  return mutations.slice(0, 8).map((mutation) => {
    const target = mutation.target instanceof HTMLElement ? mutation.target : null;
    return {
      type: mutation.type,
      attributeName: mutation.attributeName,
      target: target ? selectorPath(target) : mutation.target.nodeName,
    };
  });
}

function selectorPath(element: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : "";
    const classes =
      typeof current.className === "string"
        ? current.className
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .map((className) => `.${cssEscapeIdent(className)}`)
            .join("")
        : "";
    parts.unshift(`${tag}${id}${classes}`);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function cssEscapeIdent(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function themeFingerprint(theme: WebViewTheme): string {
  return stableHash(stableStringify(theme));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function summarizeRect(rect: DOMRect): Record<string, number> {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
