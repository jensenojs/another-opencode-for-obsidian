import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from "fs";
import { request } from "http";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import * as ts from "typescript";
import { getRuntimePaths } from "../src/debug/RuntimeDiagnostics";
import { getExplicitCustomCommand, usesExplicitCustomCommand } from "../src/types";
import { BRIDGE_MESSAGES } from "../src/bridge/BridgeProtocol";

type Command = "help" | "paths" | "install" | "status" | "logs" | "doctor" | "bridge";

interface Args {
  command: Command;
  vault: string;
  opencode: string;
  lines: number;
  force: boolean;
  skipBuild: boolean;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultVault = process.env.OPENCODE_OBSIDIAN_VAULT || "/Users/oujinsai/obsidian";
const defaultOpenCodeSource = process.env.OPENCODE_SOURCE || "/Users/oujinsai/Projects/ai-cli/opencode";
const pluginId = "opencode-obsidian";

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
  }
}

function parseArgs(argv: string[]): Args {
  const command = (argv[0] || "help") as Command;
  const args: Args = {
    command,
    vault: defaultVault,
    opencode: defaultOpenCodeSource,
    lines: 80,
    force: false,
    skipBuild: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const part = argv[index];
    const next = argv[index + 1];
    if (part === "--vault" && next) {
      args.vault = resolve(next);
      index += 1;
      continue;
    }
    if (part === "--opencode" && next) {
      args.opencode = resolve(next);
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
    }
  }

  if (!["help", "paths", "install", "status", "logs", "doctor", "bridge"].includes(args.command)) {
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

Options:
  --vault <path>        Vault path. Defaults to OPENCODE_OBSIDIAN_VAULT or /Users/oujinsai/obsidian
  --opencode <path>     OpenCode source path. Defaults to OPENCODE_SOURCE or /Users/oujinsai/Projects/ai-cli/opencode
  --lines <n>           Log lines for logs/status. Default 80
  --force               Replace existing symlinks during install
  --skip-build          Skip build during doctor
`);
}

function printPaths(args: Args): void {
  const paths = getRuntimePaths();
  console.log(JSON.stringify({
    repoRoot,
    vault: args.vault,
    opencodeSource: args.opencode,
    pluginDir: pluginDir(args.vault),
    stateDir: paths.stateDir,
    logFile: paths.logFile,
    statusFile: paths.statusFile,
  }, null, 2));
}

function install(args: Args): void {
  const dir = pluginDir(args.vault);
  mkdirSync(dir, { recursive: true });

  const results = [
    linkFile(join(repoRoot, "main.js"), join(dir, "main.js"), args.force),
    linkFile(join(repoRoot, "styles.css"), join(dir, "styles.css"), args.force),
  ];

  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    results.push(linkFile(join(repoRoot, "manifest.json"), manifestPath, args.force));
  } else {
    results.push({
      path: manifestPath,
      ok: true,
      action: "kept existing manifest.json",
    });
  }

  printCheckResults(results);
}

async function status(args: Args): Promise<void> {
  const paths = getRuntimePaths();
  const runtimeStatus = readJson(paths.statusFile);
  const data = readJson(join(pluginDir(args.vault), "data.json"));
  const enabledPlugins = readJson(join(args.vault, ".obsidian", "community-plugins.json"));

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
      status: runtimeStatus,
      recentLogs: tailFile(paths.logFile, Math.min(args.lines, 20)),
    },
  };

  if (runtimeStatus?.healthUrl) {
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
      detail: build.status === 0 ? lastLines(build.stdout, 8) : lastLines(build.stderr || build.stdout, 20),
    });
  }

  const opencode = spawnSync("opencode", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  checks.push({
    name: "opencode --version",
    ok: opencode.status === 0,
    detail: opencode.status === 0 ? opencode.stdout.trim() : (opencode.stderr || opencode.stdout).trim(),
  });

  const bridgeReport = buildBridgeReport(args);
  checks.push({
    name: "bridge contracts",
    ok: bridgeReport.ok,
    detail: summarizeBridgeReport(bridgeReport),
  });

  const runtimeStatus = readJson(getRuntimePaths().statusFile);
  if (runtimeStatus?.healthUrl) {
    checks.push({
      name: "runtime health",
      ok: Boolean((await probeHealth(runtimeStatus.healthUrl)).healthy),
      detail: await probeHealth(runtimeStatus.healthUrl),
    });
  } else {
    checks.push({
      name: "runtime health",
      ok: false,
      detail: "status.json has no healthUrl yet; start Obsidian/plugin first",
    });
  }

  printCheckResults(checks.map((check) => ({
    path: check.name,
    ok: check.ok,
    action: check.detail,
  })));

  if (checks.some((check) => !check.ok)) {
    process.exitCode = 1;
  }
}

type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

interface OpenApiOperation {
  method: HttpMethod;
  path: string;
  operationId: string | null;
  raw: any;
}

interface LocalApiUse {
  source: string;
  line: number;
  method: HttpMethod;
  rawPath: string;
  path: string;
  queryParams: string[];
  body: {
    keys: string[];
    hasSpread: boolean;
  } | null;
}

interface BridgeReport {
  ok: boolean;
  contractResolution: {
    mode: "local";
    network: "not-used";
    updatePath: string;
  };
  selectedContracts: {
    opencodeSource: string;
    opencodeGitHead: string | null;
    openapiVersion: string | null;
    openapiSpecVersion: string | null;
    obsidianPackageVersion: string | null;
  };
  sources: {
    openapi: SourceReport;
    opencodeHooks: SourceReport;
    obsidianTypes: SourceReport;
    localBridgeProtocol: SourceReport;
  };
  opencode: {
    apiOperations: number;
    apiUses: ApiUseReport[];
    hooks: HookReport;
  };
  obsidian: {
    workspaceEvents: WorkspaceEventReport[];
    declaredWorkspaceEvents: string[];
  };
  localBridge: {
    postMessageTypes: string[];
  };
}

interface SourceReport {
  path: string;
  referenceUrl: string;
  exists: boolean;
}

interface ApiUseReport extends LocalApiUse {
  ok: boolean;
  operationId: string | null;
  matchedPath: string | null;
  missingQueryParams: string[];
  unknownBodyKeys: string[];
  missingBodyKeys: string[];
  bodyNotAllowed: boolean;
}

interface HookReport {
  ok: boolean;
  source: SourceReport;
  names: string[];
  error: string | null;
}

interface WorkspaceEventReport {
  ok: boolean;
  source: string;
  line: number;
  event: string;
}

const httpMethods = new Set<HttpMethod>(["get", "post", "patch", "put", "delete"]);
const opencodeOpenApiReferenceUrl = "https://github.com/sst/opencode/blob/dev/packages/sdk/openapi.json";
const opencodeHooksReferenceUrl = "https://github.com/sst/opencode/blob/dev/packages/plugin/src/index.ts";
const obsidianTypesReferenceUrl = "https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts";

// Bridge checks use local contract files as the gold standard:
// - OpenCode HTTP: packages/sdk/openapi.json
// - OpenCode hooks: packages/plugin/src/index.ts
// - Obsidian events: node_modules/obsidian/obsidian.d.ts
// The referenceUrl fields below are only breadcrumbs for maintainers; harness never fetches them.
function bridge(args: Args): void {
  const report = buildBridgeReport(args);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

function buildBridgeReport(args: Args): BridgeReport {
  const openapiPath = join(args.opencode, "packages", "sdk", "openapi.json");
  const hooksPath = join(args.opencode, "packages", "plugin", "src", "index.ts");
  const obsidianTypesPath = join(repoRoot, "node_modules", "obsidian", "obsidian.d.ts");
  const localBridgeProtocolPath = join(repoRoot, "src", "bridge", "BridgeProtocol.ts");

  const openapiSource = sourceReport(openapiPath, opencodeOpenApiReferenceUrl);
  const hooksSource = sourceReport(hooksPath, opencodeHooksReferenceUrl);
  const obsidianTypesSource = sourceReport(obsidianTypesPath, obsidianTypesReferenceUrl);
  const localBridgeProtocolSource = sourceReport(localBridgeProtocolPath, "src/bridge/BridgeProtocol.ts");

  const openapi = openapiSource.exists ? readJson(openapiPath) : null;
  const operations = collectOpenApiOperations(openapi);
  const apiUses = extractOpenCodeApiUses().map((use) => checkApiUse(use, operations, openapi));
  const hooks = extractOpenCodeHooks(hooksPath, hooksSource);
  const declaredWorkspaceEvents = extractObsidianWorkspaceEvents(obsidianTypesPath);
  const workspaceEvents = extractLocalWorkspaceEvents().map((event) => ({
    ...event,
    ok: declaredWorkspaceEvents.includes(event.event),
  }));

  const ok =
    openapiSource.exists &&
    hooks.ok &&
    obsidianTypesSource.exists &&
    localBridgeProtocolSource.exists &&
    apiUses.every((use) => use.ok) &&
    workspaceEvents.every((event) => event.ok);

  return {
    ok,
    contractResolution: {
      mode: "local",
      network: "not-used",
      updatePath: "Update the local OpenCode checkout or npm dependencies, then rerun bun run harness bridge.",
    },
    selectedContracts: {
      opencodeSource: args.opencode,
      opencodeGitHead: gitHead(args.opencode),
      openapiVersion: typeof openapi?.info?.version === "string" ? openapi.info.version : null,
      openapiSpecVersion: typeof openapi?.openapi === "string" ? openapi.openapi : null,
      obsidianPackageVersion: packageVersion(join(repoRoot, "node_modules", "obsidian", "package.json")),
    },
    sources: {
      openapi: openapiSource,
      opencodeHooks: hooksSource,
      obsidianTypes: obsidianTypesSource,
      localBridgeProtocol: localBridgeProtocolSource,
    },
    opencode: {
      apiOperations: operations.length,
      apiUses,
      hooks,
    },
    obsidian: {
      workspaceEvents,
      declaredWorkspaceEvents,
    },
    localBridge: {
      postMessageTypes: Object.values(BRIDGE_MESSAGES),
    },
  };
}

function sourceReport(path: string, referenceUrl: string): SourceReport {
  return {
    path,
    referenceUrl,
    exists: existsSync(path),
  };
}

function collectOpenApiOperations(openapi: any): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  const paths = openapi?.paths;
  if (!paths || typeof paths !== "object") {
    return operations;
  }

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    for (const [method, raw] of Object.entries(pathItem as Record<string, unknown>)) {
      const normalizedMethod = method.toLowerCase() as HttpMethod;
      if (!httpMethods.has(normalizedMethod)) {
        continue;
      }
      operations.push({
        method: normalizedMethod,
        path,
        operationId: typeof (raw as any)?.operationId === "string" ? (raw as any).operationId : null,
        raw,
      });
    }
  }

  return operations;
}

function extractOpenCodeApiUses(): LocalApiUse[] {
  return [
    ...extractRequestCalls(join(repoRoot, "src", "client", "OpenCodeClient.ts")),
    ...extractHealthUrlUse(join(repoRoot, "src", "types.ts")),
  ];
}

function extractRequestCalls(filePath: string): LocalApiUse[] {
  const source = readSourceFile(filePath);
  if (!source) {
    return [];
  }

  const uses: LocalApiUse[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isRequestCall(node)) {
      const method = literalText(node.arguments[0])?.toLowerCase() as HttpMethod | undefined;
      const rawPath = node.arguments[1] ? expressionToTemplatePattern(node.arguments[1]) : null;
      if (method && httpMethods.has(method) && rawPath) {
        uses.push({
          source: sourceRelativePath(filePath),
          line: lineNumber(source, node),
          method,
          rawPath,
          path: toOpenApiPath(rawPath),
          queryParams: extractQueryParams(rawPath),
          body: node.arguments[2] ? extractObjectBody(node.arguments[2]) : null,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return uses;
}

function extractHealthUrlUse(filePath: string): LocalApiUse[] {
  const source = readSourceFile(filePath);
  if (!source) {
    return [];
  }

  const uses: LocalApiUse[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      propertyNameText(node.name) === "healthUrl"
    ) {
      const rawPath = expressionToTemplatePattern(node.initializer);
      if (rawPath) {
        uses.push({
          source: sourceRelativePath(filePath),
          line: lineNumber(source, node),
          method: "get",
          rawPath,
          path: toOpenApiPath(rawPath),
          queryParams: extractQueryParams(rawPath),
          body: null,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return uses;
}

function isRequestCall(node: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "request" &&
    node.arguments.length >= 2
  );
}

function checkApiUse(
  use: LocalApiUse,
  operations: OpenApiOperation[],
  openapi: any
): ApiUseReport {
  const operation = findOperation(use, operations);
  const undeclaredQueryParams = operation
    ? findUndeclaredQueryParams(use, operation)
    : use.queryParams;
  const bodyCheck = operation
    ? checkBody(use, operation, openapi)
    : {
        unknownBodyKeys: use.body?.keys ?? [],
        missingBodyKeys: [],
        bodyNotAllowed: Boolean(use.body),
      };
  const ok =
    Boolean(operation) &&
    undeclaredQueryParams.length === 0 &&
    bodyCheck.unknownBodyKeys.length === 0 &&
    bodyCheck.missingBodyKeys.length === 0 &&
    !bodyCheck.bodyNotAllowed;

  return {
    ...use,
    ok,
    operationId: operation?.operationId ?? null,
    matchedPath: operation?.path ?? null,
    missingQueryParams: undeclaredQueryParams,
    ...bodyCheck,
  };
}

function findOperation(use: LocalApiUse, operations: OpenApiOperation[]): OpenApiOperation | null {
  const candidates = operations.filter((operation) => (
    operation.method === use.method &&
    pathShapeMatches(use.path, operation.path)
  ));
  return candidates[0] ?? null;
}

function pathShapeMatches(localPath: string, specPath: string): boolean {
  const localSegments = splitPath(localPath);
  const specSegments = splitPath(specPath);
  if (localSegments.length !== specSegments.length) {
    return false;
  }

  return localSegments.every((segment, index) => {
    const specSegment = specSegments[index];
    if (segment === "{}" || segment.startsWith("{")) {
      return specSegment.startsWith("{") && specSegment.endsWith("}");
    }
    return segment === specSegment;
  });
}

function splitPath(path: string): string[] {
  return path.replace(/\/+$/, "").split("/").filter(Boolean);
}

function findUndeclaredQueryParams(use: LocalApiUse, operation: OpenApiOperation): string[] {
  const declared = new Set(
    ((operation.raw?.parameters ?? []) as any[])
      .filter((parameter) => parameter?.in === "query" && typeof parameter?.name === "string")
      .map((parameter) => parameter.name)
  );
  return use.queryParams.filter((param) => !declared.has(param));
}

function checkBody(use: LocalApiUse, operation: OpenApiOperation, openapi: any): {
  unknownBodyKeys: string[];
  missingBodyKeys: string[];
  bodyNotAllowed: boolean;
} {
  if (!use.body) {
    return {
      unknownBodyKeys: [],
      missingBodyKeys: [],
      bodyNotAllowed: false,
    };
  }

  const schema = operation.raw?.requestBody?.content?.["application/json"]?.schema;
  if (!schema) {
    return {
      unknownBodyKeys: use.body.keys,
      missingBodyKeys: [],
      bodyNotAllowed: true,
    };
  }

  const shape = resolveObjectShape(schema, openapi);
  if (!shape) {
    return {
      unknownBodyKeys: [],
      missingBodyKeys: [],
      bodyNotAllowed: false,
    };
  }

  const unknownBodyKeys = shape.properties.length > 0
    ? use.body.keys.filter((key) => !shape.properties.includes(key))
    : [];
  const missingBodyKeys = use.body.hasSpread
    ? []
    : shape.required.filter((key) => !use.body?.keys.includes(key));

  return {
    unknownBodyKeys,
    missingBodyKeys,
    bodyNotAllowed: false,
  };
}

function resolveObjectShape(
  schema: any,
  openapi: any,
  seen = new Set<string>()
): { properties: string[]; required: string[] } | null {
  if (!schema || typeof schema !== "object") {
    return null;
  }

  if (typeof schema.$ref === "string") {
    if (seen.has(schema.$ref)) {
      return null;
    }
    seen.add(schema.$ref);
    const resolved = resolveRef(schema.$ref, openapi);
    return resolveObjectShape(resolved, openapi, seen);
  }

  if (Array.isArray(schema.anyOf)) {
    return mergeShapes(schema.anyOf.map((item: any) => resolveObjectShape(item, openapi, seen)));
  }

  if (Array.isArray(schema.allOf)) {
    return mergeShapes(schema.allOf.map((item: any) => resolveObjectShape(item, openapi, seen)));
  }

  if (schema.properties && typeof schema.properties === "object") {
    return {
      properties: Object.keys(schema.properties),
      required: Array.isArray(schema.required) ? schema.required.filter((item: unknown) => typeof item === "string") : [],
    };
  }

  return null;
}

function mergeShapes(shapes: Array<{ properties: string[]; required: string[] } | null>): {
  properties: string[];
  required: string[];
} | null {
  const present = shapes.filter((shape): shape is { properties: string[]; required: string[] } => Boolean(shape));
  if (present.length === 0) {
    return null;
  }
  return {
    properties: Array.from(new Set(present.flatMap((shape) => shape.properties))),
    required: Array.from(new Set(present.flatMap((shape) => shape.required))),
  };
}

function resolveRef(ref: string, openapi: any): any {
  if (!ref.startsWith("#/")) {
    return null;
  }
  return ref
    .slice(2)
    .split("/")
    .reduce((value, key) => value?.[key], openapi);
}

function extractOpenCodeHooks(filePath: string, source: SourceReport): HookReport {
  const sourceFile = readSourceFile(filePath);
  if (!sourceFile) {
    return {
      ok: false,
      source,
      names: [],
      error: "Hook source file is missing or unreadable",
    };
  }

  const hooks: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "Hooks") {
      for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
          const name = propertyNameText(member.name);
          if (name) {
            hooks.push(name);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    ok: hooks.length > 0,
    source,
    names: hooks,
    error: hooks.length > 0 ? null : "Interface Hooks was not found or had no members",
  };
}

function extractObsidianWorkspaceEvents(filePath: string): string[] {
  const source = readSourceFile(filePath);
  if (!source) {
    return [];
  }

  const events: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === "Workspace") {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || propertyNameText(member.name) !== "on") {
          continue;
        }
        const firstParam = member.parameters[0];
        const event = firstParam?.type && ts.isLiteralTypeNode(firstParam.type)
          ? literalText(firstParam.type.literal)
          : null;
        if (event) {
          events.push(event);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return Array.from(new Set(events)).sort();
}

function extractLocalWorkspaceEvents(): Array<{ source: string; line: number; event: string }> {
  const files = [
    join(repoRoot, "src", "main.ts"),
    join(repoRoot, "src", "context", "ContextManager.ts"),
  ];
  const events: Array<{ source: string; line: number; event: string }> = [];

  for (const filePath of files) {
    const source = readSourceFile(filePath);
    if (!source) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && isWorkspaceOnCall(node, source)) {
        const event = literalText(node.arguments[0]);
        if (event) {
          events.push({
            source: sourceRelativePath(filePath),
            line: lineNumber(source, node),
            event,
          });
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return events;
}

function isWorkspaceOnCall(node: ts.CallExpression, source: ts.SourceFile): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "on") {
    return false;
  }
  return node.expression.expression.getText(source).includes("workspace");
}

function readSourceFile(filePath: string): ts.SourceFile | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const text = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function literalText(node: ts.Node | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function expressionToTemplatePattern(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.reduce(
      (text, span) => `${text}{}${span.literal.text}`,
      node.head.text
    );
  }

  if (ts.isIdentifier(node)) {
    return "{}";
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = expressionToTemplatePattern(node.left);
    const right = expressionToTemplatePattern(node.right);
    return left !== null && right !== null ? left + right : null;
  }

  return null;
}

function extractObjectBody(node: ts.Expression): { keys: string[]; hasSpread: boolean } | null {
  if (!ts.isObjectLiteralExpression(node)) {
    return {
      keys: [],
      hasSpread: true,
    };
  }

  const keys: string[] = [];
  let hasSpread = false;

  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) {
      hasSpread = true;
      continue;
    }
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = propertyNameText(property.name);
      if (name) {
        keys.push(name);
      }
    }
  }

  return {
    keys,
    hasSpread,
  };
}

function toOpenApiPath(rawPath: string): string {
  const pathWithoutQuery = rawPath.split("?")[0];
  return pathWithoutQuery
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\{\}(?=\/)/, "");
}

function extractQueryParams(rawPath: string): string[] {
  const query = rawPath.split("?")[1];
  if (!query) {
    return [];
  }
  return query
    .split("&")
    .map((part) => part.split("=")[0])
    .filter(Boolean);
}

function lineNumber(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function sourceRelativePath(filePath: string): string {
  return filePath.startsWith(repoRoot) ? filePath.slice(repoRoot.length + 1) : filePath;
}

function packageVersion(packagePath: string): string | null {
  const manifest = readJson(packagePath);
  return typeof manifest?.version === "string" ? manifest.version : null;
}

function gitHead(path: string): string | null {
  const result = spawnSync("git", ["-C", path, "rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function summarizeBridgeReport(report: BridgeReport): unknown {
  return {
    selectedContracts: report.selectedContracts,
    openapi: report.sources.openapi,
    opencodeApiUses: {
      total: report.opencode.apiUses.length,
      failed: report.opencode.apiUses.filter((use) => !use.ok),
    },
    opencodeHooks: {
      ok: report.opencode.hooks.ok,
      count: report.opencode.hooks.names.length,
      error: report.opencode.hooks.error,
      source: report.opencode.hooks.source,
    },
    obsidianWorkspaceEvents: {
      total: report.obsidian.workspaceEvents.length,
      failed: report.obsidian.workspaceEvents.filter((event) => !event.ok),
      source: report.sources.obsidianTypes,
    },
    localBridgeMessages: report.localBridge.postMessageTypes,
  };
}

function pluginDir(vault: string): string {
  return join(vault, ".obsidian", "plugins", pluginId);
}

function linkFile(target: string, linkPath: string, force: boolean): { path: string; ok: boolean; action: string } {
  if (!existsSync(target)) {
    return { path: linkPath, ok: false, action: `missing target ${target}` };
  }

  if (existsSync(linkPath)) {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      if (force) {
        unlinkSync(linkPath);
      } else {
        return { path: linkPath, ok: true, action: "symlink already exists" };
      }
    } else {
      return {
        path: linkPath,
        ok: false,
        action: "existing non-symlink file; remove or move it explicitly",
      };
    }
  }

  symlinkSync(target, linkPath);
  return { path: linkPath, ok: true, action: `linked -> ${target}` };
}

function describePath(path: string): unknown {
  if (!existsSync(path)) {
    return { exists: false, path };
  }
  const stat = lstatSync(path);
  return {
    exists: true,
    path,
    type: stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file",
  };
}

function readJson(path: string): any | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function summarizeSettings(data: any): unknown {
  const customCommand = String(data.customCommand ?? "");
  const useCustomCommand = Boolean(data.useCustomCommand);

  return {
    port: data.port,
    hostname: data.hostname,
    autoStart: data.autoStart,
    useCustomCommand,
    customCommand,
    explicitCustomCommand: getExplicitCustomCommand({ customCommand }) || null,
    effectiveStartMode: usesExplicitCustomCommand({
      customCommand,
      useCustomCommand,
    }) ? "custom" : "path",
    webViewAppearance: data.webViewAppearance,
    projectDirectory: data.projectDirectory,
    startupTimeout: data.startupTimeout,
    lastSessionUrl: data.lastSessionUrl,
  };
}

function tailFile(path: string, lines: number): string {
  if (!existsSync(path)) {
    return "";
  }
  const content = readFileSync(path, "utf8");
  return content.split(/\r?\n/).filter(Boolean).slice(-lines).join("\n");
}

function isPluginEnabled(vault: string): boolean {
  const enabled = readJson(join(vault, ".obsidian", "community-plugins.json"));
  return Array.isArray(enabled) && enabled.includes(pluginId);
}

function printCheckResults(results: Array<{ path: string; ok: boolean; action: unknown }>): void {
  for (const result of results) {
    const status = result.ok ? "ok" : "fail";
    const detail = typeof result.action === "string" ? result.action : JSON.stringify(result.action);
    console.log(`${status}\t${result.path}\t${detail}`);
  }
}

async function probeHealth(url: string): Promise<{ ok: boolean; healthy?: boolean; status?: number; error?: string }> {
  return new Promise((resolveProbe) => {
    const req = request(url, { method: "GET", timeout: 2000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          resolveProbe({
            ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
            healthy: payload.healthy === true,
            status: res.statusCode,
          });
        } catch (error) {
          resolveProbe({ ok: false, status: res.statusCode, error: (error as Error).message });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolveProbe({ ok: false, error: "timeout" });
    });
    req.on("error", (error) => {
      resolveProbe({ ok: false, error: error.message });
    });
    req.end();
  });
}

function lastLines(text: string, count: number): string {
  return text.split(/\r?\n/).filter(Boolean).slice(-count).join("\n");
}

void main();
