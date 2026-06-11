import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { App } from "obsidian";
import type { OpenCodeClient, OpenCodeMessage } from "../../src/client/OpenCodeClient";
import type { ContextManager as ContextManagerClass } from "../../src/context/ContextManager";
import type { OpenCodeSettings } from "../../src/types";

mock.module("obsidian", () => ({
  addIcon: () => {},
  ItemView: class ItemView {},
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
  setIcon: () => {},
}));

let ContextManager: typeof ContextManagerClass;
let MarkdownView: new (leaf: unknown) => {
  file?: { path: string };
  editor?: {
    getSelection: () => string;
    listSelections: () => Array<{ anchor: { line: number }; head: { line: number } }>;
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
    workspace: {
      on: () => ({}),
      offref: () => {},
      getLeavesOfType: () => [],
    },
  } as unknown as App;
}

function createAppWithEvents(): {
  app: App;
  handlers: Record<string, (...args: unknown[]) => void>;
} {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const app = {
    workspace: {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
        return {};
      },
      offref: () => {},
      getLeavesOfType: () => [],
    },
  } as unknown as App;

  return { app, handlers };
}

function createMarkdownView(
  path: string,
  selection: string,
  startLine: number,
  endLine: number
): any {
  const view = new MarkdownView({});
  view.file = { path };
  view.editor = {
    getSelection: () => selection,
    listSelections: () => [{ anchor: { line: startLine - 1 }, head: { line: endLine - 1 } }],
  };
  return view;
}

function createManager(client: Partial<OpenCodeClient>): ContextManagerClass {
  return new ContextManager({
    app: createApp(),
    settings: createSettings(),
    client: client as OpenCodeClient,
    getServerState: () => "running",
    getCachedIframeUrl: () => null,
    setCachedIframeUrl: () => {},
    registerEvent: () => {},
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
        resolveSessionId: () => "ses_1",
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      getCachedIframeUrl: () => "http://127.0.0.1:4097/project/session/ses_1",
      setCachedIframeUrl: () => {},
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

  test("auto-adds changed editor selection when enabled", async () => {
    const settings = createSettings();
    settings.autoAddSelectionContext = true;
    const { app, handlers } = createAppWithEvents();
    const calls: Array<{ sessionId: string; text: string }> = [];
    const manager = new ContextManager({
      app,
      settings,
      client: {
        resolveSessionId: () => "ses_1",
        addContextMessage: async (sessionId: string, text: string) => {
          calls.push({ sessionId, text });
          return { messageId: `msg_${calls.length}`, partId: `prt_${calls.length}` };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      getCachedIframeUrl: () => "http://127.0.0.1:4097/project/session/ses_1",
      setCachedIframeUrl: () => {},
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
        resolveSessionId: () => "ses_1",
        addContextMessage: async (_sessionId: string, text: string) => {
          calls.push(text);
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      getCachedIframeUrl: () => iframeUrl,
      setCachedIframeUrl: () => {},
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
        resolveSessionId: () => "ses_1",
        addContextMessage: async (_sessionId: string, text: string) => {
          calls.push(text);
          return { messageId: "msg_1", partId: "prt_1" };
        },
      } as unknown as OpenCodeClient,
      getServerState: () => "running",
      getCachedIframeUrl: () => "http://127.0.0.1:4097/project/session/ses_1",
      setCachedIframeUrl: () => {},
      registerEvent: () => {},
    });

    manager.updateSettings(settings);
    handlers["editor-change"]?.({}, createMarkdownView("note.md", "selected text", 2, 3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([]);
    expect(manager.getItems()).toEqual([]);
  });

  test("removes context only after the remote part is ignored", async () => {
    const ignored: string[] = [];
    const manager = createManager({
      addContextMessage: async () => ({ messageId: "msg_1", partId: "prt_1" }),
      ignorePart: async (sessionId, messageId, partId) => {
        ignored.push(`${sessionId}:${messageId}:${partId}`);
        return true;
      },
    });

    const item = expectItem(await manager.addManual("ses_1", "selected text", "note.md"));
    const removed = await manager.removeItem("ses_1", item.id);

    expect(removed).toBe(true);
    expect(ignored).toEqual(["ses_1:msg_1:prt_1"]);
    expect(manager.getItems()).toEqual([]);
  });

  test("keeps local context when remote ignore fails", async () => {
    const manager = createManager({
      addContextMessage: async () => ({ messageId: "msg_1", partId: "prt_1" }),
      ignorePart: async () => false,
    });

    const item = expectItem(await manager.addManual("ses_1", "selected text", "note.md"));
    const removed = await manager.removeItem("ses_1", item.id);

    expect(removed).toBe(false);
    expect(manager.getItems()).toEqual([item]);
  });

  test("replaces workspace auto context through its source file identity", async () => {
    const ignored: string[] = [];
    let messageIndex = 0;
    const manager = createManager({
      resolveSessionId: () => "ses_1",
      addContextMessage: async () => {
        messageIndex += 1;
        return { messageId: `msg_${messageIndex}`, partId: `prt_${messageIndex}` };
      },
      ignorePart: async (_sessionId, messageId, partId) => {
        ignored.push(`${messageId}:${partId}`);
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

    expect(ignored).toEqual(["msg_1:prt_1"]);
    expect(manager.getItems()).toMatchObject([
      {
        id: "msg_2:prt_2",
        type: "auto",
        text: "second",
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
          {
            id: "prt_2",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "<!-- oc-ctx -->\nignored",
            ignored: true,
          },
          {
            id: "prt_3",
            sessionID: "ses_1",
            messageID: "msg_1",
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
        createdAt: 123,
      },
    ]);
  });
});
