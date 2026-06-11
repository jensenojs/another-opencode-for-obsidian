import { App, EventRef, MarkdownView, WorkspaceLeaf } from "obsidian";
import { ContextItem, OpenCodeSettings, OPENCODE_VIEW_TYPE } from "../types";
import { CONTEXT_MESSAGE_PREFIX, OpenCodeClient, OpenCodeMessage } from "../client/OpenCodeClient";
import { WorkspaceContext } from "./WorkspaceContext";
import { formatWorkspaceContext } from "./ContextFormatter";
import { AutoSelectionContextSource } from "./AutoSelectionContextSource";
import { BacklinkContextSource } from "./BacklinkContextSource";
import {
  CursorContextSnapshot,
  CursorContextSource,
  formatCursorContext,
} from "./CursorContextSource";
import { OpenCodeView } from "../ui/OpenCodeView";
import { ServerState } from "../server/types";

const MAX_ACTIVE_CONTEXT_ITEMS = 50;
const WORKSPACE_CONTEXT_LABEL = "Workspace context";
const WORKSPACE_CONTEXT_SOURCE = "Obsidian workspace";
const BACKLINK_CONTEXT_LABEL_PREFIX = "Backlinks:";
const CURSOR_CONTEXT_LABEL_PREFIX = "Cursor:";

type ContextManagerDeps = {
  app: App;
  settings: OpenCodeSettings;
  client: OpenCodeClient;
  getServerState: () => ServerState;
  getCachedIframeUrl: () => string | null;
  setCachedIframeUrl: (url: string | null) => void;
  registerEvent: (ref: EventRef) => void;
};

export class ContextManager {
  private app: App;
  private settings: OpenCodeSettings;
  private client: OpenCodeClient;
  private workspaceContext: WorkspaceContext;
  private getServerState: () => ServerState;
  private getCachedIframeUrl: () => string | null;
  private setCachedIframeUrl: (url: string | null) => void;
  private registerEvent: (ref: EventRef) => void;

  private contextEventRefs: EventRef[] = [];
  private contextRefreshTimer: number | null = null;
  private items: ContextItem[] = [];
  private itemChangeCallbacks: Array<(items: ContextItem[]) => void> = [];
  private autoSelectionSource: AutoSelectionContextSource;
  private backlinkSource: BacklinkContextSource;
  private cursorSource: CursorContextSource;
  private activeMarkdownPath: string | null = null;

