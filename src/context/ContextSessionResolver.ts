import { OPENCODE_VIEW_TYPE } from "../types";

type SessionLeaf = {
  view: {
    getViewType(): string;
    getIframeUrl?: () => string | null;
  };
};

type CurrentContextSessionDeps = {
  getCachedIframeUrl: () => string | null;
  setCachedIframeUrl: (url: string | null) => void;
  resolveSessionId: (iframeUrl: string) => string | null;
};

export class CurrentContextSession {
  private getCachedIframeUrl: () => string | null;
  private setCachedIframeUrl: (url: string | null) => void;
  private resolveSessionId: (iframeUrl: string) => string | null;

  constructor(deps: CurrentContextSessionDeps) {
    this.getCachedIframeUrl = deps.getCachedIframeUrl;
    this.setCachedIframeUrl = deps.setCachedIframeUrl;
    this.resolveSessionId = deps.resolveSessionId;
  }

  getCurrentSessionId(): string | null {
    return this.getSessionIdFromUrl(this.getCachedIframeUrl());
  }

  getSessionIdForLeaf(leaf: SessionLeaf): string | null {
    const cachedSessionId = this.getCurrentSessionId();
    if (cachedSessionId) {
      return cachedSessionId;
    }

    const iframeUrl = this.getIframeUrlFromLeaf(leaf);
    const sessionId = this.getSessionIdFromUrl(iframeUrl);
    if (!sessionId) {
      return null;
    }

    this.setCachedIframeUrl(iframeUrl);
    return sessionId;
  }

  rememberSessionUrl(iframeUrl: string): string | null {
    const sessionId = this.getSessionIdFromUrl(iframeUrl);
    if (!sessionId) {
      return null;
    }

    this.setCachedIframeUrl(iframeUrl);
    return sessionId;
  }

  private getSessionIdFromUrl(iframeUrl: string | null): string | null {
    return iframeUrl ? this.resolveSessionId(iframeUrl) : null;
  }

  private getIframeUrlFromLeaf(leaf: SessionLeaf): string | null {
    if (leaf.view.getViewType() !== OPENCODE_VIEW_TYPE) {
      return null;
    }

    return typeof leaf.view.getIframeUrl === "function" ? leaf.view.getIframeUrl() : null;
  }
}
