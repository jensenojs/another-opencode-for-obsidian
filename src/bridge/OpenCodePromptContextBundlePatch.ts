export type PromptContextBundlePatchPoint = "port" | "activation" | "close";
export type PromptContextBundlePatchStatus = "patched" | "missing-anchor" | "ambiguous-anchor";

export interface PromptContextBundlePatchPointResult {
  status: PromptContextBundlePatchStatus;
  anchorCount: number;
}

export interface PromptContextBundlePatchResult {
  status: PromptContextBundlePatchStatus;
  code: string;
  patches: Record<PromptContextBundlePatchPoint, PromptContextBundlePatchPointResult>;
  patchedPoints: PromptContextBundlePatchPoint[];
}

export interface PromptContextBundlePatchAssetDiagnostic {
  path: string;
  status: PromptContextBundlePatchStatus;
  patches: Record<PromptContextBundlePatchPoint, PromptContextBundlePatchPointResult>;
  patchedPoints: PromptContextBundlePatchPoint[];
}

export interface PromptContextBundlePatchDiagnostics {
  status: PromptContextBundlePatchStatus;
  patches: Record<
    PromptContextBundlePatchPoint,
    PromptContextBundlePatchPointResult & { path?: string }
  >;
  assets: PromptContextBundlePatchAssetDiagnostic[];
}

const PORT_CONTEXT_ANCHOR =
  "context:{items:()=>l().context.items(),add:u=>l().context.add(u),remove:u=>l().context.remove(u),removeComment:(u,d)=>l().context.removeComment(u,d),updateComment:(u,d,f)=>l().context.updateComment(u,d,f),replaceComments:u=>l().context.replaceComments(u)},set:";
const PORT_CONTEXT_PATCH = `context:{items:()=>l().context.items(),add:u=>l().context.add(u),remove:u=>l().context.remove(u),removeComment:(u,d)=>l().context.removeComment(u,d),updateComment:(u,d,f)=>l().context.updateComment(u,d,f),replaceComments:u=>l().context.replaceComments(u)},set:`;
const PORT_RETURN_PREFIX = "return{ready:()=>l().ready";
const PORT_INSTALL =
  'typeof window<"u"&&window.__anotherOpenCodeForObsidianInstallPromptContextPort?.(()=>({items:()=>l().context.items(),add:u=>l().context.add(u),remove:u=>l().context.remove(u),removeComment:(u,d)=>l().context.removeComment(u,d),updateComment:(u,d,f)=>l().context.updateComment(u,d,f),replaceComments:u=>l().context.replaceComments(u)}));';
const ACTIVATION_ANCHOR_PATTERN = /([A-Za-z_$][\w$]*)\.\$\$click=\(\)=>e\.openComment\(n\)/g;
const CLOSE_ANCHOR_PATTERN =
  /onClick:([A-Za-z_$][\w$]*)=>\{\1\.stopPropagation\(\),e\.remove\(n\)\}/g;

export function patchOpenCodePromptContextBundle(input: string): PromptContextBundlePatchResult {
  const patches = {
    port: evaluatePatchPoint(input, PORT_CONTEXT_ANCHOR),
    activation: evaluateRegexPatchPoint(input, ACTIVATION_ANCHOR_PATTERN),
    close: evaluateRegexPatchPoint(input, CLOSE_ANCHOR_PATTERN),
  } satisfies Record<PromptContextBundlePatchPoint, PromptContextBundlePatchPointResult>;

  const status = summarizePatchStatus(patches);
  if (status === "ambiguous-anchor") {
    return { status, code: input, patches, patchedPoints: [] };
  }

  const patchedPoints: PromptContextBundlePatchPoint[] = [];
  let code = input;
  if (patches.port.status === "patched") {
    code = patchPortAnchor(code);
    patchedPoints.push("port");
  }
  if (patches.activation.status === "patched") {
    code = patchActivationAnchor(code);
    patchedPoints.push("activation");
  }
  if (patches.close.status === "patched") {
    code = patchCloseAnchor(code);
    patchedPoints.push("close");
  }

  return {
    status,
    code,
    patches,
    patchedPoints,
  };
}

export function mergePromptContextBundlePatchDiagnostics(
  previous: PromptContextBundlePatchDiagnostics | null,
  path: string,
  result: PromptContextBundlePatchResult
): PromptContextBundlePatchDiagnostics {
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
    activation: summarizePatchPointAcrossAssets(assets, "activation"),
    close: summarizePatchPointAcrossAssets(assets, "close"),
  } satisfies PromptContextBundlePatchDiagnostics["patches"];

  return {
    status: summarizePatchStatus(patches),
    patches,
    assets,
  };
}

function patchPortAnchor(input: string): string {
  const contextIndex = input.indexOf(PORT_CONTEXT_ANCHOR);
  if (contextIndex < 0) {
    return input;
  }

  const prefixIndex = input.lastIndexOf(PORT_RETURN_PREFIX, contextIndex);
  if (prefixIndex < 0) {
    return input.replace(PORT_CONTEXT_ANCHOR, PORT_CONTEXT_PATCH);
  }
  return `${input.slice(0, prefixIndex)}${PORT_INSTALL}${input.slice(prefixIndex)}`;
}

function patchActivationAnchor(input: string): string {
  return input.replace(
    ACTIVATION_ANCHOR_PATTERN,
    (_match, elementVariable: string) =>
      `${elementVariable}.$$click=()=>{if(window.__anotherOpenCodeForObsidianPromptContextHooks?.activated?.(n)!==false)e.openComment(n)}`
  );
}

function patchCloseAnchor(input: string): string {
  return input.replace(
    CLOSE_ANCHOR_PATTERN,
    (_match, eventVariable: string) =>
      `onClick:${eventVariable}=>{${eventVariable}.stopPropagation(),window.__anotherOpenCodeForObsidianPromptContextHooks?.removed?.(n),e.remove(n)}`
  );
}

function evaluatePatchPoint(input: string, anchor: string): PromptContextBundlePatchPointResult {
  const anchorCount = countOccurrences(input, anchor);
  if (anchorCount === 1) {
    return { status: "patched", anchorCount };
  }
  return {
    status: anchorCount === 0 ? "missing-anchor" : "ambiguous-anchor",
    anchorCount,
  };
}

function evaluateRegexPatchPoint(
  input: string,
  anchor: RegExp
): PromptContextBundlePatchPointResult {
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
  patches: Record<PromptContextBundlePatchPoint, PromptContextBundlePatchPointResult>
): PromptContextBundlePatchStatus {
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
  assets: PromptContextBundlePatchAssetDiagnostic[],
  point: PromptContextBundlePatchPoint
): PromptContextBundlePatchPointResult & { path?: string } {
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

function countRegexOccurrences(input: string, pattern: RegExp): number {
  const regex = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  );
  return Array.from(input.matchAll(regex)).length;
}
