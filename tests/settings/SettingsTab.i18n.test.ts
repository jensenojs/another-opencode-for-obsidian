import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { OpenCodeSettingTab as OpenCodeSettingTabClass } from "../../src/settings/SettingsTab";
import type { ServiceStatus } from "../../src/server/types";
import type { OpenCodeSettings } from "../../src/types";
import { DEFAULT_SETTINGS } from "../../src/types";

class FakeSetting {
  descEl: HTMLElement;
  private settingEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    this.descEl = this.settingEl.createDiv({ cls: "setting-item-description" });
  }

  setName(text: string): this {
    this.settingEl.createDiv({ cls: "setting-item-name", text });
    return this;
  }

  setDesc(text: string): this {
    this.descEl.setText(text);
    return this;
  }

  addText(callback: (text: FakeTextComponent) => void): this {
    callback(new FakeTextComponent(this.settingEl, "input"));
    return this;
  }

  addTextArea(callback: (text: FakeTextComponent) => void): this {
    callback(new FakeTextComponent(this.settingEl, "textarea"));
    return this;
  }

  addToggle(callback: (toggle: FakeToggleComponent) => void): this {
    callback(new FakeToggleComponent());
    return this;
  }

  addDropdown(callback: (dropdown: FakeDropdownComponent) => void): this {
    callback(new FakeDropdownComponent(this.settingEl));
    return this;
  }

  addSlider(callback: (slider: FakeSliderComponent) => void): this {
    callback(new FakeSliderComponent());
    return this;
  }

  addButton(callback: (button: FakeButtonComponent) => void): this {
    callback(new FakeButtonComponent(this.settingEl));
    return this;
  }
}

mock.module("obsidian", () => ({
  addIcon: () => {},
  getLinkpath: (linktext: string) => linktext.split("#", 1)[0],
  getLanguage: () => "en",
  parseLinktext: (linktext: string) => {
    const subpathIndex = linktext.indexOf("#");
    if (subpathIndex === -1) {
      return { path: linktext, subpath: "" };
    }
    return {
      path: linktext.slice(0, subpathIndex),
      subpath: linktext.slice(subpathIndex + 1),
    };
  },
  setIcon: () => {},
  ItemView: class ItemView {},
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
  PluginSettingTab: class PluginSettingTab {
    app: unknown;
    plugin: unknown;
    containerEl: HTMLElement;

    constructor(app: unknown, plugin: unknown) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement("div");
      document.body.append(this.containerEl);
    }

    update(): void {}
  },
  Setting: FakeSetting,
  SettingGroup: class SettingGroup {
    private groupEl: HTMLElement;

    constructor(containerEl: HTMLElement) {
      this.groupEl = containerEl.createDiv({ cls: "setting-group" });
    }

    setHeading(text: string): this {
      this.groupEl.createDiv({ cls: "setting-group-heading", text });
      return this;
    }

    addClass(cls: string): this {
      this.groupEl.classList.add(cls);
      return this;
    }

    addSetting(callback: (setting: FakeSetting) => void): this {
      callback(new FakeSetting(this.groupEl));
      return this;
    }
  },
  TFile: class TFile {},
  TFolder: class TFolder {},
}));

let OpenCodeSettingTab: typeof OpenCodeSettingTabClass;
let setPluginLanguageForTests: (language: string | null) => void;

beforeAll(async () => {
  ({ OpenCodeSettingTab } = await import("../../src/settings/SettingsTab"));
  ({ setPluginLanguageForTests } = await import("../../src/i18n"));
});

afterEach(() => {
  setPluginLanguageForTests?.(null);
});

