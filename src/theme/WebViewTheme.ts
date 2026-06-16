import type { WebViewTheme } from "../types";

interface ObsidianThemeValues {
  colorScheme: "light" | "dark";
  pageBackground: string;
  backgroundPrimary: string;
  backgroundPrimaryAlt: string;
  backgroundSecondary: string;
  backgroundModifierBorder: string;
  backgroundModifierHover: string;
  textNormal: string;
  textMuted: string;
  textFaint: string;
  interactiveAccent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  fontInterface: string;
  editorBackgroundImage: string;
  editorBackgroundOpacity: string;
  editorBackgroundBluriness: string;
  editorBackgroundPosition: string;
  workspaceBackgroundContract?: string;
  workspaceBackgroundImage?: string;
  workspaceBackgroundOpacity?: string;
  workspaceBackgroundFilter?: string;
  workspaceBackgroundPosition?: string;
  workspaceBackgroundSize?: string;
  workspaceBackgroundRepeat?: string;
  workspaceBackgroundBlendMode?: string;
  workspaceBackgroundSurface?: string;
  workspaceBackgroundChrome?: string;
  workspaceBackgroundBorder?: string;
}

type ThemeVariables = Record<string, string>;
interface CaptureObsidianWebViewThemeOptions {
  paneSource?: HTMLElement;
}
type WorkspaceBackgroundValues = Required<
  Pick<
    ObsidianThemeValues,
    | "workspaceBackgroundContract"
    | "workspaceBackgroundImage"
    | "workspaceBackgroundOpacity"
    | "workspaceBackgroundFilter"
    | "workspaceBackgroundPosition"
    | "workspaceBackgroundSize"
    | "workspaceBackgroundRepeat"
    | "workspaceBackgroundBlendMode"
    | "workspaceBackgroundSurface"
    | "workspaceBackgroundChrome"
    | "workspaceBackgroundBorder"
  >
>;

const OBSIDIAN_FALLBACKS: Required<ObsidianThemeValues> = {
  colorScheme: "dark",
  pageBackground: "#1e1e1e",
  backgroundPrimary: "#1e1e1e",
  backgroundPrimaryAlt: "#262626",
  backgroundSecondary: "#262626",
  backgroundModifierBorder: "#3a3a3a",
  backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
  textNormal: "#f1f1f1",
  textMuted: "#c8c8c8",
  textFaint: "#8f8f8f",
  interactiveAccent: "#f5c45c",
  success: "#54b67a",
  warning: "#d7a642",
  danger: "#db5c5c",
  info: "#5fa3e7",
  fontInterface: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  editorBackgroundImage: "none",
  editorBackgroundOpacity: "0",
  editorBackgroundBluriness: "none",
  editorBackgroundPosition: "center",
  workspaceBackgroundContract: "none",
  workspaceBackgroundImage: "none",
  workspaceBackgroundOpacity: "0",
  workspaceBackgroundFilter: "none",
  workspaceBackgroundPosition: "center",
  workspaceBackgroundSize: "cover",
  workspaceBackgroundRepeat: "no-repeat",
  workspaceBackgroundBlendMode: "overlay",
  workspaceBackgroundSurface: "color-mix(in srgb, var(--background-primary) 18%, transparent)",
  workspaceBackgroundChrome: "color-mix(in srgb, var(--background-secondary) 46%, transparent)",
  workspaceBackgroundBorder:
    "color-mix(in srgb, var(--background-modifier-border) 72%, transparent)",
};

const OBSIDIAN_MATERIAL_ALPHA = {
  backgroundBase: 28,
  layer01: 36,
  layer02: 46,
  layer03: 58,
  layer04: 68,
  contrast: 86,
};

const OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA: typeof OBSIDIAN_MATERIAL_ALPHA = {
  backgroundBase: 40,
  layer01: 50,
  layer02: 60,
  layer03: 70,
  layer04: 80,
  contrast: 88,
};

const OBSIDIAN_BORDER_ALPHA = {
  muted: 42,
  base: 64,
  strongText: 28,
};

const OBSIDIAN_TEXT_MIX_ALPHA = {
  muted: 68,
  faint: 62,
};

const OBSIDIAN_ELEVATION_ALPHA = {
  raised: 12,
  floating: 16,
  overlay: 20,
  buttonNeutral: 18,
  buttonContrast: 28,
  elements: 22,
};

const OBSIDIAN_OVERLAY_ALPHA = {
  hover: 8,
  pressed: 14,
  contrastHover: 20,
  contrastPressed: 32,
  dialogScrimDark: 70,
  dialogScrimLight: 34,
  depthTop: 72,
};

const OBSIDIAN_STATE_ALPHA = {
  background: 20,
  foreground: 68,
  border: 52,
};

const OBSIDIAN_ACCENT_ALPHA = {
  text: 72,
  textHover: 82,
  surface: 36,
  border: 52,
};

const GRUVBOX_DARK_MEDIUM = {
  accent: "#d79921",
  green: "#98971a",
  orange: "#d65d0e",
  purple: "#b16286",
  success: "#689d6a",
  warning: "#d79921",
  danger: "#cc241d",
  info: "#458588",
};

const WORKSPACE_BACKGROUND_MIN_FILTER = "blur(5px)";

