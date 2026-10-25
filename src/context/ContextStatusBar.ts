import { Notice, setIcon } from "obsidian";
import type { ContextCandidate } from "../types";
import {
  formatNavigationResolution,
  noticeContextNavigationResult,
  type ContextNavigationResolution,
  type ContextNavigationResult,
} from "./ContextItemNavigator";
import type { PromptDelivery } from "./PromptContextInjector";
import { getText } from "../i18n";
import { OPENCODE_ICON_NAME } from "../icons";

interface ContextStatusBarDeps {
  addStatusBarItem: () => HTMLElement;
  getCandidates: () => ContextCandidate[];
  onCandidatesChanged: (callback: (candidates: ContextCandidate[]) => void) => () => void;
  toggleCandidate: (candidateId: string) => ContextCandidate | null;
  removeCandidate: (candidateId: string) => ContextCandidate | null;
  getLastPromptDelivery: () => PromptDelivery | null;
  resolveCandidate: (candidate: ContextCandidate) => ContextNavigationResolution;
  openCandidate: (candidate: ContextCandidate) => Promise<ContextNavigationResult>;
}

const ROW_OPEN_DELAY_MS = 180;

// Obsidian-native surface for the local candidate set. It renders what the next
// prompt will carry; it never writes to OpenCode and never owns candidate state.
export class ContextStatusBar {
  private statusEl: HTMLElement;
  private popoverEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;
  private unsubscribeCandidates: (() => void) | null = null;
  private removeKeydown: (() => void) | null = null;
  private pendingOpenTimers = new Map<string, number>();

  constructor(private deps: ContextStatusBarDeps) {
    this.statusEl = deps.addStatusBarItem();
    this.statusEl.addClass("opencode-ctx-status");
    this.statusEl.parentElement?.prepend(this.statusEl);
    this.statusEl.addEventListener("click", (event) => {
      event.preventDefault();
      this.togglePopover();
    });
    this.unsubscribeCandidates = deps.onCandidatesChanged((candidates) => this.render(candidates));
  }

  render(candidates: ContextCandidate[] = this.deps.getCandidates()): void {
    const text = getText();
    const included = candidates.filter((candidate) => candidate.included).length;
    this.statusEl.empty();
    this.statusEl.toggleClass("is-active", candidates.length > 0);
    this.statusEl.toggleClass(
      "is-warning",
      candidates.some((candidate) => candidate.status === "failed")
    );
    this.renderStatusLabel(text.context.statusText(included));
    this.statusEl.title = text.context.statusTitle(included, candidates.length);
    if (this.popoverEl) {
      this.renderPopover(candidates);
    }
  }

