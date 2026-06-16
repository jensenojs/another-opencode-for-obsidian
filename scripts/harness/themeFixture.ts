import { createServer } from "http";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Script, createContext } from "vm";
import { Window } from "happy-dom";
import { BRIDGE_MESSAGES, BRIDGE_NAMESPACE, BRIDGE_VERSION } from "../../src/bridge/BridgeProtocol";
import { OpenCodeWebUiProxy } from "../../src/proxy/OpenCodeWebUiProxy";
import { createOpenCodeWebViewTheme } from "../../src/theme/WebViewTheme";
import { fetchText, type FetchTextResult } from "./httpText";

export interface ThemeScriptExecution {
  diagnostics: unknown | null;
  error: string | null;
}

export async function fetchFixtureThemeHtml(): Promise<
  {
    url: string | null;
  } & FetchTextResult
> {
  const previousXdgStateHome = process.env.XDG_STATE_HOME;
  const fixtureStateHome = mkdtempSync(join(tmpdir(), "opencode-obsidian-theme-"));
  process.env.XDG_STATE_HOME = fixtureStateHome;
  const backend = createServer((_, res) => {
    res.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'",
    });
    res.end('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  });

  let proxy: OpenCodeWebUiProxy | null = null;

  try {
    const backendPort = await listenOnRandomPort(backend);
    const theme = createOpenCodeWebViewTheme({
      colorScheme: "dark",
      pageBackground: "rgba(0, 0, 0, 0.25)",
      backgroundPrimary: "#000000",
      backgroundPrimaryAlt: "rgb(38, 38, 39)",
      backgroundSecondary: "rgb(29, 32, 33)",
      backgroundModifierBorder: "rgb(60, 56, 54)",
      backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
      textNormal: "#f1f1f1",
      textMuted: "rgb(213, 196, 161)",
      textFaint: "rgb(146, 131, 116)",
      interactiveAccent: "hsl(41, 88%, 66%)",
      success: "rgb(84, 182, 122)",
      warning: "rgb(215, 166, 66)",
      danger: "rgb(219, 92, 92)",
      info: "rgb(95, 163, 231)",
      fontInterface: '"Monaco Nerd Font Mono", ui-sans-serif',
      editorBackgroundImage: 'url("https://example.test/bg.jpg")',
      editorBackgroundOpacity: "0.3",
      editorBackgroundBluriness: "blur(5px)",
      editorBackgroundPosition: "center",
    });
    proxy = new OpenCodeWebUiProxy("127.0.0.1", backendPort, "obsidian", theme);
    const started = await proxy.start();
    if (!started) {
      return {
        url: null,
        ok: false,
        body: "",
        error: "fixture proxy failed to start",
      };
    }
    const url = proxy.getProxyUrl("");
    return {
      url,
      ...(await fetchText(url)),
    };
  } finally {
    proxy?.stop();
    await closeServer(backend);
    restoreEnv("XDG_STATE_HOME", previousXdgStateHome);
    rmSync(fixtureStateHome, { recursive: true, force: true });
  }
}

export async function runThemeDiagnosticsFixture(
  html: string,
  url: string | null
): Promise<ThemeScriptExecution> {
  let diagnostics: unknown | null = null;
  const window = new Window({
    url: url ?? "http://127.0.0.1/",
    innerWidth: 1024,
    innerHeight: 768,
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      timer: {
        maxTimeout: 1000,
        maxIntervalTime: 20,
        maxIntervalIterations: 1,
        preventTimerLoops: true,
      },
    },
  });

  try {
    window.Object = Object;
    window.Array = Array;
    window.Math = Math;
    window.JSON = JSON;
    window.Error = Error;
    window.String = String;
    const captureThemeDiagnostics = ((message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        (message as any).ns === BRIDGE_NAMESPACE &&
        (message as any).version === BRIDGE_VERSION &&
        (message as any).type === BRIDGE_MESSAGES.themeDiagnostics
      ) {
        diagnostics = (message as any).payload ?? null;
      }
    }) as typeof window.postMessage;
    window.postMessage = captureThemeDiagnostics;
    if (window.parent) {
      window.parent.postMessage = captureThemeDiagnostics;
    }

    loadHtmlForFixture(window, html);
    await window.happyDOM.waitUntilComplete();

    return {
      diagnostics,
      error: null,
    };
  } catch (error) {
    return {
      diagnostics: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await window.happyDOM.close();
  }
}

function loadHtmlForFixture(window: Window, html: string): void {
  const parsed = new window.DOMParser().parseFromString(html, "text/html");
  const target = window.document;

  target.documentElement.innerHTML = parsed.documentElement.innerHTML;

  const scripts = Array.from(target.querySelectorAll("script"));
  for (const script of scripts) {
    const source = script.textContent;
    if (source) {
      executeInlineScript(window, source);
    }
  }
}

function executeInlineScript(window: Window, source: string): void {
  const context = createContext({
    window,
    self: window,
    globalThis: window,
    document: window.document,
    location: window.location,
    getComputedStyle: window.getComputedStyle.bind(window),
    setTimeout: window.setTimeout.bind(window),
    MutationObserver: window.MutationObserver,
    HTMLElement: window.HTMLElement,
    Error,
    Array,
    Object,
    Math,
    JSON,
    String,
  });
  new Script(source, { filename: "opencode-obsidian-theme-fixture.js" }).runInContext(context, {
    timeout: 1000,
  });
}

function listenOnRandomPort(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address && typeof address.port === "number") {
        resolveListen(address.port);
        return;
      }
      rejectListen(new Error("fixture server did not expose a TCP port"));
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (typeof value === "undefined") {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
