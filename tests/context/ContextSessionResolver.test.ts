import { describe, expect, test } from "bun:test";
import { CurrentContextSession } from "../../src/context/ContextSessionResolver";
import { OPENCODE_VIEW_TYPE } from "../../src/types";

describe("CurrentContextSession", () => {
  test("resolves the current session id from the cached iframe URL", () => {
    const session = createSession("http://127.0.0.1:4097/project/session/ses_1");

    expect(session.getCurrentSessionId()).toBe("ses_1");
  });

  test("returns null when the cached iframe URL is missing or malformed", () => {
    expect(createSession(null).getCurrentSessionId()).toBeNull();
    expect(createSession("http://127.0.0.1:4097/project").getCurrentSessionId()).toBeNull();
  });

  test("uses an OpenCode leaf iframe URL when no cached session URL is available", () => {
    const cachedUrl: { value: string | null } = { value: null };
    const session = createSession(null, (url) => {
      cachedUrl.value = url;
    });

    const sessionId = session.getSessionIdForLeaf(
      createLeaf("http://127.0.0.1:4097/project/session/ses_2")
    );

    expect(sessionId).toBe("ses_2");
    expect(cachedUrl.value).toBe("http://127.0.0.1:4097/project/session/ses_2");
  });

  test("keeps the cached session ahead of a leaf URL", () => {
    let cachedUrl: string | null = "http://127.0.0.1:4097/project/session/ses_cached";
    const session = createSession(cachedUrl, (url) => {
      cachedUrl = url;
    });

    const sessionId = session.getSessionIdForLeaf(
      createLeaf("http://127.0.0.1:4097/project/session/ses_leaf")
    );

    expect(sessionId).toBe("ses_cached");
    expect(cachedUrl).toBe("http://127.0.0.1:4097/project/session/ses_cached");
  });

  test("ignores non-OpenCode leaves", () => {
    const session = createSession(null);

    const sessionId = session.getSessionIdForLeaf(
      createLeaf("http://127.0.0.1:4097/project/session/ses_1", "markdown")
    );

    expect(sessionId).toBeNull();
  });

  test("remembers only URLs that resolve to a session id", () => {
    const cachedUrl: { value: string | null } = { value: null };
    const session = createSession(null, (url) => {
      cachedUrl.value = url;
    });

    expect(session.rememberSessionUrl("http://127.0.0.1:4097/project")).toBeNull();
    expect(cachedUrl.value).toBeNull();
    expect(session.rememberSessionUrl("http://127.0.0.1:4097/project/session/ses_3")).toBe("ses_3");
    expect(cachedUrl.value).toBe("http://127.0.0.1:4097/project/session/ses_3");
  });
});

function createSession(
  cachedUrl: string | null,
  setCachedIframeUrl: (url: string | null) => void = () => {}
): CurrentContextSession {
  return new CurrentContextSession({
    getCachedIframeUrl: () => cachedUrl,
    setCachedIframeUrl,
    resolveSessionId: (url) => url.match(/\/session\/([^/?#]+)/)?.[1] ?? null,
  });
}

function createLeaf(iframeUrl: string | null, viewType = OPENCODE_VIEW_TYPE) {
  return {
    view: {
      getViewType: () => viewType,
      getIframeUrl: () => iframeUrl,
    },
  };
}
