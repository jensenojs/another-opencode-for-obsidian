import { App, WorkspaceLeaf } from "obsidian";
import { OPENCODE_VIEW_TYPE, type OpenCodeSettings, type ViewLocation } from "../types";
import { OpenCodeView } from "./OpenCodeView";
import { OpenCodeClient } from "../client/OpenCodeClient";
import { ContextManager } from "../context/ContextManager";
import { CurrentContextSession } from "../context/ContextSessionResolver";
import type { ServerState } from "../server/types";

type ViewManagerDeps = {
  app: App;
  settings: OpenCodeSettings;
  client: OpenCodeClient;
  contextManager: ContextManager;
  currentSession: CurrentContextSession;
  getServerState: () => ServerState;
  startServer: () => void;
};

export class ViewManager {
  private app: App;
  private settings: OpenCodeSettings;
  private client: OpenCodeClient;
  private contextManager: ContextManager;
  private currentSession: CurrentContextSession;
  private getServerState: () => ServerState;
  private startServer: () => void;
  private previousEditorLeaf: WorkspaceLeaf | null = null;

  constructor(deps: ViewManagerDeps) {
    this.app = deps.app;
    this.settings = deps.settings;
    this.client = deps.client;
    this.contextManager = deps.contextManager;
    this.currentSession = deps.currentSession;
    this.getServerState = deps.getServerState;
    this.startServer = deps.startServer;
  }

  updateSettings(settings: OpenCodeSettings): void {
    this.settings = settings;
  }

  private getExistingLeaf(): WorkspaceLeaf | null {
    const leaves = this.app.workspace.getLeavesOfType(OPENCODE_VIEW_TYPE);
    return leaves.length > 0 ? leaves[0] : null;
  }

  private isSidebarLeaf(leaf: WorkspaceLeaf): boolean {
    return leaf.getRoot() === this.app.workspace.rightSplit;
  }

  private rememberActiveLeafBeforeFocus(targetLeaf: WorkspaceLeaf): void {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && activeLeaf !== targetLeaf) {
      this.previousEditorLeaf = activeLeaf;
      return;
    }

    if (
      this.previousEditorLeaf &&
      this.previousEditorLeaf !== targetLeaf &&
      this.previousEditorLeaf.view
    ) {
      return;
    }

