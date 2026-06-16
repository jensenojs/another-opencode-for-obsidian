export interface HarnessCheck {
  name: string;
  ok: boolean;
  detail?: unknown;
}

type RuntimeBackgroundSample = {
  tag: unknown;
  id: unknown;
  className?: string | null;
  dataComponent?: unknown;
  dataSlot?: unknown;
  dataDockSurface?: unknown;
  dataVariant?: unknown;
  dataOrientation?: unknown;
  backgroundColor: string | null;
  backgroundImage: string | null;
  opacity?: unknown;
  position?: unknown;
  zIndex?: unknown;
  area?: unknown;
  tokenValues?: unknown;
};

const MAX_RUNTIME_COMPOSER_MATERIAL_ALPHA = 0.32;
const MAX_RUNTIME_DOCK_MATERIAL_ALPHA = 0.56;
const MAX_RUNTIME_BACKGROUND_COMPOSER_MATERIAL_ALPHA = 0.48;
const MAX_RUNTIME_BACKGROUND_DOCK_MATERIAL_ALPHA = 0.82;

const GRUVBOX_DARK_MEDIUM_STATE_COLORS = {
  success: "#689d6a",
  warning: "#d79921",
  danger: "#cc241d",
  info: "#458588",
};

export function themeDiagnosticsResolvedChecks(
  diagnostics: unknown,
  injectedVariables: Record<string, string>
): HarnessCheck[] {
  if (!diagnostics || typeof diagnostics !== "object") {
    return [];
  }

  const variables =
    (diagnostics as any).variables && typeof (diagnostics as any).variables === "object"
      ? ((diagnostics as any).variables as Record<string, unknown>)
      : {};
  const rootBackground = "transparent";
  const backgroundSecondary =
    injectedVariables["--another-opencode-for-obsidian-background-secondary"];
  const backgroundPrimary = injectedVariables["--another-opencode-for-obsidian-background-primary"];
  const textNormal = injectedVariables["--another-opencode-for-obsidian-text-normal"];
  const border = injectedVariables["--another-opencode-for-obsidian-border"];
  const backgroundNames = [
    "--background-strong",
    "--v2-background-bg-deep",
    "--background-bg-deep",
  ];
  const backgroundSamples = Object.fromEntries(
    backgroundNames.map((name) => [
      name,
      {
        expected: rootBackground,
        actual: resolveCustomProperty(
          typeof variables[name] === "string" ? variables[name] : null,
          variables
        ),
      },
    ])
  );
  const surfaceSamples = Object.fromEntries(
    [
      "--v2-background-bg-base",
      "--background-base",
      "--background-bg-base",
      "--background-stronger",
      "--background-bg-layer-01",
      "--background-bg-layer-02",
      "--background-bg-layer-03",
      "--background-bg-layer-04",
      "--background-weak",
      "--surface-raised-base",
      "--surface-float-base",
      "--surface-raised-stronger-non-alpha",
      "--input-base",
      "--v2-overlay-simple-overlay-scrim",
      "--overlay-simple-overlay-scrim",
    ].map((name) => [
      name,
      resolveCustomProperty(
        typeof variables[name] === "string" ? variables[name] : null,
        variables
      ),
    ])
  );
  const textAndBorderSamples = {
    "--text-text-base": {
      expected: textNormal,
      actual: resolveCustomProperty(
        typeof variables["--text-text-base"] === "string" ? variables["--text-text-base"] : null,
        variables
      ),
    },
    "--border-border-base": {
      expected: border,
      actual: resolveCustomProperty(
        typeof variables["--border-border-base"] === "string"
          ? variables["--border-border-base"]
          : null,
        variables
      ),
    },
  };
  const stateSamples = Object.fromEntries(
    [
      ["--v2-state-bg-success", GRUVBOX_DARK_MEDIUM_STATE_COLORS.success],
      ["--v2-state-fg-success", GRUVBOX_DARK_MEDIUM_STATE_COLORS.success],
      ["--v2-state-border-success", GRUVBOX_DARK_MEDIUM_STATE_COLORS.success],
      ["--v2-state-bg-warning", GRUVBOX_DARK_MEDIUM_STATE_COLORS.warning],
      ["--v2-state-fg-warning", GRUVBOX_DARK_MEDIUM_STATE_COLORS.warning],
      ["--v2-state-border-warning", GRUVBOX_DARK_MEDIUM_STATE_COLORS.warning],
      ["--v2-state-bg-danger", GRUVBOX_DARK_MEDIUM_STATE_COLORS.danger],
      ["--v2-state-fg-danger", GRUVBOX_DARK_MEDIUM_STATE_COLORS.danger],
      ["--v2-state-border-danger", GRUVBOX_DARK_MEDIUM_STATE_COLORS.danger],
      ["--v2-state-bg-info", GRUVBOX_DARK_MEDIUM_STATE_COLORS.info],
      ["--v2-state-fg-info", GRUVBOX_DARK_MEDIUM_STATE_COLORS.info],
      ["--v2-state-border-info", GRUVBOX_DARK_MEDIUM_STATE_COLORS.info],
    ].map(([name, sourceColor]) => [
      name,
      {
        sourceColor,
        actual: resolveCustomProperty(
          typeof variables[name] === "string" ? variables[name] : null,
          variables
        ),
      },
    ])
  );

  return [
    {
      name: "fixture theme diagnostics root backgrounds resolve to transparent",
      ok:
        typeof rootBackground === "string" &&
        Object.values(backgroundSamples).every(
          (entry) => normalizeCssColor(entry.actual) === normalizeCssColor(entry.expected)
        ),
      detail: backgroundSamples,
    },
    {
      name: "fixture theme diagnostics surfaces resolve to Obsidian panel materials",
      ok:
        typeof backgroundSecondary === "string" &&
        usesObsidianPanelColor(surfaceSamples["--v2-background-bg-base"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-bg-layer-01"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-bg-layer-02"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-bg-layer-03"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-bg-layer-04"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-base"], backgroundSecondary) &&
        usesObsidianPanelColor(surfaceSamples["--background-weak"], backgroundSecondary) &&
        normalizeCssColor(surfaceSamples["--background-stronger"]) === "transparent" &&
        isTranslucentPanelInRange(surfaceSamples["--v2-background-bg-base"], 22, 34) &&
        isTranslucentPanelInRange(surfaceSamples["--background-bg-layer-01"], 30, 42) &&
        isTranslucentPanelInRange(surfaceSamples["--background-bg-layer-02"], 40, 52) &&
        isTranslucentPanelInRange(surfaceSamples["--background-bg-layer-03"], 52, 64) &&
        isTranslucentPanelInRange(surfaceSamples["--background-bg-layer-04"], 62, 74) &&
        surfaceSamples["--background-base"] === surfaceSamples["--v2-background-bg-base"] &&
        surfaceSamples["--background-weak"] === surfaceSamples["--background-bg-layer-01"] &&
        surfaceSamples["--background-bg-base"] === surfaceSamples["--v2-background-bg-base"] &&
        surfaceSamples["--surface-raised-base"] === surfaceSamples["--background-bg-layer-02"] &&
        surfaceSamples["--surface-float-base"] === surfaceSamples["--background-bg-layer-03"] &&
        surfaceSamples["--surface-raised-stronger-non-alpha"] ===
          surfaceSamples["--background-bg-layer-04"] &&
        surfaceSamples["--input-base"] === surfaceSamples["--background-bg-layer-01"],
      detail: {
        expectedBackgroundSecondary: backgroundSecondary,
        surfaces: surfaceSamples,
      },
    },
    {
      name: "fixture theme diagnostics dialog scrim resolves to OpenCode alpha material",
      ok:
        typeof backgroundPrimary === "string" &&
        usesObsidianBackgroundColor(
          surfaceSamples["--v2-overlay-simple-overlay-scrim"],
          backgroundPrimary
        ) &&
        isTranslucentPanelInRange(surfaceSamples["--v2-overlay-simple-overlay-scrim"], 30, 76) &&
        surfaceSamples["--overlay-simple-overlay-scrim"] ===
          surfaceSamples["--v2-overlay-simple-overlay-scrim"],
      detail: {
        expectedBackgroundPrimary: backgroundPrimary,
        scrim: surfaceSamples["--v2-overlay-simple-overlay-scrim"],
        scrimAlias: surfaceSamples["--overlay-simple-overlay-scrim"],
      },
    },
    {
      name: "fixture theme diagnostics text and border resolve to Obsidian values",
      ok:
        textAndBorderSamples["--text-text-base"].actual ===
          textAndBorderSamples["--text-text-base"].expected &&
        usesObsidianBackgroundColor(textAndBorderSamples["--border-border-base"].actual, border) &&
        isTranslucentPanelInRange(textAndBorderSamples["--border-border-base"].actual, 56, 72),
      detail: textAndBorderSamples,
    },
    {
      name: "fixture theme diagnostics state tokens derive from gruvbox-dark-medium colors",
      ok: Object.values(stateSamples).every(
        (entry) =>
          typeof entry.actual === "string" &&
          typeof entry.sourceColor === "string" &&
          entry.actual.includes(entry.sourceColor)
      ),
      detail: stateSamples,
    },
  ];
}

export function runtimeThemeChecks(
  diagnostics: unknown,
  expectedRootBackground: string | null
): HarnessCheck[] {
  if (!diagnostics || !expectedRootBackground) {
    return [];
  }

  const roots = Array.isArray((diagnostics as any).roots) ? (diagnostics as any).roots : [];
  const rootBackgrounds: RuntimeBackgroundSample[] = roots.map((root: any) => ({
    tag: root?.tag ?? null,
    id: root?.id ?? null,
    backgroundColor: typeof root?.backgroundColor === "string" ? root.backgroundColor : null,
    backgroundImage: typeof root?.backgroundImage === "string" ? root.backgroundImage : null,
  }));
  const documentBaseBackgrounds = rootBackgrounds.filter(
    (item) => item.tag === "html" || item.tag === "body"
  );
  const appRootBackgrounds = rootBackgrounds.filter((item) => item.id === "root");
  const normalizedExpectedRootBackground = normalizeCssColor(expectedRootBackground);

  const viewport = (diagnostics as any).viewport;
  const viewportArea =
    typeof viewport?.width === "number" && typeof viewport?.height === "number"
      ? viewport.width * viewport.height
      : 0;
  const visibleBackgrounds = (diagnostics as any).visibleBackgrounds;
  const legacyOpaqueBackgrounds = (diagnostics as any).opaqueBackgrounds;
  const largeBackgrounds: RuntimeBackgroundSample[] = Array.isArray(visibleBackgrounds)
    ? visibleBackgrounds
        .filter((item: any) => typeof item?.area === "number" && item.area >= viewportArea * 0.08)
        .map(runtimeBackgroundSample)
    : [];
  const surfaceSamples: RuntimeBackgroundSample[] = Array.isArray(
    (diagnostics as any).surfaceSamples
  )
    ? (diagnostics as any).surfaceSamples.map(runtimeBackgroundSample)
    : [];
  const largeElementSamples: RuntimeBackgroundSample[] = Array.isArray(
    (diagnostics as any).largeElementSamples
  )
    ? (diagnostics as any).largeElementSamples.map(runtimeBackgroundSample)
    : [];
  const largeElementBackgrounds = largeElementSamples.filter(hasVisibleRuntimeBackground);
  const allLargeBackgrounds = dedupeRuntimeSamples([
    ...largeBackgrounds,
    ...largeElementBackgrounds,
  ]);
  const pageBackgrounds = allLargeBackgrounds.filter(isPageBackgroundSample);
  const localSurfaceBackgrounds = allLargeBackgrounds.filter(
    (item) => !isPageBackgroundSample(item)
  );
  const unmatchedLargeBackgrounds = pageBackgrounds.filter(
    (item) => !backgroundSampleMatches(item, normalizedExpectedRootBackground)
  );
  const dialogOverlays = surfaceSamples.filter((item) => item.dataComponent === "dialog-overlay");
  const opaqueDialogOverlays = dialogOverlays.filter(
    (item) => cssAlpha(item.backgroundColor) === 1
  );
  const brightDialogOverlays = dialogOverlays.filter((item) => isBrightScrim(item.backgroundColor));
  const backgroundStrongerSurfaces = [...surfaceSamples, ...largeElementSamples].filter(
    isBackgroundStrongerSurface
  );
  const transparentBackgroundStrongerSurfaces = backgroundStrongerSurfaces.filter(
    (item) => cssAlpha(item.backgroundColor) === 0
  );
  const invalidBackgroundStrongerSurfaces = backgroundStrongerSurfaces.filter(
    (item) => cssAlpha(item.backgroundColor) !== 0
  );
  const localMaterialSurfaces = surfaceSamples.filter(isLocalMaterialSurface);
  const materialLimits = runtimeMaterialLimits(diagnostics);
  const denseLocalMaterialSurfaces = localMaterialSurfaces.filter((sample) =>
    isDenseLocalMaterialSurface(sample, materialLimits)
  );

  return [
    {
      name: "runtime iframe document roots use the Obsidian base and keep the OpenCode app root transparent",
      ok:
        documentBaseBackgrounds.length >= 2 &&
        documentBaseBackgrounds.every(
          (item) => normalizeCssColor(item.backgroundColor) === normalizedExpectedRootBackground
        ) &&
        appRootBackgrounds.length > 0 &&
        appRootBackgrounds.every(
          (item) =>
            normalizeCssColor(item.backgroundColor) === "transparent" &&
            isCssNoneValue(item.backgroundImage)
        ),
      detail: {
        expectedRootBackground,
        normalizedExpectedRootBackground,
        roots: rootBackgrounds,
        documentBaseBackgrounds,
        appRootBackgrounds,
      },
    },
    {
      name: "runtime theme diagnostics use current visibleBackgrounds field",
      ok:
        Array.isArray(visibleBackgrounds) &&
        Array.isArray((diagnostics as any).largeElementSamples),
      detail: {
        hasVisibleBackgrounds: Array.isArray(visibleBackgrounds),
        hasLargeElementSamples: Array.isArray((diagnostics as any).largeElementSamples),
        hasLegacyOpaqueBackgrounds: Array.isArray(legacyOpaqueBackgrounds),
        hint: Array.isArray(legacyOpaqueBackgrounds)
          ? "The running Obsidian plugin is still using an older bundle. Reload the plugin after building."
          : undefined,
      },
    },
    {
      name: "runtime page background samples do not repaint the page background",
      ok: Array.isArray(visibleBackgrounds) && unmatchedLargeBackgrounds.length === 0,
      detail: {
        expectedRootBackground,
        normalizedExpectedRootBackground,
        largeBackgrounds,
        largeElementSamples,
        pageBackgrounds,
        localSurfaceBackgrounds,
        unmatchedLargeBackgrounds,
      },
    },
    {
      name: "runtime dialog overlay uses a translucent scrim when present",
      ok:
        dialogOverlays.length === 0 ||
        (opaqueDialogOverlays.length === 0 && brightDialogOverlays.length === 0),
      detail: {
        observedDialogOverlay: dialogOverlays.length > 0,
        dialogOverlays,
        opaqueDialogOverlays,
        brightDialogOverlays,
      },
    },
    {
      name: "runtime OpenCode shell canvas stays transparent over the host backdrop",
      ok: invalidBackgroundStrongerSurfaces.length === 0,
      detail: {
        observedBackgroundStrongerSurface: backgroundStrongerSurfaces.length > 0,
        backgroundStrongerSurfaces,
        transparentBackgroundStrongerSurfaces,
        invalidBackgroundStrongerSurfaces,
      },
    },
    {
      name: "runtime OpenCode local surfaces stay within Obsidian material density",
      ok: denseLocalMaterialSurfaces.length === 0,
      detail: {
        composerMaxAlpha: materialLimits.composer,
        dockMaxAlpha: materialLimits.dock,
        localMaterialSurfaces,
        denseLocalMaterialSurfaces,
      },
    },
  ];
}

function runtimeBackgroundSample(item: any): RuntimeBackgroundSample {
  const sample: RuntimeBackgroundSample = {
    tag: item?.tag ?? null,
    id: item?.id ?? null,
    className: typeof item?.className === "string" ? item.className : null,
    dataComponent: item?.dataComponent ?? null,
    dataSlot: item?.dataSlot ?? null,
    backgroundColor: typeof item?.backgroundColor === "string" ? item.backgroundColor : null,
    backgroundImage: typeof item?.backgroundImage === "string" ? item.backgroundImage : null,
    opacity: item?.opacity ?? null,
    position: item?.position ?? null,
    zIndex: item?.zIndex ?? null,
    area: item?.area ?? null,
  };
  if (item?.dataDockSurface) {
    sample.dataDockSurface = item.dataDockSurface;
  }
  if (item?.dataVariant) {
    sample.dataVariant = item.dataVariant;
  }
  if (item?.dataOrientation) {
    sample.dataOrientation = item.dataOrientation;
  }
  if (item?.tokenValues) {
    sample.tokenValues = item.tokenValues;
  }
  return sample;
}

function normalizeCssColor(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const color = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return "transparent";
  }
  if (/rgba\([^)]*,\s*0\)$/.test(color)) {
    return "transparent";
  }
  const shortHex = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (shortHex) {
    return `rgb(${Number.parseInt(shortHex[1] + shortHex[1], 16)}, ${Number.parseInt(shortHex[2] + shortHex[2], 16)}, ${Number.parseInt(shortHex[3] + shortHex[3], 16)})`;
  }

  const longHex = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (longHex) {
    return `rgb(${Number.parseInt(longHex[1], 16)}, ${Number.parseInt(longHex[2], 16)}, ${Number.parseInt(longHex[3], 16)})`;
  }

  const hsl = color.match(
    /^hsla?\(\s*([0-9.]+)(?:deg)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%\s*(?:,\s*([0-9.]+))?\)$/
  );
  if (hsl) {
    const alpha = hsl[4] === undefined ? 1 : Number.parseFloat(hsl[4]);
    if (alpha === 0) {
      return "transparent";
    }
    const rgb = hslToRgb(
      Number.parseFloat(hsl[1]),
      Number.parseFloat(hsl[2]),
      Number.parseFloat(hsl[3])
    );
    return `rgb(${rgb.red}, ${rgb.green}, ${rgb.blue})`;
  }

  return color.replace(/,\s*/g, ", ");
}