// Keep this bridge on documented token surfaces. Obsidian owns the source
// values, OpenCode owns the destination token names; component class selectors
// in either app are intentionally outside this contract.
// Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
// OpenCode tokens: https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css
// Legacy Tailwind color entry: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css
export function captureObsidianWebViewTheme(
  source: HTMLElement = document.body,
  options: CaptureObsidianWebViewThemeOptions = {}
): WebViewTheme {
  const styles = getComputedStyle(source);
  const colorScheme = resolveObsidianColorScheme(source);
  const backgroundPrimary = cssVar(
    styles,
    "--background-primary",
    OBSIDIAN_FALLBACKS.backgroundPrimary
  );
  const backgroundSecondary = cssVar(
    styles,
    "--background-secondary",
    OBSIDIAN_FALLBACKS.backgroundSecondary
  );

  return createOpenCodeWebViewTheme({
    colorScheme,
    pageBackground: resolveObsidianPageBackground(source, styles, options.paneSource),
    backgroundPrimary,
    backgroundPrimaryAlt: cssVar(
      styles,
      "--background-primary-alt",
      OBSIDIAN_FALLBACKS.backgroundPrimaryAlt
    ),
    backgroundSecondary,
    backgroundModifierBorder: cssVar(
      styles,
      "--background-modifier-border",
      OBSIDIAN_FALLBACKS.backgroundModifierBorder
    ),
    backgroundModifierHover: cssVar(
      styles,
      "--background-modifier-hover",
      OBSIDIAN_FALLBACKS.backgroundModifierHover
    ),
    textNormal: cssVar(styles, "--text-normal", OBSIDIAN_FALLBACKS.textNormal),
    textMuted: cssVar(styles, "--text-muted", OBSIDIAN_FALLBACKS.textMuted),
    textFaint: cssVar(styles, "--text-faint", OBSIDIAN_FALLBACKS.textFaint),
    interactiveAccent: cssVar(styles, "--interactive-accent", OBSIDIAN_FALLBACKS.interactiveAccent),
    success: cssVars(styles, ["--color-green", "--text-success"], OBSIDIAN_FALLBACKS.success),
    warning: cssVars(styles, ["--color-yellow", "--text-warning"], OBSIDIAN_FALLBACKS.warning),
    danger: cssVars(styles, ["--color-red", "--text-error"], OBSIDIAN_FALLBACKS.danger),
    info: cssVars(styles, ["--color-blue", "--interactive-accent"], OBSIDIAN_FALLBACKS.info),
    fontInterface: cssVar(styles, "--font-interface", OBSIDIAN_FALLBACKS.fontInterface),
    editorBackgroundImage: cssVar(
      styles,
      "--obsidian-editor-background-image",
      OBSIDIAN_FALLBACKS.editorBackgroundImage
    ),
    editorBackgroundOpacity: cssVar(
      styles,
      "--obsidian-editor-background-opacity",
      OBSIDIAN_FALLBACKS.editorBackgroundOpacity
    ),
    editorBackgroundBluriness: cssVar(
      styles,
      "--obsidian-editor-background-bluriness",
      OBSIDIAN_FALLBACKS.editorBackgroundBluriness
    ),
    editorBackgroundPosition: cssVar(
      styles,
      "--obsidian-editor-background-position",
      OBSIDIAN_FALLBACKS.editorBackgroundPosition
    ),
    workspaceBackgroundContract: cssVar(
      styles,
      "--obsidian-workspace-background-contract",
      OBSIDIAN_FALLBACKS.workspaceBackgroundContract
    ),
    workspaceBackgroundImage: cssVars(
      styles,
      ["--obsidian-workspace-background-image", "--obsidian-editor-background-image"],
      OBSIDIAN_FALLBACKS.workspaceBackgroundImage
    ),
    workspaceBackgroundOpacity: cssVars(
      styles,
      ["--obsidian-workspace-background-opacity", "--obsidian-editor-background-opacity"],
      OBSIDIAN_FALLBACKS.workspaceBackgroundOpacity
    ),
    workspaceBackgroundFilter: cssVars(
      styles,
      ["--obsidian-workspace-background-filter", "--obsidian-editor-background-bluriness"],
      OBSIDIAN_FALLBACKS.workspaceBackgroundFilter
    ),
    workspaceBackgroundPosition: cssVars(
      styles,
      ["--obsidian-workspace-background-position", "--obsidian-editor-background-position"],
      OBSIDIAN_FALLBACKS.workspaceBackgroundPosition
    ),
    workspaceBackgroundSize: cssVar(
      styles,
      "--obsidian-workspace-background-size",
      OBSIDIAN_FALLBACKS.workspaceBackgroundSize
    ),
    workspaceBackgroundRepeat: cssVar(
      styles,
      "--obsidian-workspace-background-repeat",
      OBSIDIAN_FALLBACKS.workspaceBackgroundRepeat
    ),
    workspaceBackgroundBlendMode: cssVar(
      styles,
      "--obsidian-workspace-background-blend-mode",
      OBSIDIAN_FALLBACKS.workspaceBackgroundBlendMode
    ),
    workspaceBackgroundSurface: cssVar(
      styles,
      "--obsidian-workspace-background-surface",
      OBSIDIAN_FALLBACKS.workspaceBackgroundSurface
    ),
    workspaceBackgroundChrome: cssVar(
      styles,
      "--obsidian-workspace-background-chrome",
      OBSIDIAN_FALLBACKS.workspaceBackgroundChrome
    ),
    workspaceBackgroundBorder: cssVar(
      styles,
      "--obsidian-workspace-background-border",
      OBSIDIAN_FALLBACKS.workspaceBackgroundBorder
    ),
  });
}

export function findObsidianWebViewThemeSource(doc: Document = document): HTMLElement {
  return (
    findFirstElement(doc, [
      ".workspace-leaf.mod-active .markdown-source-view",
      ".workspace-leaf.mod-active .markdown-reading-view",
      ".workspace-leaf.mod-active .markdown-preview-view",
      ".markdown-source-view",
      ".markdown-reading-view",
      ".markdown-preview-view",
      ".workspace-leaf-content[data-type='markdown']",
      ".opencode-appearance-obsidian",
      "body",
    ]) ?? doc.body
  );
}