describe("OpenCodeSettingTab i18n", () => {
  test("renders settings labels in Chinese when Obsidian language is Chinese", () => {
    setPluginLanguageForTests("zh-CN");
    withSettingsDom(() => {
      const tab = new OpenCodeSettingTab(
        {} as any,
        {} as any,
        makeSettings(),
        () => null,
        async () => {}
      );

      const definitions = tab.getSettingDefinitions();
      const visibleText = collectVisibleSettingsText(definitions);
      const contextGroup = findGroup(definitions, "上下文辅助");
      const workspaceGroup = findGroup(definitions, "工作区线索");
      const selectionGroup = findGroup(definitions, "选中文本");

      expect(definitions.some((item: any) => item.type === "page")).toBe(false);
      expect(contextGroup.cls).toContain("opencode-settings-level-0");
      expect(workspaceGroup.cls).toContain("opencode-settings-level-1");
      expect(workspaceGroup.cls).toContain("opencode-settings-source-group");
      expect(selectionGroup.cls).toContain("opencode-settings-level-1");
      expect(selectionGroup.cls).toContain("opencode-settings-source-group");
      expect(visibleText).toContain("OpenCode 服务");
      expect(visibleText).toContain("项目目录");
      expect(visibleText).toContain("上下文辅助");
      expect(visibleText).not.toContain("自定义命令");
      expect(visibleText).not.toContain("自动启动");

      expect(visibleText).toContain("发送时附加上下文");
      expect(visibleText).toContain("工作区线索");
      expect(visibleText).toContain("打开的笔记数量上限");
      expect(visibleText).toContain("包含当前活动位置");
      expect(visibleText).toContain("选中文本");
      expect(visibleText).toContain("最近选中文本数量");
      expect(visibleText).toContain("单段文本长度上限");
      expect(visibleText).not.toContain("上下文候选");
      expect(visibleText).not.toContain("上下文提交行为");
      expect(visibleText).not.toContain("反向链接候选来源");
      expect(visibleText).not.toContain("光标候选来源");
    });
  });

  test("renders the attached service identity and the unavailable reason", () => {
    setPluginLanguageForTests("zh-CN");
    withSettingsDom(() => {
      let current: ServiceStatus = {
        state: "attached",
        handle: {
          name: "service.json",
          url: "http://127.0.0.1:49374",
          password: "secret",
          version: "2.1.3",
          pid: 96699,
        },
      };
      const tab = new OpenCodeSettingTab(
        {} as any,
        {} as any,
        makeSettings(),
        () => current,
        async () => {}
      );
      const statusGroup = findGroup(tab.getSettingDefinitions(), "服务");
      const container = document.createElement("div");

      statusGroup.items[0].render({ settingEl: container });
      expect(container.textContent).toContain("已连接");
      expect(container.textContent).toContain("http://127.0.0.1:49374");
      expect(container.textContent).toContain("service.json · v2.1.3 · pid 96699");
      expect(container.textContent).not.toContain("secret");

      current = {
        state: "unavailable",
        reason: "no reachable service among service.json in /state/opencode",
      };
      statusGroup.items[0].render({ settingEl: container });
      expect(container.textContent).toContain("未发现服务");
      expect(container.textContent).toContain("no reachable service among service.json");
      expect(container.textContent).toContain("opencode service start");
    });
  });

  test("hides source controls when context assist is disabled", () => {
    setPluginLanguageForTests("zh-CN");
    withSettingsDom(() => {
      const settings = makeSettings();
      settings.contextAssist.enabled = false;

      const tab = new OpenCodeSettingTab(
        {} as any,
        {} as any,
        settings,
        () => null,
        async () => {}
      );

      const definitions = tab.getSettingDefinitions();
      const visibleText = collectVisibleSettingsText(definitions);

      expect(visibleText).toContain("上下文辅助");
      expect(visibleText).toContain("关闭后不会收集或发送 Obsidian 上下文");
      expect(visibleText).toContain("发送时附加上下文");
      expect(visibleText).not.toContain("工作区线索");
      expect(visibleText).not.toContain("选中文本");
      expect(visibleText).not.toContain("打开的笔记数量上限");
      expect(visibleText).not.toContain("最近选中文本数量");
    });
  });

  test("hides workspace sub-options when workspace clues are disabled", () => {
    setPluginLanguageForTests("zh-CN");
    withSettingsDom(() => {
      const settings = makeSettings();
      settings.contextAssist.workspace.enabled = false;

      const tab = new OpenCodeSettingTab(
        {} as any,
        {} as any,
        settings,
        () => null,
        async () => {}
      );

      const definitions = tab.getSettingDefinitions();
      const visibleText = collectVisibleSettingsText(definitions);

      expect(visibleText).toContain("工作区线索");
      expect(visibleText).toContain("关闭后不会收集打开笔记和活动位置");
      expect(visibleText).not.toContain("打开的笔记数量上限");
      expect(visibleText).not.toContain("包含当前活动位置");
      expect(visibleText).toContain("选中文本");
      expect(visibleText).toContain("最近选中文本数量");
    });
  });

  test("hides selection queue controls when selected text source is disabled", () => {
    setPluginLanguageForTests("zh-CN");
    withSettingsDom(() => {
      const settings = makeSettings();
      settings.contextAssist.selection.enabled = false;

      const tab = new OpenCodeSettingTab(
        {} as any,
        {} as any,
        settings,
        () => null,
        async () => {}
      );

      const definitions = tab.getSettingDefinitions();
      const visibleText = collectVisibleSettingsText(definitions);

      expect(visibleText).toContain("选中文本");
      expect(visibleText).toContain("关闭后不监听选中文本，也不会维护选中文本队列");
      expect(visibleText).not.toContain("最近选中文本数量");
      expect(visibleText).not.toContain("单段文本长度上限");
      expect(visibleText).toContain("工作区线索");
      expect(visibleText).toContain("打开的笔记数量上限");
    });
  });
});

