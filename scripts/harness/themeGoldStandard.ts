import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { HarnessCheck } from "./themeChecks";

interface SourceStatus {
  path: string;
  referenceUrl: string;
  exists: boolean;
}

const openCodeV2ThemeReferenceUrl =
  "https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css";
const openCodeTailwindColorsReferenceUrl =
  "https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css";

const appearanceV2Prefixes = [
  "--v2-background-",
  "--v2-text-",
  "--v2-icon-",
  "--v2-border-",
  "--v2-state-",
  "--v2-elevation-",
  "--v2-overlay-",
  "--v2-illustration-",
  "--v2-font-family-",
];

const appearanceLegacyPrefixes = [
  "--background-",
  "--surface-",
  "--base",
  "--input-",
  "--text-",
  "--button-",
  "--border-",
  "--elevation-",
  "--icon-",
  "--markdown-",
];

export function openCodeThemeGoldStandardChecks(
  opencodeSource: string | null | undefined,
  variables: Record<string, string>
): HarnessCheck[] {
  if (!opencodeSource) {
    return [];
  }

  const v2ThemePath = join(opencodeSource, "packages", "ui", "src", "v2", "styles", "theme.css");
  const tailwindColorsPath = join(
    opencodeSource,
    "packages",
    "ui",
    "src",
    "styles",
    "tailwind",
    "colors.css"
  );
  const sources = {
    v2Theme: sourceStatus(v2ThemePath, openCodeV2ThemeReferenceUrl),
    tailwindColors: sourceStatus(tailwindColorsPath, openCodeTailwindColorsReferenceUrl),
  };

  if (!sources.v2Theme.exists || !sources.tailwindColors.exists) {
    return [
      {
        name: "OpenCode theme gold standard sources are available",
        ok: false,
        detail: sources,
      },
    ];
  }

  const v2ThemeCss = readFileSync(v2ThemePath, "utf8");
  const tailwindColorsCss = readFileSync(tailwindColorsPath, "utf8");
  const v2AppearanceTokens = extractCssCustomProperties(v2ThemeCss).filter((name) =>
    appearanceV2Prefixes.some((prefix) => name.startsWith(prefix))
  );
  const tailwindLegacyTokens = extractTailwindReferencedTokens(tailwindColorsCss).filter(
    (name) =>
      !name.startsWith("--v2-") &&
      appearanceLegacyPrefixes.some((prefix) => name.startsWith(prefix))
  );
  const missingV2Tokens = v2AppearanceTokens.filter((name) => !(name in variables));
  const missingUnprefixedV2Aliases = v2AppearanceTokens
    .filter((name) => !name.startsWith("--v2-font-family-"))
    .map((name) => ({ name, alias: `--${name.slice("--v2-".length)}` }))
    .filter(({ name, alias }) => variables[alias] !== `var(${name})`);
  const overriddenLegacyTokens = tailwindLegacyTokens.filter((name) => name in variables);
  const nonV2LegacyValues = Object.fromEntries(
    Object.entries(variables).filter(([name, value]) => {
      if (!appearanceLegacyPrefixes.some((prefix) => name.startsWith(prefix))) {
        return false;
      }
      return value !== "transparent" && !value.startsWith("var(--v2-");
    })
  );

  return [
    {
      name: "OpenCode v2 appearance tokens are covered from local source",
      ok: missingV2Tokens.length === 0,
      detail: {
        source: sources.v2Theme,
        expectedCount: v2AppearanceTokens.length,
        missing: missingV2Tokens,
      },
    },
    {
      name: "OpenCode unprefixed v2 aliases are derived from local source",
      ok: missingUnprefixedV2Aliases.length === 0,
      detail: {
        source: sources.v2Theme,
        missing: missingUnprefixedV2Aliases,
      },
    },
    {
      name: "OpenCode legacy appearance overrides are only v2 aliases",
      ok: Object.keys(nonV2LegacyValues).length === 0,
      detail: {
        source: sources.tailwindColors,
        tailwindLegacyAppearanceTokenCount: tailwindLegacyTokens.length,
        overriddenTailwindLegacyTokens: overriddenLegacyTokens,
        nonV2LegacyValues,
      },
    },
  ];
}

function sourceStatus(path: string, referenceUrl: string): SourceStatus {
  return {
    path,
    referenceUrl,
    exists: existsSync(path),
  };
}

function extractCssCustomProperties(css: string): string[] {
  return unique(Array.from(css.matchAll(/--[-_a-zA-Z0-9]+(?=\s*:)/g), (match) => match[0]));
}

function extractTailwindReferencedTokens(css: string): string[] {
  return unique(
    Array.from(
      css.matchAll(/--color-[-_a-zA-Z0-9]+\s*:\s*var\((--[-_a-zA-Z0-9]+)\)/g),
      (match) => match[1]
    )
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