function findFirstElement(doc: Document, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (element instanceof HTMLElement) {
      return element;
    }
  }
  return null;
}

export function createOpenCodeWebViewTheme(obsidian: ObsidianThemeValues): WebViewTheme {
  const v2Variables = createV2ObsidianVariables(obsidian);
  const variables = {
    ...createObsidianSourceVariables(obsidian),
    ...v2Variables,
    ...createLegacyAliasesFromV2(v2Variables),
  };

  return {
    colorScheme: obsidian.colorScheme,
    variables,
  };
}

function createObsidianSourceVariables(obsidian: ObsidianThemeValues): ThemeVariables {
  const workspace = resolveWorkspaceBackgroundValues(obsidian);
  const workspaceBackgroundEnabled = isWorkspaceBackgroundEnabled(workspace);
  return {
    "--another-opencode-for-obsidian-background-primary": obsidian.backgroundPrimary,
    "--another-opencode-for-obsidian-background-primary-alt": obsidian.backgroundPrimaryAlt,
    "--another-opencode-for-obsidian-page-background": obsidian.pageBackground,
    "--another-opencode-for-obsidian-background-secondary": obsidian.backgroundSecondary,
    "--another-opencode-for-obsidian-border": obsidian.backgroundModifierBorder,
    "--another-opencode-for-obsidian-hover": obsidian.backgroundModifierHover,
    "--another-opencode-for-obsidian-text-normal": obsidian.textNormal,
    "--another-opencode-for-obsidian-text-muted": obsidian.textMuted,
    "--another-opencode-for-obsidian-text-faint": obsidian.textFaint,
    "--another-opencode-for-obsidian-accent": obsidian.interactiveAccent,
    "--another-opencode-for-obsidian-success": obsidian.success,
    "--another-opencode-for-obsidian-warning": obsidian.warning,
    "--another-opencode-for-obsidian-danger": obsidian.danger,
    "--another-opencode-for-obsidian-info": obsidian.info,
    "--font-family-sans": obsidian.fontInterface,
    "--font-sans": obsidian.fontInterface,
    "--obsidian-editor-background-image": obsidian.editorBackgroundImage,
    "--obsidian-editor-background-opacity": obsidian.editorBackgroundOpacity,
    "--obsidian-editor-background-bluriness": obsidian.editorBackgroundBluriness,
    "--obsidian-editor-background-position": obsidian.editorBackgroundPosition,
    "--obsidian-workspace-background-contract": workspace.workspaceBackgroundContract,
    "--obsidian-workspace-background-image": workspace.workspaceBackgroundImage,
    "--obsidian-workspace-background-opacity": workspace.workspaceBackgroundOpacity,
    "--obsidian-workspace-background-filter": workspace.workspaceBackgroundFilter,
    "--obsidian-workspace-background-position": workspace.workspaceBackgroundPosition,
    "--obsidian-workspace-background-size": workspace.workspaceBackgroundSize,
    "--obsidian-workspace-background-repeat": workspace.workspaceBackgroundRepeat,
    "--obsidian-workspace-background-blend-mode": workspace.workspaceBackgroundBlendMode,
    "--obsidian-workspace-background-surface": workspace.workspaceBackgroundSurface,
    "--obsidian-workspace-background-chrome": workspace.workspaceBackgroundChrome,
    "--obsidian-workspace-background-border": workspace.workspaceBackgroundBorder,
    "--another-opencode-for-obsidian-workspace-background-state": workspaceBackgroundEnabled
      ? "enabled"
      : "disabled",
    "--another-opencode-for-obsidian-workspace-background-contract":
      workspace.workspaceBackgroundContract,
    "--another-opencode-for-obsidian-workspace-background-image":
      workspace.workspaceBackgroundImage,
    "--another-opencode-for-obsidian-workspace-background-opacity":
      workspace.workspaceBackgroundOpacity,
    "--another-opencode-for-obsidian-workspace-background-filter":
      resolveWorkspaceBackgroundFilter(workspace),
    "--another-opencode-for-obsidian-workspace-background-position":
      workspace.workspaceBackgroundPosition,
    "--another-opencode-for-obsidian-workspace-background-size": workspace.workspaceBackgroundSize,
    "--another-opencode-for-obsidian-workspace-background-repeat":
      workspace.workspaceBackgroundRepeat,
    "--another-opencode-for-obsidian-workspace-background-blend-mode":
      workspace.workspaceBackgroundBlendMode,
    "--another-opencode-for-obsidian-workspace-background-surface":
      workspace.workspaceBackgroundSurface,
  };
}

