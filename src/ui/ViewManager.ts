import { App, WorkspaceLeaf } from "obsidian";
import { OPENCODE_VIEW_TYPE, type OpenCodeSettings } from "../types";
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

  async activateView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      this.startServerForUserActivation();
      return;
    }

    const leaf =
      this.settings.defaultViewLocation === "main"
        ? this.app.workspace.getLeaf("tab")
        : this.app.workspace.getRightLeaf(false);

    if (leaf) {
      await leaf.setViewState({
        type: OPENCODE_VIEW_TYPE,
        active: true,
      });
      this.app.workspace.revealLeaf(leaf);
      this.startServerForUserActivation();
      const view = leaf.view;
      if (view instanceof OpenCodeView) {
        requestAnimationFrame(() => view.focusIframe());
      }
    }
  }

  private startServerForUserActivation(): void {
    if (this.getServerState() === "stopped") {
      this.startServer();
    }
  }

  async toggleView(): Promise<void> {
    const existingLeaf = this.getExistingLeaf();

    if (existingLeaf) {
      const isInSidebar = existingLeaf.getRoot() === this.app.workspace.rightSplit;

      if (isInSidebar) {
        const rightSplit = this.app.workspace.rightSplit;
        if (rightSplit && !rightSplit.collapsed) {
          if (this.app.workspace.activeLeaf === existingLeaf) {
            rightSplit.collapse();
            if (this.previousEditorLeaf && this.previousEditorLeaf !== existingLeaf) {
              this.app.workspace.setActiveLeaf(this.previousEditorLeaf, { focus: true });
            }
          } else {
            this.app.workspace.revealLeaf(existingLeaf);
            this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
            this.startServerForUserActivation();
            const view = existingLeaf.view;
            if (view instanceof OpenCodeView) {
              requestAnimationFrame(() => view.focusIframe());
            }
          }
        } else {
          const activeLeaf = this.app.workspace.activeLeaf;
          if (activeLeaf && activeLeaf !== existingLeaf) {
            this.previousEditorLeaf = activeLeaf;
          }
          this.app.workspace.revealLeaf(existingLeaf);
          this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
          this.startServerForUserActivation();
          const view = existingLeaf.view;
          if (view instanceof OpenCodeView) {
            requestAnimationFrame(() => view.focusIframe());
          }
        }
      } else {
        if (this.app.workspace.activeLeaf === existingLeaf) {
          existingLeaf.detach();
          if (this.previousEditorLeaf && this.previousEditorLeaf.view) {
            this.app.workspace.setActiveLeaf(this.previousEditorLeaf, { focus: true });
          }
        } else {
          const activeLeaf = this.app.workspace.activeLeaf;
          if (activeLeaf && activeLeaf !== existingLeaf) {
            this.previousEditorLeaf = activeLeaf;
          }
          this.app.workspace.revealLeaf(existingLeaf);
          this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
          this.startServerForUserActivation();
          const view = existingLeaf.view;
          if (view instanceof OpenCodeView) {
            requestAnimationFrame(() => view.focusIframe());
          }
        }
      }
    } else {
      await this.activateView();
    }
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