    const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
    if (mostRecentLeaf && mostRecentLeaf !== targetLeaf) {
      this.previousEditorLeaf = mostRecentLeaf;
    }
  }

  private restorePreviousEditorLeaf(): void {
    if (this.previousEditorLeaf && this.previousEditorLeaf.view) {
      this.app.workspace.setActiveLeaf(this.previousEditorLeaf, { focus: true });
    }
  }

  private focusIframe(leaf: WorkspaceLeaf): void {
    const view = leaf.view;
    if (view instanceof OpenCodeView) {
      requestAnimationFrame(() => view.focusIframe());
    }
  }

  private revealLeaf(
    leaf: WorkspaceLeaf,
    options: { activate: boolean; focusIframe: boolean }
  ): void {
    this.app.workspace.revealLeaf(leaf);
    if (options.activate) {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    }
    this.startServerForUserActivation();
    if (options.focusIframe) {
      this.focusIframe(leaf);
    }
  }

  private async createLeafAt(location: ViewLocation): Promise<WorkspaceLeaf | null> {
    const leaf =
      location === "main"
        ? this.app.workspace.getLeaf("tab")
        : this.app.workspace.getRightLeaf(false);

    if (!leaf) {
      return null;
    }

    await leaf.setViewState({
      type: OPENCODE_VIEW_TYPE,
      active: true,
    });

    return leaf;
  }

  private rememberLeafSessionUrl(leaf: WorkspaceLeaf): void {
    const view = leaf.view;
    if (!(view instanceof OpenCodeView)) {
      return;
    }

    const iframeUrl = view.getIframeUrl();
    if (iframeUrl) {
      this.currentSession.rememberSessionUrl(iframeUrl);
    }
  }

  private async openLeafAt(location: ViewLocation, options: { activate: boolean }): Promise<void> {
    const leaf = await this.createLeafAt(location);
    if (!leaf) {
      return;
    }

    this.revealLeaf(leaf, { activate: options.activate, focusIframe: true });
  }

  private async replaceLeafAt(existingLeaf: WorkspaceLeaf, location: ViewLocation): Promise<void> {
    this.rememberActiveLeafBeforeFocus(existingLeaf);
    this.rememberLeafSessionUrl(existingLeaf);
    existingLeaf.detach();
    await this.openLeafAt(location, { activate: true });
  }

  async activateView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      this.revealLeaf(existingLeaf, { activate: false, focusIframe: false });
      return;
    }

    await this.openLeafAt(this.settings.defaultViewLocation, { activate: false });
  }

  private startServerForUserActivation(): void {
    if (this.getServerState() === "stopped") {
      this.startServer();
    }
  }

  async toggleView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      const isInSidebar = this.isSidebarLeaf(existingLeaf);

      if (isInSidebar) {
        const rightSplit = this.app.workspace.rightSplit;
        if (rightSplit && !rightSplit.collapsed) {
          if (this.app.workspace.activeLeaf === existingLeaf) {
            rightSplit.collapse();
            this.restorePreviousEditorLeaf();
          } else {
            this.rememberActiveLeafBeforeFocus(existingLeaf);
            this.revealLeaf(existingLeaf, { activate: true, focusIframe: true });
          }
        } else {
          this.rememberActiveLeafBeforeFocus(existingLeaf);
          this.revealLeaf(existingLeaf, { activate: true, focusIframe: true });
        }
      } else {
        await this.replaceLeafAt(existingLeaf, "sidebar");
      }
    } else {
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf) {
        this.previousEditorLeaf = activeLeaf;
      }
      await this.openLeafAt("sidebar", { activate: true });
    }
  }

  async toggleDeepView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (!existingLeaf) {
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf) {
        this.previousEditorLeaf = activeLeaf;
      }
      await this.openLeafAt("main", { activate: true });
      return;
    }

    if (this.isSidebarLeaf(existingLeaf)) {
      await this.replaceLeafAt(existingLeaf, "main");
      return;
    }

    if (this.app.workspace.activeLeaf === existingLeaf) {
      this.rememberLeafSessionUrl(existingLeaf);
      existingLeaf.detach();
      this.restorePreviousEditorLeaf();
      return;
    }

    this.rememberActiveLeafBeforeFocus(existingLeaf);
    this.revealLeaf(existingLeaf, { activate: true, focusIframe: true });
  }

  async ensureSessionUrl(view: OpenCodeView): Promise<void> {
    if (this.getServerState() !== "running") {
      return;
    }

    const latestSessionId = await this.client.getLatestSessionId();
    if (latestSessionId) {
      const latestSessionUrl = this.client.getSessionUrl(latestSessionId);
      this.currentSession.rememberSessionUrl(latestSessionUrl);
      view.setIframeUrl(latestSessionUrl);
      await this.contextManager.restoreFromServer(latestSessionId);
      if (this.app.workspace.activeLeaf === view.leaf) {
        await this.contextManager.refreshVisibleOpenCodeContext();
      }
      return;
    }

    const currentSessionId = this.currentSession.getSessionIdForLeaf(view.leaf);
    if (currentSessionId) {
      await this.contextManager.restoreFromServer(currentSessionId);
      return;
    }

    const sessionId = await this.client.createSession();
    if (!sessionId) {
      return;
    }

    const sessionUrl = this.client.getSessionUrl(sessionId);
    this.currentSession.rememberSessionUrl(sessionUrl);
    view.setIframeUrl(sessionUrl);
    await this.contextManager.restoreFromServer(sessionId);

    if (this.app.workspace.activeLeaf === view.leaf) {
      await this.contextManager.refreshVisibleOpenCodeContext();
    }
  }
}
