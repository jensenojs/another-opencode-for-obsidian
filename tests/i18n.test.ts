import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  getPluginLanguage as getPluginLanguageFn,
  getText as getTextFn,
  normalizePluginLanguage as normalizePluginLanguageFn,
  resolvePluginLanguage as resolvePluginLanguageFn,
  setPluginLanguageForTests as setPluginLanguageForTestsFn,
} from "../src/i18n";

mock.module("obsidian", () => ({
  addIcon: () => {},
  getLanguage: () => "en",
  getLinkpath: (linktext: string) => linktext.split("#", 1)[0],
  ItemView: class ItemView {
    app: unknown;
    contentEl: HTMLElement;

    constructor(leaf: { app?: unknown } = {}) {
      this.app = leaf.app;
      this.contentEl =
        typeof document === "undefined" ? ({} as HTMLElement) : document.createElement("div");
      if (typeof document !== "undefined") {
        document.body.append(this.contentEl);
      }
    }

    registerDomEvent(): void {}
  },
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
  parseLinktext: (linktext: string) => ({ path: linktext, subpath: "" }),
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
  },
  Setting: class Setting {
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

    addText(callback: (text: any) => void): this {
      callback(createFakeTextComponent(this.settingEl, "input"));
      return this;
    }

    addTextArea(callback: (text: any) => void): this {
      callback(createFakeTextComponent(this.settingEl, "textarea"));
      return this;
    }

    addToggle(callback: (toggle: any) => void): this {
      callback(createFluentComponent());
      return this;
    }

    addDropdown(callback: (dropdown: any) => void): this {
      callback(createFakeDropdownComponent(this.settingEl));
      return this;
    }

    addSlider(callback: (slider: any) => void): this {
      callback(createFluentComponent());
      return this;
    }

    addButton(callback: (button: any) => void): this {
      callback(createFakeButtonComponent(this.settingEl));
      return this;
    }
  },
  setIcon: () => {},
  TFile: class TFile {},
  TFolder: class TFolder {},
}));

function createFluentComponent(): Record<string, () => Record<string, unknown>> {
  const component: Record<string, () => Record<string, unknown>> = {};
  for (const method of ["setValue", "onChange", "setLimits", "setDynamicTooltip"]) {
    component[method] = () => component;
  }
  return component;
}

function createFakeTextComponent(containerEl: HTMLElement, tag: "input" | "textarea") {
  const inputEl = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
  containerEl.append(inputEl);
  const component = {
    inputEl,
    setPlaceholder: () => component,
    setValue: () => component,
    onChange: () => component,
    setDisabled: () => component,
  };
  return component;
}

function createFakeDropdownComponent(containerEl: HTMLElement) {
  const selectEl = document.createElement("select");
  containerEl.append(selectEl);
  const component = {
    addOption: (value: string, text: string) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      selectEl.append(option);
      return component;
    },
    setValue: () => component,
    onChange: () => component,
  };
  return component;
}

function createFakeButtonComponent(containerEl: HTMLElement) {
  const buttonEl = document.createElement("button");
  containerEl.append(buttonEl);
  const component = {
    setButtonText: (text: string) => {
      buttonEl.textContent = text;
      return component;
    },
    onClick: () => component,
  };
  return component;
}

let getPluginLanguage: typeof getPluginLanguageFn;
let getText: typeof getTextFn;
let normalizePluginLanguage: typeof normalizePluginLanguageFn;
let resolvePluginLanguage: typeof resolvePluginLanguageFn;
let setPluginLanguageForTests: typeof setPluginLanguageForTestsFn;

beforeAll(async () => {
  ({
    getPluginLanguage,
    getText,
    normalizePluginLanguage,
    resolvePluginLanguage,
    setPluginLanguageForTests,
  } = await import("../src/i18n"));
});

afterEach(() => {
  setPluginLanguageForTests(null);
});

describe("i18n", () => {
  test("maps Chinese Obsidian language variants to zh-CN", () => {
    expect(normalizePluginLanguage("zh-CN")).toBe("zh-CN");
    expect(normalizePluginLanguage("zh-TW")).toBe("zh-CN");
    expect(normalizePluginLanguage("zh-Hans")).toBe("zh-CN");
  });

  test("falls back to English for unknown languages", () => {
    expect(normalizePluginLanguage("en")).toBe("en");
    expect(normalizePluginLanguage("fr")).toBe("en");
    expect(normalizePluginLanguage(null)).toBe("en");
  });

  test("uses runtime language when Obsidian getLanguage is unavailable", () => {
    expect(resolvePluginLanguage(null, "zh-CN")).toBe("zh-CN");
    expect(resolvePluginLanguage(undefined, "zh-TW")).toBe("zh-CN");
    expect(resolvePluginLanguage("", "zh-Hans")).toBe("zh-CN");
  });

  test("allows tests to override the current language", () => {
    setPluginLanguageForTests("zh-CN");

    expect(getPluginLanguage()).toBe("zh-CN");
    expect(getText().settings.serverConfiguration).toBe("服务器配置");
  });

  test("English and Chinese text tables have the same shape", () => {
    expect(textShape(getText("zh-CN"))).toEqual(textShape(getText("en")));
  });
});

function textShape(value: unknown): unknown {
  if (typeof value === "function") {
    return "function";
  }
  if (Array.isArray(value)) {
    return value.map(textShape);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, textShape(child)]));
  }
  return typeof value;
}
