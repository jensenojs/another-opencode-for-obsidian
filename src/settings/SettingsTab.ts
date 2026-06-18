import { App, Plugin, PluginSettingTab, SettingDefinitionItem, Notice } from "obsidian";
import { existsSync, statSync } from "fs";
import { homedir } from "os";
import {
  CUSTOM_COMMAND_EXAMPLE,
  OPENCODE_VIEW_TYPE,
  type KeyboardBridgeShortcutOwner,
  OpenCodeSettings,
  ViewLocation,
  WebViewAppearance,
} from "../types";
import { ServerManager } from "../server/ServerManager";
import { ExecutableResolver } from "../server/ExecutableResolver";
import { getRuntimePaths } from "../debug/RuntimeDiagnostics";
import { OpenCodeView } from "../ui/OpenCodeView";
import { getText } from "../i18n";
import type { KeyboardConflict, KeyboardShortcutIndex } from "../bridge/KeyboardShortcutIndex";

type SettingsKey =
  | "port"
  | "hostname"
  | "useCustomCommand"
  | "customCommand"
  | "opencodePath"
  | "projectDirectory"
  | "autoStart"
  | "defaultViewLocation"
  | "webViewAppearance"
  | "contextAssist.enabled"
  | "contextAssist.workspace.enabled"
  | "contextAssist.workspace.maxOpenNotes"
  | "contextAssist.workspace.includeActiveLocation"
  | "contextAssist.selection.enabled"
  | "contextAssist.selection.maxSnippets"
  | "contextAssist.selection.maxCharsPerSnippet";

interface KeyboardBridgeSettingsControl {
  getSummary: () => {
    status: KeyboardShortcutIndex["status"];
    obsidianShortcutCount: number;
    opencodeShortcutCount: number;
    conflictCount: number;
    obsidianAvailable: boolean;
    opencodeAvailable: boolean;
    unavailableReason: string | null;
    conflicts: KeyboardConflict[];
  };
  setOwner: (signature: string, owner: KeyboardBridgeShortcutOwner) => Promise<void>;
  refresh: () => void;
}

function expandTilde(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return path.replace("~", homedir());
  }
  return path;
}

