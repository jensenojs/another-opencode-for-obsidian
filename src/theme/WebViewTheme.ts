import type { WebViewTheme } from "../types";

interface ObsidianThemeValues {
  colorScheme: "light" | "dark";
  backgroundPrimary: string;
  backgroundSecondary: string;
  backgroundModifierBorder: string;
  backgroundModifierHover: string;
  textNormal: string;
  textMuted: string;
  textFaint: string;
  interactiveAccent: string;
  fontInterface: string;
}

const OBSIDIAN_FALLBACKS: ObsidianThemeValues = {
  colorScheme: "dark",
  backgroundPrimary: "#1e1e1e",
  backgroundSecondary: "#262626",
  backgroundModifierBorder: "#3a3a3a",
  backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
  textNormal: "#f1f1f1",
  textMuted: "#c8c8c8",
  textFaint: "#8f8f8f",
  interactiveAccent: "#f5c45c",
  fontInterface: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

// This bridge consumes both apps' theme-token surfaces:
// Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
// OpenCode tokens: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/theme.css
// Tailwind mapping: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css
export function captureObsidianWebViewTheme(source: HTMLElement = document.body): WebViewTheme {
  const styles = getComputedStyle(source);
  const colorScheme = source.classList.contains("theme-light") ? "light" : "dark";

  return createOpenCodeWebViewTheme({
    colorScheme,
    backgroundPrimary: cssVar(styles, "--background-primary", OBSIDIAN_FALLBACKS.backgroundPrimary),
    backgroundSecondary: cssVar(
      styles,
      "--background-secondary",
      OBSIDIAN_FALLBACKS.backgroundSecondary
    ),
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
    fontInterface: cssVar(styles, "--font-interface", OBSIDIAN_FALLBACKS.fontInterface),
  });
}

export function createOpenCodeWebViewTheme(obsidian: ObsidianThemeValues): WebViewTheme {
  const transparent = "transparent";
  const subtleSurface = "color-mix(in srgb, var(--opencode-obsidian-text-normal) 7%, transparent)";
  const baseSurface =
    "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 48%, transparent)";
  const raisedSurface =
    "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 64%, transparent)";
  const strongSurface =
    "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 76%, transparent)";
  const strongerSurface =
    "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 84%, transparent)";

  const variables = {
    "--opencode-obsidian-background-primary": obsidian.backgroundPrimary,
    "--opencode-obsidian-background-secondary": obsidian.backgroundSecondary,
    "--opencode-obsidian-border": obsidian.backgroundModifierBorder,
    "--opencode-obsidian-hover": obsidian.backgroundModifierHover,
    "--opencode-obsidian-text-normal": obsidian.textNormal,
    "--opencode-obsidian-text-muted": obsidian.textMuted,
    "--opencode-obsidian-text-faint": obsidian.textFaint,
    "--opencode-obsidian-accent": obsidian.interactiveAccent,
    "--font-family-sans": obsidian.fontInterface,
    "--font-sans": obsidian.fontInterface,

    // Obsidian mode lets the Obsidian pane own the page background. Local
    // OpenCode surfaces below add contrast without targeting component classes.
    "--background-base": transparent,
    "--background-weak": transparent,
    "--background-strong": transparent,
    "--background-stronger": transparent,

    "--surface-base": "color-mix(in srgb, var(--opencode-obsidian-text-normal) 6%, transparent)",
    "--base": subtleSurface,
    "--base2": subtleSurface,
    "--base3": subtleSurface,
    "--surface-base-hover": "var(--opencode-obsidian-hover)",
    "--surface-base-active":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 13%, transparent)",
    "--surface-base-interactive-active":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 18%, transparent)",
    "--surface-inset-base": baseSurface,
    "--surface-inset-base-hover":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 10%, transparent)",
    "--surface-inset-strong":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 12%, transparent)",
    "--surface-inset-strong-hover":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 16%, transparent)",
    "--surface-raised-base": raisedSurface,
    "--surface-float-base": strongSurface,
    "--surface-float-base-hover": strongerSurface,
    "--surface-raised-base-hover":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 10%, transparent)",
    "--surface-raised-base-active":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 14%, transparent)",
    "--surface-raised-strong": strongSurface,
    "--surface-raised-strong-hover": strongerSurface,
    "--surface-raised-stronger": strongerSurface,
    "--surface-raised-stronger-hover": strongerSurface,
    "--surface-stronger-non-alpha": strongerSurface,
    "--surface-raised-stronger-non-alpha": strongerSurface,
    "--surface-weak": "color-mix(in srgb, var(--opencode-obsidian-text-normal) 9%, transparent)",
    "--surface-weaker": "color-mix(in srgb, var(--opencode-obsidian-text-normal) 6%, transparent)",
    "--surface-strong": strongSurface,
    "--surface-interactive-base":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 22%, transparent)",
    "--surface-interactive-hover":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 30%, transparent)",
    "--surface-interactive-weak":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 12%, transparent)",
    "--surface-interactive-weak-hover":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 18%, transparent)",

    "--input-base": baseSurface,
    "--input-hover": raisedSurface,
    "--input-active": raisedSurface,
    "--input-focus": raisedSurface,
    "--input-selected": "color-mix(in srgb, var(--opencode-obsidian-accent) 24%, transparent)",

    "--text-base": "var(--opencode-obsidian-text-muted)",
    "--text-weak": "var(--opencode-obsidian-text-muted)",
    "--text-weaker": "var(--opencode-obsidian-text-faint)",
    "--text-strong": "var(--opencode-obsidian-text-normal)",
    "--text-stronger": "var(--opencode-obsidian-text-normal)",
    "--text-interactive-base": "var(--opencode-obsidian-accent)",

    "--button-primary-base": "var(--opencode-obsidian-accent)",
    "--button-secondary-base": raisedSurface,
    "--button-secondary-hover": "var(--opencode-obsidian-hover)",
    "--button-ghost-hover": "var(--opencode-obsidian-hover)",
    "--button-ghost-hover2":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 14%, transparent)",

    "--border-base": "var(--opencode-obsidian-border)",
    "--border-hover":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 35%, var(--opencode-obsidian-border))",
    "--border-active":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 45%, var(--opencode-obsidian-border))",
    "--border-focus": "var(--opencode-obsidian-accent)",
    "--border-selected": "var(--opencode-obsidian-accent)",
    "--border-weak-base": "var(--opencode-obsidian-border)",
    "--border-weak-hover":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 25%, var(--opencode-obsidian-border))",
    "--border-weak-active":
      "color-mix(in srgb, var(--opencode-obsidian-text-normal) 35%, var(--opencode-obsidian-border))",
    "--border-weak-selected":
      "color-mix(in srgb, var(--opencode-obsidian-accent) 38%, transparent)",
    "--border-weaker-base": "color-mix(in srgb, var(--opencode-obsidian-border) 60%, transparent)",
    "--border-interactive-base": "var(--opencode-obsidian-accent)",
    "--border-interactive-hover": "var(--opencode-obsidian-accent)",
    "--border-interactive-active": "var(--opencode-obsidian-accent)",
    "--border-interactive-selected": "var(--opencode-obsidian-accent)",
    "--border-interactive-focus": "var(--opencode-obsidian-accent)",

    "--icon-base": "var(--opencode-obsidian-text-muted)",
    "--icon-hover": "var(--opencode-obsidian-text-normal)",
    "--icon-active": "var(--opencode-obsidian-text-normal)",
    "--icon-selected": "var(--opencode-obsidian-text-normal)",
    "--icon-focus": "var(--opencode-obsidian-text-normal)",
    "--icon-weak-base": "var(--opencode-obsidian-text-faint)",
    "--icon-strong-base": "var(--opencode-obsidian-text-normal)",
    "--icon-interactive-base": "var(--opencode-obsidian-accent)",

    "--markdown-text": "var(--opencode-obsidian-text-muted)",
    "--markdown-heading": "var(--opencode-obsidian-text-normal)",
    "--markdown-link": "var(--opencode-obsidian-accent)",
    "--markdown-link-text": "var(--opencode-obsidian-accent)",

    "--v2-background-bg-base": transparent,
    "--v2-background-bg-deep": transparent,
    "--v2-background-bg-layer-01": baseSurface,
    "--v2-background-bg-layer-02": raisedSurface,
    "--v2-background-bg-layer-03": strongSurface,
    "--v2-background-bg-layer-04": strongerSurface,
    "--v2-background-bg-button-neutral": raisedSurface,
    "--v2-background-bg-accent": "var(--opencode-obsidian-accent)",
    "--v2-text-text-base": "var(--opencode-obsidian-text-normal)",
    "--v2-text-text-muted": "var(--opencode-obsidian-text-muted)",
    "--v2-text-text-faint": "var(--opencode-obsidian-text-faint)",
    "--v2-text-text-accent": "var(--opencode-obsidian-accent)",
    "--v2-icon-icon-base": "var(--opencode-obsidian-text-normal)",
    "--v2-icon-icon-muted": "var(--opencode-obsidian-text-muted)",
    "--v2-icon-icon-accent": "var(--opencode-obsidian-accent)",
    "--v2-border-border-muted":
      "color-mix(in srgb, var(--opencode-obsidian-border) 60%, transparent)",
    "--v2-border-border-base": "var(--opencode-obsidian-border)",
    "--v2-border-border-focus": "var(--opencode-obsidian-accent)",
  };

  return {
    colorScheme: obsidian.colorScheme,
    variables,
  };
}

function cssVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}
