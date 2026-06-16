import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, test } from "bun:test";
import { openCodeThemeGoldStandardChecks } from "../../scripts/harness/themeGoldStandard";

describe("openCodeThemeGoldStandardChecks", () => {
  test("uses OpenCode v2 theme.css as the token coverage source", () => {
    const root = createOpenCodeThemeFixture({
      v2ThemeCss: `
        :root {
          --v2-background-bg-base: transparent;
          --v2-background-bg-deep: transparent;
          --v2-elevation-raised: none;
          --v2-state-bg-success: #123;
          --v2-text-text-base: #fff;
        }
      `,
      tailwindColorsCss: `
        @theme {
          --color-surface-base: var(--surface-base);
          --color-text-strong: var(--text-strong);
          --color-v2-background-bg-base: var(--v2-background-bg-base);
        }
      `,
    });

    try {
      const checks = openCodeThemeGoldStandardChecks(root, {
        "--v2-background-bg-base": "transparent",
        "--v2-background-bg-deep": "transparent",
        "--v2-elevation-raised": "none",
        "--v2-state-bg-success": "var(--opencode-obsidian-success)",
        "--v2-text-text-base": "var(--opencode-obsidian-text-normal)",
        "--background-bg-base": "var(--v2-background-bg-base)",
        "--background-bg-deep": "var(--v2-background-bg-deep)",
        "--background-stronger": "transparent",
        "--elevation-raised": "var(--v2-elevation-raised)",
        "--state-bg-success": "var(--v2-state-bg-success)",
        "--text-text-base": "var(--v2-text-text-base)",
        "--surface-base": "var(--v2-background-bg-layer-01)",
        "--text-strong": "var(--v2-text-text-base)",
      });

      expect(checks).toHaveLength(3);
      expect(checks.every((check) => check.ok)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when an upstream v2 appearance token is not injected", () => {
    const root = createOpenCodeThemeFixture({
      v2ThemeCss: `
        :root {
          --v2-background-bg-base: transparent;
          --v2-background-bg-contrast: #111;
          --v2-state-fg-warning: #222;
        }
      `,
      tailwindColorsCss: "@theme {}",
    });

    try {
      const checks = openCodeThemeGoldStandardChecks(root, {
        "--v2-background-bg-base": "transparent",
        "--background-bg-base": "var(--v2-background-bg-base)",
      });

      expect(checks[0].ok).toBe(false);
      expect(checks[0].detail).toMatchObject({
        missing: ["--v2-background-bg-contrast", "--v2-state-fg-warning"],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when an unprefixed v2 alias is not derived from the local source token", () => {
    const root = createOpenCodeThemeFixture({
      v2ThemeCss: `
        :root {
          --v2-background-bg-base: transparent;
          --v2-elevation-floating: none;
        }
      `,
      tailwindColorsCss: "@theme {}",
    });

    try {
      const checks = openCodeThemeGoldStandardChecks(root, {
        "--v2-background-bg-base": "transparent",
        "--v2-elevation-floating": "none",
        "--background-bg-base": "var(--v2-background-bg-base)",
      });

      expect(checks[1].ok).toBe(false);
      expect(checks[1].detail).toMatchObject({
        missing: [{ name: "--v2-elevation-floating", alias: "--elevation-floating" }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails when a legacy appearance override carries its own color", () => {
    const root = createOpenCodeThemeFixture({
      v2ThemeCss: `
        :root {
          --v2-background-bg-base: transparent;
        }
      `,
      tailwindColorsCss: `
        @theme {
          --color-surface-base: var(--surface-base);
        }
      `,
    });

    try {
      const checks = openCodeThemeGoldStandardChecks(root, {
        "--v2-background-bg-base": "transparent",
        "--background-bg-base": "var(--v2-background-bg-base)",
        "--background-stronger": "transparent",
        "--surface-base": "rgba(0, 0, 0, 0.6)",
      });

      expect(checks[2].ok).toBe(false);
      expect(checks[2].detail).toMatchObject({
        nonV2LegacyValues: {
          "--surface-base": "rgba(0, 0, 0, 0.6)",
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function createOpenCodeThemeFixture(input: {
  v2ThemeCss: string;
  tailwindColorsCss: string;
}): string {
  const root = mkdtempSync(join(tmpdir(), "opencode-theme-gold-"));
  const v2Dir = join(root, "packages", "ui", "src", "v2", "styles");
  const tailwindDir = join(root, "packages", "ui", "src", "styles", "tailwind");
  mkdirSync(v2Dir, { recursive: true });
  mkdirSync(tailwindDir, { recursive: true });
  writeFileSync(join(v2Dir, "theme.css"), input.v2ThemeCss);
  writeFileSync(join(tailwindDir, "colors.css"), input.tailwindColorsCss);
  return root;
}
