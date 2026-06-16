import { App, EventRef, MarkdownView, WorkspaceLeaf } from "obsidian";
import { OPENCODE_VIEW_TYPE, type ContextItem, type OpenCodeSettings } from "../types";
import { OpenCodeClient } from "../client/OpenCodeClient";
import { WorkspaceContext } from "./WorkspaceContext";
import { formatWorkspaceContext, type WorkspaceContextSnapshot } from "./ContextFormatter";
import { ContextAutoSources } from "./ContextAutoSources";
import { formatCursorContext, type CursorContextSnapshot } from "./CursorContextSource";
import { ContextRegistry } from "./ContextRegistry";
import { ContextSyncer } from "./ContextSyncer";
import { CurrentContextSession } from "./ContextSessionResolver";
import type { ServerState } from "../server/types";

const WORKSPACE_CONTEXT_LABEL = "Workspace context";
const WORKSPACE_CONTEXT_SOURCE = "Obsidian workspace";
const BACKLINK_CONTEXT_LABEL_PREFIX = "Backlinks:";
const CURSOR_CONTEXT_LABEL_PREFIX = "Cursor:";

type ContextManagerDeps = {
  app: App;
  settings: OpenCodeSettings;
  client: OpenCodeClient;
  getServerState: () => ServerState;
  currentSession: CurrentContextSession;
  registerEvent: (ref: EventRef) => void;
};

export class ContextManager {
  private app: App;
  private settings: OpenCodeSettings;
  private client: OpenCodeClient;
  private syncer: ContextSyncer;
  private workspaceContext: WorkspaceContext;
  private getServerState: () => ServerState;
  private currentSession: CurrentContextSession;
  private registerEvent: (ref: EventRef) => void;

  private contextEventRefs: EventRef[] = [];
  private contextRefreshTimer: number | null = null;
  private registry = new ContextRegistry();
  private autoSources: ContextAutoSources;
  private autoItemOperations = new Map<string, Promise<unknown>>();

  constructor(deps: ContextManagerDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.client = deps.client;
    this.syncer = new ContextSyncer(this.client);
    this.workspaceContext = new WorkspaceContext(this.app);
    this.getServerState = deps.getServerState;
    this.currentSession = deps.currentSession;
    this.registerEvent = deps.registerEvent;
    this.autoSources = new ContextAutoSources({
      isSelectionEnabled: () => this.settings.autoAddSelectionContext,
      isBacklinksEnabled: () => this.settings.autoAddBacklinksContext,
      isCursorEnabled: () => this.settings.autoAddCursorContext,
      addSelection: (selection) =>
        this.addSelectionForCurrentSession(
          selection.text,
          selection.sourcePath,
          selection.selectionStartLine,
          selection.selectionEndLine
        ),
      addBacklinks: (filePath, text) => this.addBacklinksForCurrentSession(filePath, text),
      removeBacklinks: () => this.removeBacklinksForCurrentSession(),
      addCursor: (cursor) => this.addCursorForCurrentSession(cursor),
      removeCursor: () => this.removeCursorForCurrentSession(),
      getResolvedLinks: () => this.app.metadataCache.resolvedLinks,
    });
  }

  updateSettings(settings: OpenCodeSettings): void {
    this.settings = settings;
    this.updateListeners();
  }

