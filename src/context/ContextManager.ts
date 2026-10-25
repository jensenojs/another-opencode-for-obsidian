import { App, EventRef, MarkdownView, WorkspaceLeaf } from "obsidian";
import { OPENCODE_VIEW_TYPE, type ContextCandidate, type OpenCodeSettings } from "../types";
import { WorkspaceContext } from "./WorkspaceContext";
import {
  formatWorkspaceContext,
  type SelectedTextContext,
  type WorkspaceContextSnapshot,
} from "./ContextFormatter";
import { ContextAutoSources } from "./ContextAutoSources";
import { CandidateRegistry } from "./CandidateRegistry";
import { buildSelectionCandidate } from "./AutoSelectionContextSource";
import { CurrentContextSession } from "./ContextSessionResolver";
import type { ContextCandidateInput, ContextSourceResult } from "./ContextSourceDriver";
import {
  PromptContextInjector,
  type PromptDelivery,
  type PromptInjectionPlan,
} from "./PromptContextInjector";
import type { ServiceState } from "../server/types";

export type { PromptDelivery };

const WORKSPACE_CONTEXT_LABEL = "Workspace context";
const WORKSPACE_CONTEXT_SOURCE = "Obsidian workspace";
const WORKSPACE_SOURCE_ID = "workspace";
const WORKSPACE_IDENTITY_KEY = "current";

// Coordinates Obsidian context sources and local candidates. Candidates are the
// only context model; they reach OpenCode as prompt request attachments.
type ContextManagerDeps = {
  app: App;
  settings: OpenCodeSettings;
  getServiceState: () => ServiceState;
  currentSession: CurrentContextSession;
  registerEvent: (ref: EventRef) => void;
};

export class ContextManager {
  private app: App;
  private settings: OpenCodeSettings;
  private workspaceContext: WorkspaceContext;
  private getServiceState: () => ServiceState;
  private currentSession: CurrentContextSession;
  private registerEvent: (ref: EventRef) => void;

  private contextEventRefs: EventRef[] = [];
  private contextRefreshTimer: number | null = null;
  private selectionPollTimer: number | null = null;
  private removeSelectionPollListeners: (() => void) | null = null;
  private candidateRegistry = new CandidateRegistry();
  private promptInjector = new PromptContextInjector(this.candidateRegistry);
  private autoSources: ContextAutoSources;

  constructor(deps: ContextManagerDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.workspaceContext = new WorkspaceContext(this.app);
    this.getServiceState = deps.getServiceState;
    this.currentSession = deps.currentSession;
    this.registerEvent = deps.registerEvent;
    this.autoSources = new ContextAutoSources({
      isSelectionEnabled: () => this.isSelectionSourceEnabled(),
      maxSelectionChars: () => this.settings.contextAssist.selection.maxCharsPerSnippet,
    });
    this.candidateRegistry.setSourceLimit(
      "selection",
      this.settings.contextAssist.selection.maxSnippets
    );
  }

  updateSettings(settings: OpenCodeSettings): void {
    const previous = this.settings;
    this.settings = settings;
    this.candidateRegistry.setSourceLimit(
      "selection",
      settings.contextAssist.selection.maxSnippets
    );
    this.clearDisabledCandidates(previous, settings);
    this.updateListeners();
  }