export class OpenCodeSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private settings: OpenCodeSettings,
    private serverManager: ServerManager,
    private onSettingsChange: () => Promise<void>,
    private keyboardBridge?: KeyboardBridgeSettingsControl
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
    const text = getText();
    return [
      {
        type: "group",
        heading: text.settings.serverConfiguration,
        cls: "opencode-settings-group",
        items: [
          {
            name: text.settings.port,
            desc: text.settings.portDesc,
            control: {
              type: "number",
              key: "port",
              min: 1,
              max: 65535,
              step: 1,
              defaultValue: 14096,
            },
          },
          {
            name: text.settings.hostname,
            desc: text.settings.hostnameDesc,
            control: {
              type: "text",
              key: "hostname",
              placeholder: "127.0.0.1",
              defaultValue: "127.0.0.1",
            },
          },
          {
            name: text.settings.useCustomCommand,
            desc: this.customCommandModeDescription(),
            control: {
              type: "toggle",
              key: "useCustomCommand",
              defaultValue: false,
            },
          },
          {
            name: text.settings.customCommand,
            desc: text.settings.customCommandDesc,
            visible: () => this.settings.useCustomCommand,
            control: {
              type: "textarea",
              key: "customCommand",
              placeholder: CUSTOM_COMMAND_EXAMPLE,
              rows: 3,
              defaultValue: "",
            },
          },
          {
            name: text.settings.executablePath,
            visible: () => !this.settings.useCustomCommand,
            render: (setting) => {
              setting
                .addText((input) =>
                  input
                    .setPlaceholder("opencode")
                    .setValue(this.settings.opencodePath)
                    .onChange(async (value) => {
                      this.settings.opencodePath = value;
                      await this.onSettingsChange();
                    })
                )
                .addButton((button) => {
                  button.setButtonText(text.settings.autodetect).onClick(async () => {
                    const detectedPath = ExecutableResolver.resolve("opencode");
                    if (detectedPath && detectedPath !== "opencode") {
                      this.settings.opencodePath = detectedPath;
                      await this.onSettingsChange();
                      this.update();
                      new Notice(text.notices.executableFound(detectedPath));
                    } else {
                      new Notice(text.notices.executableNotFoundInstallation);
                    }
                  });
                });
            },
          },
          {
            name: text.settings.projectDirectory,
            desc: text.settings.projectDirectoryDesc,
            control: {
              type: "text",
              key: "projectDirectory",
              placeholder: text.settings.projectDirectoryPlaceholder,
              defaultValue: "",
              validate: (value) => this.validateProjectDirectoryInput(value),
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.behavior,
        cls: "opencode-settings-group",
        items: [
          {
            name: text.settings.autoStartServer,
            desc: text.settings.autoStartServerDesc,
            control: {
              type: "toggle",
              key: "autoStart",
              defaultValue: false,
            },
          },
          {
            name: text.settings.defaultViewLocation,
            desc: text.settings.defaultViewLocationDesc,
            control: {
              type: "dropdown",
              key: "defaultViewLocation",
              options: {
                sidebar: text.settings.sidebar,
                main: text.settings.mainWindow,
              },
              defaultValue: "sidebar",
            },
          },
          {
            name: text.settings.webViewAppearance,
            desc: text.settings.webViewAppearanceDesc,
            control: {
              type: "dropdown",
              key: "webViewAppearance",
              options: {
                opencode: "OpenCode",
                obsidian: "Obsidian",
              },
              defaultValue: "obsidian",
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.contextAssist,
        cls: "opencode-settings-group opencode-settings-level-0",
        items: [
          {
            name: text.settings.enableContextAssist,
            desc: this.settings.contextAssist.enabled
              ? text.settings.contextAssistDesc
              : text.settings.contextAssistDisabledDesc,
            control: {
              type: "toggle",
              key: "contextAssist.enabled",
              defaultValue: true,
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.workspaceClues,
        cls: "opencode-settings-group opencode-settings-level-1 opencode-settings-source-group",
        visible: () => this.settings.contextAssist.enabled,
        items: [
          {
            name: text.settings.workspaceClues,
            desc: this.settings.contextAssist.workspace.enabled
              ? text.settings.workspaceCluesDesc
              : text.settings.workspaceCluesDisabledDesc,
            visible: () => this.settings.contextAssist.enabled,
            control: {
              type: "toggle",
              key: "contextAssist.workspace.enabled",
              defaultValue: true,
            },
          },
          {
            name: text.settings.maxOpenNotes,
            desc: text.settings.maxOpenNotesDesc,
            visible: () =>
              this.settings.contextAssist.enabled && this.settings.contextAssist.workspace.enabled,
            control: {
              type: "slider",
              key: "contextAssist.workspace.maxOpenNotes",
              min: 1,
              max: 20,
              step: 1,
              displayFormat: (value) => value.toString(),
              defaultValue: 3,
            },
          },
          {
            name: text.settings.includeActiveLocation,
            desc: text.settings.includeActiveLocationDesc,
            visible: () =>
              this.settings.contextAssist.enabled && this.settings.contextAssist.workspace.enabled,
            control: {
              type: "toggle",
              key: "contextAssist.workspace.includeActiveLocation",
              defaultValue: true,
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.selectionSnippets,
        cls: "opencode-settings-group opencode-settings-level-1 opencode-settings-source-group",
        visible: () => this.settings.contextAssist.enabled,
        items: [
          {
            name: text.settings.selectionSnippets,
            desc: this.settings.contextAssist.selection.enabled
              ? text.settings.selectionSnippetsDesc
              : text.settings.selectionSnippetsDisabledDesc,
            visible: () => this.settings.contextAssist.enabled,
            control: {
              type: "toggle",
              key: "contextAssist.selection.enabled",
              defaultValue: true,
            },
          },
          {
            name: text.settings.maxSelectionSnippets,
            desc: text.settings.maxSelectionSnippetsDesc,
            visible: () =>
              this.settings.contextAssist.enabled && this.settings.contextAssist.selection.enabled,
            control: {
              type: "slider",
              key: "contextAssist.selection.maxSnippets",
              min: 1,
              max: 10,
              step: 1,
              displayFormat: (value) => value.toString(),
              defaultValue: 3,
            },
          },
          {
            name: text.settings.maxCharsPerSnippet,
            desc: text.settings.maxCharsPerSnippetDesc,
            visible: () =>
              this.settings.contextAssist.enabled && this.settings.contextAssist.selection.enabled,
            control: {
              type: "slider",
              key: "contextAssist.selection.maxCharsPerSnippet",
              min: 200,
              max: 5000,
              step: 100,
              displayFormat: (value) => value.toString(),
              defaultValue: 500,
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.keyboardBridge,
        cls: "opencode-settings-group opencode-settings-keyboard-bridge",
        items: [
          {
            name: text.settings.keyboardBridge,
            desc: text.settings.keyboardBridgeDesc,
            searchable: false,
            render: (setting) => {
              this.renderKeyboardBridge(setting.settingEl);
            },
          },
        ],
      },
      {
        type: "group",
        heading: text.settings.serverStatus,
        cls: "opencode-settings-group opencode-settings-status-group",
        items: [
          {
            name: text.settings.serverStatus,
            desc: text.settings.serverStatusDesc,
            searchable: false,
            render: (setting) => {
              this.renderServerStatus(setting.settingEl);
            },
          },
        ],
      },
    ];
  }

  display(): void {}

  getControlValue(key: SettingsKey): unknown {
    switch (key) {
      case "port":
        return this.settings.port;
      case "hostname":
        return this.settings.hostname;
      case "useCustomCommand":
        return this.settings.useCustomCommand;
      case "customCommand":
        return this.settings.customCommand;
      case "opencodePath":
        return this.settings.opencodePath;
      case "projectDirectory":
        return this.settings.projectDirectory;
      case "autoStart":
        return this.settings.autoStart;
      case "defaultViewLocation":
        return this.settings.defaultViewLocation;
      case "webViewAppearance":
        return this.settings.webViewAppearance;
      case "contextAssist.enabled":
        return this.settings.contextAssist.enabled;
      case "contextAssist.workspace.enabled":
        return this.settings.contextAssist.workspace.enabled;
      case "contextAssist.workspace.maxOpenNotes":
        return this.settings.contextAssist.workspace.maxOpenNotes;
      case "contextAssist.workspace.includeActiveLocation":
        return this.settings.contextAssist.workspace.includeActiveLocation;
      case "contextAssist.selection.enabled":
        return this.settings.contextAssist.selection.enabled;
      case "contextAssist.selection.maxSnippets":
        return this.settings.contextAssist.selection.maxSnippets;
      case "contextAssist.selection.maxCharsPerSnippet":
        return this.settings.contextAssist.selection.maxCharsPerSnippet;
    }
  }

  async setControlValue(key: SettingsKey, value: unknown): Promise<void> {
    switch (key) {
      case "port":
        this.settings.port = expectNumber(key, value);
        await this.onSettingsChange();
        return;
      case "hostname":
        this.settings.hostname = expectString(key, value) || "127.0.0.1";
        await this.onSettingsChange();
        return;
      case "useCustomCommand":
        this.settings.useCustomCommand = expectBoolean(key, value);
        await this.onSettingsChange();
        this.update();
        return;
      case "customCommand":
        this.settings.customCommand = expectString(key, value);
        await this.onSettingsChange();
        return;
      case "opencodePath":
        this.settings.opencodePath = expectString(key, value);
        await this.onSettingsChange();
        return;
      case "projectDirectory":
        await this.setProjectDirectoryFromInput(expectString(key, value));
        return;
      case "autoStart":
        this.settings.autoStart = expectBoolean(key, value);
        await this.onSettingsChange();
        return;
      case "defaultViewLocation":
        this.settings.defaultViewLocation = expectViewLocation(key, value);
        await this.onSettingsChange();
        return;
      case "webViewAppearance":
        this.settings.webViewAppearance = expectWebViewAppearance(key, value);
        await this.onSettingsChange();
        this.refreshOpenCodeViews();
        return;
      case "contextAssist.enabled":
        this.settings.contextAssist.enabled = expectBoolean(key, value);
        await this.onSettingsChange();
        this.update();
        return;
      case "contextAssist.workspace.enabled":
        this.settings.contextAssist.workspace.enabled = expectBoolean(key, value);
        await this.onSettingsChange();
        this.update();
        return;
      case "contextAssist.workspace.maxOpenNotes":
        this.settings.contextAssist.workspace.maxOpenNotes = expectNumber(key, value);
        await this.onSettingsChange();
        return;
      case "contextAssist.workspace.includeActiveLocation":
        this.settings.contextAssist.workspace.includeActiveLocation = expectBoolean(key, value);
        await this.onSettingsChange();
        return;
      case "contextAssist.selection.enabled":
        this.settings.contextAssist.selection.enabled = expectBoolean(key, value);
        await this.onSettingsChange();
        this.update();
        return;
      case "contextAssist.selection.maxSnippets":
        this.settings.contextAssist.selection.maxSnippets = expectNumber(key, value);
        await this.onSettingsChange();
        return;
      case "contextAssist.selection.maxCharsPerSnippet":
        this.settings.contextAssist.selection.maxCharsPerSnippet = expectNumber(key, value);
        await this.onSettingsChange();
        return;
    }
  }

  private customCommandModeDescription(): DocumentFragment {
    const text = getText();
    const fragment = document.createDocumentFragment();
    fragment.append(text.settings.useCustomCommandDesc);
    fragment.append(document.createElement("br"));
    const linkEl = document.createElement("a");
    linkEl.textContent = text.settings.learnMore;
    linkEl.href = "https://github.com/jensenojs/another-opencode-for-obsidian#custom-command-mode";
    linkEl.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(linkEl.href, "_blank");
    });
    fragment.append(linkEl);
    return fragment;
  }

  private validateProjectDirectoryInput(value: string): string | void {
    const text = getText();
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    if (!trimmed.startsWith("/") && !trimmed.startsWith("~") && !trimmed.match(/^[A-Za-z]:\\/)) {
      return text.notices.projectDirectoryAbsolute;
    }

    const expanded = expandTilde(trimmed);

    try {
      if (!existsSync(expanded)) {
        return text.notices.projectDirectoryMissing;
      }
      const stat = statSync(expanded);
      if (!stat.isDirectory()) {
        return text.notices.projectDirectoryNotDirectory;
      }
    } catch (error) {
      return text.notices.projectDirectoryValidationFailed((error as Error).message);
    }
  }

  private async setProjectDirectoryFromInput(value: string): Promise<void> {
    const validationMessage = this.validateProjectDirectoryInput(value);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const trimmed = value.trim();
    this.settings.projectDirectory = trimmed;
    if (!trimmed) {
      this.serverManager.updateProjectDirectory("");
      await this.onSettingsChange();
      return;
    }

    const expanded = expandTilde(trimmed);
    this.serverManager.updateProjectDirectory(expanded);
    await this.onSettingsChange();
  }

  private renderKeyboardBridge(container: HTMLElement): void {
    const text = getText();
    container.empty();
    container.classList.add("opencode-keyboard-bridge-setting");

    if (!this.keyboardBridge) {
      container.createDiv({
        text: text.settings.keyboardBridgeUnavailable,
        cls: "opencode-keyboard-bridge-status",
      });
      return;
    }

    const panel = container.createDiv({ cls: "opencode-keyboard-bridge-panel" });
    const summary = this.keyboardBridge.getSummary();
    const summaryEl = panel.createDiv({ cls: "opencode-keyboard-bridge-summary" });
    const metricsEl = summaryEl.createDiv({ cls: "opencode-keyboard-bridge-metrics" });
    const statusEl = metricsEl.createDiv({ cls: "opencode-keyboard-bridge-status" });
    statusEl.createSpan({ text: text.settings.statusLabel });
    statusEl.createSpan({
      text: this.keyboardBridgeStatusText(summary),
      cls: summary.status === "available" ? "opencode-keyboard-bridge-status-ok" : undefined,
    });

    const countsEl = metricsEl.createDiv({ cls: "opencode-keyboard-bridge-counts" });
    countsEl.createSpan({
      text: text.settings.keyboardBridgeCounts(
        summary.obsidianShortcutCount,
        summary.opencodeShortcutCount,
        summary.conflictCount
      ),
    });

    const buttonContainer = summaryEl.createDiv({ cls: "opencode-settings-buttons" });
    const refreshButton = buttonContainer.createEl("button", {
      text: text.settings.refreshKeyboardBridge,
    });
    refreshButton.addEventListener("click", () => {
      this.keyboardBridge?.refresh();
      this.renderKeyboardBridge(container);
    });

    if (summary.conflictCount > 0) {
      panel.createDiv({
        text: text.settings.keyboardBridgeConflictsNeedReview(summary.conflictCount),
        cls: "opencode-keyboard-bridge-warning",
      });
    }

    if (summary.conflicts.length === 0) {
      panel.createDiv({
        text: text.settings.keyboardBridgeNoConflicts,
        cls: "opencode-keyboard-bridge-empty",
      });
      return;
    }

    const listEl = panel.createDiv({ cls: "opencode-keyboard-conflict-list" });
    for (const conflict of summary.conflicts.slice(0, 20)) {
      this.renderKeyboardConflict(listEl, conflict, container);
    }
  }

  private renderKeyboardConflict(
    container: HTMLElement,
    conflict: KeyboardConflict,
    refreshContainer: HTMLElement
  ): void {
    const text = getText();
    const row = container.createDiv({ cls: "opencode-keyboard-conflict-row" });
    row.createEl("code", {
      text: conflict.display,
      cls: "opencode-keyboard-conflict-shortcut",
    });

    const detail = row.createDiv({ cls: "opencode-keyboard-conflict-detail" });
    const obsidianLine = detail.createDiv({ cls: "opencode-keyboard-conflict-command" });
    obsidianLine.createSpan({ text: "Obsidian", cls: "opencode-keyboard-conflict-label" });
    obsidianLine.createSpan({
      text: formatShortcutOwners(conflict.obsidian),
      cls: "opencode-keyboard-conflict-command-text",
    });

    const opencodeLine = detail.createDiv({ cls: "opencode-keyboard-conflict-command" });
    opencodeLine.createSpan({ text: "OpenCode", cls: "opencode-keyboard-conflict-label" });
    opencodeLine.createSpan({
      text: formatShortcutOwners(conflict.opencode),
      cls: "opencode-keyboard-conflict-command-text",
    });

    const actions = row.createDiv({ cls: "opencode-keyboard-conflict-actions" });
    const ownerControl = actions.createDiv({
      cls: "opencode-keyboard-conflict-owner-segment",
      attr: { "aria-label": text.settings.keyboardConflictOwnerLabel },
    });
    const owners: KeyboardBridgeShortcutOwner[] = ["obsidian", "opencode"];
    for (const owner of owners) {
      const active = conflict.policy.owner === owner;
      const button = ownerControl.createEl("button", {
        text: owner === "obsidian" ? "Obsidian" : "OpenCode",
        cls: "opencode-keyboard-conflict-owner-option",
        attr: {
          type: "button",
          "aria-pressed": active ? "true" : "false",
          title: owner === "obsidian" ? text.settings.ownerObsidian : text.settings.ownerOpenCode,
        },
      });
      button.classList.toggle("is-active", active);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (conflict.policy.owner === owner) {
          return;
        }
        void this.keyboardBridge?.setOwner(conflict.signature, owner).then(() => {
          this.renderKeyboardBridge(refreshContainer);
        });
      });
    }
  }

  private keyboardBridgeStatusText(
    summary: ReturnType<KeyboardBridgeSettingsControl["getSummary"]>
  ): string {
    const text = getText();
    if (!summary.obsidianAvailable) {
      return text.settings.keyboardBridgeObsidianUnavailable;
    }
    if (!summary.opencodeAvailable) {
      return text.settings.keyboardBridgeOpenCodeUnavailable;
    }
    return text.settings.keyboardBridgeAvailable;
  }

  private renderServerStatus(container: HTMLElement): void {
    const text = getText();
    container.empty();

    const state = this.serverManager.getState();
    const statusText = {
      stopped: text.settings.stopped,
      starting: text.settings.starting,
      running: text.settings.running,
      error: text.settings.error,
    };

    const statusClass = {
      stopped: "status-stopped",
      starting: "status-starting",
      running: "status-running",
      error: "status-error",
    };

    const statusEl = container.createDiv({ cls: "opencode-status-line" });
    statusEl.createSpan({ text: text.settings.statusLabel });
    statusEl.createSpan({
      text: statusText[state],
      cls: `opencode-status-badge ${statusClass[state]}`,
    });

    if (state === "error") {
      const diagnostics = this.serverManager.getDiagnostics();
      const paths = getRuntimePaths();
      const errorMsg = diagnostics.lastError;
      if (errorMsg) {
        const errorEl = container.createDiv({ cls: "opencode-error-details" });
        errorEl.createEl("div", {
          text: errorMsg,
          cls: "opencode-error-text",
        });
        if (diagnostics.hint) {
          errorEl.createEl("div", {
            text: diagnostics.hint,
            cls: "opencode-diagnostic-hint",
          });
        }
        this.renderDiagnosticLine(errorEl, text.settings.command, diagnostics.lastDisplayCommand);
        this.renderDiagnosticLine(errorEl, text.settings.stderr, diagnostics.lastStderr);
        this.renderDiagnosticLine(errorEl, text.settings.log, paths.logFile);
        this.renderDiagnosticLine(errorEl, text.settings.statusFile, paths.statusFile);
      }
    }

    if (state === "running") {
      const urlEl = container.createDiv({ cls: "opencode-status-line" });
      urlEl.createSpan({ text: "URL: " });
      const serverUrl = this.serverManager.getUrl();
      const linkEl = urlEl.createEl("a", {
        text: serverUrl,
        href: serverUrl,
      });
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(serverUrl, "_blank");
      });
    }

    const buttonContainer = container.createDiv({ cls: "opencode-settings-buttons" });

    if (state === "stopped" || state === "error") {
      const startButton = buttonContainer.createEl("button", {
        text: text.settings.startServer,
        cls: "mod-cta",
      });
      startButton.addEventListener("click", async () => {
        await this.serverManager.start();
        this.renderServerStatus(container);
      });
    }

    if (state === "running") {
      const stopButton = buttonContainer.createEl("button", {
        text: text.settings.stopServer,
      });
      stopButton.addEventListener("click", () => {
        this.serverManager.stop();
        this.renderServerStatus(container);
      });

      const restartButton = buttonContainer.createEl("button", {
        text: text.settings.restartServer,
        cls: "mod-warning",
      });
      restartButton.addEventListener("click", async () => {
        this.serverManager.stop();
        await this.serverManager.start();
        this.renderServerStatus(container);
      });
    }

    if (state === "starting") {
      buttonContainer.createSpan({
        text: text.settings.pleaseWait,
        cls: "opencode-status-waiting",
      });
    }
  }

  private serverStateText(): string {
    const text = getText();
    const state = this.serverManager.getState();
    return {
      stopped: text.settings.stopped,
      starting: text.settings.starting,
      running: text.settings.running,
      error: text.settings.error,
    }[state];
  }

  private renderDiagnosticLine(
    container: HTMLElement,
    label: string,
    value: string | null | undefined
  ): void {
    if (!value) {
      return;
    }

    const row = container.createDiv({ cls: "opencode-diagnostic-row" });
    row.createDiv({ text: label, cls: "opencode-diagnostic-label" });
    row.createEl("code", { text: value, cls: "opencode-diagnostic-value" });
  }

  private refreshOpenCodeViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE)) {
      if (leaf.view instanceof OpenCodeView) {
        leaf.view.refreshAppearance();
      }
    }
  }
}

function expectString(key: SettingsKey, value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${key} to be a string`);
  }
  return value;
}

function expectNumber(key: SettingsKey, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Expected ${key} to be a finite number`);
  }
  return value;
}

function expectBoolean(key: SettingsKey, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`Expected ${key} to be a boolean`);
  }
  return value;
}

function expectViewLocation(key: SettingsKey, value: unknown): ViewLocation {
  if (value !== "sidebar" && value !== "main") {
    throw new TypeError(`Expected ${key} to be a valid view location`);
  }
  return value;
}

function expectWebViewAppearance(key: SettingsKey, value: unknown): WebViewAppearance {
  if (value !== "opencode" && value !== "obsidian") {
    throw new TypeError(`Expected ${key} to be a valid web view appearance`);
  }
  return value;
}

function formatShortcutOwners(entries: Array<{ title: string; commandId: string }>): string {
  return entries.map((entry) => entry.title || entry.commandId).join(", ");
}