class FakeTextComponent {
  inputEl: HTMLInputElement | HTMLTextAreaElement;

  constructor(containerEl: HTMLElement, tag: "input" | "textarea") {
    this.inputEl = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
    containerEl.append(this.inputEl);
  }

  setPlaceholder(value: string): this {
    this.inputEl.setAttribute("placeholder", value);
    return this;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  onChange(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }
}

class FakeToggleComponent {
  setValue(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }

  onChange(): this {
    return this;
  }
}

class FakeDropdownComponent {
  private selectEl: HTMLSelectElement;

  constructor(containerEl: HTMLElement) {
    this.selectEl = document.createElement("select");
    containerEl.append(this.selectEl);
  }

  addOption(value: string, text: string): this {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    this.selectEl.append(option);
    return this;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(): this {
    return this;
  }
}

class FakeSliderComponent {
  setLimits(): this {
    return this;
  }

  setValue(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  onChange(): this {
    return this;
  }
}

class FakeButtonComponent {
  private buttonEl: HTMLButtonElement;

  constructor(containerEl: HTMLElement) {
    this.buttonEl = document.createElement("button");
    containerEl.append(this.buttonEl);
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text;
    return this;
  }

  onClick(): this {
    return this;
  }
}

function withSettingsDom(run: (window: Window) => void): void {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const window = new Window();
  installObsidianElementHelpers(window);
  globalThis.window = window as any;
  globalThis.document = window.document as unknown as Document;

  try {
    run(window);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
}

function installObsidianElementHelpers(window: Window): void {
  const proto = window.HTMLElement.prototype as unknown as {
    empty: () => void;
    setText: (text: string) => void;
    createDiv: (options?: { cls?: string; text?: string }) => HTMLElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLElement;
    createEl: (
      tag: string,
      options?: { cls?: string; text?: string; attr?: Record<string, string> }
    ) => HTMLElement;
  };
  proto.empty = function empty(this: HTMLElement): void {
    this.replaceChildren();
  };
  proto.setText = function setText(this: HTMLElement, text: string): void {
    this.textContent = text;
  };
  proto.createDiv = function createDiv(
    this: HTMLElement,
    options: { cls?: string; text?: string } = {}
  ): HTMLElement {
    return this.createEl("div", options);
  };
  proto.createSpan = function createSpan(
    this: HTMLElement,
    options: { cls?: string; text?: string } = {}
  ): HTMLElement {
    return this.createEl("span", options);
  };
  proto.createEl = function createEl(
    this: HTMLElement,
    tag: string,
    options: { cls?: string; text?: string; attr?: Record<string, string> } = {}
  ): HTMLElement {
    const el = window.document.createElement(tag);
    if (options.cls) {
      el.className = options.cls;
    }
    if (options.text) {
      el.textContent = options.text;
    }
    for (const [key, value] of Object.entries(options.attr ?? {})) {
      el.setAttribute(key, value);
    }
    this.append(el as any);
    return el as unknown as HTMLElement;
  };
}

function makeSettings(): OpenCodeSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as OpenCodeSettings;
}

function collectVisibleSettingsText(
  items: any[],
  options: { descendIntoPages?: boolean } = {}
): string {
  const parts: string[] = [];

  for (const item of items) {
    if (!isVisible(item)) {
      continue;
    }

    if (typeof item.heading === "string") {
      parts.push(item.heading);
    }
    if (typeof item.name === "string") {
      parts.push(item.name);
    }
    if (typeof item.desc === "string") {
      parts.push(item.desc);
    } else if (item.desc && typeof item.desc.textContent === "string") {
      parts.push(item.desc.textContent);
    }

    if (Array.isArray(item.items) && (options.descendIntoPages || item.type !== "page")) {
      parts.push(collectVisibleSettingsText(item.items, options));
    }
  }

  return parts.join("\n");
}

function isVisible(item: { visible?: boolean | (() => boolean) }): boolean {
  if (typeof item.visible === "function") {
    return item.visible();
  }
  return item.visible !== false;
}

function findGroup(items: any[], heading: string): any {
  const group = items.find((item) => item.type === "group" && item.heading === heading);
  if (!group) {
    throw new Error(`Missing settings group: ${heading}`);
  }
  return group;
}
