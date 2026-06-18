import { Notice, setIcon } from "obsidian";
import type { ContextCandidate, ContextItem } from "../types";
import {
  formatNavigationResolution,
  noticeContextNavigationResult,
  type ContextNavigationSource,
  type ContextNavigationResolution,
  type ContextNavigationResult,
} from "./ContextItemNavigator";
import { getText } from "../i18n";
import { OPENCODE_ICON_NAME } from "../icons";
import type { PromptContextProjectionFailure } from "./PromptContextProjection";

interface ContextStatusBarDeps {
  addStatusBarItem: () => HTMLElement;
  getItems: () => ContextItem[];
  onItemsChanged: (callback: (items: ContextItem[]) => void) => () => void;
  getCandidates?: () => ContextCandidate[];
  onCandidatesChanged?: (callback: (items: ContextCandidate[]) => void) => () => void;
  getProjectionFailures?: () => PromptContextProjectionFailure[];
  toggleCandidate?: (candidateId: string) => ContextCandidate | null;
  removeCandidate?: (candidateId: string) => ContextCandidate | null;
  resolveItem: (item: ContextStatusBarSource) => ContextNavigationResolution;
  openItem: (item: ContextStatusBarSource) => Promise<ContextNavigationResult>;
  removeItem: (itemId: string) => Promise<boolean>;
}

const ROW_OPEN_DELAY_MS = 180;
type ContextStatusBarSource = ContextNavigationSource & { id: string };

export class ContextStatusBar {
  private statusEl: HTMLElement;
  private popoverEl: HTMLElement | null = null;
  private unsubscribeItems: (() => void) | null = null;
  private unsubscribeCandidates: (() => void) | null = null;
  private removeDocumentClick: (() => void) | null = null;
  private removeKeydown: (() => void) | null = null;
  private expandedItemIds = new Set<string>();
  private pendingOpenTimers = new Map<string, number>();
  private removeFailures = new Map<string, string>();

  constructor(private deps: ContextStatusBarDeps) {
    this.statusEl = deps.addStatusBarItem();
    this.statusEl.addClass("opencode-ctx-status");
    this.statusEl.parentElement?.prepend(this.statusEl);
    this.statusEl.addEventListener("click", (event) => {
      event.preventDefault();
      this.togglePopover();
    });
    this.unsubscribeItems = deps.onItemsChanged((items) =>
      this.render(items, this.getCandidates())
    );
    this.unsubscribeCandidates =
      deps.onCandidatesChanged?.((candidates) => this.render(this.deps.getItems(), candidates)) ??
      null;
  }

  render(items: ContextItem[] = this.deps.getItems(), candidates = this.getCandidates()): void {
    const text = getText();
    const total = items.length + candidates.length;
    const includedCandidates = candidates.filter((candidate) => candidate.included).length;
    const statusCount = candidates.length > 0 ? includedCandidates : items.length;
    this.statusEl.empty();
    this.statusEl.toggleClass("is-active", total > 0);
    this.renderStatusLabel(text.context.statusText(statusCount));
    this.statusEl.title = text.context.statusTitle(
      includedCandidates,
      candidates.length,
      items.length
    );
    if (this.popoverEl) {
      this.renderPopover(items, candidates);
    }
  }

  destroy(): void {
    this.hidePopover();
    this.clearPendingOpenTimers();
    this.unsubscribeItems?.();
    this.unsubscribeCandidates?.();
    this.unsubscribeItems = null;
    this.unsubscribeCandidates = null;
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
    this.renderPopover(this.deps.getItems(), this.getCandidates());

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

  private renderPopover(items: ContextItem[], candidates: ContextCandidate[]): void {
    if (!this.popoverEl) {
      return;
    }

    const text = getText();
    this.popoverEl.empty();
    const headerEl = this.popoverEl.createDiv({ cls: "opencode-ctx-popover-header" });
    const brandEl = headerEl.createDiv({ cls: "opencode-ctx-popover-brand" });
    const brandIconEl = brandEl.createSpan({
      cls: "opencode-ctx-popover-icon",
      attr: { "aria-hidden": "true" },
    });
    setIcon(brandIconEl, OPENCODE_ICON_NAME);
    brandEl.createDiv({
      cls: "opencode-ctx-popover-title",
      text: text.context.popoverTitle(items.length, candidates.length),
    });
    const copyButton = headerEl.createEl("button", {
      cls: "opencode-ctx-copy",
      text: text.context.copyDiagnostics,
      attr: { type: "button" },
    });
    copyButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await navigator.clipboard.writeText(
        formatContextDiagnostics(items, (item) => this.deps.resolveItem(item), candidates)
      );
      new Notice(text.notices.contextDiagnosticsCopied);
    });