function createV2ObsidianVariables(obsidian: ObsidianThemeValues): ThemeVariables {
  const materialAlpha = resolveObsidianMaterialAlpha(obsidian);

  return {
    // OpenCode v2 uses bg-base both for small local surfaces and for the
    // settings dialog canvas. The document roots are made transparent by the
    // proxy style; the token itself must remain a light Obsidian material.
    "--v2-background-bg-base": panelLayer(materialAlpha.backgroundBase),
    "--v2-background-bg-deep": "transparent",
    "--v2-background-bg-layer-01": panelLayer(materialAlpha.layer01),
    "--v2-background-bg-layer-02": panelLayer(materialAlpha.layer02),
    "--v2-background-bg-layer-03": panelLayer(materialAlpha.layer03),
    "--v2-background-bg-layer-04": panelLayer(materialAlpha.layer04),
    "--v2-background-bg-inverse": "var(--another-opencode-for-obsidian-text-normal)",
    "--v2-background-bg-contrast": textNormalMix(materialAlpha.contrast),
    "--v2-background-bg-button-neutral": "var(--v2-background-bg-layer-02)",
    "--v2-background-bg-accent": accentSurfaceMix(OBSIDIAN_ACCENT_ALPHA.surface),

    "--v2-text-text-base": "var(--another-opencode-for-obsidian-text-normal)",
    "--v2-text-text-muted": readableTextMix("text-muted", OBSIDIAN_TEXT_MIX_ALPHA.muted),
    "--v2-text-text-faint": readableTextMix("text-faint", OBSIDIAN_TEXT_MIX_ALPHA.faint),
    "--v2-text-text-inverse": "var(--another-opencode-for-obsidian-background-primary)",
    "--v2-text-text-contrast": "var(--another-opencode-for-obsidian-background-primary)",
    "--v2-text-text-accent": accentTextMix(OBSIDIAN_ACCENT_ALPHA.text),
    "--v2-text-text-accent-hover": accentTextMix(OBSIDIAN_ACCENT_ALPHA.textHover),

    "--v2-icon-icon-base": "var(--v2-text-text-base)",
    "--v2-icon-icon-muted": "var(--v2-text-text-muted)",
    "--v2-icon-icon-inverse": "var(--v2-text-text-inverse)",
    "--v2-icon-icon-contrast": "var(--v2-text-text-contrast)",
    "--v2-icon-icon-accent": "var(--v2-text-text-accent)",
    "--v2-icon-icon-accent-hover": "var(--v2-text-text-accent-hover)",

    "--v2-border-border-muted": borderMix(OBSIDIAN_BORDER_ALPHA.muted),
    "--v2-border-border-base": borderMix(OBSIDIAN_BORDER_ALPHA.base),
    "--v2-border-border-strong": strongBorderMix(OBSIDIAN_BORDER_ALPHA.strongText),
    "--v2-border-border-inverse": "var(--v2-background-bg-inverse)",
    "--v2-border-border-focus": accentBorderMix(OBSIDIAN_ACCENT_ALPHA.border),

    "--v2-state-bg-success": stateBackground("success"),
    "--v2-state-fg-success": stateForeground("success"),
    "--v2-state-border-success": stateBorder("success"),
    "--v2-state-bg-warning": stateBackground("warning"),
    "--v2-state-fg-warning": stateForeground("warning"),
    "--v2-state-border-warning": stateBorder("warning"),
    "--v2-state-bg-danger": stateBackground("danger"),
    "--v2-state-fg-danger": stateForeground("danger"),
    "--v2-state-border-danger": stateBorder("danger"),
    "--v2-state-bg-info": stateBackground("info"),
    "--v2-state-fg-info": stateForeground("info"),
    "--v2-state-border-info": stateBorder("info"),

    "--v2-elevation-raised": elevationShadow("2px", "4px", OBSIDIAN_ELEVATION_ALPHA.raised),
    "--v2-elevation-floating": elevationShadow("8px", "16px", OBSIDIAN_ELEVATION_ALPHA.floating),
    "--v2-elevation-overlay": elevationShadow("16px", "32px", OBSIDIAN_ELEVATION_ALPHA.overlay),
    "--v2-elevation-button-neutral": `0px 1px 1.5px 0px ${backgroundPrimaryMix(OBSIDIAN_ELEVATION_ALPHA.buttonNeutral)}, 0px 0px 0px 0.5px var(--v2-border-border-muted)`,
    "--v2-elevation-button-contrast": `0px 1px 1.5px 0px ${backgroundPrimaryMix(OBSIDIAN_ELEVATION_ALPHA.buttonContrast)}, 0px 0px 0px 0.5px var(--v2-border-border-strong)`,
    "--v2-elevation-elements": `0px 0.5px 0.5px 0px ${backgroundPrimaryMix(OBSIDIAN_ELEVATION_ALPHA.elements)}`,
    "--v2-elevation-switch-off": "inset 0px 0px 0px 0.5px var(--v2-border-border-muted)",
    "--v2-elevation-switch-on": "inset 0px 0px 0px 0.5px var(--v2-border-border-focus)",

    "--v2-overlay-simple-overlay-hover": textNormalMix(OBSIDIAN_OVERLAY_ALPHA.hover),
    "--v2-overlay-simple-overlay-pressed": textNormalMix(OBSIDIAN_OVERLAY_ALPHA.pressed),
    "--v2-overlay-simple-overlay-contrast-hover": backgroundPrimaryMix(
      OBSIDIAN_OVERLAY_ALPHA.contrastHover
    ),
    "--v2-overlay-simple-overlay-contrast-pressed": backgroundPrimaryMix(
      OBSIDIAN_OVERLAY_ALPHA.contrastPressed
    ),
    "--v2-overlay-simple-overlay-scrim": scrimLayer(obsidian.colorScheme),
    "--v2-overlay-gradient-depth-overlay-depth-top": backgroundPrimaryMix(
      OBSIDIAN_OVERLAY_ALPHA.depthTop
    ),
    "--v2-overlay-gradient-depth-overlay-depth-bot": "transparent",
    "--v2-overlay-simple-tab-active-scrim": "transparent",
    "--v2-overlay-simple-tab-hover-scrim": "transparent",
    "--v2-overlay-simple-tab-scrim": "transparent",

    "--v2-illustration-illustration-layer-01": "var(--v2-background-bg-layer-01)",
    "--v2-illustration-illustration-layer-02": "var(--v2-background-bg-layer-02)",
    "--v2-illustration-illustration-layer-03": "var(--v2-background-bg-layer-03)",
    "--v2-font-family-sans": obsidian.fontInterface,
  };
}