function hslToRgb(
  hueDegrees: number,
  saturationPercent: number,
  lightnessPercent: number
): { red: number; green: number; blue: number } {
  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;

  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return { red: channel, green: channel, blue: channel };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    red: Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    green: Math.round(hueToRgb(p, q, hue) * 255),
    blue: Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let hue = t;
  if (hue < 0) {
    hue += 1;
  }
  if (hue > 1) {
    hue -= 1;
  }
  if (hue < 1 / 6) {
    return p + (q - p) * 6 * hue;
  }
  if (hue < 1 / 2) {
    return q;
  }
  if (hue < 2 / 3) {
    return p + (q - p) * (2 / 3 - hue) * 6;
  }
  return p;
}

function resolveCustomProperty(
  value: string | null,
  variables: Record<string, unknown>,
  seen = new Set<string>()
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^var\((--[-_a-zA-Z0-9]+)\)$/);
  if (!match) {
    return trimmed;
  }

  const ref = match[1];
  if (seen.has(ref)) {
    return trimmed;
  }
  seen.add(ref);

  const next = variables[ref];
  return resolveCustomProperty(typeof next === "string" ? next : null, variables, seen);
}

function backgroundSampleMatches(
  sample: RuntimeBackgroundSample,
  normalizedExpectedRootBackground: string | null
): boolean {
  if (!normalizedExpectedRootBackground) {
    return false;
  }

  const color = normalizeCssColor(sample.backgroundColor);
  if (color === normalizedExpectedRootBackground) {
    return true;
  }

  const image = sample.backgroundImage?.trim().toLowerCase();
  return Boolean(image && image !== "none" && image.includes(normalizedExpectedRootBackground));
}

