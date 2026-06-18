import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type {
  ContextStatusBar as ContextStatusBarClass,
  formatContextDiagnostics as formatContextDiagnosticsFn,
} from "../../src/context/ContextStatusBar";
import type { ContextCandidate, ContextItem } from "../../src/types";

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
  TFile: class TFile {},
  TFolder: class TFolder {},
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

class FakeStatusElement {
  text = "";
  title = "";
  removed = false;
  classes = new Set<string>();

  addClass(cls: string): void {
    this.classes.add(cls);
  }

  toggleClass(cls: string, enabled: boolean): void {
    if (enabled) {
      this.classes.add(cls);
    } else {
      this.classes.delete(cls);
    }
  }

  setText(text: string): void {
    this.text = text;
  }

  empty(): void {
    this.text = "";
  }

  addEventListener(): void {}

  remove(): void {
    this.removed = true;
  }
}

const manualItem: ContextItem = {
  id: "msg_1:prt_1",
  type: "manual",
  label: "Selection",
  text: "selected text",
  sourceFile: "note.md",
  messageId: "msg_1",
  partId: "prt_1",
  createdAt: 123,
};

const uncertainItem: ContextItem = {
  id: "msg_2:prt_2",
  type: "auto",
  label: "Workspace context",
  text: "workspace text",
  sourceFile: "Obsidian workspace",
  messageId: "msg_2",
  partId: "prt_2",
  textLength: "workspace text".length,
  provenanceStatus: "uncertain",
  createdAt: 456,
};

const missingItem: ContextItem = {
  id: "msg_3:prt_3",
  type: "manual",
  label: "Missing note",
  text: "missing text",
  sourceFile: "missing.md",
  messageId: "msg_3",
  partId: "prt_3",
  textLength: "missing text".length,
  createdAt: 789,
};

const folderItem: ContextItem = {
  id: "msg_4:prt_4",
  type: "manual",
  label: "Folder",
  text: "folder text",
  sourceFile: "folder",
  messageId: "msg_4",
  partId: "prt_4",
  textLength: "folder text".length,
  createdAt: 890,
};

const candidateItem: ContextCandidate = {
  id: "candidate:selection:latest",
  sourceId: "selection",
  sourceKind: "selection",
  identityKey: "latest",
  fingerprint: "candidate-fingerprint",
  label: "Selection candidate",
  text: "candidate content",
  sourceFile: "candidate.md",
  startLine: 7,
  endLine: 9,
  included: true,
  lifetime: "one-shot",
  status: "active",
  createdAt: 1000,
  updatedAt: 1000,
};

