import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import {
  captureObsidianWebViewTheme,
  createOpenCodeWebViewTheme,
} from "../../src/theme/WebViewTheme";

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
    expect(theme.variables["--background-bg-base"]).toBe("var(--v2-background-bg-base)");
    expect(theme.variables["--background-bg-layer-01"]).toBe("var(--v2-background-bg-layer-01)");
    expect(theme.variables["--text-text-base"]).toBe("var(--v2-text-text-base)");
    expect(theme.variables["--border-border-base"]).toBe("var(--v2-border-border-base)");
    expect(theme.variables["--alpha-light-6"]).toBe("var(--v2-alpha-light-6)");
    expect(theme.variables["--font-family-sans"]).toBe('"Monaco Nerd Font Mono", ui-sans-serif');
  });
});

describe("captureObsidianWebViewTheme", () => {
  test("uses the visible Obsidian app background for translucent themes", async () => {
    const window = new Window({
      settings: {
        enableJavaScriptEvaluation: false,
      },
    });
    const previousGetComputedStyle = globalThis.getComputedStyle;
    const previousHTMLElement = globalThis.HTMLElement;

    try {
      globalThis.getComputedStyle = window.getComputedStyle.bind(window) as typeof getComputedStyle;
      globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
      window.document.body.className = "theme-dark is-translucent";
      window.document.body.innerHTML = '<div class="app-container"></div>';
      window.document.body.style.setProperty("--background-primary", "#000");
      window.document.body.style.setProperty("--background-secondary", "rgb(29, 32, 33)");
      window.document.body.style.setProperty("--background-modifier-border", "rgb(60, 56, 54)");
      window.document.body.style.setProperty(
        "--background-modifier-hover",
        "rgba(255, 255, 255, 0.08)"
      );
      window.document.body.style.setProperty("--text-normal", "#f1f1f1");
      window.document.body.style.setProperty("--text-muted", "rgb(213, 196, 161)");
      window.document.body.style.setProperty("--text-faint", "rgb(146, 131, 116)");
      window.document.body.style.setProperty("--interactive-accent", "hsl(41, 88%, 66%)");
      window.document.body.style.setProperty(
        "--font-interface",
        '"Monaco Nerd Font Mono", ui-sans-serif'
      );
      const appContainer = window.document.querySelector(
        ".app-container"
      ) as unknown as HTMLElement;
      appContainer.style.backgroundColor = "rgba(0, 0, 0, 0.25)";

      const theme = captureObsidianWebViewTheme(window.document.body as unknown as HTMLElement);

      expect(theme.variables["--opencode-obsidian-page-background"]).toBe("rgba(0, 0, 0, 0.25)");
      expect(theme.variables["--opencode-obsidian-background-primary"]).toBe("#000");
    } finally {
      globalThis.getComputedStyle = previousGetComputedStyle;
      globalThis.HTMLElement = previousHTMLElement;
      await window.happyDOM.close();
    }
  });
});