function hasVisibleRuntimeBackground(sample: RuntimeBackgroundSample): boolean {
  const image = sample.backgroundImage?.trim().toLowerCase();
  const alpha = cssAlpha(sample.backgroundColor);
  return (typeof alpha === "number" && alpha !== 0) || Boolean(image && image !== "none");
}

function dedupeRuntimeSamples(samples: RuntimeBackgroundSample[]): RuntimeBackgroundSample[] {
  const seen = new Set<string>();
  const result: RuntimeBackgroundSample[] = [];
  for (const sample of samples) {
    const key = [
      sample.tag,
      sample.id,
      sample.className,
      sample.dataComponent,
      sample.dataSlot,
      sample.backgroundColor,
      sample.backgroundImage,
      sample.area,
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(sample);
  }
  return result;
}

function usesObsidianPanelColor(value: unknown, backgroundSecondary: string): boolean {
  return (
    typeof value === "string" &&
    (value.includes(backgroundSecondary) ||
      value.includes("var(--another-opencode-for-obsidian-background-secondary)"))
  );
}

function usesObsidianBackgroundColor(value: unknown, backgroundPrimary: string): boolean {
  return (
    typeof value === "string" &&
    (value.includes(backgroundPrimary) ||
      value.includes("var(--another-opencode-for-obsidian-background-primary)"))
  );
}

function isTranslucentPanelInRange(
  value: unknown,
  minimumPercent: number,
  maximumPercent: number
): boolean {
  if (typeof value !== "string" || !value.includes("transparent")) {
    return false;
  }

  const percent = colorMixPercent(value);
  return typeof percent === "number" && percent >= minimumPercent && percent <= maximumPercent;
}

function cssAlpha(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const color = value.trim().toLowerCase();
  if (color === "transparent" || color === "rgba(0, 0, 0, 0)") {
    return 0;
  }

  const rgba = color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)$/);
  if (rgba) {
    return Number.parseFloat(rgba[1]);
  }

  const slashAlpha = color.match(/\/\s*([0-9.]+)\s*\)?$/);
  if (slashAlpha) {
    return Number.parseFloat(slashAlpha[1]);
  }

  if (color.startsWith("rgb(") || color.startsWith("#") || color.startsWith("color(")) {
    return 1;
  }

  return null;
}

