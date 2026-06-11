import { setIcon } from "obsidian";
import type { ContextItem } from "../types";

interface ContextStatusBarDeps {
  addStatusBarItem: () => HTMLElement;
  getItems: () => ContextItem[];
  onItemsChanged: (callback: (items: ContextItem[]) => void) => () => void;
  openItem: (item: ContextItem) => Promise<void>;
  removeItem: (itemId: string) => Promise<boolean>;
}

export class ContextStatusBar {
  private statusEl: HTMLElement;
  private popoverEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private removeDocumentClick: (() => void) | null = null;
  private removeKeydown: (() => void) | null = null;

  constructor(private deps: ContextStatusBarDeps) {
    this.statusEl = deps.addStatusBarItem();
    this.statusEl.addClass("opencode-ctx-status");
    this.statusEl.addEventListener("click", (event) => {
      event.preventDefault();
      this.togglePopover();
    });
    this.unsubscribe = deps.onItemsChanged((items) => this.render(items));
  }

  render(items: ContextItem[] = this.deps.getItems()): void {
    this.statusEl.empty();
    this.statusEl.toggleClass("is-active", items.length > 0);
    this.statusEl.setText(`OpenCode ctx ${items.length}`);
    this.statusEl.title = `${items.length} OpenCode context item${items.length === 1 ? "" : "s"}`;
    if (this.popoverEl) {
      this.renderPopover(items);
    }
  }

  destroy(): void {
    this.hidePopover();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.statusEl.remove();
  }

  private togglePopover(): void {
    if (this.popoverEl) {
      this.hidePopover();
      return;
    }
    this.showPopover();
  }

  private showPopover(): void {
    this.popoverEl = document.body.createDiv({ cls: "opencode-ctx-popover" });
    this.positionPopover();
    this.renderPopover(this.deps.getItems());

    const handleDocumentClick = (event: MouseEvent): void => {
      const target = event.target;
      if (
        target instanceof Node &&
        (this.statusEl.contains(target) || this.popoverEl?.contains(target))
      ) {
        return;
      }
      this.hidePopover();
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        this.hidePopover();
      }
    };

    window.setTimeout(() => {
      document.addEventListener("click", handleDocumentClick, true);
      window.addEventListener("keydown", handleKeydown, true);
      this.removeDocumentClick = () =>
        document.removeEventListener("click", handleDocumentClick, true);
      this.removeKeydown = () => window.removeEventListener("keydown", handleKeydown, true);
    }, 0);
  }

  private hidePopover(): void {
    this.removeDocumentClick?.();
    this.removeKeydown?.();
    this.removeDocumentClick = null;
    this.removeKeydown = null;
    this.popoverEl?.remove();
    this.popoverEl = null;
  }

  private renderPopover(items: ContextItem[]): void {
    if (!this.popoverEl) {
      return;
    }

    this.popoverEl.empty();
    this.popoverEl.createDiv({
      cls: "opencode-ctx-popover-title",
      text: `OpenCode context (${items.length})`,
    });

    if (items.length === 0) {
      this.popoverEl.createDiv({
        cls: "opencode-ctx-empty",
        text: "No active context",
      });
      return;
    }

    const listEl = this.popoverEl.createDiv({ cls: "opencode-ctx-list" });
    for (const item of items) {
      const rowEl = listEl.createDiv({ cls: "opencode-ctx-item" });
      const bodyEl = rowEl.createEl("button", {
        cls: "opencode-ctx-item-body",
        attr: { type: "button" },
      });
      bodyEl.createDiv({ cls: "opencode-ctx-item-label", text: item.label });
      bodyEl.createDiv({ cls: "opencode-ctx-item-source", text: this.formatSource(item) });
      bodyEl.addEventListener("click", async (event) => {
        event.preventDefault();
        await this.deps.openItem(item);
        this.hidePopover();
      });

      const removeButton = rowEl.createEl("button", {
        cls: "opencode-ctx-remove",
        attr: { type: "button", "aria-label": `Remove ${item.label}` },
      });
      setIcon(removeButton, "x");
      removeButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeButton.disabled = true;
        const removed = await this.deps.removeItem(item.id);
        if (!removed) {
          removeButton.disabled = false;
        }
      });
    }
  }

  private positionPopover(): void {
    if (!this.popoverEl) {
      return;
    }

    const rect = this.statusEl.getBoundingClientRect();
    const width = 320;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    this.popoverEl.style.width = `${width}px`;
  }

  private formatSource(item: ContextItem): string {
    if (item.startLine === undefined || item.endLine === undefined) {
      return item.sourceFile;
    }
    if (item.startLine === item.endLine) {
      return `${item.sourceFile}:${item.startLine}`;
    }
    return `${item.sourceFile}:${item.startLine}-${item.endLine}`;
  }
}
