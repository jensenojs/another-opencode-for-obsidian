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

  test("opens the side-by-side view from the panel toggle", async () => {
    const sidebarLeaf = createLeaf();
    const mainLeaf = createLeaf();
    const calls: string[] = [];
    const manager = createViewManager({
      leaves: [],
      newSidebarLeaf: sidebarLeaf,
      newMainLeaf: mainLeaf,
      settings: { ...DEFAULT_SETTINGS, defaultViewLocation: "main" },
      state: "stopped",
      onStart: () => calls.push("start"),
    });

    await manager.toggleView();

    expect(sidebarLeaf.viewState).toEqual({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });
    expect(sidebarLeaf.activated).toBe(true);
    expect(mainLeaf.viewState).toBeUndefined();
    expect(calls).toEqual(["start"]);
  });

  test("opens the deep view from the deep toggle", async () => {
    const sidebarLeaf = createLeaf();
    const mainLeaf = createLeaf();
    const calls: string[] = [];
    const manager = createViewManager({
      leaves: [],
      newSidebarLeaf: sidebarLeaf,
      newMainLeaf: mainLeaf,
      state: "stopped",
      onStart: () => calls.push("start"),
    });

    await manager.toggleDeepView();

    expect(mainLeaf.viewState).toEqual({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });
    expect(mainLeaf.activated).toBe(true);
    expect(sidebarLeaf.viewState).toBeUndefined();
    expect(calls).toEqual(["start"]);
  });

  test("switches from side-by-side to deep view", async () => {
    const rightSplit = createRightSplit();
    const sidebarLeaf = createLeaf(rightSplit);
    const mainLeaf = createLeaf();
    const manager = createViewManager({
      leaves: [sidebarLeaf],
      newMainLeaf: mainLeaf,
      rightSplit,
      activeLeaf: sidebarLeaf,
      state: "running",
      onStart: () => {},
    });

    await manager.toggleDeepView();

    expect(sidebarLeaf.detached).toBe(true);
    expect(mainLeaf.viewState).toEqual({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });
    expect(mainLeaf.activated).toBe(true);
  });

  test("switches from deep view to side-by-side view", async () => {
    const mainLeaf = createLeaf();
    const sidebarLeaf = createLeaf();
    const manager = createViewManager({
      leaves: [mainLeaf],
      newSidebarLeaf: sidebarLeaf,
      activeLeaf: mainLeaf,
      state: "running",
      onStart: () => {},
    });

    await manager.toggleView();

    expect(mainLeaf.detached).toBe(true);
    expect(sidebarLeaf.viewState).toEqual({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });
    expect(sidebarLeaf.activated).toBe(true);
  });

  test("returns from active deep view to the previous editor leaf", async () => {
    const editorLeaf = createLeaf();
    const mainLeaf = createLeaf();
    const manager = createViewManager({
      leaves: [],
      newMainLeaf: mainLeaf,
      activeLeaf: editorLeaf,
      state: "running",
      onStart: () => {},
    });

    await manager.toggleDeepView();
    await manager.toggleDeepView();

    expect(mainLeaf.detached).toBe(true);
    expect(editorLeaf.activated).toBe(true);
  });

  test("returns from deep view to the most recent content leaf after entering from active sidebar", async () => {
    const rightSplit = createRightSplit();
    const previewLeaf = createLeaf();
    const sidebarLeaf = createLeaf(rightSplit);
    const mainLeaf = createLeaf();
    const manager = createViewManager({
      leaves: [sidebarLeaf],
      newMainLeaf: mainLeaf,
      rightSplit,
      activeLeaf: sidebarLeaf,
      mostRecentLeaf: previewLeaf,
      state: "running",
      onStart: () => {},
    });

    await manager.toggleDeepView();
    await manager.toggleDeepView();

    expect(sidebarLeaf.detached).toBe(true);
    expect(mainLeaf.detached).toBe(true);
    expect(previewLeaf.activated).toBe(true);
  });
});

function createViewManager(options: {
  leaves: any[];
  newLeaf?: any;
  newMainLeaf?: any;
  newSidebarLeaf?: any;
  rightSplit?: any;
  activeLeaf?: any;
  mostRecentLeaf?: any;
  settings?: typeof DEFAULT_SETTINGS;
  state: "stopped" | "starting" | "running" | "error";
  onStart: () => void;
}): ViewManagerClass {
  const leaves = [...options.leaves];
  const rightSplit = options.rightSplit ?? createRightSplit();

  function trackLeaf(leaf: any | null | undefined): any | null {
    if (leaf && !leaves.includes(leaf)) {
      leaves.push(leaf);
    }
    return leaf ?? null;
  }

  const app = {
    workspace: {
      rightSplit,
      activeLeaf: options.activeLeaf ?? null,
      getLeavesOfType: (type: string) =>
        type === OPENCODE_VIEW_TYPE ? leaves.filter((leaf) => !leaf.detached) : [],
      revealLeaf: (leaf: any) => {
        leaf.revealed = true;
      },
      getLeaf: () => trackLeaf(options.newMainLeaf ?? options.newLeaf),
      getRightLeaf: () => trackLeaf(options.newSidebarLeaf ?? options.newLeaf),
      getMostRecentLeaf: () => options.mostRecentLeaf ?? options.activeLeaf ?? null,
      setActiveLeaf: (leaf: any) => {
        leaf.activated = true;
        app.workspace.activeLeaf = leaf;
      },
    },
  };

  return new ViewManager({
    app: app as any,
    settings: options.settings ?? DEFAULT_SETTINGS,
    client: {} as any,
    contextManager: {} as any,
    currentSession: {} as any,
    getServerState: () => options.state,
    startServer: options.onStart,
  });
}

function createRightSplit(): any {
  return {
    collapsed: false,
    collapse() {
      this.collapsed = true;
    },
  };
}

function createLeaf(root: any = {}): any {
  return {
    view: {},
    root,
    detached: false,
    getRoot() {
      return this.root;
    },
    detach() {
      this.detached = true;
    },
    setViewState: async function setViewState(viewState: unknown): Promise<void> {
      this.viewState = viewState;
    },
  };
}
