import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type {
  ContextStatusBar as ContextStatusBarClass,
  formatContextDiagnostics as formatContextDiagnosticsFn,
} from "../../src/context/ContextStatusBar";
import type { ContextCandidate } from "../../src/types";
import type { ContextNavigationResolution } from "../../src/context/ContextItemNavigator";
import type { PromptDelivery } from "../../src/context/PromptContextInjector";

mock.module("obsidian", () => ({
  addIcon: () => {},
  getLinkpath: (linktext: string) => linktext.split("#", 1)[0],
  Notice: class Notice {},
  parseLinktext: (linktext: string) => {
    const subpathIndex = linktext.indexOf("#");
    if (subpathIndex === -1) {
      return { path: linktext, subpath: "" };
    }
    return { path: linktext.slice(0, subpathIndex), subpath: linktext.slice(subpathIndex + 1) };
  },
  setIcon: () => {},
}));

let ContextStatusBar: typeof ContextStatusBarClass;
let formatContextDiagnostics: typeof formatContextDiagnosticsFn;
let setPluginLanguageForTests: (language: string | null) => void;

beforeAll(async () => {
  ({ ContextStatusBar, formatContextDiagnostics } =
    await import("../../src/context/ContextStatusBar"));
  ({ setPluginLanguageForTests } = await import("../../src/i18n"));
});

afterEach(() => {
  setPluginLanguageForTests?.(null);
});

describe("ContextStatusBar", () => {
  test("shows the included candidate count in the status label", async () => {
    await withContextStatusBarDom(async () => {
      const candidates = [candidate({ id: "a" }), candidate({ id: "b", included: false })];
      const bar = new ContextStatusBar(createDeps(candidates, document.body.createDiv()));

      bar.render();

      expect(statusLabel().textContent).toBe("1");
      expect(statusElement().title).toContain("1 of 2");
      bar.destroy();
    });
  });

  test("renders candidate rows with include, skip and remove controls", async () => {
    await withContextStatusBarDom(async () => {
      const candidates = [
        candidate({ id: "selection", included: true }),
        candidate({ id: "skipped", included: false, status: "failed", statusReason: "boom" }),
        candidate({ id: "workspace", lifetime: "dynamic", included: false }),
      ];
      const toggled: string[] = [];
      const removed: string[] = [];
      const bar = new ContextStatusBar(
        createDeps(candidates, document.body.createDiv(), { toggled, removed })
      );

      bar.render();
      statusElement().click();

      const rows = document.querySelectorAll(".opencode-ctx-candidate");
      expect(rows).toHaveLength(3);
      expect(rows[0].querySelector(".opencode-ctx-item-label")?.textContent).toBe(
        "Selection: note.md:3-5"
      );
      expect(rows[1].textContent).toContain("boom");
      expect(document.querySelectorAll(".opencode-ctx-candidate-remove")).toHaveLength(2);

      clickButton(".opencode-ctx-candidate-toggle");
      expect(toggled).toEqual(["selection"]);
      clickButton(".opencode-ctx-candidate-remove");
      expect(removed).toEqual(["selection"]);
      bar.destroy();
    });
  });

  test("renders the last prompt delivery line", async () => {
    await withContextStatusBarDom(async () => {
      const candidates = [candidate({ id: "a" })];
      const delivery: PromptDelivery = { at: 1, count: 2, labels: ["a", "b"] };
      const bar = new ContextStatusBar(
        createDeps(candidates, document.body.createDiv(), { delivery })
      );

      bar.render();
      statusElement().click();

      expect(document.querySelector(".opencode-ctx-delivery")?.textContent).toContain("2");
      bar.destroy();
    });
  });

  test("renders the empty state when no candidate is queued", async () => {
    await withContextStatusBarDom(async () => {
      const bar = new ContextStatusBar(createDeps([], document.body.createDiv()));

      bar.render();
      statusElement().click();

      expect(document.querySelector(".opencode-ctx-empty")).not.toBeNull();
      expect(document.querySelectorAll(".opencode-ctx-candidate")).toHaveLength(0);
      bar.destroy();
    });
  });

  test("marks unresolved candidates but never opens them on click", async () => {
    await withContextStatusBarDom(async () => {
      const candidates = [candidate({ id: "missing", sourceFile: "missing.md" })];
      const opened: string[] = [];
      const bar = new ContextStatusBar(
        createDeps(candidates, document.body.createDiv(), { opened })
      );

      bar.render();
      statusElement().click();

      const row = document.querySelector(".opencode-ctx-candidate")!;
      expect(row.classList.contains("is-unresolved")).toBe(true);
      (row as HTMLElement).click();
      await delay(220);
      expect(opened).toEqual([]);
      bar.destroy();
    });
  });

  test("formats diagnostics without copying candidate text", async () => {
    const candidates = [
      candidate({ id: "a", text: "secret text" }),
      candidate({ id: "b", included: false }),
    ];

    const payload = JSON.parse(formatContextDiagnostics(candidates));

    expect(payload.candidateCount).toBe(2);
    expect(payload.includedCount).toBe(1);
    expect(payload.candidates[0]).toMatchObject({
      id: "a",
      sourceKind: "selection",
      label: "Selection: note.md:3-5",
      textLength: "secret text".length,
      navigation: null,
    });
    expect(formatContextDiagnostics(candidates)).not.toContain("secret text");
    expect(payload).not.toHaveProperty("items");
    expect(payload).not.toHaveProperty("committedCount");
  });
});

