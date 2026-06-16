import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { App } from "obsidian";
import type { OpenCodeClient, OpenCodeMessage } from "../../src/client/OpenCodeClient";
import type { ContextManager as ContextManagerClass } from "../../src/context/ContextManager";
import { CurrentContextSession } from "../../src/context/ContextSessionResolver";
import { formatContextMessageText } from "../../src/context/ContextProvenance";
import type { OpenCodeSettings } from "../../src/types";

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
    listSelections: () => Array<{ anchor: { line: number }; head: { line: number } }>;
    getCursor: () => { line: number; ch: number };
  };
};

beforeAll(async () => {
  ({ ContextManager } = await import("../../src/context/ContextManager"));
  const obsidianModule = await import("obsidian");
  MarkdownView = obsidianModule.MarkdownView as unknown as typeof MarkdownView;
});

function createSettings(): OpenCodeSettings {
  return {
    port: 14096,
    hostname: "127.0.0.1",
    autoStart: false,
    opencodePath: "opencode",
    projectDirectory: "",
    startupTimeout: 45000,
    defaultViewLocation: "sidebar",
    injectWorkspaceContext: false,
    autoAddSelectionContext: false,
    autoAddBacklinksContext: false,
    autoAddCursorContext: false,
    maxNotesInContext: 20,
    maxSelectionLength: 2000,
    customCommand: "",
    useCustomCommand: false,
    webViewAppearance: "obsidian",
    lastSessionUrl: "",
  };
}

function createApp(): App {
  return {
    metadataCache: {
      on: () => ({}),
      resolvedLinks: {},
    },
    workspace: {
      on: () => ({}),
      offref: () => {},
      getLeavesOfType: () => [],
      getActiveViewOfType: () => null,
    },
  } as unknown as App;
}

function createAppWithEvents(): {
  app: App;
  handlers: Record<string, (...args: unknown[]) => void>;
  resolvedLinks: Record<string, Record<string, number>>;
} {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const resolvedLinks: Record<string, Record<string, number>> = {};
  const app = {
    metadataCache: {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers[`metadata:${event}`] = handler;
        return {};
      },
      resolvedLinks,
    },
    workspace: {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
        return {};
      },
      offref: () => {},
      getLeavesOfType: () => [],
      getActiveViewOfType: () => null,
    },
  } as unknown as App;

  return { app, handlers, resolvedLinks };
}

function createMarkdownView(
  path: string,
  selection: string,
  startLine: number,
  endLine: number,
  cursorLine = startLine,
  cursorColumn = 1
): any {
  const view = new MarkdownView({});
  view.file = { path };
  view.editor = {
    getSelection: () => selection,
    listSelections: () => [{ anchor: { line: startLine - 1 }, head: { line: endLine - 1 } }],
    getCursor: () => ({ line: cursorLine - 1, ch: cursorColumn - 1 }),
  };
  return view;
}

function createManager(client: Partial<OpenCodeClient>): ContextManagerClass {
  return new ContextManager({
    app: createApp(),
    settings: createSettings(),
    client: {
      deleteMessage: async () => true,
      ...client,
    } as OpenCodeClient,
    getServerState: () => "running",
    currentSession: createCurrentSession(null),
    registerEvent: () => {},
  });
}

function createCurrentSession(cachedUrl: string | null): CurrentContextSession {
  return createDynamicCurrentSession(
    () => cachedUrl,
    (url) => {
      cachedUrl = url;
    }
  );
}

