import { beforeAll, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { App } from "obsidian";
import type { ContextManager as ContextManagerClass } from "../../src/context/ContextManager";
import { CurrentContextSession } from "../../src/context/ContextSessionResolver";
import { DEFAULT_SETTINGS, OPENCODE_VIEW_TYPE, type OpenCodeSettings } from "../../src/types";

mock.module("obsidian", () => ({
  addIcon: () => {},
  getLinkpath: (linktext: string) => linktext.split("#", 1)[0],
  ItemView: class ItemView {},
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
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
}));

let ContextManager: typeof ContextManagerClass;
let MarkdownView: new (leaf: unknown) => {
  file?: { path: string };
  editor?: {
    getSelection: () => string;
    listSelections: () => Array<{
      anchor: { line: number; ch?: number };
      head: { line: number; ch?: number };
    }>;
    getCursor: () => { line: number; ch: number };
  };
};

beforeAll(async () => {
  ({ ContextManager } = await import("../../src/context/ContextManager"));
  const obsidianModule = await import("obsidian");
  MarkdownView = obsidianModule.MarkdownView as unknown as typeof MarkdownView;
});

describe("ContextManager", () => {
  test("editor selection events create one-shot candidates with bounded FIFO eviction", async () => {
    const { app, handlers } = createAppWithEvents();
    const settings = createSettings();
    settings.contextAssist.selection.maxSnippets = 1;
    const manager = createManager({ app, settings });
    manager.updateSettings(settings);

    handlers["editor-change"]?.(null, createMarkdownView("first.md", "first", 1, 1));
    await tick();
    handlers["editor-change"]?.(null, createMarkdownView("second.md", "second", 2, 2));
    await tick();

    expect(manager.getCandidates()).toMatchObject([
      {
        sourceId: "selection",
        sourceKind: "selection",
        label: "Selection: second.md:2",
        text: "second",
        lifetime: "one-shot",
        included: true,
      },
    ]);
  });

  test("document selection changes poll the active Markdown selection", async () => {
    await withContextManagerDom(async (window) => {
      const activeView = createMarkdownView("active.md", "selected from editor", 4, 6);
      const { app } = createAppWithEvents({ activeMarkdownView: activeView });
      const settings = createSettings();
      const manager = createManager({ app, settings });
      manager.updateSettings(settings);

      document.dispatchEvent(new window.Event("selectionchange") as unknown as Event);
      await delay(160);

      expect(manager.getCandidates()).toMatchObject([
        {
          sourceId: "selection",
          sourceKind: "selection",
          label: "Selection: active.md:4-6",
          text: "selected from editor",
          lifetime: "one-shot",
          included: true,
        },
      ]);

      const disabled = createSettings();
      disabled.contextAssist.selection.enabled = false;
      manager.updateSettings(disabled);
    });
  });

  test("collapsed cursor ranges do not become one-shot selection candidates", async () => {
    await withContextManagerDom(async (window) => {
      const activeView = createMarkdownView("active.md", "stale selected text", 6, 6, 6, true);
      const { app } = createAppWithEvents({ activeMarkdownView: activeView });
      const settings = createSettings();
      const manager = createManager({ app, settings });
      manager.updateSettings(settings);

      document.dispatchEvent(new window.Event("selectionchange") as unknown as Event);
      await delay(160);

      expect(manager.getCandidates()).toEqual([]);
    });
  });

  test("collapsed cursor ranges keep queued selected ranges and refresh workspace active location", async () => {
    await withContextManagerDom(async (window) => {
      const activeView = createMarkdownView("note.md", "selected", 1, 1, 1);
      const { app, handlers } = createAppWithEvents({
        activeLeaf: createOpenCodeLeaf(),
        activeMarkdownView: activeView,
        markdownLeaves: [{ view: activeView }],
      });
      const settings = createSettings();
      const manager = createManager({ app, settings });
      manager.updateSettings(settings);

      handlers["editor-change"]?.(null, activeView);
      await tick();
      expect(manager.getCandidates()).toMatchObject([
        {
          sourceId: "selection",
          sourceKind: "selection",
          text: "selected",
        },
      ]);

      activeView.editor = createMarkdownView("note.md", "", 9, 9, 9, true).editor;
      document.dispatchEvent(new window.Event("selectionchange") as unknown as Event);
      await delay(160);

      expect(manager.getCandidates()).toMatchObject([
        {
          sourceId: "selection",
          sourceKind: "selection",
          text: "selected",
          lifetime: "one-shot",
        },
        {
          sourceId: "workspace",
          sourceKind: "workspace",
          identityKey: "current",
          navigationSourceFile: "note.md",
          startLine: 9,
          endLine: 9,
          lifetime: "dynamic",
        },
      ]);

      const disabled = createSettings();
      disabled.contextAssist.enabled = false;
      manager.updateSettings(disabled);
    });
  });

  test("selection polling stops when the selection source is disabled", async () => {
    await withContextManagerDom(async (window) => {
      const activeView = createMarkdownView("active.md", "selected from editor", 4, 6);
      const { app } = createAppWithEvents({ activeMarkdownView: activeView });
      const settings = createSettings();
      settings.contextAssist.selection.enabled = false;
      const manager = createManager({ app, settings });
      manager.updateSettings(settings);

      document.dispatchEvent(new window.Event("selectionchange") as unknown as Event);
      await delay(160);

      expect(manager.getCandidates()).toEqual([]);
    });
  });

  test("workspace refresh creates a dynamic candidate with active location", async () => {
    const activeView = createMarkdownView("active.md", "", 8, 8, 8);
    const app = createApp({
      activeMarkdownView: activeView,
      markdownLeaves: [
        { view: createMarkdownView("a.md", "", 1, 1) },
        { view: createMarkdownView("b.md", "", 1, 1) },
      ],
      activeLeaf: createOpenCodeLeaf(),
    });
    const manager = createManager({ app });

    await manager.refreshVisibleOpenCodeContext();

    expect(manager.getCandidates()).toMatchObject([
      {
        sourceId: "workspace",
        sourceKind: "workspace",
        identityKey: "current",
        lifetime: "dynamic",
        included: true,
        navigationSourceFile: "active.md",
        startLine: 8,
        endLine: 8,
      },
    ]);
    expect(manager.getCandidates()[0].text).toContain("Active: active.md:L8");
    expect(manager.getCandidates()[0].text).toContain("- a.md");
    expect(manager.getCandidates()[0].text).toContain("- b.md");
  });

  test("disabled sources clear their candidates and stop maintaining source state", async () => {
    const { app, handlers } = createAppWithEvents();
    const settings = createSettings();
    const manager = createManager({ app, settings });
    manager.updateSettings(settings);

    handlers["editor-change"]?.(null, createMarkdownView("note.md", "selected", 1, 1));
    await tick();
    expect(manager.getCandidates()).toHaveLength(1);

    const disabled = createSettings();
    disabled.contextAssist.selection.enabled = false;
    manager.updateSettings(disabled);

    expect(manager.getCandidates()).toEqual([]);
    handlers["editor-change"]?.(null, createMarkdownView("note.md", "new", 1, 1));
    await tick();
    expect(manager.getCandidates()).toEqual([]);
  });

  test("preparePromptContext turns included candidates into prompt file attachments", () => {
    const manager = createManager({});
    const candidateRegistry = (manager as any).candidateRegistry;
    candidateRegistry.setSession("ses_1");
    candidateRegistry.upsert({
      id: "selection",
      sourceId: "selection",
      sourceKind: "selection",
      identityKey: "selection",
      fingerprint: "fp",
      label: "Selection",
      text: "selected",
      sourceFile: "note.md",
      included: true,
      lifetime: "one-shot",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });

    const plan = manager.preparePromptContext("ses_1", { text: "user prompt" });
    const body = plan?.requestBody as {
      text: string;
      files: Array<{ uri: string; name: string }>;
    };

    expect(body.text).toBe("user prompt");
    expect(body.files.map((file) => file.name)).toEqual(["obsidian-context:selection:Selection"]);
    expect(Buffer.from(body.files[0].uri.split(",")[1], "base64").toString("utf8")).toBe(
      "Obsidian context: Selection\nSource: note.md\n\nselected"
    );
  });

  test("includeSelection queues an explicit selection candidate", () => {
    const manager = createManager({});

    const candidate = manager.includeSelection({
      text: "picked text",
      sourcePath: "note.md",
      selectionStartLine: 4,
      selectionEndLine: 6,
    });

    expect(candidate).toMatchObject({
      sourceId: "selection",
      sourceKind: "selection",
      label: "Selection: note.md:4-6",
      text: "picked text",
      startLine: 4,
      endLine: 6,
      included: true,
      lifetime: "one-shot",
    });
  });

  test("includeNote queues a one-shot manual candidate and rejects empty notes", () => {
    const manager = createManager({});

    expect(manager.includeNote({ path: "note.md", text: "   " })).toBeNull();

    const candidate = manager.includeNote({ path: "note.md", text: "line one\nline two" });

    expect(candidate).toMatchObject({
      sourceId: "manual",
      sourceKind: "manual",
      identityKey: "note:note.md",
      label: "note.md",
      startLine: 1,
      endLine: 2,
      lifetime: "one-shot",
    });
  });
});

function createSettings(): OpenCodeSettings {
  return {
    ...DEFAULT_SETTINGS,
    contextAssist: {
      enabled: true,
      workspace: {
        enabled: true,
        maxOpenNotes: 3,
        includeActiveLocation: true,
      },
      selection: {
        enabled: true,
        maxSnippets: 3,
        maxCharsPerSnippet: 500,
      },
    },
  };
}

function createManager(options: { app?: App; settings?: OpenCodeSettings }): ContextManagerClass {
  return new ContextManager({
    app: options.app ?? createApp(),
    settings: options.settings ?? createSettings(),
    getServiceState: () => "attached",
    currentSession: createCurrentSession("http://127.0.0.1/session/ses_1"),
    registerEvent: () => {},
  });
}

function createCurrentSession(cachedUrl: string | null): CurrentContextSession {
  return new CurrentContextSession({
    getCachedIframeUrl: () => cachedUrl,
    setCachedIframeUrl: (url) => {
      cachedUrl = url;
    },
    resolveSessionId: (url) => url.match(/\/session\/([^/?#]+)/)?.[1] ?? null,
  });
}

function createApp(
  params: {
    activeLeaf?: any;
    markdownLeaves?: Array<{ view: any }>;
    activeMarkdownView?: any;
  } = {}
): App {
  return {
    metadataCache: {
      on: () => ({}),
      resolvedLinks: {},
    },
    workspace: {
      activeLeaf: params.activeLeaf ?? null,
      rightSplit: { collapsed: false },
      on: () => ({}),
      offref: () => {},
      getLeavesOfType: (type: string) => (type === "markdown" ? (params.markdownLeaves ?? []) : []),
      getActiveViewOfType: () => params.activeMarkdownView ?? null,
    },
  } as unknown as App;
}

function createAppWithEvents(params: Parameters<typeof createApp>[0] = {}): {
  app: App;
  handlers: Record<string, (...args: unknown[]) => void>;
} {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const app = createApp(params);
  (app.workspace as any).on = (event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler;
    return {};
  };
  return { app, handlers };
}

function createMarkdownView(
  path: string,
  selection: string,
  startLine: number,
  endLine: number,
  cursorLine = startLine,
  collapsedSelection = false
): any {
  const view = new MarkdownView({});
  view.file = { path };
  view.editor = {
    getSelection: () => selection,
    listSelections: () => [
      {
        anchor: { line: startLine - 1, ch: 0 },
        head: { line: endLine - 1, ch: collapsedSelection ? 0 : Math.max(1, selection.length) },
      },
    ],
    getCursor: () => ({ line: cursorLine - 1, ch: 0 }),
  };
  return view;
}

function createOpenCodeLeaf(): any {
  return {
    view: {
      getViewType: () => OPENCODE_VIEW_TYPE,
      getIframeUrl: () => "http://127.0.0.1/session/ses_1",
    },
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withContextManagerDom(run: (window: Window) => Promise<void>): Promise<void> {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const window = new Window();
  globalThis.window = window as any;
  globalThis.document = window.document as unknown as Document;

  try {
    await run(window);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
}
