export type TerminalBundlePatchPoint = "theme" | "transparency";
export type TerminalBundlePatchStatus = "patched" | "missing-anchor" | "ambiguous-anchor";

export interface TerminalBundlePatchPointResult {
  status: TerminalBundlePatchStatus;
  anchorCount: number;
}

export interface TerminalBundlePatchResult {
  status: TerminalBundlePatchStatus;
  code: string;
  patches: Record<TerminalBundlePatchPoint, TerminalBundlePatchPointResult>;
  patchedPoints: TerminalBundlePatchPoint[];
}

export interface TerminalBundlePatchAssetDiagnostic {
  path: string;
  status: TerminalBundlePatchStatus;
  patches: Record<TerminalBundlePatchPoint, TerminalBundlePatchPointResult>;
  patchedPoints: TerminalBundlePatchPoint[];
}

export interface TerminalBundlePatchDiagnostics {
  status: TerminalBundlePatchStatus;
  patches: Record<TerminalBundlePatchPoint, TerminalBundlePatchPointResult & { path?: string }>;
  assets: TerminalBundlePatchAssetDiagnostic[];
}

const TERMINAL_THEME_ANCHOR = "return{background:Me,foreground:K,cursor:K,selectionBackground:Xe}";
const TERMINAL_THEME_PATCH =
  "return window.__anotherOpenCodeForObsidianTerminalTheme?.({background:Me,foreground:K,cursor:K,selectionBackground:Xe})??{background:Me,foreground:K,cursor:K,selectionBackground:Xe}";

const TERMINAL_TRANSPARENCY_ANCHOR = "allowTransparency:!1,convertEol:!1,theme:Q()";
const TERMINAL_TRANSPARENCY_PATCH = "allowTransparency:!0,convertEol:!1,theme:Q()";

export function patchOpenCodeTerminalBundle(input: string): TerminalBundlePatchResult {
  const patches = {
    theme: evaluatePatchPoint(input, TERMINAL_THEME_ANCHOR),
    transparency: evaluatePatchPoint(input, TERMINAL_TRANSPARENCY_ANCHOR),
  } satisfies Record<TerminalBundlePatchPoint, TerminalBundlePatchPointResult>;

  const status = summarizePatchStatus(patches);
  if (status === "ambiguous-anchor") {
    return { status, code: input, patches, patchedPoints: [] };
  }

  const patchedPoints: TerminalBundlePatchPoint[] = [];
  let code = input;
  if (patches.theme.status === "patched") {
    code = code.replace(TERMINAL_THEME_ANCHOR, TERMINAL_THEME_PATCH);
    patchedPoints.push("theme");
  }
  if (patches.transparency.status === "patched") {
    code = code.replace(TERMINAL_TRANSPARENCY_ANCHOR, TERMINAL_TRANSPARENCY_PATCH);
    patchedPoints.push("transparency");
  }

  return {
    status,
    code,
    patches,
    patchedPoints,
  };
}

export function mergeTerminalBundlePatchDiagnostics(
  previous: TerminalBundlePatchDiagnostics | null,
  path: string,
  result: TerminalBundlePatchResult
): TerminalBundlePatchDiagnostics {
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
    theme: summarizePatchPointAcrossAssets(assets, "theme"),
    transparency: summarizePatchPointAcrossAssets(assets, "transparency"),
  } satisfies TerminalBundlePatchDiagnostics["patches"];

  return {
    status: summarizePatchStatus(patches),
    patches,
    assets,
  };
}

function evaluatePatchPoint(input: string, anchor: string): TerminalBundlePatchPointResult {
  const anchorCount = countOccurrences(input, anchor);
  if (anchorCount === 1) {
    return { status: "patched", anchorCount };
  }
  return {
    status: anchorCount === 0 ? "missing-anchor" : "ambiguous-anchor",
    anchorCount,
  };
}

function summarizePatchStatus(
  patches: Record<TerminalBundlePatchPoint, TerminalBundlePatchPointResult>
): TerminalBundlePatchStatus {
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
  assets: TerminalBundlePatchAssetDiagnostic[],
  point: TerminalBundlePatchPoint
): TerminalBundlePatchPointResult & { path?: string } {
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

function countOccurrences(input: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let index = input.indexOf(needle);
  while (index >= 0) {
    count += 1;
    index = input.indexOf(needle, index + needle.length);
  }
  return count;
}