function createDynamicCurrentSession(
  getCachedIframeUrl: () => string | null,
  setCachedIframeUrl: (url: string | null) => void = () => {}
): CurrentContextSession {
  return new CurrentContextSession({
    getCachedIframeUrl,
    setCachedIframeUrl,
    resolveSessionId: (url) => url.match(/\/session\/([^/?#]+)/)?.[1] ?? null,
  });
}

function expectItem<T>(item: T | null): T {
  if (!item) {
    throw new Error("Expected context item");
  }
  return item;
}

describe("ContextManager", () => {
  test("adds manual context as a ContextItem after OpenCode accepts it", async () => {
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = createManager({
      addContextMessage: async (sessionId, text) => {
        calls.push({ sessionId, text });
        return { messageId: "msg_1", partId: "prt_1" };
      },
    });

    const item = expectItem(await manager.addManual("ses_1", "selected text", "note.md", 3, 5));

    expect(calls).toEqual([{ sessionId: "ses_1", text: "selected text" }]);
    expect(item).toMatchObject({
      id: "msg_1:prt_1",
      type: "manual",
      label: "note.md:3-5",
      text: "selected text",
      sourceFile: "note.md",
      startLine: 3,
      endLine: 5,
      messageId: "msg_1",
      partId: "prt_1",
    });
    expect(manager.getItems()).toEqual([item]);
  });

  test("adds selected text to the current OpenCode session", async () => {
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app: createApp(),
      settings: createSettings(),
      client: {
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    const item = await manager.addSelectionForCurrentSession("selected text", "note.md", 2, 3);

    expect(calls).toEqual([{ sessionId: "ses_1", text: "selected text" }]);
    expect(item).toMatchObject({
      label: "note.md:2-3",
      sourceFile: "note.md",
      startLine: 2,
      endLine: 3,
    });
  });

  test("adds the current note to the current OpenCode session", async () => {
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app: createApp(),
      settings: createSettings(),
      client: {
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    const item = await manager.addCurrentNoteForCurrentSession(
      "notes/current.md",
      "line 1\nline 2"
    );

    expect(calls).toEqual([{ sessionId: "ses_1", text: "line 1\nline 2" }]);
    expect(item).toMatchObject({
      type: "manual",
      label: "notes/current.md:1-2",
      text: "line 1\nline 2",
      sourceFile: "notes/current.md",
      startLine: 1,
      endLine: 2,
    });
  });

  test("does not add an empty current note", async () => {
    const calls: string[] = [];
    const manager = new ContextManager({
      app: createApp(),
      settings: createSettings(),
      client: {
        addContextMessage: async (_sessionId: string, text: string) => {
          calls.push(text);
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    const item = await manager.addCurrentNoteForCurrentSession("notes/current.md", " \n ");

    expect(item).toBeNull();
    expect(calls).toEqual([]);
    expect(manager.getItems()).toEqual([]);
  });

  test("auto-adds changed editor selection when enabled", async () => {
    const settings = createSettings();
    settings.autoAddSelectionContext = true;
    const { app, handlers } = createAppWithEvents();
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: `msg_${calls.length}`, partId: `prt_${calls.length}` };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "new selected text", 4, 4));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([
      { sessionId: "ses_1", text: "selected text" },
      { sessionId: "ses_1", text: "new selected text" },
    ]);
    expect(manager.getItems()).toMatchObject([
      { label: "note.md:2-3", text: "selected text", sourceFile: "note.md" },
      { label: "note.md:4", text: "new selected text", sourceFile: "note.md" },
    ]);
  });

  test("retries the same auto selection after a missing session", async () => {
    const settings = createSettings();
    settings.autoAddSelectionContext = true;
    const { app, handlers } = createAppWithEvents();
    const calls: string[] = [];
    let iframeUrl: string | null = null;
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async (_sessionId: string, text: string) => {
          calls.push(text);
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createDynamicCurrentSession(() => iframeUrl),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    iframeUrl = "http://127.0.0.1:4097/project/session/ses_1";
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(["selected text"]);
    expect(manager.getItems()).toMatchObject([
      { label: "note.md:2-3", text: "selected text", sourceFile: "note.md" },
    ]);
  });

  test("does not auto-add editor selection when disabled", async () => {
    const settings = createSettings();
    const { app, handlers } = createAppWithEvents();
    const calls: string[] = [];
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async (_sessionId: string, text: string) => {
          calls.push(text);
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([]);
    expect(manager.getItems()).toEqual([]);
  });

  test("auto-adds resolved backlinks for the active note when enabled", async () => {
    const settings = createSettings();
    settings.autoAddBacklinksContext = true;
    const { app, handlers, resolvedLinks } = createAppWithEvents();
    resolvedLinks["source.md"] = { "target.md": 2 };
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: `msg_${calls.length}`, partId: `prt_${calls.length}` };
        },
        deleteMessage: async () => true,
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["file-open"]?.({ path: "target.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["metadata:resolve"]?.({ path: "source.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([
      {
        sessionId: "ses_1",
        text: `<obsidian-backlinks file="target.md">
- source.md (2)
</obsidian-backlinks>`,
      },
    ]);
    expect(manager.getItems()).toMatchObject([
      {
        type: "auto",
        label: "Backlinks: target.md",
        sourceFile: "target.md",
      },
    ]);
  });

  test("keeps only one active backlink auto item", async () => {
    const settings = createSettings();
    settings.autoAddBacklinksContext = true;
    const { app, handlers, resolvedLinks } = createAppWithEvents();
    resolvedLinks["source.md"] = { "first.md": 1, "second.md": 1 };
    const deleted: string[] = [];
    let messageIndex = 0;
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async () => {
          messageIndex += 1;
          return { messageId: `msg_${messageIndex}`, partId: `prt_${messageIndex}` };
        },
        deleteMessage: async (_sessionId: string, messageId: string) => {
          deleted.push(messageId);
          return true;
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["file-open"]?.({ path: "first.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["file-open"]?.({ path: "second.md" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deleted).toEqual(["msg_1"]);
    expect(manager.getItems()).toMatchObject([
      {
        type: "auto",
        label: "Backlinks: second.md",
        sourceFile: "second.md",
      },
    ]);
  });

  test("auto-adds cursor position for the active note when enabled", async () => {
    const settings = createSettings();
    settings.autoAddCursorContext = true;
    const { app, handlers } = createAppWithEvents();
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: `msg_${calls.length}`, partId: `prt_${calls.length}` };
        },
        deleteMessage: async () => true,
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("target.md", "", 3, 3, 3, 5));
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["editor-change"]?.({}, createMarkdownView("target.md", "", 3, 3, 3, 5));
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["editor-change"]?.({}, createMarkdownView("target.md", "", 4, 4, 4, 1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([
      {
        sessionId: "ses_1",
        text: '<obsidian-cursor file="target.md" line="3" column="5" />',
      },
      {
        sessionId: "ses_1",
        text: '<obsidian-cursor file="target.md" line="4" column="1" />',
      },
    ]);
    expect(manager.getItems()).toMatchObject([
      {
        type: "auto",
        label: "Cursor: target.md:4:1",
        sourceFile: "target.md",
        startLine: 4,
        endLine: 4,
      },
    ]);
  });

  test("keeps only one active cursor auto item", async () => {
    const settings = createSettings();
    settings.autoAddCursorContext = true;
    const { app, handlers } = createAppWithEvents();
    const deleted: string[] = [];
    let messageIndex = 0;
    const manager = new ContextManager({
      app,
      settings,
      client: {
        addContextMessage: async () => {
          messageIndex += 1;
          return { messageId: `msg_${messageIndex}`, partId: `prt_${messageIndex}` };
        },
        deleteMessage: async (_sessionId: string, messageId: string) => {
          deleted.push(messageId);
          return true;
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      currentSession: createCurrentSession("http://127.0.0.1:4097/project/session/ses_1"),
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("first.md", "", 2, 2, 2, 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    handlers["editor-change"]?.({}, createMarkdownView("second.md", "", 8, 8, 8, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deleted).toEqual(["msg_1"]);
    expect(manager.getItems()).toMatchObject([
      {
        type: "auto",
        label: "Cursor: second.md:8:3",
        sourceFile: "second.md",
        startLine: 8,
        endLine: 8,
      },
    ]);
  });

  test("removes context only after the remote message is deleted", async () => {
    const deleted: string[] = [];
    const manager = createManager({
      addContextMessage: async () => ({ messageId: "msg_1", partId: "prt_1" }),
      deleteMessage: async (sessionId, messageId) => {
        deleted.push(`${sessionId}:${messageId}`);
        return true;
      },
    });

    const item = expectItem(await manager.addManual("ses_1", "selected text", "note.md"));
    const removed = await manager.removeItem("ses_1", item.id);

    expect(removed).toBe(true);
    expect(deleted).toEqual(["ses_1:msg_1"]);
    expect(manager.getItems()).toEqual([]);
  });

  test("keeps local context when remote delete fails", async () => {
    const manager = createManager({
      addContextMessage: async () => ({ messageId: "msg_1", partId: "prt_1" }),
      deleteMessage: async () => false,
    });

    const item = expectItem(await manager.addManual("ses_1", "selected text", "note.md"));
    const removed = await manager.removeItem("ses_1", item.id);

    expect(removed).toBe(false);
    expect(manager.getItems()).toEqual([item]);
  });

  test("replaces workspace auto context through its public identity", async () => {
    const deleted: string[] = [];
    let messageIndex = 0;
    const manager = createManager({
      addContextMessage: async () => {
        messageIndex += 1;
        return { messageId: `msg_${messageIndex}`, partId: `prt_${messageIndex}` };
      },
      deleteMessage: async (_sessionId: string, messageId: string) => {
        deleted.push(messageId);
        return true;
      },
    });

    await manager["addItem"]({
      sessionId: "ses_1",
      type: "auto",
      label: "Workspace context",
      text: "first",
      sourceFile: "Obsidian workspace",
    });
    await manager["addItem"]({
      sessionId: "ses_1",
      type: "auto",
      label: "Workspace context",
      text: "second",
      sourceFile: "Obsidian workspace",
    });

    expect(deleted).toEqual(["msg_1"]);
    expect(manager.getItems()).toMatchObject([
      {
        id: "msg_2:prt_2",
        type: "auto",
        text: "second",
        sourceFile: "Obsidian workspace",
      },
    ]);
  });

  test("derives workspace navigation target from selection or a single open note", () => {
    const manager = createManager({});

    expect(
      manager["getWorkspaceNavigationTarget"]({
        openNotePaths: ["a.md", "b.md"],
        selection: {
          text: "selected",
          sourcePath: "b.md",
          selectionStartLine: 3,
          selectionEndLine: 4,
        },
      })
    ).toEqual({
      navigationSourceFile: "b.md",
      startLine: 3,
      endLine: 4,
    });

    expect(
      manager["getWorkspaceNavigationTarget"]({
        openNotePaths: ["only.md"],
        selection: null,
      })
    ).toEqual({
      navigationSourceFile: "only.md",
    });

    expect(
      manager["getWorkspaceNavigationTarget"]({
        openNotePaths: ["a.md", "b.md"],
        selection: null,
      })
    ).toEqual({});
  });

  test("serializes identical workspace auto context refreshes without duplicate posts", async () => {
    const calls: string[] = [];
    let messageIndex = 0;
    let releaseFirstAdd!: () => void;
    const firstAddGate = new Promise<void>((resolve) => {
      releaseFirstAdd = resolve;
    });
    const manager = createManager({
      addContextMessage: async (_sessionId: string, text: string) => {
        calls.push(text);
        if (calls.length === 1) {
          await firstAddGate;
        }
        messageIndex += 1;
        return { messageId: `msg_${messageIndex}`, partId: `prt_${messageIndex}` };
      },
      deleteMessage: async () => true,
    });

    const first = manager["addItem"]({
      sessionId: "ses_1",
      type: "auto",
      label: "Workspace context",
      text: "same",
      sourceFile: "Obsidian workspace",
    });
    const second = manager["addItem"]({
      sessionId: "ses_1",
      type: "auto",
      label: "Workspace context",
      text: "same",
      sourceFile: "Obsidian workspace",
    });

    releaseFirstAdd();
    const [firstItem, secondItem] = await Promise.all([first, second]);

    expect(calls).toEqual(["same"]);
    expect(secondItem).toEqual(firstItem);
    expect(manager.getItems()).toHaveLength(1);
  });

  test("restores one active auto context per public identity and deletes stale messages", async () => {
    const deleted: string[] = [];
    const messages: OpenCodeMessage[] = [
      {
        info: { id: "msg_1", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_1",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: formatContextMessageText("old", {
              version: 1,
              type: "auto",
              label: "Workspace context",
              sourceFile: "Obsidian workspace",
              textLength: "old".length,
              createdAt: 100,
            }),
          },
        ],
      },
      {
        info: { id: "msg_2", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_2",
            sessionID: "ses_1",
            messageID: "msg_2",
            type: "text",
            text: formatContextMessageText("new", {
              version: 1,
              type: "auto",
              label: "Workspace context",
              sourceFile: "Obsidian workspace",
              textLength: "new".length,
              createdAt: 200,
            }),
          },
        ],
      },
    ];
    const manager = createManager({
      listSessionMessages: async () => messages,
      deleteMessage: async (_sessionId: string, messageId: string) => {
        deleted.push(messageId);
        return true;
      },
    });

    await manager.restoreFromServer("ses_1");

    expect(deleted).toEqual(["msg_1"]);
    expect(manager.getItems()).toMatchObject([
      {
        id: "msg_2:prt_2",
        type: "auto",
        label: "Workspace context",
        text: "new",
        sourceFile: "Obsidian workspace",
      },
    ]);
  });

  test("restores active plugin context messages from the server", async () => {
    const messages: OpenCodeMessage[] = [
      {
        info: { id: "msg_1", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_1",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "<!-- oc-ctx -->\nrestored",
            time: { start: 123 },
          },
        ],
      },
      {
        info: { id: "msg_2", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_2",
            sessionID: "ses_1",
            messageID: "msg_2",
            type: "text",
            text: "<!-- oc-ctx -->\nignored",
            ignored: true,
          },
        ],
      },
      {
        info: { id: "msg_3", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_3",
            sessionID: "ses_1",
            messageID: "msg_3",
            type: "text",
            text: "normal user message",
          },
        ],
      },
    ];
    const manager = createManager({
      listSessionMessages: async () => messages,
    });

    await manager.restoreFromServer("ses_1");

    expect(manager.getItems()).toEqual([
      {
        id: "msg_1:prt_1",
        type: "manual",
        label: "Restored context",
        text: "restored",
        sourceFile: "OpenCode session",
        messageId: "msg_1",
        partId: "prt_1",
        textLength: "restored".length,
        provenanceStatus: "uncertain",
        createdAt: 123,
      },
    ]);
  });
});
