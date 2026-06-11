import { App, EventRef, MarkdownView, WorkspaceLeaf } from "obsidian";
import { ContextItem, OpenCodeSettings, OPENCODE_VIEW_TYPE } from "../types";
import { CONTEXT_MESSAGE_PREFIX, OpenCodeClient, OpenCodeMessage } from "../client/OpenCodeClient";
import { WorkspaceContext } from "./WorkspaceContext";
import { formatWorkspaceContext } from "./ContextFormatter";
import { OpenCodeView } from "../ui/OpenCodeView";
import { ServerState } from "../server/types";

const MAX_ACTIVE_CONTEXT_ITEMS = 50;
const WORKSPACE_CONTEXT_SOURCE = "Obsidian workspace";

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

  constructor(deps: ContextManagerDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.client = deps.client;
    this.workspaceContext = new WorkspaceContext(this.app);
    this.getServerState = deps.getServerState;
    this.getCachedIframeUrl = deps.getCachedIframeUrl;
    this.setCachedIframeUrl = deps.setCachedIframeUrl;
    this.registerEvent = deps.registerEvent;
  }

  updateSettings(settings: OpenCodeSettings): void {
    this.settings = settings;
    this.updateListeners();
  }

  private updateListeners(): void {
    if (!this.settings.injectWorkspaceContext) {
      this.clearListeners();
      return;
    }

    if (this.contextEventRefs.length > 0) {
      return;
    }

    const activeLeafRef = this.app.workspace.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView) {
        this.workspaceContext.trackViewSelection(leaf.view);
      }
      this.scheduleRefresh(0);
    });
    const fileOpenRef = this.app.workspace.on("file-open", () => {
      this.scheduleRefresh();
    });
    const layoutChangeRef = this.app.workspace.on("layout-change", () => {
      this.scheduleRefresh();
    });
    const editorChangeRef = this.app.workspace.on("editor-change", (_editor, view) => {
      if (view instanceof MarkdownView) {
        this.workspaceContext.trackViewSelection(view);
      }
      this.scheduleRefresh(500);
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
      await this.removeAutoItem(sessionId, WORKSPACE_CONTEXT_SOURCE);
      return;
    }

    await this.addItem({
      sessionId,
      type: "auto",
      label: "Workspace context",
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
      await this.removeAutoItem(params.sessionId, params.sourceFile);
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

  private async removeAutoItem(sessionId: string, sourceFile: string): Promise<void> {
    const items = this.items.filter(
      (item) => item.type === "auto" && item.sourceFile === sourceFile
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

  destroy(): void {
    this.clearListeners();
  }
}