describe("ContextStatusBar", () => {
  test("renders the active context count from ContextManager updates", () => {
    const statusEl = new FakeStatusElement();
    const callbacks: Array<(items: ContextItem[]) => void> = [];
    let unsubscribed = false;

    const statusBar = new ContextStatusBar({
      addStatusBarItem: () => statusEl as unknown as HTMLElement,
      getItems: () => [],
      onItemsChanged: (nextCallback) => {
        callbacks.push(nextCallback);
        nextCallback([]);
        return () => {
          unsubscribed = true;
        };
      },
      resolveItem: () => ({ status: "resolved", path: "note.md", line: null }),
      openItem: async () => ({ status: "opened", path: "note.md", line: null }),
      removeItem: async () => true,
    });

    expect(statusEl.text).toBe("0");
    expect(statusEl.classes.has("is-active")).toBe(false);

    callbacks[0]([manualItem]);

    expect(statusEl.text).toBe("1");
    expect(statusEl.classes.has("is-active")).toBe(true);
    expect(statusEl.title).toBe("1 committed OpenCode context item");

    statusBar.destroy();

    expect(unsubscribed).toBe(true);
    expect(statusEl.removed).toBe(true);
  });

  test("formats context diagnostics without copying full context text", () => {
    const payload = JSON.parse(formatContextDiagnostics([manualItem]));

    expect(payload.committedCount).toBe(1);
    expect(payload.candidateCount).toBe(0);
    expect(payload.itemCount).toBe(1);
    expect(payload.candidates).toEqual([]);
    expect(payload.items[0]).toEqual({
      id: "msg_1:prt_1",
      type: "manual",
      label: "Selection",
      sourceFile: "note.md",
      navigationSourceFile: null,
      startLine: null,
      endLine: null,
      messageId: "msg_1",
      partId: "prt_1",
      textLength: "selected text".length,
      provenanceStatus: "known",
      navigation: null,
      createdAt: "1970-01-01T00:00:00.123Z",
    });
    expect(JSON.stringify(payload)).not.toContain("selected text");
    expect(JSON.stringify(payload)).not.toContain("sourceKey");
  });

  test("uses navigationSourceFile for workspace rows with a concrete vault target", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const workspaceItem: ContextItem = {
        ...uncertainItem,
        provenanceStatus: "known",
        navigationSourceFile: "0-理论/current.md",
      };
      const opened: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [workspaceItem],
        onItemsChanged: (callback) => {
          callback([workspaceItem]);
          return () => {};
        },
        resolveItem: (item) => ({
          status: "resolved",
          path: item.navigationSourceFile ?? item.sourceFile,
          line: null,
        }),
        openItem: async (item) => {
          opened.push(item.navigationSourceFile ?? item.sourceFile);
          return {
            status: "opened",
            path: item.navigationSourceFile ?? item.sourceFile,
            line: null,
          };
        },
        removeItem: async () => true,
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(window.document.body.textContent).toContain("Obsidian workspace -> 0-理论/current.md");
      const row = window.document.querySelector(".opencode-ctx-item");
      row?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(opened).toEqual(["0-理论/current.md"]);

      statusBar.destroy();
    });
  });

  test("does not call openItem for unresolved aggregate rows", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const opened: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [uncertainItem],
        onItemsChanged: (callback) => {
          callback([uncertainItem]);
          return () => {};
        },
        resolveItem: (item) => ({
          status: "unresolved",
          reason: "synthetic-source",
          sourceFile: item.sourceFile,
        }),
        openItem: async (item) => {
          opened.push(item.id);
          return { status: "unresolved", reason: "synthetic-source", sourceFile: item.sourceFile };
        },
        removeItem: async () => true,
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const row = window.document.querySelector(".opencode-ctx-item");
      row?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(opened).toEqual([]);

      statusBar.destroy();
    });
  });

  test("formats navigation resolution in diagnostics without copying full context text", () => {
    const payload = JSON.parse(
      formatContextDiagnostics([manualItem], () => ({
        status: "unresolved",
        reason: "missing-file",
        sourceFile: "note.md",
      }))
    );

    expect(payload.items[0].navigation).toEqual({
      status: "unresolved",
      reason: "missing-file",
      sourceFile: "note.md",
      subpath: null,
    });
    expect(JSON.stringify(payload)).not.toContain("selected text");
  });

  test("renders an Obsidian-native context control surface with explicit actions", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const removed: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem, uncertainItem],
        onItemsChanged: (callback) => {
          callback([manualItem, uncertainItem]);
          return () => {};
        },
        resolveItem: (item) =>
          item.sourceFile === "Obsidian workspace"
            ? {
                status: "unresolved",
                reason: "synthetic-source",
                sourceFile: item.sourceFile,
              }
            : { status: "resolved", path: item.sourceFile, line: null },
        openItem: async () => ({ status: "opened", path: "note.md", line: null }),
        removeItem: async (itemId) => {
          removed.push(itemId);
          return false;
        },
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(window.document.body.textContent).toContain("Committed");
      expect(window.document.body.textContent).not.toContain("Candidate content");
      expect(window.document.body.textContent).not.toContain(
        "GraphIndex candidates are not connected in this surface yet."
      );
      expect(window.document.body.textContent).not.toContain("provenance uncertain");
      expect(window.document.body.textContent).not.toContain("synthetic source");
      expect(window.document.body.textContent).not.toContain("chars");
      expect(window.document.querySelector(".opencode-ctx-remove")).toBeNull();
      expect(window.document.body.textContent).not.toContain("Open source");
      expect(window.document.querySelectorAll(".opencode-ctx-warning")).toHaveLength(1);

      expect(window.document.body.textContent).not.toContain("Remove from session");

      const row = window.document.querySelector(".opencode-ctx-item");
      row?.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));

      const removeButton = window.document.querySelector(".opencode-ctx-detail-action");
      expect(removeButton).toBeTruthy();
      expect(removeButton?.getAttribute("title")).toBe(
        "Remove from current OpenCode session context"
      );
      removeButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(removed).toEqual(["msg_1:prt_1"]);
      expect(window.document.body.textContent).toContain("Workspace context");
      expect(window.document.body.textContent).toContain("remove failed");

      statusBar.destroy();
    });
  });

  test("renders candidates separately from committed context without an attach action", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const removedCandidates: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem],
        onItemsChanged: (callback) => {
          callback([manualItem]);
          return () => {};
        },
        getCandidates: () => [candidateItem],
        onCandidatesChanged: (callback) => {
          callback([candidateItem]);
          return () => {};
        },
        toggleCandidate: () => null,
        removeCandidate: (candidateId) => {
          removedCandidates.push(candidateId);
          return candidateItem;
        },
        resolveItem: (item) => ({ status: "resolved", path: item.sourceFile, line: null }),
        openItem: async (item) => ({ status: "opened", path: item.sourceFile, line: null }),
        removeItem: async () => true,
      });

      expect(statusEl.textContent).toBe("1");

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(window.document.body.textContent).toContain("Next message");
      expect(window.document.body.textContent).toContain("Committed");
      expect(window.document.querySelectorAll(".opencode-ctx-candidate")).toHaveLength(1);
      expect(window.document.body.textContent).toContain("included");
      expect(window.document.body.textContent).not.toContain("Attach");
      expect(window.document.querySelector(".opencode-ctx-attach")).toBeNull();

      const removeCandidateButton = window.document.querySelector(".opencode-ctx-candidate-remove");
      removeCandidateButton?.dispatchEvent(new window.Event("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(removedCandidates).toEqual(["candidate:selection:latest"]);

      statusBar.destroy();
    });
  });

  test("warns when an included candidate failed to attach as a native OpenCode card", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [],
        onItemsChanged: (callback) => {
          callback([]);
          return () => {};
        },
        getCandidates: () => [candidateItem],
        onCandidatesChanged: (callback) => {
          callback([candidateItem]);
          return () => {};
        },
        getNativeSyncFailures: () => [
          {
            projectionId: "native:selection:latest",
            candidateId: candidateItem.id,
            key: "file:/vault/candidate.md:7:9",
            status: "failed",
            reason: "prompt context command timed out",
          },
        ],
        toggleCandidate: () => null,
        resolveItem: (item) => ({ status: "resolved", path: item.sourceFile, line: null }),
        openItem: async (item) => ({ status: "opened", path: item.sourceFile, line: null }),
        removeItem: async () => true,
      });

      expect(statusEl.textContent).toBe("1");
      expect(statusEl.classList.contains("is-warning")).toBe(true);
      expect(statusEl.title).toContain("1 OpenCode context card failed to attach");

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        window.document.querySelector(".opencode-ctx-candidate")?.classList.contains("is-failed")
      ).toBe(true);
      expect(window.document.body.textContent).toContain(
        "OpenCode card failed: prompt context command timed out"
      );
      expect(window.document.querySelectorAll(".opencode-ctx-warning")).toHaveLength(1);

      statusBar.destroy();
    });
  });

  test("candidate toggle delegates locally and does not remove committed context", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const toggled: string[] = [];
      const removed: string[] = [];
      const skippedCandidate = { ...candidateItem, included: false };
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem],
        onItemsChanged: (callback) => {
          callback([manualItem]);
          return () => {};
        },
        getCandidates: () => [skippedCandidate],
        onCandidatesChanged: (callback) => {
          callback([skippedCandidate]);
          return () => {};
        },
        toggleCandidate: (candidateId) => {
          toggled.push(candidateId);
          return { ...skippedCandidate, included: true };
        },
        resolveItem: (item) => ({ status: "resolved", path: item.sourceFile, line: null }),
        openItem: async (item) => ({ status: "opened", path: item.sourceFile, line: null }),
        removeItem: async (itemId) => {
          removed.push(itemId);
          return true;
        },
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const candidateToggle = window.document.querySelector(".opencode-ctx-candidate-toggle");
      candidateToggle?.dispatchEvent(new window.Event("click", { bubbles: true }));

      expect(toggled).toEqual(["candidate:selection:latest"]);
      expect(removed).toEqual([]);
      expect(window.document.body.textContent).toContain("Include");

      statusBar.destroy();
    });
  });

  test("renders candidate controls in the Obsidian language", async () => {
    setPluginLanguageForTests("zh-CN");
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem],
        onItemsChanged: (callback) => {
          callback([manualItem]);
          return () => {};
        },
        getCandidates: () => [candidateItem],
        onCandidatesChanged: (callback) => {
          callback([candidateItem]);
          return () => {};
        },
        toggleCandidate: () => null,
        resolveItem: (item) => ({ status: "resolved", path: item.sourceFile, line: null }),
        openItem: async (item) => ({ status: "opened", path: item.sourceFile, line: null }),
        removeItem: async () => true,
      });

      expect(statusEl.textContent).toBe("1");

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(window.document.body.textContent).toContain("下一条消息");
      expect(window.document.body.textContent).toContain("已提交");
      expect(window.document.body.textContent).toContain("已包含");
      expect(window.document.body.textContent).not.toContain("附加");
      expect(window.document.body.textContent).toContain("跳过");

      statusBar.destroy();
    });
  });

  test("formats candidate diagnostics without copying candidate text", () => {
    const payload = JSON.parse(
      formatContextDiagnostics(
        [manualItem],
        (item) => ({ status: "resolved", path: item.sourceFile, line: null }),
        [candidateItem]
      )
    );

    expect(payload.committedCount).toBe(1);
    expect(payload.candidateCount).toBe(1);
    expect(payload.candidates[0]).toMatchObject({
      id: "candidate:selection:latest",
      sourceId: "selection",
      sourceKind: "selection",
      identityKey: "latest",
      fingerprint: "candidate-fingerprint",
      label: "Selection candidate",
      sourceFile: "candidate.md",
      navigationSourceFile: null,
      startLine: 7,
      endLine: 9,
      included: true,
      lifetime: "one-shot",
      status: "active",
      statusReason: null,
      textLength: "candidate content".length,
      navigation: {
        status: "resolved",
        path: "candidate.md",
        line: null,
      },
      createdAt: "1970-01-01T00:00:01.000Z",
      updatedAt: "1970-01-01T00:00:01.000Z",
    });
    expect(JSON.stringify(payload)).not.toContain("candidate content");
    expect(JSON.stringify(payload)).not.toContain("selected text");
  });

  test("renders unresolved navigation reasons for missing files, folders, and synthetic sources", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const items = [missingItem, folderItem, uncertainItem];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => items,
        onItemsChanged: (callback) => {
          callback(items);
          return () => {};
        },
        resolveItem: (item) => {
          if (item.id === missingItem.id) {
            return { status: "unresolved", reason: "missing-file", sourceFile: item.sourceFile };
          }
          if (item.id === folderItem.id) {
            return { status: "unresolved", reason: "folder", sourceFile: item.sourceFile };
          }
          return { status: "unresolved", reason: "synthetic-source", sourceFile: item.sourceFile };
        },
        openItem: async (item) => ({
          status: "unresolved",
          reason: item.id === folderItem.id ? "folder" : "missing-file",
          sourceFile: item.sourceFile,
        }),
        removeItem: async () => true,
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(window.document.body.textContent).not.toContain(
        "missing.md does not exist in this vault"
      );
      expect(window.document.body.textContent).not.toContain("folder is a folder");
      expect(window.document.body.textContent).not.toContain("synthetic source");
      expect(window.document.querySelectorAll(".opencode-ctx-item.is-unresolved")).toHaveLength(3);
      expect(window.document.querySelectorAll(".opencode-ctx-warning")).toHaveLength(3);

      const payload = JSON.parse(
        formatContextDiagnostics(items, (item) => {
          if (item.id === missingItem.id) {
            return { status: "unresolved", reason: "missing-file", sourceFile: item.sourceFile };
          }
          if (item.id === folderItem.id) {
            return { status: "unresolved", reason: "folder", sourceFile: item.sourceFile };
          }
          return { status: "unresolved", reason: "synthetic-source", sourceFile: item.sourceFile };
        })
      );

      expect(payload.items.map((item: any) => item.navigation.reason)).toEqual([
        "missing-file",
        "folder",
        "synthetic-source",
      ]);
      expect(JSON.stringify(payload)).not.toContain("missing text");
      expect(JSON.stringify(payload)).not.toContain("folder text");
      expect(JSON.stringify(payload)).not.toContain("workspace text");

      statusBar.destroy();
    });
  });

  test("opens a source by single-clicking the compact row", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const opened: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem],
        onItemsChanged: (callback) => {
          callback([manualItem]);
          return () => {};
        },
        resolveItem: () => ({ status: "resolved", path: "note.md", line: null }),
        openItem: async (item) => {
          opened.push(item.id);
          return { status: "unresolved", reason: "missing-file", sourceFile: item.sourceFile };
        },
        removeItem: async () => true,
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const row = window.document.querySelector(".opencode-ctx-item");
      expect(row).toBeTruthy();
      expect(row?.getAttribute("role")).toBe("button");
      expect(row?.getAttribute("tabindex")).toBe("0");
      expect(row?.getAttribute("aria-expanded")).toBe("false");
      expect(window.document.body.textContent).not.toContain("Open source");

      row?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(opened).toEqual(["msg_1:prt_1"]);
      expect(window.document.querySelector(".opencode-ctx-popover")).toBeTruthy();

      statusBar.destroy();
    });
  });

  test("double-clicking a row toggles local dim state without opening the source", async () => {
    await withContextStatusBarDom(async (window) => {
      const statusEl = window.document.createElement("div");
      window.document.body.append(statusEl);
      const opened: string[] = [];
      const statusBar = new ContextStatusBar({
        addStatusBarItem: () => statusEl as unknown as HTMLElement,
        getItems: () => [manualItem],
        onItemsChanged: (callback) => {
          callback([manualItem]);
          return () => {};
        },
        resolveItem: () => ({ status: "resolved", path: "note.md", line: null }),
        openItem: async (item) => {
          opened.push(item.id);
          return { status: "opened", path: item.sourceFile, line: null };
        },
        removeItem: async () => true,
      });

      statusEl.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const row = window.document.querySelector(".opencode-ctx-item");
      expect(row).toBeTruthy();

      row?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      row?.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 220));

      expect(opened).toEqual([]);
      expect(row?.classList.contains("is-expanded")).toBe(true);
      expect(row?.getAttribute("aria-expanded")).toBe("true");
      expect(window.document.body.textContent).toContain("provenance known");
      expect(window.document.body.textContent).toContain("13 chars");

      row?.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));

      expect(row?.classList.contains("is-expanded")).toBe(false);
      expect(row?.getAttribute("aria-expanded")).toBe("false");
      expect(window.document.body.textContent).not.toContain("provenance known");
      expect(window.document.body.textContent).not.toContain("13 chars");

      statusBar.destroy();
    });
  });
});

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
