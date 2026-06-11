import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  ContextStatusBar as ContextStatusBarClass,
  formatContextDiagnostics as formatContextDiagnosticsFn,
} from "../../src/context/ContextStatusBar";
import type { ContextItem } from "../../src/types";

mock.module("obsidian", () => ({
  addIcon: () => {},
  ItemView: class ItemView {},
  MarkdownView: class MarkdownView {},
  Notice: class Notice {},
  setIcon: () => {},
}));

let ContextStatusBar: typeof ContextStatusBarClass;
let formatContextDiagnostics: typeof formatContextDiagnosticsFn;

beforeAll(async () => {
  ({ ContextStatusBar, formatContextDiagnostics } =
    await import("../../src/context/ContextStatusBar"));
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
      openItem: async () => {},
      removeItem: async () => true,
    });

    expect(statusEl.text).toBe("OpenCode ctx 0");
    expect(statusEl.classes.has("is-active")).toBe(false);

    callbacks[0]([manualItem]);

    expect(statusEl.text).toBe("OpenCode ctx 1");
    expect(statusEl.classes.has("is-active")).toBe(true);
    expect(statusEl.title).toBe("1 OpenCode context item");

    statusBar.destroy();

    expect(unsubscribed).toBe(true);
    expect(statusEl.removed).toBe(true);
  });

  test("formats context diagnostics without copying full context text", () => {
    const payload = JSON.parse(formatContextDiagnostics([manualItem]));

    expect(payload.itemCount).toBe(1);
    expect(payload.items[0]).toEqual({
      id: "msg_1:prt_1",
      type: "manual",
      label: "Selection",
      sourceFile: "note.md",
      startLine: null,
      endLine: null,
      messageId: "msg_1",
      partId: "prt_1",
      textLength: "selected text".length,
      createdAt: "1970-01-01T00:00:00.123Z",
    });
    expect(JSON.stringify(payload)).not.toContain("selected text");
    expect(JSON.stringify(payload)).not.toContain("sourceKey");
  });
});
