import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { OpenCodeView as OpenCodeViewClass } from "../../src/ui/OpenCodeView";

mock.module("obsidian", () => ({
  addIcon: () => {},
  getLanguage: () => "en",
  ItemView: class ItemView {
    app: unknown;
    contentEl: HTMLElement;

    constructor(leaf: { app?: unknown }) {
      this.app = leaf.app;
      this.contentEl = document.createElement("div");
      document.body.append(this.contentEl);
    }

    registerDomEvent(): void {}
  },
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
  setIcon: () => {},
}));

let OpenCodeView: typeof OpenCodeViewClass;
let setPluginLanguageForTests: (language: string | null) => void;

beforeAll(async () => {
  ({ OpenCodeView } = await import("../../src/ui/OpenCodeView"));
  ({ setPluginLanguageForTests } = await import("../../src/i18n"));
});

afterEach(() => {
  setPluginLanguageForTests?.(null);
});

describe("OpenCodeView i18n", () => {
  test("renders the stopped state in Chinese", () => {
    setPluginLanguageForTests("zh-CN");
    withViewDom((window) => {
      const view = new OpenCodeView({ app: {} } as any, fakePlugin() as any);

      (view as any).renderStoppedState();

      expect(window.document.body.textContent).toContain("OpenCode 已停止");
      expect(window.document.body.textContent).toContain("启动 OpenCode");
      expect(window.document.body.textContent).toContain("点击下面的按钮启动 OpenCode 服务器。");
    });
  });
});

function withViewDom(run: (window: Window) => void | Promise<void>): void | Promise<void> {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousMutationObserver = globalThis.MutationObserver;
  const window = new Window();
  installObsidianElementHelpers(window);
  globalThis.window = window as any;
  globalThis.document = window.document as unknown as Document;
  globalThis.MutationObserver = window.MutationObserver as unknown as typeof MutationObserver;

  const cleanup = (): void => {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.MutationObserver = previousMutationObserver;
  };

  try {
    const result = run(window);
    if (result instanceof Promise) {
      return result.finally(cleanup);
    }
    cleanup();
    return undefined;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function installObsidianElementHelpers(window: Window): void {
  const proto = window.HTMLElement.prototype as unknown as {
    addClass: (cls: string) => void;
    removeClass: (cls: string) => void;
    empty: () => void;
    createDiv: (options?: { cls?: string; text?: string }) => HTMLElement;
    createEl: (
      tag: string,
      options?: { cls?: string; text?: string; attr?: Record<string, string> }
    ) => HTMLElement;
  };
  proto.addClass = function addClass(this: HTMLElement, cls: string): void {
    this.classList.add(cls);
  };
  proto.removeClass = function removeClass(this: HTMLElement, cls: string): void {
    this.classList.remove(cls);
  };
  proto.empty = function empty(this: HTMLElement): void {
    this.replaceChildren();
  };
  proto.createDiv = function createDiv(
    this: HTMLElement,
    options: { cls?: string; text?: string } = {}
  ): HTMLElement {
    return this.createEl("div", options);
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

function fakePlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    startServer: () => {},
    getServerState: () => "stopped",
    getSettings: () => ({ webViewAppearance: "opencode" }),
    onServerStateChange: () => () => {},
    ...overrides,
  };
}
