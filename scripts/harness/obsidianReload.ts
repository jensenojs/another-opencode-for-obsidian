import { pluginId as defaultPluginId } from "./pathHelpers";

export interface DevtoolsTarget {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface ObsidianReloadOptions {
  devtoolsListUrl: string;
  pluginId?: string;
  settleMs: number;
  openView: boolean;
  restartServer: boolean;
}

export interface ObsidianReloadSnapshot {
  enabled: boolean | null;
  serverState: string | null;
  lastSessionUrl: string | null;
  serverUrl: string | null;
  proxyOrigin: string | null;
  iframeUrls: string[];
}

export interface ObsidianReloadRuntimeResult {
  ok: boolean;
  reason?: string;
  before?: ObsidianReloadSnapshot;
  stoppedBeforeDisable?: boolean;
  afterEnable?: ObsidianReloadSnapshot;
  after?: ObsidianReloadSnapshot;
  started?: unknown;
  commandExecuted?: boolean;
  error?: string;
  stack?: string | null;
}

export interface ObsidianReloadReport {
  ok: boolean;
  devtoolsListUrl: string;
  target: Pick<DevtoolsTarget, "id" | "title" | "type" | "url"> | null;
  result: ObsidianReloadRuntimeResult | null;
  error?: string;
}

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: unknown;
}

export function defaultDevtoolsListUrl(port: number): string {
  return `http://127.0.0.1:${port}/json/list`;
}

export async function reloadObsidianPlugin(
  options: ObsidianReloadOptions
): Promise<ObsidianReloadReport> {
  let targets: DevtoolsTarget[];
  try {
    targets = await fetchDevtoolsTargets(options.devtoolsListUrl);
  } catch (error) {
    return {
      ok: false,
      devtoolsListUrl: options.devtoolsListUrl,
      target: null,
      result: null,
      error: `Failed to read Chrome DevTools targets: ${(error as Error).message}`,
    };
  }

  const target = findObsidianPageTarget(targets);
  if (!target?.webSocketDebuggerUrl) {
    return {
      ok: false,
      devtoolsListUrl: options.devtoolsListUrl,
      target: target ? describeTarget(target) : null,
      result: null,
      error: "Obsidian page target was not found. Start Obsidian with --remote-debugging-port.",
    };
  }

  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    const evaluation = await client.send("Runtime.evaluate", {
      expression: buildReloadExpression({
        pluginId: options.pluginId ?? defaultPluginId,
        settleMs: options.settleMs,
        openView: options.openView,
        restartServer: options.restartServer,
      }),
      awaitPromise: true,
      returnByValue: true,
    });
    const result = readRuntimeEvaluationValue(evaluation);
    return {
      ok: result?.ok === true,
      devtoolsListUrl: options.devtoolsListUrl,
      target: describeTarget(target),
      result,
      error: result?.ok === true ? undefined : (result?.reason ?? result?.error ?? "Reload failed"),
    };
  } finally {
    client.close();
  }
}

export function findObsidianPageTarget(targets: DevtoolsTarget[]): DevtoolsTarget | null {
  return (
    targets.find(
      (target) => target.type === "page" && target.url === "app://obsidian.md/index.html"
    ) ??
    targets.find(
      (target) =>
        target.type === "page" &&
        typeof target.url === "string" &&
        target.url.startsWith("app://obsidian.md/")
    ) ??
    null
  );
}

export function buildReloadExpression(options: {
  pluginId: string;
  settleMs: number;
  openView: boolean;
  restartServer: boolean;
}): string {
  return `
    (async () => {
      const pluginId = ${JSON.stringify(options.pluginId)};
      const settleMs = ${JSON.stringify(options.settleMs)};
      const openView = ${JSON.stringify(options.openView)};
      const restartServer = ${JSON.stringify(options.restartServer)};
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const snapshot = (obsidianApp, plugin) => ({
        enabled: obsidianApp?.plugins?.enabledPlugins?.has(pluginId) ?? null,
        serverState: plugin?.getServerState?.() ?? null,
        lastSessionUrl: plugin?.settings?.lastSessionUrl ?? null,
        serverUrl: plugin?.getServerUrl?.() ?? null,
        proxyOrigin: plugin?.getProxyOrigin?.() ?? null,
        iframeUrls: Array.from(document.querySelectorAll('iframe'))
          .map((iframe) => iframe.src)
          .filter((url) => typeof url === 'string' && url.length > 0),
      });
      try {
        const obsidianApp = window.app || globalThis.app;
        if (!obsidianApp?.plugins) {
          return { ok: false, reason: 'obsidian-app-not-found' };
        }
        const beforePlugin = obsidianApp.plugins.plugins?.[pluginId] ?? null;
        const before = snapshot(obsidianApp, beforePlugin);
        if (!beforePlugin) {
          return { ok: false, reason: 'plugin-not-found', before };
        }

        let stoppedBeforeDisable = false;
        if (restartServer && typeof beforePlugin.stopServer === 'function') {
          await beforePlugin.stopServer();
          stoppedBeforeDisable = true;
          await delay(500);
        }

        await obsidianApp.plugins.disablePlugin(pluginId);
        await delay(500);
        await obsidianApp.plugins.enablePlugin(pluginId);
        await delay(500);

        const plugin = obsidianApp.plugins.plugins?.[pluginId] ?? null;
        const afterEnable = snapshot(obsidianApp, plugin);
        if (!plugin) {
          return { ok: false, reason: 'plugin-not-loaded-after-enable', before, afterEnable };
        }

        let started = null;
        if (restartServer && typeof plugin.startServer === 'function') {
          started = await plugin.startServer();
        }
        await delay(settleMs);

        let commandExecuted = false;
        if (openView) {
          const commandId = pluginId + ':open-opencode-view';
          commandExecuted = Boolean(await obsidianApp.commands.executeCommandById(commandId));
        }
        await delay(settleMs);

        const after = snapshot(obsidianApp, plugin);
        return { ok: true, before, stoppedBeforeDisable, afterEnable, after, started, commandExecuted };
      } catch (error) {
        return {
          ok: false,
          reason: 'exception',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack ?? null : null,
        };
      }
    })()
  `;
}

async function fetchDevtoolsTargets(url: string): Promise<DevtoolsTarget[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("DevTools target list is not an array");
  }
  return payload;
}

function describeTarget(
  target: DevtoolsTarget
): Pick<DevtoolsTarget, "id" | "title" | "type" | "url"> {
  return {
    id: target.id,
    title: target.title,
    type: target.type,
    url: target.url,
  };
}

function readRuntimeEvaluationValue(evaluation: unknown): ObsidianReloadRuntimeResult | null {
  const result = evaluation as { result?: { value?: ObsidianReloadRuntimeResult } };
  return result.result?.value ?? null;
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    this.socket.onmessage = (event) => this.handleMessage(event);
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      socket.onopen = () => resolveOpen();
      socket.onerror = () => rejectOpen(new Error(`Failed to connect to ${url}`));
    });
    return new CdpClient(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
    });
  }

  close(): void {
    this.socket.close();
  }

  private handleMessage(event: MessageEvent): void {
    const message = JSON.parse(String(event.data)) as CdpResponse;
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }
    const pending = this.pending.get(message.id)!;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result);
  }
}