    this.pruneRowState([...items, ...candidates]);
    this.renderCandidateSection(candidates);
    this.renderCurrentContextSection(items);
  }

  private renderCandidateSection(candidates: ContextCandidate[]): void {
    if (!this.popoverEl || candidates.length === 0) {
      return;
    }

    const sectionEl = this.popoverEl.createDiv({
      cls: "opencode-ctx-section opencode-ctx-candidate-section",
    });
    const sectionHeaderEl = sectionEl.createDiv({ cls: "opencode-ctx-section-header" });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-title",
      text: getText().context.nextMessageIncludes,
    });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-count",
      text: `${candidates.filter((candidate) => candidate.included).length}/${candidates.length}`,
    });
    const listEl = sectionEl.createDiv({ cls: "opencode-ctx-list" });
    const failures = new Map(
      (this.deps.getProjectionFailures?.() ?? []).map((failure) => [failure.candidateId, failure])
    );
    for (const candidate of candidates) {
      this.renderCandidateRow(listEl, candidate, failures.get(candidate.id));
    }
  }

  private renderCandidateRow(
    listEl: HTMLElement,
    candidate: ContextCandidate,
    projectionFailure?: PromptContextProjectionFailure
  ): void {
    const rowEl = listEl.createDiv({ cls: "opencode-ctx-item opencode-ctx-candidate" });
    const resolution = this.deps.resolveItem(candidate);
    rowEl.toggleClass("is-unresolved", resolution.status === "unresolved");
    rowEl.toggleClass("is-excluded", !candidate.included);
    rowEl.toggleClass("is-failed", candidate.status === "failed");
    rowEl.setAttribute("role", "button");
    rowEl.setAttribute("tabindex", "0");
    rowEl.setAttribute("aria-pressed", String(candidate.included));
    rowEl.title = formatNavigationResolution(resolution);
    rowEl.addEventListener("click", (event) => {
      event.preventDefault();
      this.scheduleOpenItem(candidate, resolution);
    });
    rowEl.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.clearPendingOpenTimer(candidate.id);
      this.toggleCandidate(candidate.id);
    });
    rowEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      this.scheduleOpenItem(candidate, resolution);
    });

    const bodyEl = rowEl.createDiv({ cls: "opencode-ctx-item-body" });
    bodyEl.createDiv({ cls: "opencode-ctx-item-label", text: candidate.label });
    bodyEl.createDiv({ cls: "opencode-ctx-item-source", text: this.formatSource(candidate) });
    this.renderCandidatePills(bodyEl, candidate, resolution, projectionFailure);

    if (resolution.status === "unresolved" || candidate.status === "failed") {
      rowEl.createSpan({
        cls: "opencode-ctx-warning",
        text: "!",
      });
    }

    const actionsEl = rowEl.createDiv({ cls: "opencode-ctx-item-actions" });
    const toggleButton = actionsEl.createEl("button", {
      cls: "opencode-ctx-action opencode-ctx-candidate-toggle",
      text: candidate.included ? this.getCandidateSkipLabel(candidate) : getText().context.include,
      attr: { type: "button", title: getText().context.toggleCandidateTitle },
    });
    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleCandidate(candidate.id);
    });

    if (candidate.lifetime === "one-shot") {
      const removeButton = actionsEl.createEl("button", {
        cls: "opencode-ctx-action opencode-ctx-candidate-remove",
        text: getText().context.remove,
        attr: { type: "button", title: getText().context.removeCandidateTitle },
      });
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.removeCandidate(candidate.id);
      });
    }
  }

  private renderCurrentContextSection(items: ContextItem[]): void {
    if (!this.popoverEl || items.length === 0) {
      return;
    }

    const sectionEl = this.popoverEl.createDiv({ cls: "opencode-ctx-section" });
    const sectionHeaderEl = sectionEl.createDiv({ cls: "opencode-ctx-section-header" });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-title",
      text: getText().context.currentSessionContext,
    });
    sectionHeaderEl.createDiv({
      cls: "opencode-ctx-section-count",
      text: `${items.length}`,
    });

    const listEl = sectionEl.createDiv({ cls: "opencode-ctx-list" });
    for (const item of items) {
      const rowEl = listEl.createDiv({ cls: "opencode-ctx-item" });
      const resolution = this.deps.resolveItem(item);
      rowEl.toggleClass("is-unresolved", resolution.status === "unresolved");
      rowEl.toggleClass("is-expanded", this.expandedItemIds.has(item.id));
      rowEl.setAttribute("role", "button");
      rowEl.setAttribute("tabindex", "0");
      rowEl.setAttribute("aria-expanded", String(this.expandedItemIds.has(item.id)));
      rowEl.title = formatNavigationResolution(resolution);
      rowEl.addEventListener("click", (event) => {
        event.preventDefault();
        this.scheduleOpenItem(item, resolution);
      });
      rowEl.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.clearPendingOpenTimer(item.id);
        this.toggleRowExpansion(item, resolution, rowEl);
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
      if (this.expandedItemIds.has(item.id)) {
        this.renderRowDetails(bodyEl, item, resolution);
      }

      if (resolution.status === "unresolved") {
        rowEl.createSpan({
          cls: "opencode-ctx-warning",
          text: "!",
        });
      }

      const actionsEl = rowEl.createDiv({ cls: "opencode-ctx-item-actions" });
      actionsEl.createSpan({
        cls: "opencode-ctx-row-state",
        text: this.expandedItemIds.has(item.id) ? "⌃" : "›",
        attr: { "aria-hidden": "true" },
      });
    }
  }

  private renderStatusLabel(label: string): void {
    if (!this.statusEl.ownerDocument || !("appendChild" in this.statusEl)) {
      this.statusEl.setText(label);
      return;
    }

    const iconEl = this.statusEl.ownerDocument.createElement("span");
    iconEl.className = "opencode-ctx-status-icon";
    iconEl.setAttribute("aria-hidden", "true");
    setIcon(iconEl, OPENCODE_ICON_NAME);
    this.statusEl.appendChild(iconEl);

    const countEl = this.statusEl.ownerDocument.createElement("span");
    countEl.className = "opencode-ctx-status-count";
    countEl.textContent = label;
    this.statusEl.appendChild(countEl);
  }

  private scheduleOpenItem(
    item: ContextStatusBarSource,
    resolution: ContextNavigationResolution
  ): void {
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

  private async openItem(item: ContextStatusBarSource): Promise<void> {
    const result = await this.deps.openItem(item);
    noticeContextNavigationResult(result);
  }

  private toggleRowExpansion(
    item: ContextItem,
    resolution: ContextNavigationResolution,
    rowEl: HTMLElement
  ): void {
    const itemId = item.id;
    const expanded = !this.expandedItemIds.has(itemId);
    if (expanded) {
      this.expandedItemIds.add(itemId);
    } else {
      this.expandedItemIds.delete(itemId);
    }
    rowEl.toggleClass("is-expanded", expanded);
    rowEl.setAttribute("aria-expanded", String(expanded));
    const bodyEl = rowEl.querySelector(".opencode-ctx-item-body");
    bodyEl?.querySelector(".opencode-ctx-item-details")?.remove();
    if (expanded && bodyEl) {
      this.renderRowDetails(bodyEl as HTMLElement, item, resolution);
    }
  }

  private toggleCandidate(candidateId: string): void {
    const candidate = this.deps.toggleCandidate?.(candidateId);
    if (candidate && this.popoverEl) {
      this.renderPopover(this.deps.getItems(), this.getCandidates());
    }
  }

  private removeCandidate(candidateId: string): void {
    const candidate = this.deps.removeCandidate?.(candidateId);
    if (candidate && this.popoverEl) {
      this.renderPopover(this.deps.getItems(), this.getCandidates());
    }
  }

  private getCandidateSkipLabel(candidate: ContextCandidate): string {
    return candidate.lifetime === "dynamic" ? getText().context.skipOnce : getText().context.skip;
  }

  private pruneRowState(items: Array<{ id: string }>): void {
    const itemIds = new Set(items.map((item) => item.id));
    for (const itemId of this.expandedItemIds) {
      if (!itemIds.has(itemId)) {
        this.expandedItemIds.delete(itemId);
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

  private formatSource(item: ContextNavigationSource): string {
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
      text: getText().context.provenance(item.provenanceStatus ?? "known"),
    });
    detailsEl.createSpan({
      cls: resolution.status === "resolved" ? "opencode-ctx-pill" : "opencode-ctx-pill is-warning",
      text: formatNavigationResolution(resolution),
    });
    detailsEl.createSpan({
      cls: "opencode-ctx-pill",
      text: getText().context.chars(item.textLength ?? item.text.length),
    });
    detailsEl.createSpan({
      cls: "opencode-ctx-pill",
      text: new Date(item.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    const removeFailure = this.removeFailures.get(item.id);
    if (removeFailure) {
      detailsEl.createSpan({
        cls: "opencode-ctx-pill is-warning",
        text: removeFailure,
      });
    }
    const removeButton = detailsEl.createEl("button", {
      cls: "opencode-ctx-detail-action is-danger",
      text: getText().context.removeCommitted,
      attr: { type: "button", title: getText().context.removeTitle },
    });
    removeButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeButton.disabled = true;
      const removed = await this.deps.removeItem(item.id);
      if (removed) {
        this.removeFailures.delete(item.id);
        return;
      }
      const reason = getText().context.removeFailed;
      this.removeFailures.set(item.id, reason);
      removeButton.disabled = false;
      bodyEl.querySelector(".opencode-ctx-item-details")?.remove();
      this.renderRowDetails(bodyEl, item, resolution);
      new Notice(getText().notices.contextRemoveFailed);
    });
  }

  private renderCandidatePills(
    bodyEl: HTMLElement,
    candidate: ContextCandidate,
    resolution: ContextNavigationResolution,
    projectionFailure?: PromptContextProjectionFailure
  ): void {
    const detailsEl = bodyEl.createDiv({ cls: "opencode-ctx-item-details" });
    detailsEl.createSpan({
      cls: candidate.included ? "opencode-ctx-pill" : "opencode-ctx-pill is-warning",
      text: candidate.included ? getText().context.included : getText().context.skipped,
    });
    if (candidate.status === "failed") {
      detailsEl.createSpan({
        cls: "opencode-ctx-pill is-warning",
        text: getText().context.failedStatus(candidate.statusReason ?? null),
      });
    }
    if (resolution.status !== "resolved") {
      detailsEl.createSpan({
        cls: "opencode-ctx-pill is-warning",
        text: formatNavigationResolution(resolution),
      });
    }
    if (projectionFailure) {
      detailsEl.createSpan({
        cls: "opencode-ctx-pill is-warning",
        text: `native card skipped: ${projectionFailure.reason}`,
      });
    }
  }

  private getCandidates(): ContextCandidate[] {
    return this.deps.getCandidates?.() ?? [];
  }
}

export function formatContextDiagnostics(
  items: ContextItem[],
  resolveItem?: (item: ContextStatusBarSource) => ContextNavigationResolution,
  candidates: ContextCandidate[] = []
): string {
  return JSON.stringify(
    {
      committedCount: items.length,
      candidateCount: candidates.length,
      itemCount: items.length,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        sourceId: candidate.sourceId,
        sourceKind: candidate.sourceKind,
        identityKey: candidate.identityKey,
        fingerprint: candidate.fingerprint,
        label: candidate.label,
        sourceFile: candidate.sourceFile,
        navigationSourceFile: candidate.navigationSourceFile ?? null,
        startLine: candidate.startLine ?? null,
        endLine: candidate.endLine ?? null,
        included: candidate.included,
        lifetime: candidate.lifetime,
        status: candidate.status,
        statusReason: candidate.statusReason ?? null,
        sourceData: summarizeCandidateSourceData(candidate),
        textLength: candidate.text.length,
        navigation: resolveItem ? serializeNavigationResolution(resolveItem(candidate)) : null,
        createdAt: new Date(candidate.createdAt).toISOString(),
        updatedAt: new Date(candidate.updatedAt).toISOString(),
      })),
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

function summarizeCandidateSourceData(candidate: ContextCandidate): Record<string, unknown> | null {
  if (candidate.sourceData?.kind !== "opencode-native-comment") {
    return null;
  }
  return {
    kind: candidate.sourceData.kind,
    key: candidate.sourceData.key,
    item: {
      type: candidate.sourceData.item.type,
      path: candidate.sourceData.item.path,
      selection: candidate.sourceData.item.selection ?? null,
      commentID: candidate.sourceData.item.commentID,
      commentOrigin: candidate.sourceData.item.commentOrigin ?? null,
      previewLength: candidate.sourceData.item.preview?.length ?? null,
      commentLength: candidate.sourceData.item.comment.length,
    },
  };
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