function isCssNoneValue(value: string | null): boolean {
  return value === null || value.trim() === "" || value.trim().toLowerCase() === "none";
}

function isBrightScrim(value: string | null): boolean {
  const color = parseRgbComponents(value);
  const alpha = cssAlpha(value);
  if (!color || alpha === null || alpha === 0) {
    return false;
  }

  const lightness = (color.red + color.green + color.blue) / 3;
  return lightness >= 0.7 && alpha >= 0.2;
}

function parseRgbComponents(
  value: string | null
): { red: number; green: number; blue: number } | null {
  if (!value) {
    return null;
  }

  const color = value.trim().toLowerCase();
  const srgb = color.match(/^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  if (srgb) {
    return {
      red: Number.parseFloat(srgb[1]),
      green: Number.parseFloat(srgb[2]),
      blue: Number.parseFloat(srgb[3]),
    };
  }

  const rgb = color.match(/^rgba?\(([^,]+),\s*([^,]+),\s*([^,\s)]+)/);
  if (!rgb) {
    return null;
  }

  return {
    red: Number.parseFloat(rgb[1]) / 255,
    green: Number.parseFloat(rgb[2]) / 255,
    blue: Number.parseFloat(rgb[3]) / 255,
  };
}

function colorMixPercent(value: string): number | null {
  const match = value.match(/\s(\d+(?:\.\d+)?)%\s*,/);
  return match ? Number.parseFloat(match[1]) : null;
}

function isPageBackgroundSample(sample: RuntimeBackgroundSample): boolean {
  if (sample.dataComponent || sample.dataSlot || sample.dataDockSurface) {
    return false;
  }

  return sample.id === "root";
}

function isBackgroundStrongerSurface(sample: RuntimeBackgroundSample): boolean {
  return (
    (sample.dataComponent === "tabs" ||
      (typeof sample.className === "string" &&
        sample.className.includes("bg-background-stronger"))) &&
    typeof sample.area === "number" &&
    sample.area >= 1200
  );
}

function isLocalMaterialSurface(sample: RuntimeBackgroundSample): boolean {
  return (
    sample.dataComponent === "session-composer" ||
    sample.dataComponent === "session-prompt-dock" ||
    sample.dataDockSurface === "shell" ||
    sample.dataDockSurface === "tray"
  );
}

function isDenseLocalMaterialSurface(
  sample: RuntimeBackgroundSample,
  limits: { composer: number; dock: number }
): boolean {
  const alpha = cssAlpha(sample.backgroundColor);
  if (alpha === null) {
    return false;
  }

  if (sample.dataComponent === "session-composer") {
    return alpha > limits.composer;
  }

  return alpha > limits.dock;
}

function runtimeMaterialLimits(diagnostics: unknown): { composer: number; dock: number } {
  const sourceBoundary =
    diagnostics && typeof diagnostics === "object" && (diagnostics as any).sourceBoundary
      ? (diagnostics as any).sourceBoundary
      : null;
  return sourceBoundary?.workspaceBackgroundState === "enabled"
    ? {
        composer: MAX_RUNTIME_BACKGROUND_COMPOSER_MATERIAL_ALPHA,
        dock: MAX_RUNTIME_BACKGROUND_DOCK_MATERIAL_ALPHA,
      }
    : {
        composer: MAX_RUNTIME_COMPOSER_MATERIAL_ALPHA,
        dock: MAX_RUNTIME_DOCK_MATERIAL_ALPHA,
      };
}
