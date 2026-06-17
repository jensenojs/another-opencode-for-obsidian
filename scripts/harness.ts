import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { getRuntimePaths } from "../src/debug/RuntimeDiagnostics";
import { buildBridgeReport, summarizeBridgeReport } from "./harness/bridgeReport";
import { probeHealth } from "./harness/healthProbe";
import {
  CheckResult,
  defaultOpenCodeSourcePath,
  defaultVaultPath,
  describePath,
  ensureDir,
  formatHomePath,
  linkFile,
  copyFile,
  pluginDir,
  pluginId,
  readJson,
  resolveHarnessPath,
  tailFile,
  tailFileLines,
} from "./harness/pathHelpers";
import {
  summarizeLogEvents,
  summarizeLogLine,
  summarizeEnvironmentDiagnostics,
  summarizeRuntimeStatus,
  summarizeSettings,
} from "./harness/runtimeSummary";
import { buildThemeReport, summarizeThemeReport } from "./harness/themeReport";

type Command = "help" | "paths" | "install" | "status" | "logs" | "doctor" | "bridge" | "theme";

interface Args {
  command: Command;
  vault: string;
  opencode: string;
  lines: number;
  force: boolean;
  skipBuild: boolean;
  themeSource: "runtime" | "fixture";
  themeFull: boolean;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "help") {
    printHelp();
    return;
  }
  if (args.command === "paths") {
    printPaths(args);
    return;
  }
  if (args.command === "install") {
    install(args);
    return;
  }
  if (args.command === "status") {
    await status(args);
    return;
  }
  if (args.command === "logs") {
    logs(args);
    return;
  }
  if (args.command === "doctor") {
    await doctor(args);
    return;
  }
  if (args.command === "bridge") {
    bridge(args);
    return;
  }
  if (args.command === "theme") {
    await theme(args);
    return;
  }
}

function parseArgs(argv: string[]): Args {
  const command = (argv[0] || "help") as Command;
  const args: Args = {
    command,
    vault: defaultVaultPath(),
    opencode: defaultOpenCodeSourcePath(),
    lines: 80,
    force: false,
    skipBuild: false,
    themeSource: "runtime",
    themeFull: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const part = argv[index];
    const next = argv[index + 1];
    if (part === "--vault" && next) {
      args.vault = resolveHarnessPath(next);
      index += 1;
      continue;
    }
    if (part === "--opencode" && next) {
      args.opencode = resolveHarnessPath(next);
      index += 1;
      continue;
    }
    if (part === "--lines" && next) {
      args.lines = Math.max(1, Number.parseInt(next, 10) || args.lines);
      index += 1;
      continue;
    }
    if (part === "--force") {
      args.force = true;
      continue;
    }
    if (part === "--skip-build") {
      args.skipBuild = true;
      continue;
    }
    if (part === "--fixture") {
      args.themeSource = "fixture";
      continue;
    }
    if (part === "--full") {
      args.themeFull = true;
      continue;
    }
  }

  if (
    !["help", "paths", "install", "status", "logs", "doctor", "bridge", "theme"].includes(
      args.command
    )
  ) {
    args.command = "help";
  }

  return args;
}

function printHelp(): void {
  console.log(`Usage: bun run harness <command> [options]

Commands:
  paths                 Print XDG runtime paths and vault plugin path
  install               Link build outputs into the vault plugin directory
  status                Print vault/plugin/runtime status
  logs                  Print the XDG runtime log tail
  doctor                Run build and runtime checks
  bridge                Check bridge contracts against OpenCode and Obsidian declarations
  theme                 Check the current proxy theme injection

Options:
  --vault <path>        Vault path. Defaults to ANOTHER_OPENCODE_FOR_OBSIDIAN_VAULT or ~/obsidian
  --opencode <path>     OpenCode source path. Defaults to OPENCODE_SOURCE or ~/Projects/ai-cli/opencode
  --lines <n>           Log lines for logs/status. Default 80
  --force               Replace existing symlinks during install
  --skip-build          Skip build during doctor
  --fixture             For theme: check current workspace proxy/theme code with a local HTML fixture
  --full                For theme: print the full diagnostics payload
`);
}

function printPaths(args: Args): void {
  const paths = getRuntimePaths();
  console.log(
    JSON.stringify(
      {
        repoRoot,
        vault: args.vault,
        opencodeSource: args.opencode,
        pluginDir: pluginDir(args.vault),
        stateDir: paths.stateDir,
        logFile: paths.logFile,
        statusFile: paths.statusFile,
      },
      null,
      2
    )
  );
}

function install(args: Args): void {
  const dir = pluginDir(args.vault);
  ensureDir(dir);

  const results = [
    linkFile(join(repoRoot, "main.js"), join(dir, "main.js"), args.force),
    linkFile(join(repoRoot, "styles.css"), join(dir, "styles.css"), args.force),
  ];

  results.push(copyFile(join(repoRoot, "manifest.json"), join(dir, "manifest.json")));

  printCheckResults(results);
}

