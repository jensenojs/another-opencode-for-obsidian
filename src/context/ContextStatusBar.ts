import { Notice } from "obsidian";
import type { ContextItem } from "../types";
import {
  formatNavigationResolution,
  noticeContextNavigationResult,
  type ContextNavigationResolution,
  type ContextNavigationResult,
} from "./ContextItemNavigator";

interface ContextStatusBarDeps {
  addStatusBarItem: () => HTMLElement;
  getItems: () => ContextItem[];
  onItemsChanged: (callback: (items: ContextItem[]) => void) => () => void;
  resolveItem: (item: ContextItem) => ContextNavigationResolution;
  openItem: (item: ContextItem) => Promise<ContextNavigationResult>;
  removeItem: (itemId: string) => Promise<boolean>;
}

const ROW_OPEN_DELAY_MS = 180;

export class ContextStatusBar {
  private statusEl: HTMLElement;
  private popoverEl: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private removeDocumentClick: (() => void) | null = null;
  private removeKeydown: (() => void) | null = null;
  private selectedItemIds = new Set<string>();
  private pendingOpenTimers = new Map<string, number>();

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
    this.clearPendingOpenTimers();
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
    const headerEl = this.popoverEl.createDiv({ cls: "opencode-ctx-popover-header" });
    headerEl.createDiv({
      cls: "opencode-ctx-popover-title",
      text: `OpenCode context (${items.length})`,
    });
    const copyButton = headerEl.createEl("button", {
      cls: "opencode-ctx-copy",
      text: "Copy diagnostics",
      attr: { type: "button" },
    });
    copyButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await navigator.clipboard.writeText(
        formatContextDiagnostics(items, (item) => this.deps.resolveItem(item))
      );
      new Notice("OpenCode context diagnostics copied");
    });

    this.renderCurrentContextSection(items);
  }

  private renderCurrentContextSection(items: ContextItem[]): void {
    if (!this.popoverEl) {
      return;
    }

    const sectionEl = this.popoverEl.createDiv({ cls: "opencode-ctx-section" });
    const sectionHeaderEl = sectionEl.createDiv({ cls: "opencode-ctx-section-header" });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-title",
      text: "Current session context",
    });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-count",
      text: `${items.length}`,
    });

    if (items.length === 0) {
      sectionEl.createDiv({
        cls: "opencode-ctx-empty",
        text: "No active context",
      });
      return;
    }

    const listEl = sectionEl.createDiv({ cls: "opencode-ctx-list" });
    this.pruneRowState(items);
    for (const item of items) {
      const rowEl = listEl.createDiv({ cls: "opencode-ctx-item" });
      const resolution = this.deps.resolveItem(item);
      rowEl.toggleClass("is-unresolved", resolution.status === "unresolved");
      rowEl.toggleClass("is-selected", this.selectedItemIds.has(item.id));
      rowEl.setAttribute("role", "button");
      rowEl.setAttribute("tabindex", "0");
      rowEl.setAttribute("aria-pressed", String(this.selectedItemIds.has(item.id)));
      rowEl.title = formatNavigationResolution(resolution);
      rowEl.addEventListener("click", (event) => {
        event.preventDefault();
        this.scheduleOpenItem(item, resolution);
      });
      rowEl.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.clearPendingOpenTimer(item.id);
        this.toggleRowSelection(item, resolution, rowEl);
      });
      rowEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        this.scheduleOpenItem(item, resolution);
      });

      const bodyEl = rowEl.createDiv({ cls: "opencode-ctx-item-body" });
      bodyEl.createDiv({ cls: "opencode-ctx-item-label", text: item.label });
      bodyEl.createDiv({ cls: "opencode-ctx-item-source", text: this.formatSource(item) });
      if (this.selectedItemIds.has(item.id)) {
        this.renderRowDetails(bodyEl, item, resolution);
      }

      if (resolution.status === "unresolved") {
        rowEl.createSpan({
          cls: "opencode-ctx-warning",
          text: "!",
        });
      }

      const actionsEl = rowEl.createDiv({ cls: "opencode-ctx-item-actions" });
      const removeButton = actionsEl.createEl("button", {
        cls: "opencode-ctx-action",
        text: "Remove",
        attr: { type: "button", title: "Remove from current OpenCode session context" },
      });
      removeButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeButton.disabled = true;
        const removed = await this.deps.removeItem(item.id);
        if (!removed) {
          removeButton.disabled = false;
          new Notice("OpenCode context was not removed. The remote message was not deleted.");
        }
      });
    }
  }

  private scheduleOpenItem(item: ContextItem, resolution: ContextNavigationResolution): void {
    if (resolution.status !== "resolved") {
      return;
    }
    this.clearPendingOpenTimer(item.id);
    const timer = window.setTimeout(() => {
      this.pendingOpenTimers.delete(item.id);
      void this.openItem(item);
    }, ROW_OPEN_DELAY_MS);
    this.pendingOpenTimers.set(item.id, timer);
  }

  private async openItem(item: ContextItem): Promise<void> {
    const result = await this.deps.openItem(item);
    noticeContextNavigationResult(result);
    if (result.status === "opened") {
      this.hidePopover();
    }
  }

  private toggleRowSelection(
    item: ContextItem,
    resolution: ContextNavigationResolution,
    rowEl: HTMLElement
  ): void {
    const itemId = item.id;
    const selected = !this.selectedItemIds.has(itemId);
    if (selected) {
      this.selectedItemIds.add(itemId);
    } else {
      this.selectedItemIds.delete(itemId);
    }
    rowEl.toggleClass("is-selected", selected);
    rowEl.setAttribute("aria-pressed", String(selected));
    const bodyEl = rowEl.querySelector(".opencode-ctx-item-body");
    bodyEl?.querySelector(".opencode-ctx-item-details")?.remove();
    if (selected && bodyEl) {
      this.renderRowDetails(bodyEl as HTMLElement, item, resolution);
    }
  }

  private pruneRowState(items: ContextItem[]): void {
    const itemIds = new Set(items.map((item) => item.id));
    for (const itemId of this.selectedItemIds) {
      if (!itemIds.has(itemId)) {
        this.selectedItemIds.delete(itemId);
      }
    }
    for (const itemId of this.pendingOpenTimers.keys()) {
      if (!itemIds.has(itemId)) {
        this.clearPendingOpenTimer(itemId);
      }
    }
  }

  private clearPendingOpenTimer(itemId: string): void {
    const timer = this.pendingOpenTimers.get(itemId);
    if (timer === undefined) {
      return;
    }
    window.clearTimeout(timer);
    this.pendingOpenTimers.delete(itemId);
  }

  private clearPendingOpenTimers(): void {
    for (const timer of this.pendingOpenTimers.values()) {
      window.clearTimeout(timer);
    }
    this.pendingOpenTimers.clear();
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
    const sourceFile = item.navigationSourceFile ?? item.sourceFile;
    const formattedSource = this.formatSourceRange(sourceFile, item.startLine, item.endLine);
    if (item.navigationSourceFile && item.navigationSourceFile !== item.sourceFile) {
      return `${item.sourceFile} -> ${formattedSource}`;
    }
    return formattedSource;
  }

  private formatSourceRange(
    sourceFile: string,
    startLine: number | undefined,
    endLine: number | undefined
  ): string {
    if (startLine === undefined || endLine === undefined) {
      return sourceFile;
    }
    if (startLine === endLine) {
      return `${sourceFile}:${startLine}`;
    }
    return `${sourceFile}:${startLine}-${endLine}`;
  }

  private renderRowDetails(
    bodyEl: HTMLElement,
    item: ContextItem,
    resolution: ContextNavigationResolution
  ): void {
    const detailsEl = bodyEl.createDiv({ cls: "opencode-ctx-item-details" });
    detailsEl.createSpan({ cls: "opencode-ctx-pill", text: item.type });
    detailsEl.createSpan({
      cls:
        item.provenanceStatus === "uncertain"
          ? "opencode-ctx-pill is-warning"
          : "opencode-ctx-pill",
      text: `provenance ${item.provenanceStatus ?? "known"}`,
    });
    detailsEl.createSpan({
      cls: resolution.status === "resolved" ? "opencode-ctx-pill" : "opencode-ctx-pill is-warning",
      text: formatNavigationResolution(resolution),
    });
    detailsEl.createSpan({
      cls: "opencode-ctx-pill",
      text: `${item.textLength ?? item.text.length} chars`,
    });
    detailsEl.createSpan({
      cls: "opencode-ctx-pill",
      text: new Date(item.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }
}

export function formatContextDiagnostics(
  items: ContextItem[],
  resolveItem?: (item: ContextItem) => ContextNavigationResolution
): string {
  return JSON.stringify(
    {
      itemCount: items.length,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        label: item.label,
        sourceFile: item.sourceFile,
        navigationSourceFile: item.navigationSourceFile ?? null,
        startLine: item.startLine ?? null,
        endLine: item.endLine ?? null,
        messageId: item.messageId ?? null,
        partId: item.partId ?? null,
        textLength: item.textLength ?? item.text.length,
        provenanceStatus: item.provenanceStatus ?? "known",
        navigation: resolveItem ? serializeNavigationResolution(resolveItem(item)) : null,
        createdAt: new Date(item.createdAt).toISOString(),
      })),
    },
    null,
    2
  );
}

function serializeNavigationResolution(
  resolution: ContextNavigationResolution
): Record<string, unknown> {
  if (resolution.status === "resolved") {
    return {
      status: resolution.status,
      path: resolution.path,
      line: resolution.line,
    };
  }

  return {
    status: resolution.status,
    reason: resolution.reason,
    sourceFile: resolution.sourceFile,
    subpath: resolution.subpath ?? null,
  };
}