function createLegacyAliasesFromV2(v2Variables: ThemeVariables): ThemeVariables {
  const aliases: ThemeVariables = {};

  Object.assign(aliases, {
    "--background-base": "var(--v2-background-bg-base)",
    "--background-weak": "var(--v2-background-bg-layer-01)",
    "--background-strong": "transparent",
    // OpenCode uses this legacy token for the full session canvas. The Obsidian
    // host view owns the backdrop; the session shell must not add a second large
    // surface over it.
    "--background-stronger": "transparent",

    "--surface-base": "var(--v2-background-bg-layer-01)",
    "--base": "var(--v2-background-bg-layer-01)",
    "--base2": "var(--v2-background-bg-layer-01)",
    "--base3": "var(--v2-background-bg-layer-01)",
    "--surface-base-hover": "var(--v2-overlay-simple-overlay-hover)",
    "--surface-base-active": "var(--v2-overlay-simple-overlay-pressed)",
    "--surface-base-interactive-active": "var(--v2-background-bg-accent)",
    "--surface-inset-base": "var(--v2-background-bg-layer-01)",
    "--surface-inset-base-hover": "var(--v2-background-bg-layer-02)",
    "--surface-inset-strong": "var(--v2-background-bg-layer-02)",
    "--surface-inset-strong-hover": "var(--v2-background-bg-layer-03)",
    "--surface-raised-base": "var(--v2-background-bg-layer-02)",
    "--surface-float-base": "var(--v2-background-bg-layer-03)",
    "--surface-float-base-hover": "var(--v2-background-bg-layer-04)",
    "--surface-raised-base-hover": "var(--v2-overlay-simple-overlay-hover)",
    "--surface-raised-base-active": "var(--v2-overlay-simple-overlay-pressed)",
    "--surface-raised-strong": "var(--v2-background-bg-layer-03)",
    "--surface-raised-strong-hover": "var(--v2-background-bg-layer-04)",
    "--surface-raised-stronger": "var(--v2-background-bg-layer-04)",
    "--surface-raised-stronger-hover": "var(--v2-background-bg-layer-04)",
    "--surface-stronger-non-alpha": "var(--v2-background-bg-layer-04)",
    "--surface-raised-stronger-non-alpha": "var(--v2-background-bg-layer-04)",
    "--surface-weak": "var(--v2-overlay-simple-overlay-hover)",
    "--surface-weaker": "var(--v2-background-bg-layer-01)",
    "--surface-strong": "var(--v2-background-bg-layer-03)",
    "--surface-interactive-base": "var(--v2-background-bg-accent)",
    "--surface-interactive-hover": "var(--v2-background-bg-accent)",
    "--surface-interactive-weak": "var(--v2-overlay-simple-overlay-hover)",
    "--surface-interactive-weak-hover": "var(--v2-overlay-simple-overlay-pressed)",
    "--surface-success-base": "var(--v2-state-bg-success)",
    "--surface-success-weak": "var(--v2-state-bg-success)",
    "--surface-success-strong": "var(--v2-state-bg-success)",
    "--surface-warning-base": "var(--v2-state-bg-warning)",
    "--surface-warning-weak": "var(--v2-state-bg-warning)",
    "--surface-warning-strong": "var(--v2-state-bg-warning)",
    "--surface-critical-base": "var(--v2-state-bg-danger)",
    "--surface-critical-weak": "var(--v2-state-bg-danger)",
    "--surface-critical-strong": "var(--v2-state-bg-danger)",
    "--surface-info-base": "var(--v2-state-bg-info)",
    "--surface-info-weak": "var(--v2-state-bg-info)",
    "--surface-info-strong": "var(--v2-state-bg-info)",

    "--input-base": "var(--v2-background-bg-layer-01)",
    "--input-hover": "var(--v2-background-bg-layer-02)",
    "--input-active": "var(--v2-background-bg-layer-02)",
    "--input-focus": "var(--v2-background-bg-layer-02)",
    "--input-selected": "var(--v2-overlay-simple-overlay-pressed)",

    "--text-base": "var(--v2-text-text-base)",
    "--text-weak": "var(--v2-text-text-muted)",
    "--text-weaker": "var(--v2-text-text-faint)",
    "--text-strong": "var(--v2-text-text-base)",
    "--text-stronger": "var(--v2-text-text-base)",
    "--text-interactive-base": "var(--v2-text-text-accent)",
    "--text-link-base": "var(--v2-text-text-accent)",
    "--text-on-success-base": "var(--v2-state-fg-success)",
    "--text-on-success-weak": "var(--v2-state-fg-success)",
    "--text-on-success-strong": "var(--v2-state-fg-success)",
    "--text-on-warning-base": "var(--v2-state-fg-warning)",
    "--text-on-warning-weak": "var(--v2-state-fg-warning)",
    "--text-on-warning-strong": "var(--v2-state-fg-warning)",
    "--text-on-critical-base": "var(--v2-state-fg-danger)",
    "--text-on-critical-weak": "var(--v2-state-fg-danger)",
    "--text-on-critical-strong": "var(--v2-state-fg-danger)",
    "--text-on-info-base": "var(--v2-state-fg-info)",
    "--text-on-info-weak": "var(--v2-state-fg-info)",
    "--text-on-info-strong": "var(--v2-state-fg-info)",

    "--button-primary-base": "var(--v2-background-bg-accent)",
    "--button-secondary-base": "var(--v2-background-bg-button-neutral)",
    "--button-secondary-hover": "var(--v2-overlay-simple-overlay-hover)",
    "--button-ghost-hover": "var(--v2-overlay-simple-overlay-hover)",
    "--button-ghost-hover2": "var(--v2-overlay-simple-overlay-pressed)",

    "--border-base": "var(--v2-border-border-base)",
    "--border-hover": "var(--v2-border-border-strong)",
    "--border-active": "var(--v2-border-border-strong)",
    "--border-focus": "var(--v2-border-border-focus)",
    "--border-selected": "var(--v2-border-border-focus)",
    "--border-weak-base": "var(--v2-border-border-muted)",
    "--border-weak-hover": "var(--v2-border-border-base)",
    "--border-weak-active": "var(--v2-border-border-strong)",
    "--border-weak-selected": "var(--v2-border-border-focus)",
    "--border-weaker-base": "var(--v2-border-border-muted)",
    "--border-interactive-base": "var(--v2-border-border-focus)",
    "--border-interactive-hover": "var(--v2-border-border-focus)",
    "--border-interactive-active": "var(--v2-border-border-focus)",
    "--border-interactive-selected": "var(--v2-border-border-focus)",
    "--border-interactive-focus": "var(--v2-border-border-focus)",
    "--border-success-base": "var(--v2-state-border-success)",
    "--border-success-hover": "var(--v2-state-border-success)",
    "--border-success-selected": "var(--v2-state-border-success)",
    "--border-warning-base": "var(--v2-state-border-warning)",
    "--border-warning-hover": "var(--v2-state-border-warning)",
    "--border-warning-selected": "var(--v2-state-border-warning)",
    "--border-critical-base": "var(--v2-state-border-danger)",
    "--border-critical-hover": "var(--v2-state-border-danger)",
    "--border-critical-selected": "var(--v2-state-border-danger)",
    "--border-info-base": "var(--v2-state-border-info)",
    "--border-info-hover": "var(--v2-state-border-info)",
    "--border-info-selected": "var(--v2-state-border-info)",

    "--icon-base": "var(--v2-icon-icon-muted)",
    "--icon-hover": "var(--v2-icon-icon-base)",
    "--icon-active": "var(--v2-icon-icon-base)",
    "--icon-selected": "var(--v2-icon-icon-base)",
    "--icon-focus": "var(--v2-icon-icon-base)",
    "--icon-weak-base": "var(--v2-icon-icon-muted)",
    "--icon-strong-base": "var(--v2-icon-icon-base)",
    "--icon-interactive-base": "var(--v2-icon-icon-accent)",
    "--icon-success-base": "var(--v2-state-fg-success)",
    "--icon-success-hover": "var(--v2-state-fg-success)",
    "--icon-success-active": "var(--v2-state-fg-success)",
    "--icon-warning-base": "var(--v2-state-fg-warning)",
    "--icon-warning-hover": "var(--v2-state-fg-warning)",
    "--icon-warning-active": "var(--v2-state-fg-warning)",
    "--icon-critical-base": "var(--v2-state-fg-danger)",
    "--icon-critical-hover": "var(--v2-state-fg-danger)",
    "--icon-critical-active": "var(--v2-state-fg-danger)",
    "--icon-info-base": "var(--v2-state-fg-info)",
    "--icon-info-hover": "var(--v2-state-fg-info)",
    "--icon-info-active": "var(--v2-state-fg-info)",

    "--markdown-text": "var(--v2-text-text-muted)",
    "--markdown-heading": "var(--v2-text-text-base)",
    "--markdown-link": "var(--v2-text-text-accent)",
    "--markdown-link-text": "var(--v2-text-text-accent)",
    "--markdown-code": "var(--v2-text-text-muted)",
    "--markdown-code-block": "var(--v2-text-text-base)",
    "--markdown-block-quote": "var(--v2-text-text-muted)",
    "--markdown-emph": "var(--v2-text-text-muted)",
    "--markdown-strong": "var(--v2-text-text-base)",
    "--markdown-list-item": "var(--v2-text-text-accent)",
    "--markdown-list-enumeration": "var(--v2-text-text-accent)",
    "--markdown-image": "var(--v2-text-text-accent)",
    "--markdown-image-text": "var(--v2-text-text-muted)",

    "--syntax-comment": "var(--v2-text-text-faint)",
    "--syntax-regexp": syntaxTextMix(GRUVBOX_DARK_MEDIUM.purple, 42),
    "--syntax-string": syntaxTextMix(GRUVBOX_DARK_MEDIUM.green, 42),
    "--syntax-keyword": syntaxTextMix(GRUVBOX_DARK_MEDIUM.accent, 56),
    "--syntax-primitive": syntaxTextMix(GRUVBOX_DARK_MEDIUM.orange, 50),
    "--syntax-operator": "var(--v2-text-text-muted)",
    "--syntax-variable": "var(--v2-text-text-base)",
    "--syntax-property": syntaxTextMix(GRUVBOX_DARK_MEDIUM.info, 46),
    "--syntax-type": syntaxTextMix(GRUVBOX_DARK_MEDIUM.warning, 50),
    "--syntax-constant": syntaxTextMix(GRUVBOX_DARK_MEDIUM.accent, 52),
    "--syntax-punctuation": "var(--v2-text-text-muted)",
    "--syntax-object": "var(--v2-text-text-base)",
    "--syntax-success": "var(--v2-state-fg-success)",
    "--syntax-warning": "var(--v2-state-fg-warning)",
    "--syntax-critical": "var(--v2-state-fg-danger)",
    "--syntax-info": "var(--v2-state-fg-info)",
    "--syntax-diff-add": "var(--v2-state-fg-success)",
    "--syntax-diff-delete": "var(--v2-state-fg-danger)",
    "--syntax-diff-unknown": syntaxTextMix(GRUVBOX_DARK_MEDIUM.purple, 46),
  });

  addUnprefixedV2Aliases(aliases, Object.keys(v2Variables));
  addUnprefixedV2Aliases(aliases, [
    "--v2-alpha-light-0",
    "--v2-alpha-light-2",
    "--v2-alpha-light-6",
    "--v2-alpha-light-20",
  ]);

  return aliases;
}