  destroy(): void {
    this.hidePopover();
    this.clearPendingOpenTimers();
    this.unsubscribeCandidates?.();
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
    this.backdropEl = document.body.createDiv({ cls: "opencode-ctx-popover-backdrop" });
    this.backdropEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.hidePopover();
    });
    this.popoverEl = document.body.createDiv({ cls: "opencode-ctx-popover" });
    this.positionPopover();
    this.renderPopover(this.deps.getCandidates());

    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        this.hidePopover();
      }
    };

    window.setTimeout(() => {
      window.addEventListener("keydown", handleKeydown, true);
      this.removeKeydown = () => window.removeEventListener("keydown", handleKeydown, true);
    }, 0);
  }

  private hidePopover(): void {
    this.removeKeydown?.();
    this.removeKeydown = null;
    this.popoverEl?.remove();
    this.popoverEl = null;
    this.backdropEl?.remove();
    this.backdropEl = null;
  }

  private renderPopover(candidates: ContextCandidate[]): void {
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
      text: text.context.popoverTitle(candidates.length),
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
        formatContextDiagnostics(candidates, (candidate) => this.deps.resolveCandidate(candidate))
      );
      new Notice(text.notices.contextDiagnosticsCopied);
    });

    this.prunePendingOpenTimers(candidates);
    this.renderDeliveryLine();
    if (candidates.length === 0) {
      this.popoverEl.createDiv({ cls: "opencode-ctx-empty", text: text.context.noActiveContext });
      return;
    }
    this.renderCandidateSection(candidates);
  }

  private renderDeliveryLine(): void {
    if (!this.popoverEl) {
      return;
    }
    const delivery = this.deps.getLastPromptDelivery();
    if (!delivery) {
      return;
    }
    this.popoverEl.createDiv({
      cls: "opencode-ctx-delivery",
      text: getText().context.lastDelivery(delivery.count),
    });
  }

  private renderCandidateSection(candidates: ContextCandidate[]): void {
    if (!this.popoverEl) {
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
    for (const candidate of candidates) {
      this.renderCandidateRow(listEl, candidate);
    }
  }

  private renderCandidateRow(listEl: HTMLElement, candidate: ContextCandidate): void {
    const rowEl = listEl.createDiv({ cls: "opencode-ctx-item opencode-ctx-candidate" });
    const resolution = this.deps.resolveCandidate(candidate);
    rowEl.toggleClass("is-unresolved", resolution.status === "unresolved");
    rowEl.toggleClass("is-excluded", !candidate.included);
    rowEl.toggleClass("is-failed", candidate.status === "failed");
    rowEl.setAttribute("role", "button");
    rowEl.setAttribute("tabindex", "0");
    rowEl.setAttribute("aria-pressed", String(candidate.included));
    rowEl.title = formatNavigationResolution(resolution);
    rowEl.addEventListener("click", (event) => {
      event.preventDefault();
      this.scheduleOpenCandidate(candidate, resolution);
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
      this.scheduleOpenCandidate(candidate, resolution);
    });

    const bodyEl = rowEl.createDiv({ cls: "opencode-ctx-item-body" });
    bodyEl.createDiv({ cls: "opencode-ctx-item-label", text: candidate.label });
    bodyEl.createDiv({ cls: "opencode-ctx-item-source", text: this.formatSource(candidate) });
    this.renderCandidatePills(bodyEl, candidate, resolution);

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

  private renderCandidatePills(
    bodyEl: HTMLElement,
    candidate: ContextCandidate,
    resolution: ContextNavigationResolution
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

  private scheduleOpenCandidate(
    candidate: ContextCandidate,
    resolution: ContextNavigationResolution
  ): void {
    if (resolution.status !== "resolved") {
      return;
    }
    this.clearPendingOpenTimer(candidate.id);
    const timer = window.setTimeout(() => {
      this.pendingOpenTimers.delete(candidate.id);
      void this.openCandidate(candidate);
    }, ROW_OPEN_DELAY_MS);
    this.pendingOpenTimers.set(candidate.id, timer);
  }

  private async openCandidate(candidate: ContextCandidate): Promise<void> {
    const result = await this.deps.openCandidate(candidate);
    noticeContextNavigationResult(result);
  }

  private toggleCandidate(candidateId: string): void {
    const candidate = this.deps.toggleCandidate(candidateId);
    if (candidate && this.popoverEl) {
      this.renderPopover(this.deps.getCandidates());
    }
  }

  private removeCandidate(candidateId: string): void {
    const candidate = this.deps.removeCandidate(candidateId);
    if (candidate && this.popoverEl) {
      this.renderPopover(this.deps.getCandidates());
    }
  }

  private getCandidateSkipLabel(candidate: ContextCandidate): string {
    return candidate.lifetime === "dynamic" ? getText().context.skipOnce : getText().context.skip;
  }

  private prunePendingOpenTimers(candidates: ContextCandidate[]): void {
    const liveIds = new Set(candidates.map((candidate) => candidate.id));
    for (const candidateId of this.pendingOpenTimers.keys()) {
      if (!liveIds.has(candidateId)) {
        this.clearPendingOpenTimer(candidateId);
      }
    }
  }

  private clearPendingOpenTimer(candidateId: string): void {
    const timer = this.pendingOpenTimers.get(candidateId);
    if (timer === undefined) {
      return;
    }
    window.clearTimeout(timer);
    this.pendingOpenTimers.delete(candidateId);
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

  private formatSource(candidate: ContextCandidate): string {
    const sourceFile = candidate.navigationSourceFile ?? candidate.sourceFile;
    const formattedSource = this.formatSourceRange(
      sourceFile,
      candidate.startLine,
      candidate.endLine
    );
    if (candidate.navigationSourceFile && candidate.navigationSourceFile !== candidate.sourceFile) {
      return `${candidate.sourceFile} -> ${formattedSource}`;
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
}

export function formatContextDiagnostics(
  candidates: ContextCandidate[],
  resolveCandidate?: (candidate: ContextCandidate) => ContextNavigationResolution
): string {
  return JSON.stringify(
    {
      candidateCount: candidates.length,
      includedCount: candidates.filter((candidate) => candidate.included).length,
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
        textLength: candidate.text.length,
        navigation: resolveCandidate
          ? serializeNavigationResolution(resolveCandidate(candidate))
          : null,
        createdAt: new Date(candidate.createdAt).toISOString(),
        updatedAt: new Date(candidate.updatedAt).toISOString(),
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