  constructor(deps: ContextManagerDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.client = deps.client;
    this.workspaceContext = new WorkspaceContext(this.app);
    this.getServerState = deps.getServerState;
    this.getCachedIframeUrl = deps.getCachedIframeUrl;
    this.setCachedIframeUrl = deps.setCachedIframeUrl;
    this.registerEvent = deps.registerEvent;
    this.autoSelectionSource = new AutoSelectionContextSource({
      isEnabled: () => this.settings.autoAddSelectionContext,
      addSelection: (selection) =>
        this.addSelectionForCurrentSession(
          selection.text,
          selection.sourcePath,
          selection.selectionStartLine,
          selection.selectionEndLine
        ),
    });
    this.backlinkSource = new BacklinkContextSource({
      isEnabled: () => this.settings.autoAddBacklinksContext,
      addBacklinks: (params) => this.addBacklinksForCurrentSession(params.filePath, params.text),
      removeBacklinks: () => this.removeBacklinksForCurrentSession(),
    });
    this.cursorSource = new CursorContextSource({
      isEnabled: () => this.settings.autoAddCursorContext,
      addCursor: (cursor) => this.addCursorForCurrentSession(cursor),
      removeCursor: () => this.removeCursorForCurrentSession(),
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
        this.activeMarkdownPath = leaf.view.file?.path ?? null;
        this.workspaceContext.trackViewSelection(leaf.view);
        void this.refreshBacklinks();
        void this.refreshCursor(leaf.view);
      }
      this.scheduleRefresh(0);
    });
    const fileOpenRef = this.app.workspace.on("file-open", (file) => {
      this.activeMarkdownPath = file?.path ?? null;
      void this.refreshBacklinks();
      void this.refreshCursor();
      this.scheduleRefresh();
    });
    const layoutChangeRef = this.app.workspace.on("layout-change", () => {
      this.scheduleRefresh();
    });
    const editorChangeRef = this.app.workspace.on("editor-change", (_editor, view) => {
      if (view instanceof MarkdownView) {
        this.activeMarkdownPath = view.file?.path ?? null;
        const selection = this.workspaceContext.trackViewSelection(view);
        void this.autoSelectionSource.handleSelection(selection);
        void this.refreshBacklinks();
        void this.refreshCursor(view);
      }
      this.scheduleRefresh(500);
    });
    const metadataChangeRef = this.app.metadataCache.on("changed", () => {
      void this.refreshBacklinks();
    });
    const metadataResolveRef = this.app.metadataCache.on("resolve", () => {
      void this.refreshBacklinks();
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
    this.autoSelectionSource.reset();
    this.backlinkSource.reset();
    this.cursorSource.reset();
    this.activeMarkdownPath = null;
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
    if (activeLeaf?.view.getViewType() === OPENCODE_VIEW_TYPE) {
      await this.refreshContext(activeLeaf);
    }
  }

  async refreshContextForView(_view: OpenCodeView): Promise<void> {
    if (!this.settings.injectWorkspaceContext) {
      return;
    }

    const leaf = this.getLeafForRefresh();
    if (!leaf) {
      return;
    }

    await this.refreshContext(leaf);
  }

  getItems(): ContextItem[] {
    return [...this.items];
  }

  onItemsChanged(callback: (items: ContextItem[]) => void): () => void {
    this.itemChangeCallbacks.push(callback);
    callback(this.getItems());
    return () => {
      const index = this.itemChangeCallbacks.indexOf(callback);
      if (index >= 0) {
        this.itemChangeCallbacks.splice(index, 1);
      }
    };
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
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return null;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return null;
    }

    return this.addManual(sessionId, text, sourceFile, startLine, endLine);
  }

  async addAutoForCurrentSession(params: {
    label: string;
    text: string;
    sourceFile: string;
  }): Promise<ContextItem | null> {
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return null;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return null;
    }