function addUnprefixedV2Aliases(variables: ThemeVariables, names: string[]): void {
  for (const name of names) {
    if (!name.startsWith("--v2-")) {
      continue;
    }
    variables[`--${name.slice("--v2-".length)}`] = `var(${name})`;
  }
}

function elevationShadow(y: string, blur: string, alphaPercent: number): string {
  return [
    `0px ${y} ${blur} 0px color-mix(in srgb, var(--another-opencode-for-obsidian-background-primary) ${alphaPercent}%, transparent)`,
    "0px 0px 0px 0.5px var(--v2-border-border-muted)",
  ].join(", ");
}

function backgroundPrimaryMix(percent: number): string {
  return obsidianMix("background-primary", percent);
}

function backgroundSecondaryMix(percent: number): string {
  return obsidianMix("background-secondary", percent);
}

function textNormalMix(percent: number): string {
  return obsidianMix("text-normal", percent);
}

function accentTextMix(percent: number): string {
  return `color-mix(in srgb, ${GRUVBOX_DARK_MEDIUM.accent} ${percent}%, var(--another-opencode-for-obsidian-text-normal))`;
}

function accentSurfaceMix(percent: number): string {
  return `color-mix(in srgb, ${GRUVBOX_DARK_MEDIUM.accent} ${percent}%, var(--another-opencode-for-obsidian-background-secondary))`;
}

