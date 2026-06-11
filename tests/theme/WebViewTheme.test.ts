import { describe, expect, test } from "bun:test";
import { createOpenCodeWebViewTheme } from "../../src/theme/WebViewTheme";

describe("createOpenCodeWebViewTheme", () => {
  test("maps Obsidian theme variables onto OpenCode design tokens", () => {
    const theme = createOpenCodeWebViewTheme({
      colorScheme: "dark",
      pageBackground: "rgba(0, 0, 0, 0.25)",
      backgroundPrimary: "#000000",
      backgroundSecondary: "rgb(29, 32, 33)",
      backgroundModifierBorder: "rgb(60, 56, 54)",
      backgroundModifierHover: "rgba(255, 255, 255, 0.08)",
      textNormal: "#f1f1f1",
      textMuted: "rgb(213, 196, 161)",
      textFaint: "rgb(146, 131, 116)",
      interactiveAccent: "hsl(41, 88%, 66%)",
      fontInterface: '"Monaco Nerd Font Mono", ui-sans-serif',
    });

    expect(theme.colorScheme).toBe("dark");
    expect(theme.variables["--opencode-obsidian-page-background"]).toBe("rgba(0, 0, 0, 0.25)");
    expect(theme.variables["--opencode-obsidian-background-primary"]).toBe("#000000");
    expect(theme.variables["--background-base"]).toBe("var(--opencode-obsidian-page-background)");
    expect(theme.variables["--background-strong"]).toBe("var(--opencode-obsidian-page-background)");
    expect(theme.variables["--surface-raised-base"]).toBe(
      "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 64%, transparent)"
    );
    expect(theme.variables["--surface-float-base"]).toBe(
      "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 76%, transparent)"
    );
    expect(theme.variables["--input-base"]).toBe(
      "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 48%, transparent)"
    );
    expect(theme.variables["--text-strong"]).toBe("var(--opencode-obsidian-text-normal)");
    expect(theme.variables["--border-weak-base"]).toBe("var(--opencode-obsidian-border)");
    expect(theme.variables["--text-interactive-base"]).toBe("var(--opencode-obsidian-accent)");
    expect(theme.variables["--v2-background-bg-base"]).toBe(
      "var(--opencode-obsidian-page-background)"
    );
    expect(theme.variables["--v2-background-bg-layer-03"]).toBe(
      "color-mix(in srgb, var(--opencode-obsidian-background-secondary) 76%, transparent)"
    );
    expect(theme.variables["--font-family-sans"]).toBe('"Monaco Nerd Font Mono", ui-sans-serif');
  });
});