  private updateListeners(): void {
    this.updateSelectionPollListeners();
    if (!this.isWorkspaceSourceEnabled() && !this.isSelectionSourceEnabled()) {
      this.clearListeners();
      return;
    }

    if (this.contextEventRefs.length > 0) {
      return;
    }

    const activeLeafRef = this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) {
        this.workspaceContext.trackViewSelection(leaf.view);
        void this.handleAutoSourceResults(
          this.autoSources.handleActiveMarkdownChanged({
            filePath: leaf.view.file?.path ?? null,
          })
        );
      }
      if (this.isWorkspaceSourceEnabled()) {
        this.scheduleRefresh(0);
      }
    });
    const fileOpenRef = this.app.workspace.on("file-open", (file) => {
      void this.handleAutoSourceResults(
        this.autoSources.handleActiveMarkdownChanged({
          filePath: file?.path ?? null,
        })
      );
      if (this.isWorkspaceSourceEnabled()) {
        this.scheduleRefresh();
      }
    });
    const layoutChangeRef = this.app.workspace.on("layout-change", () => {
      if (this.isWorkspaceSourceEnabled()) {
        this.scheduleRefresh();
      }
    });
    const editorChangeRef = this.app.workspace.on("editor-change", (_editor, view) => {
      if (view instanceof MarkdownView) {
        const selection = this.workspaceContext.trackViewSelection(view);
        void this.handleAutoSourceResults(
          this.autoSources.handleEditorChanged({
            filePath: view.file?.path ?? null,
            selection,
          })
        );
      }
      if (this.isWorkspaceSourceEnabled()) {
        this.scheduleRefresh(500);
      }
    });

    this.contextEventRefs = [activeLeafRef, fileOpenRef, layoutChangeRef, editorChangeRef];
    this.contextEventRefs.forEach((ref) => this.registerEvent(ref));
  }

  private clearListeners(): void {
    for (const ref of this.contextEventRefs) {
      this.app.workspace.offref(ref);
    }
    this.contextEventRefs = [];
    if (this.contextRefreshTimer !== null) {
      window.clearTimeout(this.contextRefreshTimer);
      this.contextRefreshTimer = null;
    }
    if (this.selectionPollTimer !== null) {
      window.clearTimeout(this.selectionPollTimer);
      this.selectionPollTimer = null;
    }
    this.removeSelectionPollListeners?.();
    this.removeSelectionPollListeners = null;
    this.autoSources.reset();
  }

  private updateSelectionPollListeners(): void {
    if (!this.isSelectionSourceEnabled()) {
      this.removeSelectionPollListeners?.();
      this.removeSelectionPollListeners = null;
      if (this.selectionPollTimer !== null) {
        window.clearTimeout(this.selectionPollTimer);
        this.selectionPollTimer = null;
      }
      return;
    }

    if (
      this.removeSelectionPollListeners ||
      typeof document === "undefined" ||
      typeof window === "undefined"
    ) {
      return;
    }

    const schedule = (): void => this.scheduleSelectionPoll();
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("mouseup", schedule, true);
    window.addEventListener("keyup", schedule, true);
    this.removeSelectionPollListeners = () => {
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("mouseup", schedule, true);
      window.removeEventListener("keyup", schedule, true);
    };
  }

  private scheduleRefresh(delayMs: number = 300): void {
    const leaf = this.getLeafForRefresh();
    if (!leaf) {
      return;
    }

    if (this.contextRefreshTimer !== null) {
      window.clearTimeout(this.contextRefreshTimer);
    }

    this.contextRefreshTimer = window.setTimeout(() => {
      this.contextRefreshTimer = null;
      void this.refreshContext(leaf);
    }, delayMs);
  }

  private scheduleSelectionPoll(delayMs: number = 120): void {
    if (!this.isSelectionSourceEnabled()) {
      return;
    }

    if (this.selectionPollTimer !== null) {
      window.clearTimeout(this.selectionPollTimer);
    }

    this.selectionPollTimer = window.setTimeout(() => {
      this.selectionPollTimer = null;
      void this.refreshSelectionFromActiveMarkdown();
    }, delayMs);
  }

  private async refreshSelectionFromActiveMarkdown(): Promise<void> {
    if (!this.isSelectionSourceEnabled()) {
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!(view instanceof MarkdownView)) {
      return;
    }

    const selection = this.workspaceContext.trackViewSelection(view);
    await this.handleAutoSourceResults(
      this.autoSources.handleEditorChanged({
        filePath: view.file?.path ?? null,
        selection,
      })
    );
    const leaf = this.getLeafForRefresh();
    if (leaf) {
      await this.refreshContext(leaf);
    }
  }

  private getLeafForRefresh(): WorkspaceLeaf | null {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view.getViewType() === OPENCODE_VIEW_TYPE) {
      return activeLeaf;
    }

    return this.getVisibleSidebarLeaf();
  }

  private getVisibleSidebarLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE);
    if (leaves.length === 0) {
      return null;
    }

    const rightSplit = this.app.workspace.rightSplit;
    if (!rightSplit || rightSplit.collapsed) {
      return null;
    }

    const leaf = leaves[0];
    return leaf.getRoot() === rightSplit ? leaf : null;
  }

  async handleServiceAttached(): Promise<void> {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf || activeLeaf.view.getViewType() !== OPENCODE_VIEW_TYPE) {
      return;
    }

    await this.refreshContext(activeLeaf);
  }

  async refreshVisibleOpenCodeContext(): Promise<void> {
    const leaf = this.getLeafForRefresh();
    if (!leaf) {
      return;
    }

    await this.refreshContext(leaf);
  }

  getCandidates(): ContextCandidate[] {
    return this.candidateRegistry.getCandidates();
  }

  onCandidatesChanged(callback: (items: ContextCandidate[]) => void): () => void {
    return this.candidateRegistry.onCandidatesChanged(callback);
  }

  toggleCandidate(candidateId: string): ContextCandidate | null {
    return this.candidateRegistry.toggleIncluded(candidateId);
  }

  setCandidateIncluded(candidateId: string, included: boolean): ContextCandidate | null {
    return this.candidateRegistry.setIncluded(candidateId, included);
  }

  removeCandidate(candidateId: string): ContextCandidate | null {
    return this.candidateRegistry.remove(candidateId);
  }

  getLastPromptDelivery(): PromptDelivery | null {
    return this.promptInjector.getLastDelivery();
  }

  preparePromptContext(sessionId: string, requestBody: unknown): PromptInjectionPlan | null {
    this.candidateRegistry.setSession(sessionId);
    return this.promptInjector.prepare(sessionId, requestBody);
  }

  completePromptContext(planId: string): void {
    this.promptInjector.complete(planId);
  }

  failPromptContext(planId: string, reason: string): void {
    this.promptInjector.fail(planId, reason);
  }

  includeSelection(selection: SelectedTextContext): ContextCandidate | null {
    return this.applySourceResult({
      type: "upsert",
      candidate: buildSelectionCandidate(
        selection,
        this.settings.contextAssist.selection.maxCharsPerSnippet
      ),
    });
  }

  includeNote(input: { path: string; text: string }): ContextCandidate | null {
    const text = input.text.trim();
    if (!text) {
      return null;
    }

    return this.applySourceResult({
      type: "upsert",
      candidate: {
        sourceId: "manual",
        sourceKind: "manual",
        identityKey: `note:${input.path}`,
        fingerprint: text,
        label: input.path,
        text,
        sourceFile: input.path,
        navigationSourceFile: input.path,
        startLine: 1,
        endLine: text.split(/\r\n|\r|\n/).length,
        lifetime: "one-shot",
      },
    });
  }

  private async refreshContext(leaf: WorkspaceLeaf): Promise<void> {
    if (!this.isWorkspaceSourceEnabled()) {
      return;
    }

    if (this.getServiceState() !== "attached") {
      return;
    }

    const sessionId = this.currentSession.getSessionIdForLeaf(leaf);
    if (!sessionId) {
      return;
    }
    this.candidateRegistry.setSession(sessionId);

    const snapshot = this.workspaceContext.gatherContext();
    const contextText = formatWorkspaceContext(snapshot, {
      maxOpenNotes: this.settings.contextAssist.workspace.maxOpenNotes,
      includeActiveLocation: this.settings.contextAssist.workspace.includeActiveLocation,
    });

    if (!contextText) {
      this.applySourceResult({
        type: "remove",
        sourceId: WORKSPACE_SOURCE_ID,
        identityKey: WORKSPACE_IDENTITY_KEY,
      });
      return;
    }

    this.applySourceResult({
      type: "upsert",
      candidate: {
        sourceId: WORKSPACE_SOURCE_ID,
        sourceKind: "workspace",
        identityKey: WORKSPACE_IDENTITY_KEY,
        fingerprint: contextText,
        label: WORKSPACE_CONTEXT_LABEL,
        text: contextText,
        sourceFile: WORKSPACE_CONTEXT_SOURCE,
        lifetime: "dynamic",
        ...this.getWorkspaceNavigationTarget(snapshot),
      },
    });
  }

  private async handleAutoSourceResults(
    resultsPromise: Promise<ContextSourceResult[]>
  ): Promise<void> {
    this.applySourceResults(await resultsPromise);
  }

  private applySourceResults(results: ContextSourceResult[]): void {
    const sessionId = this.currentSession.getCurrentSessionId();
    this.candidateRegistry.setSession(sessionId);
    if (!sessionId) {
      this.autoSources.reset();
      return;
    }

    for (const result of results) {
      this.applySourceResult(result);
    }
  }

  private applySourceResult(result: ContextSourceResult): ContextCandidate | null {
    if (result.type === "remove") {
      this.candidateRegistry.removeByIdentity(result.sourceId, result.identityKey);
      return null;
    }

    if (result.type === "clear-source") {
      this.candidateRegistry.clearSource(result.sourceId);
      return null;
    }

    if (result.type === "failed") {
      return this.candidateRegistry.markSourceFailed(
        result.sourceId,
        result.identityKey,
        result.reason
      );
    }

    return this.candidateRegistry.upsert(this.createCandidate(result.candidate));
  }

  private createCandidate(input: ContextCandidateInput): ContextCandidate {
    const now = Date.now();
    return {
      id: `candidate:${input.sourceId}:${input.identityKey}`,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      identityKey: input.identityKey,
      fingerprint: input.fingerprint,
      label: input.label,
      text: input.text,
      sourceFile: input.sourceFile,
      navigationSourceFile: input.navigationSourceFile,
      startLine: input.startLine,
      endLine: input.endLine,
      included: true,
      lifetime: input.lifetime,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
  }

  private clearDisabledCandidates(previous: OpenCodeSettings, next: OpenCodeSettings): void {
    if (previous.contextAssist.enabled && !next.contextAssist.enabled) {
      this.candidateRegistry.clear();
      this.autoSources.reset();
      return;
    }

    if (
      previous.contextAssist.workspace.enabled &&
      (!next.contextAssist.enabled || !next.contextAssist.workspace.enabled)
    ) {
      this.candidateRegistry.clearSource(WORKSPACE_SOURCE_ID);
    }

    if (
      previous.contextAssist.selection.enabled &&
      (!next.contextAssist.enabled || !next.contextAssist.selection.enabled)
    ) {
      this.candidateRegistry.clearSource("selection");
      this.autoSources.stopSelection();
    }
  }

  private getWorkspaceNavigationTarget(snapshot: WorkspaceContextSnapshot): {
    navigationSourceFile?: string;
    startLine?: number;
    endLine?: number;
  } {
    if (snapshot.activeLocation) {
      return {
        navigationSourceFile: snapshot.activeLocation.sourcePath,
        startLine: snapshot.activeLocation.line,
        endLine: snapshot.activeLocation.line,
      };
    }

    if (snapshot.openNotePaths.length === 1) {
      return {
        navigationSourceFile: snapshot.openNotePaths[0],
      };
    }

    return {};
  }

  private isWorkspaceSourceEnabled(): boolean {
    return this.settings.contextAssist.enabled && this.settings.contextAssist.workspace.enabled;
  }

  private isSelectionSourceEnabled(): boolean {
    return this.settings.contextAssist.enabled && this.settings.contextAssist.selection.enabled;
  }

  destroy(): void {
    this.clearListeners();
  }
}
