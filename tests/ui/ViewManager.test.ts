import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { ViewManager as ViewManagerClass } from "../../src/ui/ViewManager";
import { DEFAULT_SETTINGS, OPENCODE_VIEW_TYPE } from "../../src/types";

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

let ViewManager: typeof ViewManagerClass;

beforeAll(async () => {
  ({ ViewManager } = await import("../../src/ui/ViewManager"));
});

describe("ViewManager", () => {
  test("starts a stopped server when the user opens an existing OpenCode view", async () => {
    const leaf = createLeaf();
    const calls: string[] = [];
    const manager = createViewManager({
      leaves: [leaf],
      state: "stopped",
      onStart: () => calls.push("start"),
    });

    await manager.activateView();

    expect(calls).toEqual(["start"]);
  });

  test("does not start the server when the user reveals an already running OpenCode view", async () => {
    const leaf = createLeaf();
    const calls: string[] = [];
    const manager = createViewManager({
      leaves: [leaf],
      state: "running",
      onStart: () => calls.push("start"),
    });

    await manager.activateView();

    expect(calls).toEqual([]);
  });

  test("starts a stopped server after creating a new OpenCode view from a user action", async () => {
    const createdLeaf = createLeaf();
    const calls: string[] = [];
    const manager = createViewManager({
      leaves: [],
      newLeaf: createdLeaf,
      state: "stopped",
      onStart: () => calls.push("start"),
    });

    await manager.activateView();

    expect(createdLeaf.viewState).toEqual({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });
    expect(calls).toEqual(["start"]);
  });
});

function createViewManager(options: {
  leaves: any[];
  newLeaf?: any;
  state: "stopped" | "starting" | "running" | "error";
  onStart: () => void;
}): ViewManagerClass {
  const app = {
    workspace: {
      rightSplit: { collapsed: false },
      activeLeaf: null,
      getLeavesOfType: (type: string) => (type === OPENCODE_VIEW_TYPE ? options.leaves : []),
      revealLeaf: (leaf: any) => {
        leaf.revealed = true;
      },
      getLeaf: () => options.newLeaf ?? null,
      getRightLeaf: () => options.newLeaf ?? null,
      setActiveLeaf: (leaf: any) => {
        app.workspace.activeLeaf = leaf;
      },
    },
  };

  return new ViewManager({
    app: app as any,
    settings: DEFAULT_SETTINGS,
    client: {} as any,
    contextManager: {} as any,
    currentSession: {} as any,
    getServerState: () => options.state,
    startServer: options.onStart,
  });
}

function createLeaf(): any {
  return {
    view: {},
    getRoot: () => ({}),
    setViewState: async function setViewState(viewState: unknown): Promise<void> {
      this.viewState = viewState;
    },
  };
}