function candidate(overrides: Partial<ContextCandidate>): ContextCandidate {
  return {
    id: "selection",
    sourceId: "selection",
    sourceKind: "selection",
    identityKey: "selection:1",
    fingerprint: "fp-1",
    label: "Selection: note.md:3-5",
    text: "selected text",
    sourceFile: "note.md",
    startLine: 3,
    endLine: 5,
    included: true,
    lifetime: "one-shot",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function createDeps(
  candidates: ContextCandidate[],
  statusEl: HTMLElement,
  options: {
    toggled?: string[];
    removed?: string[];
    opened?: string[];
    delivery?: PromptDelivery | null;
  } = {}
) {
  const resolveCandidate = (item: ContextCandidate): ContextNavigationResolution =>
    item.sourceFile === "missing.md"
      ? { status: "unresolved", reason: "missing-file", sourceFile: item.sourceFile }
      : { status: "resolved", path: item.sourceFile, line: 2 };

  return {
    addStatusBarItem: () => statusEl,
    getCandidates: () => candidates,
    onCandidatesChanged: () => () => {},
    toggleCandidate: (candidateId: string) => {
      options.toggled?.push(candidateId);
      return candidates.find((item) => item.id === candidateId) ?? null;
    },
    removeCandidate: (candidateId: string) => {
      options.removed?.push(candidateId);
      return candidates.find((item) => item.id === candidateId) ?? null;
    },
    getLastPromptDelivery: () => options.delivery ?? null,
    resolveCandidate,
    openCandidate: async (item: ContextCandidate) => {
      options.opened?.push(item.id);
      return { status: "opened", path: item.sourceFile, line: 2 } as const;
    },
  };
}

function statusElement(): HTMLElement {
  return document.querySelector(".opencode-ctx-status") as HTMLElement;
}

function statusLabel(): HTMLElement {
  return document.querySelector(".opencode-ctx-status-count") as HTMLElement;
}

function clickButton(selector: string): void {
  (document.querySelector(selector) as HTMLElement).click();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withContextStatusBarDom(run: (window: Window) => Promise<void>): Promise<void> {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = globalThis.navigator;
  const window = new Window();
  installObsidianElementHelpers(window);
  globalThis.window = window as any;
  globalThis.document = window.document as unknown as Document;
  globalThis.navigator = {
    clipboard: { writeText: async () => {} },
  } as unknown as Navigator;

  try {
    await run(window);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.navigator = previousNavigator;
  }
}

function installObsidianElementHelpers(window: Window): void {
  const proto = window.HTMLElement.prototype as unknown as {
    addClass: (cls: string) => void;
    toggleClass: (cls: string, enabled: boolean) => void;
    empty: () => void;
    setText: (text: string) => void;
    createDiv: (options?: { cls?: string; text?: string }) => HTMLElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLElement;
    createEl: (
      tag: string,
      options?: { cls?: string; text?: string; attr?: Record<string, string> }
    ) => HTMLElement;
  };
  proto.addClass = function addClass(this: any, cls: string): void {
    this.classList.add(cls);
  };
  proto.toggleClass = function toggleClass(this: any, cls: string, enabled: boolean): void {
    this.classList.toggle(cls, enabled);
  };
  proto.empty = function empty(this: any): void {
    this.replaceChildren();
  };
  proto.setText = function setText(this: any, text: string): void {
    this.textContent = text;
  };
  proto.createDiv = function createDiv(
    this: any,
    options: { cls?: string; text?: string } = {}
  ): HTMLElement {
    return this.createEl("div", options);
  };
  proto.createSpan = function createSpan(
    this: any,
    options: { cls?: string; text?: string } = {}
  ): HTMLElement {
    return this.createEl("span", options);
  };
  proto.createEl = function createEl(
    this: any,
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
