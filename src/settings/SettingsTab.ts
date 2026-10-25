import { App, Plugin, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import { existsSync, statSync } from "fs";
import { homedir } from "os";
import { OPENCODE_VIEW_TYPE, OpenCodeSettings, ViewLocation, WebViewAppearance } from "../types";
import type { ServiceStatus } from "../server/types";
import { getRuntimePaths } from "../debug/RuntimeDiagnostics";
import { OpenCodeView } from "../ui/OpenCodeView";
import { getText } from "../i18n";

type SettingsKey =
  | "serviceName"
  | "projectDirectory"
  | "defaultViewLocation"
  | "webViewAppearance"
  | "contextAssist.enabled"
  | "contextAssist.workspace.enabled"
  | "contextAssist.workspace.maxOpenNotes"
  | "contextAssist.workspace.includeActiveLocation"
  | "contextAssist.selection.enabled"
  | "contextAssist.selection.maxSnippets"
  | "contextAssist.selection.maxCharsPerSnippet";

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
    private getServiceStatus: () => ServiceStatus | null,
    private onSettingsChange: () => Promise<void>
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
    const text = getText();
    return [
      {
        type: "group",
        heading: text.settings.serviceConfiguration,
        cls: "opencode-settings-group",
        items: [
          {
            name: text.settings.serviceName,
            desc: text.settings.serviceNameDesc,
            control: {
              type: "text",
              key: "serviceName",
              placeholder: text.settings.serviceNamePlaceholder,
              defaultValue: "auto",
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
        heading: text.settings.serviceStatus,
        cls: "opencode-settings-group opencode-settings-status-group",
        items: [
          {
            name: text.settings.serviceStatus,
            desc: text.settings.serviceStatusDesc,
            searchable: false,
            render: (setting) => {
              this.renderServiceStatus(setting.settingEl);
            },
          },
        ],
      },
    ];
  }

  display(): void {}

  getControlValue(key: SettingsKey): unknown {
    switch (key) {
      case "serviceName":
        return this.settings.serviceName;
      case "projectDirectory":
        return this.settings.projectDirectory;
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
      case "serviceName":
        this.settings.serviceName = expectString(key, value).trim() || "auto";
        await this.onSettingsChange();
        return;
      case "projectDirectory":
        await this.setProjectDirectoryFromInput(expectString(key, value));
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

    this.settings.projectDirectory = value.trim();
    await this.onSettingsChange();
  }

  private renderServiceStatus(container: HTMLElement): void {
    const text = getText();
    const paths = getRuntimePaths();
    const status = this.getServiceStatus();
    container.empty();

    const statusEl = container.createDiv({ cls: "opencode-status-line" });
    statusEl.createSpan({ text: text.settings.statusLabel });
    statusEl.createSpan({
      text: status?.state === "attached" ? text.settings.attached : text.settings.unavailable,
      cls:
        status?.state === "attached"
          ? "opencode-status-badge status-running"
          : "opencode-status-badge status-error",
    });

    if (status?.state === "attached") {
      const { handle } = status;
      const urlEl = container.createDiv({ cls: "opencode-status-line" });
      const linkEl = urlEl.createEl("a", { text: handle.url, href: handle.url });
      linkEl.addEventListener("click", (event) => {
        event.preventDefault();
        window.open(handle.url, "_blank");
      });
      urlEl.createSpan({
        text: `${handle.name} · v${handle.version} · pid ${handle.pid}`,
        cls: "opencode-status-detail",
      });
      this.renderDiagnosticLine(container, text.settings.log, paths.logFile);
      return;
    }

    const detailEl = container.createDiv({ cls: "opencode-error-details" });
    this.renderDiagnosticLine(detailEl, text.settings.reason, status?.reason);
    detailEl.createEl("code", {
      text: text.view.unavailableCommand,
      cls: "opencode-diagnostic-value",
    });
    this.renderDiagnosticLine(detailEl, text.settings.log, paths.logFile);
    this.renderDiagnosticLine(detailEl, text.settings.statusFile, paths.statusFile);
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
