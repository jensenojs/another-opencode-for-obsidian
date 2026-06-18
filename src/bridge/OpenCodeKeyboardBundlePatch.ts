export type KeyboardBundlePatchPoint = "port" | "responsiveSidebarToggle";
export type KeyboardBundlePatchStatus = "patched" | "missing-anchor" | "ambiguous-anchor";

export interface KeyboardBundlePatchPointResult {
  status: KeyboardBundlePatchStatus;
  anchorCount: number;
}

export interface KeyboardBundlePatchResult {
  status: KeyboardBundlePatchStatus;
  code: string;
  patches: Record<KeyboardBundlePatchPoint, KeyboardBundlePatchPointResult>;
  patchedPoints: KeyboardBundlePatchPoint[];
}

export interface KeyboardBundlePatchAssetDiagnostic {
  path: string;
  status: KeyboardBundlePatchStatus;
  patches: Record<KeyboardBundlePatchPoint, KeyboardBundlePatchPointResult>;
  patchedPoints: KeyboardBundlePatchPoint[];
}

export interface KeyboardBundlePatchDiagnostics {
  status: KeyboardBundlePatchStatus;
  patches: Record<KeyboardBundlePatchPoint, KeyboardBundlePatchPointResult & { path?: string }>;
  assets: KeyboardBundlePatchAssetDiagnostic[];
}

const COMMAND_CATALOG_GETTER_PATTERN =
  /get catalog\(\)\{return ([A-Za-z_$][\w$]*)\(\)\},get options\(\)\{return ([A-Za-z_$][\w$]*)\(\)\}/g;

const SIDEBAR_TOGGLE_COMMAND_PATTERN =
  /(\{id:"sidebar\.toggle",title:[^{}]*?keybind:"mod\+b",onSelect:\(\)=>)([A-Za-z_$][\w$]*)\.sidebar\.toggle\(\)/g;

export function patchOpenCodeKeyboardBundle(input: string): KeyboardBundlePatchResult {
  const patches = {
    port: evaluateRegexPatchPoint(input, COMMAND_CATALOG_GETTER_PATTERN),
    responsiveSidebarToggle: evaluateRegexPatchPoint(input, SIDEBAR_TOGGLE_COMMAND_PATTERN),
  } satisfies Record<KeyboardBundlePatchPoint, KeyboardBundlePatchPointResult>;
  const status = summarizePatchStatus(patches);

  if (Object.values(patches).some((patch) => patch.status === "ambiguous-anchor")) {
    return { status, code: input, patches, patchedPoints: [] };
  }

  let code = input;
  const patchedPoints: KeyboardBundlePatchPoint[] = [];
  if (patches.port.status === "patched") {
    code = patchCommandCatalogGetter(code);
    patchedPoints.push("port");
  }
  if (patches.responsiveSidebarToggle.status === "patched") {
    code = patchResponsiveSidebarToggle(code);
    patchedPoints.push("responsiveSidebarToggle");
  }

  return {
    status,
    code,
    patches,
    patchedPoints,
  };
}

export function mergeKeyboardBundlePatchDiagnostics(
  previous: KeyboardBundlePatchDiagnostics | null,
  path: string,
  result: KeyboardBundlePatchResult
): KeyboardBundlePatchDiagnostics {
  const assets = [
    ...(previous?.assets.filter((asset) => asset.path !== path) ?? []),
    {
      path,
      status: result.status,
      patches: result.patches,
      patchedPoints: result.patchedPoints,
    },
  ];

  const patches = {
    port: summarizePatchPointAcrossAssets(assets, "port"),
    responsiveSidebarToggle: summarizePatchPointAcrossAssets(assets, "responsiveSidebarToggle"),
  } satisfies KeyboardBundlePatchDiagnostics["patches"];

  return {
    status: summarizePatchStatus(patches),
    patches,
    assets,
  };
}

function patchCommandCatalogGetter(input: string): string {
  return input.replace(
    COMMAND_CATALOG_GETTER_PATTERN,
    (_match, catalogGetter: string, optionsGetter: string) =>
      [
        `__anotherOpenCodeForObsidianKeyboardPort:(typeof window<"u"&&window.__anotherOpenCodeForObsidianInstallKeyboardPort?.(()=>({`,
        `catalog:()=>${catalogGetter}(),`,
        `options:()=>${optionsGetter}()`,
        `})),!0),`,
        `get catalog(){return ${catalogGetter}()},get options(){return ${optionsGetter}()}`,
      ].join("")
  );
}

function patchResponsiveSidebarToggle(input: string): string {
  return input.replace(
    SIDEBAR_TOGGLE_COMMAND_PATTERN,
    (_match, prefix: string, layoutVariable: string) =>
      [
        prefix,
        `{(typeof window<"u"&&window.matchMedia("(min-width: 1280px)").matches?`,
        `${layoutVariable}.sidebar:${layoutVariable}.mobileSidebar).toggle()}`,
      ].join("")
  );
}

function evaluateRegexPatchPoint(input: string, anchor: RegExp): KeyboardBundlePatchPointResult {
  const anchorCount = countRegexOccurrences(input, anchor);
  if (anchorCount === 1) {
    return { status: "patched", anchorCount };
  }
  return {
    status: anchorCount === 0 ? "missing-anchor" : "ambiguous-anchor",
    anchorCount,
  };
}

function summarizePatchStatus(
  patches: Record<KeyboardBundlePatchPoint, KeyboardBundlePatchPointResult>
): KeyboardBundlePatchStatus {
  const statuses = Object.values(patches).map((patch) => patch.status);
  if (statuses.every((status) => status === "patched")) {
    return "patched";
  }
  if (statuses.some((status) => status === "ambiguous-anchor")) {
    return "ambiguous-anchor";
  }
  return "missing-anchor";
}

function summarizePatchPointAcrossAssets(
  assets: KeyboardBundlePatchAssetDiagnostic[],
  point: KeyboardBundlePatchPoint
): KeyboardBundlePatchPointResult & { path?: string } {
  const pointResults = assets.map((asset) => ({
    path: asset.path,
    ...asset.patches[point],
  }));
  const anchorCount = pointResults.reduce((sum, patch) => sum + patch.anchorCount, 0);
  if (pointResults.some((patch) => patch.status === "ambiguous-anchor") || anchorCount > 1) {
    return { status: "ambiguous-anchor", anchorCount };
  }
  if (anchorCount === 1) {
    return {
      status: "patched",
      anchorCount,
      path: pointResults.find((patch) => patch.anchorCount === 1)?.path,
    };
  }
  return { status: "missing-anchor", anchorCount };
}

function countRegexOccurrences(input: string, pattern: RegExp): number {
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  return Array.from(input.matchAll(regex)).length;
}