function accentBorderMix(percent: number): string {
  return `color-mix(in srgb, ${GRUVBOX_DARK_MEDIUM.accent} ${percent}%, var(--another-opencode-for-obsidian-border))`;
}

function syntaxTextMix(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, var(--another-opencode-for-obsidian-text-normal))`;
}

function readableTextMix(source: "text-muted" | "text-faint", percent: number): string {
  return `color-mix(in srgb, var(--another-opencode-for-obsidian-${source}) ${percent}%, var(--another-opencode-for-obsidian-text-normal))`;
}

function borderMix(percent: number): string {
  return obsidianMix("border", percent);
}

function obsidianMix(
  source: "background-primary" | "background-secondary" | "border" | "text-normal",
  percent: number
): string {
  return `color-mix(in srgb, var(--another-opencode-for-obsidian-${source}) ${percent}%, transparent)`;
}

function scrimLayer(colorScheme: ObsidianThemeValues["colorScheme"]): string {
  return colorScheme === "dark"
    ? backgroundPrimaryMix(OBSIDIAN_OVERLAY_ALPHA.dialogScrimDark)
    : textNormalMix(OBSIDIAN_OVERLAY_ALPHA.dialogScrimLight);
}

function panelLayer(percent: number): string {
  return backgroundSecondaryMix(percent);
}

function resolveObsidianMaterialAlpha(
  obsidian: ObsidianThemeValues
): typeof OBSIDIAN_MATERIAL_ALPHA {
  return isWorkspaceBackgroundEnabled(resolveWorkspaceBackgroundValues(obsidian))
    ? OBSIDIAN_WORKSPACE_BACKGROUND_MATERIAL_ALPHA
    : OBSIDIAN_MATERIAL_ALPHA;
}

function stateBackground(state: "success" | "warning" | "danger" | "info"): string {
  return `color-mix(in srgb, ${gruvboxStateColor(state)} ${OBSIDIAN_STATE_ALPHA.background}%, transparent)`;
}

function stateForeground(state: "success" | "warning" | "danger" | "info"): string {
  return `color-mix(in srgb, ${gruvboxStateColor(state)} ${OBSIDIAN_STATE_ALPHA.foreground}%, var(--another-opencode-for-obsidian-text-normal))`;
}

function stateBorder(state: "success" | "warning" | "danger" | "info"): string {
  return `color-mix(in srgb, ${gruvboxStateColor(state)} ${OBSIDIAN_STATE_ALPHA.border}%, var(--another-opencode-for-obsidian-border))`;
}

function gruvboxStateColor(state: "success" | "warning" | "danger" | "info"): string {
  return GRUVBOX_DARK_MEDIUM[state];
}

function strongBorderMix(percent: number): string {
  return `color-mix(in srgb, var(--v2-text-text-base) ${percent}%, var(--another-opencode-for-obsidian-border))`;
}

function cssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

function cssVars(styles: CSSStyleDeclaration, names: string[], fallback: string): string {
  for (const name of names) {
    const value = styles.getPropertyValue(name).trim();
    if (value) {
      return value;
    }
  }
  return fallback;
}

function resolveWorkspaceBackgroundValues(
  obsidian: ObsidianThemeValues
): WorkspaceBackgroundValues {
  return {
    workspaceBackgroundContract:
      obsidian.workspaceBackgroundContract ?? OBSIDIAN_FALLBACKS.workspaceBackgroundContract,
    workspaceBackgroundImage:
      obsidian.workspaceBackgroundImage ?? OBSIDIAN_FALLBACKS.workspaceBackgroundImage,
    workspaceBackgroundOpacity:
      obsidian.workspaceBackgroundOpacity ?? OBSIDIAN_FALLBACKS.workspaceBackgroundOpacity,
    workspaceBackgroundFilter:
      obsidian.workspaceBackgroundFilter ?? OBSIDIAN_FALLBACKS.workspaceBackgroundFilter,
    workspaceBackgroundPosition:
      obsidian.workspaceBackgroundPosition ?? OBSIDIAN_FALLBACKS.workspaceBackgroundPosition,
    workspaceBackgroundSize:
      obsidian.workspaceBackgroundSize ?? OBSIDIAN_FALLBACKS.workspaceBackgroundSize,
    workspaceBackgroundRepeat:
      obsidian.workspaceBackgroundRepeat ?? OBSIDIAN_FALLBACKS.workspaceBackgroundRepeat,
    workspaceBackgroundBlendMode:
      obsidian.workspaceBackgroundBlendMode ?? OBSIDIAN_FALLBACKS.workspaceBackgroundBlendMode,
    workspaceBackgroundSurface:
      obsidian.workspaceBackgroundSurface ?? OBSIDIAN_FALLBACKS.workspaceBackgroundSurface,
    workspaceBackgroundChrome:
      obsidian.workspaceBackgroundChrome ?? OBSIDIAN_FALLBACKS.workspaceBackgroundChrome,
    workspaceBackgroundBorder:
      obsidian.workspaceBackgroundBorder ?? OBSIDIAN_FALLBACKS.workspaceBackgroundBorder,
  };
}

function isWorkspaceBackgroundEnabled(workspace: WorkspaceBackgroundValues): boolean {
  const image = workspace.workspaceBackgroundImage.trim();
  const opacity = Number.parseFloat(workspace.workspaceBackgroundOpacity);
  return (
    workspace.workspaceBackgroundContract.trim() === "v1" &&
    image.length > 0 &&
    image !== "none" &&
    /^url\(/i.test(image) &&
    (!Number.isFinite(opacity) || opacity > 0)
  );
}

function resolveWorkspaceBackgroundFilter(workspace: WorkspaceBackgroundValues): string {
  const filter = workspace.workspaceBackgroundFilter.trim();
  if (!isWorkspaceBackgroundEnabled(workspace)) {
    return filter || "none";
  }

  return normalizeWorkspaceBackgroundFilter(filter, WORKSPACE_BACKGROUND_MIN_FILTER);
}

function normalizeWorkspaceBackgroundFilter(filter: string, fallback: string): string {
  if (filter.length === 0 || filter === "none") {
    return fallback;
  }

  const lowerFilter = filter.toLowerCase();
  if (lowerFilter === "blur(low)") {
    return WORKSPACE_BACKGROUND_MIN_FILTER;
  }
  if (lowerFilter === "blur(medium)") {
    return "blur(7px)";
  }
  if (lowerFilter === "blur(high)") {
    return "blur(10px)";
  }
  if (/^blur\(\s*(?:\d+|\d*\.\d+)px\s*\)$/i.test(filter)) {
    return filter;
  }

  return fallback;
}

function resolveObsidianColorScheme(source: HTMLElement): ObsidianThemeValues["colorScheme"] {
  if (source.classList.contains("theme-light") || source.closest(".theme-light")) {
    return "light";
  }
  if (source.classList.contains("theme-dark") || source.closest(".theme-dark")) {
    return "dark";
  }

  const body = source.ownerDocument.body;
  return body.classList.contains("theme-light") ? "light" : "dark";
}

function resolveObsidianPageBackground(
  source: HTMLElement,
  sourceStyles: CSSStyleDeclaration,
  paneSource?: HTMLElement
): string {
  const bodyStyles = getComputedStyle(source.ownerDocument.body);
  const paneBackground = paneSource ? resolvePaneChromeBackground(paneSource) : null;
  if (paneBackground) {
    return paneBackground;
  }

  const chromeVariableBackground = cssVariableBackground(bodyStyles, sourceStyles, [
    "--tab-container-background",
    "--titlebar-background",
    "--background-secondary",
  ]);
  if (chromeVariableBackground) {
    return chromeVariableBackground;
  }

  const chromeBackground = firstVisibleElementBackground(source.ownerDocument, [
    ".workspace-tabs.mod-top .workspace-tab-header-container",
    ".workspace-tab-header-container",
    ".workspace-ribbon",
    ".workspace-sidedock-vault-profile",
    ".mod-root .workspace-tabs",
    ".app-container",
  ]);
  if (chromeBackground) {
    return chromeBackground;
  }

  const backgroundPrimary = cssVar(
    sourceStyles,
    "--background-primary",
    OBSIDIAN_FALLBACKS.backgroundPrimary
  );
  if (isVisibleBackground(backgroundPrimary)) {
    return backgroundPrimary;
  }

  return cssVar(sourceStyles, "--background-primary", OBSIDIAN_FALLBACKS.backgroundPrimary);
}

function resolvePaneChromeBackground(paneSource: HTMLElement): string | null {
  const ancestors = paneChromeAncestors(paneSource);
  const elementBackground = firstVisibleAncestorBackground(ancestors);
  if (elementBackground) {
    return elementBackground;
  }

  return cssVariableBackground(getComputedStyle(paneSource), getComputedStyle(paneSource), [
    "--tab-container-background",
    "--background-secondary",
    "--background-primary-alt",
    "--background-primary",
  ]);
}

function paneChromeAncestors(source: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current: HTMLElement | null = source;
  while (current) {
    if (
      current.matches(
        [
          ".workspace-tab-container",
          ".workspace-tabs",
          ".workspace-split.mod-left-split",
          ".workspace-split.mod-right-split",
          ".workspace-split.mod-root",
          ".workspace-leaf-content",
          ".workspace-leaf",
        ].join(", ")
      )
    ) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }
  return ancestors;
}

function firstVisibleAncestorBackground(ancestors: HTMLElement[]): string | null {
  for (const element of ancestors) {
    const background = getComputedStyle(element).backgroundColor.trim();
    if (isVisibleBackground(background)) {
      return background;
    }
  }
  return null;
}

function cssVariableBackground(
  primaryStyles: CSSStyleDeclaration,
  fallbackStyles: CSSStyleDeclaration,
  names: string[]
): string | null {
  for (const styles of [primaryStyles, fallbackStyles]) {
    for (const name of names) {
      const value = styles.getPropertyValue(name).trim();
      if (isVisibleBackground(value)) {
        return value;
      }
    }
  }
  return null;
}

function firstVisibleElementBackground(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    const background = getComputedStyle(element).backgroundColor.trim();
    if (isVisibleBackground(background)) {
      return background;
    }
  }

  return null;
}

function isVisibleBackground(color: string): boolean {
  return color !== "" && color !== "transparent" && color !== "rgba(0, 0, 0, 0)";
}