async function status(args: Args): Promise<void> {
  const paths = getRuntimePaths();
  const runtimeStatus = readJson(paths.statusFile);
  const runtimeStatusSummary = runtimeStatus ? summarizeRuntimeStatus(runtimeStatus) : null;
  const data = readJson(join(pluginDir(args.vault), "data.json"));
  const enabledPlugins = readJson(join(args.vault, ".obsidian", "community-plugins.json"));
  const runtimeLogLines = tailFileLines(paths.logFile, args.lines);

  const result = {
    vault: {
      path: args.vault,
      exists: existsSync(args.vault),
      pluginDir: describePath(pluginDir(args.vault)),
      enabled: Array.isArray(enabledPlugins) ? enabledPlugins.includes(pluginId) : null,
    },
    pluginFiles: {
      main: describePath(join(pluginDir(args.vault), "main.js")),
      styles: describePath(join(pluginDir(args.vault), "styles.css")),
      manifest: describePath(join(pluginDir(args.vault), "manifest.json")),
      data: data ? summarizeSettings(data) : null,
    },
    runtime: {
      paths,
      status: runtimeStatusSummary,
      logSummary: summarizeLogEvents(runtimeLogLines),
      recentLogs: runtimeLogLines
        .slice(-Math.min(args.lines, 20))
        .map((line) => summarizeLogLine(line)),
    },
  };

  if (runtimeStatus?.healthUrl && result.runtime.status) {
    result.runtime.status.healthProbe = await probeHealth(runtimeStatus.healthUrl);
  }

  console.log(JSON.stringify(result, null, 2));
}

function logs(args: Args): void {
  const paths = getRuntimePaths();
  const lines = tailFile(paths.logFile, args.lines);
  if (!lines) {
    console.log(`No log file at ${paths.logFile}`);
    return;
  }
  console.log(lines);
}

async function theme(args: Args): Promise<void> {
  const report = await buildThemeReport({
    vault: args.vault,
    source: args.themeSource,
    opencodeSource: args.opencode,
    readJson,
    pluginDir,
    formatPath: formatHomePath,
  });
  console.log(JSON.stringify(args.themeFull ? report : summarizeThemeReport(report), null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

async function doctor(args: Args): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail?: unknown }> = [];

  checks.push({
    name: "vault exists",
    ok: existsSync(args.vault),
    detail: args.vault,
  });
  checks.push({
    name: "plugin enabled",
    ok: isPluginEnabled(args.vault),
  });
  checks.push({
    name: "main.js linked or present",
    ok: existsSync(join(pluginDir(args.vault), "main.js")),
    detail: describePath(join(pluginDir(args.vault), "main.js")),
  });

  if (!args.skipBuild) {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    checks.push({
      name: "bun run build",
      ok: build.status === 0,
      detail:
        build.status === 0
          ? lastLines(build.stdout, 8)
          : lastLines(build.stderr || build.stdout, 20),
    });
  }

  const opencode = spawnSync("opencode", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  checks.push({
    name: "opencode --version",
    ok: opencode.status === 0,
    detail:
      opencode.status === 0 ? opencode.stdout.trim() : (opencode.stderr || opencode.stdout).trim(),
  });

  const bridgeReport = buildBridgeReport({ repoRoot, opencodeSource: args.opencode });
  checks.push({
    name: "bridge contracts",
    ok: bridgeReport.ok,
    detail: summarizeBridgeReport(bridgeReport),
  });

  const runtimeStatus = readJson(getRuntimePaths().statusFile);
  checks.push({
    name: "runtime process environment diagnostics",
    ok: Boolean(runtimeStatus?.processEnvironment),
    detail: runtimeStatus?.processEnvironment
      ? {
          process: summarizeEnvironmentDiagnostics(runtimeStatus.processEnvironment),
          spawn: summarizeEnvironmentDiagnostics(runtimeStatus.lastSpawnEnvironment),
          mode: runtimeStatus.lastStartMode ?? null,
          usesShell: runtimeStatus.lastUsesShell ?? null,
          command: runtimeStatus.lastDisplayCommand ?? runtimeStatus.lastCommand ?? null,
          resolvedExecutable: runtimeStatus.lastResolvedExecutable ?? null,
        }
      : "status.json has no processEnvironment yet; reload the plugin with a current bundle",
  });

  if (runtimeStatus?.healthUrl) {
    const healthProbe = await probeHealth(runtimeStatus.healthUrl);
    checks.push({
      name: "runtime health",
      ok: Boolean(healthProbe.healthy),
      detail: healthProbe,
    });
  } else {
    checks.push({
      name: "runtime health",
      ok: false,
      detail: "status.json has no healthUrl yet; start Obsidian/plugin first",
    });
  }

  if (runtimeStatus?.proxyUrl) {
    const themeReport = await buildThemeReport({
      vault: args.vault,
      source: args.themeSource,
      opencodeSource: args.opencode,
      readJson,
      pluginDir,
      formatPath: formatHomePath,
    });
    checks.push({
      name: "web view theme",
      ok: themeReport.ok,
      detail: themeReport,
    });
  }

  printCheckResults(
    checks.map((check) => ({
      path: check.name,
      ok: check.ok,
      action: check.detail,
    }))
  );

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
  }
}

// Bridge checks use local contract files as the gold standard:
// - OpenCode HTTP: packages/sdk/openapi.json
// - OpenCode hooks: packages/plugin/src/index.ts
// - Obsidian events: node_modules/obsidian/obsidian.d.ts
// The referenceUrl fields below are only breadcrumbs for maintainers; harness never fetches them.
function bridge(args: Args): void {
  const report = buildBridgeReport({ repoRoot, opencodeSource: args.opencode });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function isPluginEnabled(vault: string): boolean {
  const enabled = readJson(join(vault, ".obsidian", "community-plugins.json"));
  return Array.isArray(enabled) && enabled.includes(pluginId);
}

function printCheckResults(results: CheckResult[]): void {
  for (const result of results) {
    const status = result.ok ? "ok" : "fail";
    const detail =
      typeof result.action === "string" ? result.action : JSON.stringify(result.action);
    console.log(`${status}\t${result.path}\t${detail}`);
  }
}

function lastLines(text: string, count: number): string {
  return text.split(/\r?\n/).filter(Boolean).slice(-count).join("\n");
}

void main();