    return this.addItem({
      sessionId,
      type: "auto",
      label: params.label,
      text: params.text,
      sourceFile: params.sourceFile,
    });
  }

  private async addBacklinksForCurrentSession(
    filePath: string,
    text: string
  ): Promise<ContextItem | null> {
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return null;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
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
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return false;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return false;
    }

    await this.removeBacklinkAutoItems(sessionId);
    return true;
  }

  private async addCursorForCurrentSession(
    cursor: CursorContextSnapshot
  ): Promise<ContextItem | null> {
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return null;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
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
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return false;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return false;
    }

    await this.removeCursorAutoItems(sessionId);
    return true;
  }

  async removeItem(sessionId: string, itemId: string): Promise<boolean> {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return false;
    }

    if (item.messageId && item.partId) {
      const ignored = await this.client.ignorePart(sessionId, item.messageId, item.partId);
      if (!ignored) {
        return false;
      }
    }

    this.items = this.items.filter((candidate) => candidate.id !== itemId);
    this.emitItemsChanged();
    return true;
  }

  async removeItemForCurrentSession(itemId: string): Promise<boolean> {
    const iframeUrl = this.getCachedIframeUrl();
    if (!iframeUrl) {
      return false;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return false;
    }

    return this.removeItem(sessionId, itemId);
  }

  async restoreFromServer(sessionId: string): Promise<ContextItem[]> {
    const messages = await this.client.listSessionMessages(sessionId);
    if (!messages) {
      this.items = [];
      this.emitItemsChanged();
      return this.getItems();
    }

    this.items = messages
      .flatMap((message) => this.restoreItemsFromMessage(message))
      .slice(0, MAX_ACTIVE_CONTEXT_ITEMS);

    this.emitItemsChanged();
    return this.getItems();
  }

  private async refreshContext(leaf: WorkspaceLeaf): Promise<void> {
    if (!this.settings.injectWorkspaceContext) {
      return;
    }

    if (this.getServerState() !== "running") {
      return;
    }

    const view = leaf.view instanceof OpenCodeView ? leaf.view : null;
    const iframeUrl = this.getCachedIframeUrl() ?? view?.getIframeUrl();
    if (!iframeUrl) {
      return;
    }

    const sessionId = this.client.resolveSessionId(iframeUrl);
    if (!sessionId) {
      return;
    }

    this.setCachedIframeUrl(iframeUrl);

    const contextText = formatWorkspaceContext(this.workspaceContext.gatherContext(), {
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
    });
  }

  private async addItem(params: {
    sessionId: string;
    type: ContextItem["type"];
    label: string;
    text: string;
    sourceFile: string;
    startLine?: number;
    endLine?: number;
  }): Promise<ContextItem | null> {
    const text = params.text.trim();
    if (!text) {
      return null;
    }

    if (params.type === "auto") {
      await this.removeAutoItem(params.sessionId, params.label, params.sourceFile);
    }

    if (this.items.length >= MAX_ACTIVE_CONTEXT_ITEMS) {
      return null;
    }

    const ref = await this.client.addContextMessage(params.sessionId, text);
    if (!ref) {
      return null;
    }

    const item: ContextItem = {
      id: this.createItemId(ref.messageId, ref.partId),
      type: params.type,
      label: params.label,
      text,
      sourceFile: params.sourceFile,
      startLine: params.startLine,
      endLine: params.endLine,
      messageId: ref.messageId,
      partId: ref.partId,
      createdAt: Date.now(),
    };

    this.items = [...this.items, item];
    this.emitItemsChanged();
    return item;
  }

  private restoreItemsFromMessage(message: OpenCodeMessage): ContextItem[] {
    return message.parts
      .filter((part) => part.type === "text")
      .filter((part) => typeof part.text === "string")
      .filter((part) => part.text!.startsWith(CONTEXT_MESSAGE_PREFIX))
      .filter((part) => !part.ignored)
      .map((part) => {
        const text = this.stripContextMarker(part.text!);
        return {
          id: this.createItemId(message.info.id, part.id),
          type: "manual",
          label: "Restored context",
          text,
          sourceFile: "OpenCode session",
          messageId: message.info.id,
          partId: part.id,
          createdAt: part.time?.start ?? Date.now(),
        };
      });
  }

  private async removeAutoItem(
    sessionId: string,
    label: string,
    sourceFile: string
  ): Promise<void> {
    const items = this.items.filter(
      (item) => item.type === "auto" && item.label === label && item.sourceFile === sourceFile
    );
    for (const item of items) {
      await this.removeItem(sessionId, item.id);
    }
  }

  private async removeBacklinkAutoItems(sessionId: string): Promise<void> {
    const items = this.items.filter(
      (item) => item.type === "auto" && item.label.startsWith(BACKLINK_CONTEXT_LABEL_PREFIX)
    );
    for (const item of items) {
      await this.removeItem(sessionId, item.id);
    }
  }

  private async removeCursorAutoItems(sessionId: string): Promise<void> {
    const items = this.items.filter(
      (item) => item.type === "auto" && item.label.startsWith(CURSOR_CONTEXT_LABEL_PREFIX)
    );
    for (const item of items) {
      await this.removeItem(sessionId, item.id);
    }
  }

  private stripContextMarker(text: string): string {
    return text.slice(CONTEXT_MESSAGE_PREFIX.length).replace(/^\n/, "");
  }

  private createItemId(messageId: string, partId: string): string {
    return `${messageId}:${partId}`;
  }

  private emitItemsChanged(): void {
    const items = this.getItems();
    for (const callback of this.itemChangeCallbacks) {
      callback(items);
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

  private async refreshBacklinks(): Promise<void> {
    await this.backlinkSource.refresh(
      this.activeMarkdownPath,
      this.app.metadataCache.resolvedLinks
    );
  }

  private async refreshCursor(view?: MarkdownView | null): Promise<void> {
    const markdownView = view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    await this.cursorSource.refresh(this.getCursorSnapshot(markdownView));
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