  private updateListeners(): void {
    if (
      !this.settings.injectWorkspaceContext &&
      !this.settings.autoAddSelectionContext &&
      !this.settings.autoAddBacklinksContext &&
      !this.settings.autoAddCursorContext
    ) {
      this.clearListeners();
      return;
    }

    if (this.contextEventRefs.length > 0) {
      return;
    }

    const activeLeafRef = this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) {
        this.workspaceContext.trackViewSelection(leaf.view);
        void this.autoSources.handleActiveMarkdownChanged({
          filePath: leaf.view.file?.path ?? null,
          cursor: this.getCursorSnapshot(leaf.view),
        });
      }
      this.scheduleRefresh(0);
    });
    const fileOpenRef = this.app.workspace.on("file-open", (file) => {
      const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      void this.autoSources.handleActiveMarkdownChanged({
        filePath: file?.path ?? null,
        cursor: this.getCursorSnapshot(markdownView),
      });
      this.scheduleRefresh();
    });
    const layoutChangeRef = this.app.workspace.on("layout-change", () => {
      this.scheduleRefresh();
    });
    const editorChangeRef = this.app.workspace.on("editor-change", (_editor, view) => {
      if (view instanceof MarkdownView) {
        const selection = this.workspaceContext.trackViewSelection(view);
        void this.autoSources.handleEditorChanged({
          filePath: view.file?.path ?? null,
          selection,
          cursor: this.getCursorSnapshot(view),
        });
      }
      this.scheduleRefresh(500);
    });
    const metadataChangeRef = this.app.metadataCache.on("changed", () => {
      void this.autoSources.handleMetadataChanged();
    });
    const metadataResolveRef = this.app.metadataCache.on("resolve", () => {
      void this.autoSources.handleMetadataChanged();
    });

    this.contextEventRefs = [
      activeLeafRef,
      fileOpenRef,
      layoutChangeRef,
      editorChangeRef,
      metadataChangeRef,
      metadataResolveRef,
    ];
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
    this.autoSources.reset();
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

  async handleServerRunning(): Promise<void> {
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

  getItems(): ContextItem[] {
    return this.registry.getItems();
  }

  onItemsChanged(callback: (items: ContextItem[]) => void): () => void {
    return this.registry.onItemsChanged(callback);
  }

  async addManual(
    sessionId: string,
    text: string,
    sourceFile: string,
    startLine?: number,
    endLine?: number
  ): Promise<ContextItem | null> {
    return this.addItem({
      sessionId,
      type: "manual",
      label: this.formatContextLabel(sourceFile, startLine, endLine),
      text,
      sourceFile,
      startLine,
      endLine,
    });
  }

  async addSelectionForCurrentSession(
    text: string,
    sourceFile: string,
    startLine?: number,
    endLine?: number
  ): Promise<ContextItem | null> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return null;
    }

    return this.addManual(sessionId, text, sourceFile, startLine, endLine);
  }

  async addCurrentNoteForCurrentSession(
    sourceFile: string,
    text: string
  ): Promise<ContextItem | null> {
    const endLine = text.length > 0 ? text.split(/\r\n|\r|\n/).length : undefined;
    return this.addSelectionForCurrentSession(text, sourceFile, 1, endLine);
  }

  async addAutoForCurrentSession(params: {
    label: string;
    text: string;
    sourceFile: string;
    navigationSourceFile?: string;
  }): Promise<ContextItem | null> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return null;
    }

    return this.addItem({
      sessionId,
      type: "auto",
      label: params.label,
      text: params.text,
      sourceFile: params.sourceFile,
      navigationSourceFile: params.navigationSourceFile,
    });
  }

  private async addBacklinksForCurrentSession(
    filePath: string,
    text: string
  ): Promise<ContextItem | null> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return null;
    }

    await this.removeBacklinkAutoItems(sessionId);
    return this.addItem({
      sessionId,
      type: "auto",
      label: `${BACKLINK_CONTEXT_LABEL_PREFIX} ${filePath}`,
      text,
      sourceFile: filePath,
    });
  }

  private async removeBacklinksForCurrentSession(): Promise<boolean> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return false;
    }

    await this.removeBacklinkAutoItems(sessionId);
    return true;
  }

  private async addCursorForCurrentSession(
    cursor: CursorContextSnapshot
  ): Promise<ContextItem | null> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return null;
    }

    await this.removeCursorAutoItems(sessionId);
    return this.addItem({
      sessionId,
      type: "auto",
      label: `${CURSOR_CONTEXT_LABEL_PREFIX} ${cursor.sourcePath}:${cursor.line}:${cursor.column}`,
      text: formatCursorContext(cursor),
      sourceFile: cursor.sourcePath,
      startLine: cursor.line,
      endLine: cursor.line,
    });
  }

  private async removeCursorForCurrentSession(): Promise<boolean> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return false;
    }

    await this.removeCursorAutoItems(sessionId);
    return true;
  }

  async removeItem(sessionId: string, itemId: string): Promise<boolean> {
    const item = this.registry.find(itemId);
    if (!item) {
      return false;
    }

    const removed = await this.syncer.remove(sessionId, item);
    if (!removed) {
      return false;
    }

    this.registry.remove(itemId);
    return true;
  }

  async removeItemForCurrentSession(itemId: string): Promise<boolean> {
    const sessionId = this.currentSession.getCurrentSessionId();
    if (!sessionId) {
      return false;
    }

    return this.removeItem(sessionId, itemId);
  }

  async restoreFromServer(sessionId: string): Promise<ContextItem[]> {
    const items = await this.syncer.restore(sessionId);
    if (!items) {
      this.registry.clear();
      return this.getItems();
    }

    return this.registry.replaceAll(await this.normalizeRestoredItems(sessionId, items));
  }

  private async refreshContext(leaf: WorkspaceLeaf): Promise<void> {
    if (!this.settings.injectWorkspaceContext) {
      return;
    }

    if (this.getServerState() !== "running") {
      return;
    }

    const sessionId = this.currentSession.getSessionIdForLeaf(leaf);
    if (!sessionId) {
      return;
    }

    const snapshot = this.workspaceContext.gatherContext();
    const contextText = formatWorkspaceContext(snapshot, {
      maxNotes: this.settings.maxNotesInContext,
      maxSelectionLength: this.settings.maxSelectionLength,
    });

    if (!contextText) {
      await this.removeAutoItem(sessionId, WORKSPACE_CONTEXT_LABEL, WORKSPACE_CONTEXT_SOURCE);
      return;
    }

    await this.addItem({
      sessionId,
      type: "auto",
      label: WORKSPACE_CONTEXT_LABEL,
      text: contextText,
      sourceFile: WORKSPACE_CONTEXT_SOURCE,
      ...this.getWorkspaceNavigationTarget(snapshot),
    });
  }

  private async addItem(params: {
    sessionId: string;
    type: ContextItem["type"];
    label: string;
    text: string;
    sourceFile: string;
    navigationSourceFile?: string;
    startLine?: number;
    endLine?: number;
  }): Promise<ContextItem | null> {
    const text = params.text.trim();
    if (!text) {
      return null;
    }

    if (params.type === "auto") {
      return this.replaceAutoItem({ ...params, type: "auto", text });
    }

    if (!this.registry.canAdd()) {
      return null;
    }

    const item = await this.syncer.add({ ...params, text });

    return item ? this.registry.add(item) : null;
  }

  private async replaceAutoItem(params: {
    sessionId: string;
    type: "auto";
    label: string;
    text: string;
    sourceFile: string;
    navigationSourceFile?: string;
    startLine?: number;
    endLine?: number;
  }): Promise<ContextItem | null> {
    const key = this.autoItemKey(params.sessionId, params.label, params.sourceFile);
    return this.runAutoItemOperation(key, async () => {
      const items = this.findAutoItems(params.label, params.sourceFile);
      const current = this.latestItem(items);

      if (current?.text === params.text) {
        for (const stale of items) {
          if (stale.id !== current.id) {
            await this.removeItem(params.sessionId, stale.id);
          }
        }
        return current;
      }

      for (const item of items) {
        const removed = await this.removeItem(params.sessionId, item.id);
        if (!removed) {
          return null;
        }
      }

      if (!this.registry.canAdd()) {
        return null;
      }

      const item = await this.syncer.add(params);
      return item ? this.registry.add(item) : null;
    });
  }

  private async removeAutoItem(
    sessionId: string,
    label: string,
    sourceFile: string
  ): Promise<void> {
    const key = this.autoItemKey(sessionId, label, sourceFile);
    await this.runAutoItemOperation(key, async () => {
      const items = this.findAutoItems(label, sourceFile);
      for (const item of items) {
        await this.removeItem(sessionId, item.id);
      }
      return null;
    });
  }

  private async removeBacklinkAutoItems(sessionId: string): Promise<void> {
    const items = this.registry.findAll(
      (item) => item.type === "auto" && item.label.startsWith(BACKLINK_CONTEXT_LABEL_PREFIX)
    );
    for (const item of items) {
      await this.removeItem(sessionId, item.id);
    }
  }

  private async removeCursorAutoItems(sessionId: string): Promise<void> {
    const items = this.registry.findAll(
      (item) => item.type === "auto" && item.label.startsWith(CURSOR_CONTEXT_LABEL_PREFIX)
    );
    for (const item of items) {
      await this.removeItem(sessionId, item.id);
    }
  }

  private formatContextLabel(sourceFile: string, startLine?: number, endLine?: number): string {
    if (startLine === undefined || endLine === undefined) {
      return sourceFile;
    }
    if (startLine === endLine) {
      return `${sourceFile}:${startLine}`;
    }
    return `${sourceFile}:${startLine}-${endLine}`;
  }

  private async normalizeRestoredItems(
    sessionId: string,
    items: ContextItem[]
  ): Promise<ContextItem[]> {
    const result: ContextItem[] = [];
    const autoGroups = new Map<string, ContextItem[]>();

    for (const item of items) {
      if (item.type !== "auto") {
        result.push(item);
        continue;
      }

      const key = this.autoItemKey(sessionId, item.label, item.sourceFile);
      const group = autoGroups.get(key) ?? [];
      group.push(item);
      autoGroups.set(key, group);
    }

    for (const group of autoGroups.values()) {
      const latest = this.latestItem(group);
      if (!latest) {
        continue;
      }

      result.push(latest);
      for (const stale of group) {
        if (stale.id === latest.id) {
          continue;
        }

        const removed = await this.syncer.remove(sessionId, stale);
        if (!removed) {
          result.push(stale);
        }
      }
    }

    return result;
  }

  private runAutoItemOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.autoItemOperations.get(key) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(operation)
      .finally(() => {
        if (this.autoItemOperations.get(key) === current) {
          this.autoItemOperations.delete(key);
        }
      });
    this.autoItemOperations.set(key, current);
    return current;
  }

  private findAutoItems(label: string, sourceFile: string): ContextItem[] {
    return this.registry.findAll(
      (item) => item.type === "auto" && item.label === label && item.sourceFile === sourceFile
    );
  }

  private latestItem(items: ContextItem[]): ContextItem | null {
    return items.reduce<ContextItem | null>((latest, item) => {
      if (!latest || item.createdAt >= latest.createdAt) {
        return item;
      }
      return latest;
    }, null);
  }

  private autoItemKey(sessionId: string, label: string, sourceFile: string): string {
    return JSON.stringify([sessionId, label, sourceFile]);
  }

  private getWorkspaceNavigationTarget(snapshot: WorkspaceContextSnapshot): {
    navigationSourceFile?: string;
    startLine?: number;
    endLine?: number;
  } {
    if (snapshot.selection) {
      return {
        navigationSourceFile: snapshot.selection.sourcePath,
        startLine: snapshot.selection.selectionStartLine,
        endLine: snapshot.selection.selectionEndLine,
      };
    }

    if (snapshot.openNotePaths.length === 1) {
      return {
        navigationSourceFile: snapshot.openNotePaths[0],
      };
    }

    return {};
  }

  private getCursorSnapshot(view: MarkdownView | null): CursorContextSnapshot | null {
    const sourcePath = view?.file?.path;
    const cursor = view?.editor?.getCursor?.();
    if (!sourcePath || !cursor) {
      return null;
    }

    return {
      sourcePath,
      line: cursor.line + 1,
      column: cursor.ch + 1,
    };
  }

  destroy(): void {
    this.clearListeners();
  }
}
