import { describe, expect, test } from "bun:test";
import {
  runtimeThemeChecks,
  themeDiagnosticsResolvedChecks,
} from "../../scripts/harness/themeChecks";

describe("themeDiagnosticsResolvedChecks", () => {
  test("checks fixture diagnostics against injected Obsidian variables", () => {
    const checks = themeDiagnosticsResolvedChecks(
      {
        variables: {
          "--background-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
          "--background-weak": "color-mix(in srgb, rgb(29, 32, 33) 36%, transparent)",
          "--background-strong": "rgba(0, 0, 0, 0)",
          "--background-stronger": "transparent",
          "--v2-background-bg-deep": "rgba(0, 0, 0, 0)",
          "--background-bg-deep": "rgba(0, 0, 0, 0)",
          "--v2-background-bg-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
          "--background-bg-base": "color-mix(in srgb, rgb(29, 32, 33) 28%, transparent)",
          "--background-bg-layer-01": "color-mix(in srgb, rgb(29, 32, 33) 36%, transparent)",
          "--background-bg-layer-02": "color-mix(in srgb, rgb(29, 32, 33) 46%, transparent)",
          "--background-bg-layer-03": "color-mix(in srgb, rgb(29, 32, 33) 58%, transparent)",
          "--background-bg-layer-04": "color-mix(in srgb, rgb(29, 32, 33) 68%, transparent)",
          "--surface-raised-base": "color-mix(in srgb, rgb(29, 32, 33) 46%, transparent)",
          "--surface-float-base": "color-mix(in srgb, rgb(29, 32, 33) 58%, transparent)",
          "--surface-raised-stronger-non-alpha":
            "color-mix(in srgb, rgb(29, 32, 33) 68%, transparent)",
          "--input-base": "color-mix(in srgb, rgb(29, 32, 33) 36%, transparent)",
          "--v2-overlay-simple-overlay-scrim": "color-mix(in srgb, #000 70%, transparent)",
          "--overlay-simple-overlay-scrim": "color-mix(in srgb, #000 70%, transparent)",
          "--text-text-base": "#f1f1f1",
          "--border-border-base": "color-mix(in srgb, rgb(60, 56, 54) 64%, transparent)",
          "--v2-state-bg-success": "color-mix(in srgb, #689d6a 20%, transparent)",
          "--v2-state-fg-success":
            "color-mix(in srgb, #689d6a 68%, var(--another-opencode-for-obsidian-text-normal))",
          "--v2-state-border-success":
            "color-mix(in srgb, #689d6a 52%, var(--another-opencode-for-obsidian-border))",
          "--v2-state-bg-warning": "color-mix(in srgb, #d79921 20%, transparent)",
          "--v2-state-fg-warning":
            "color-mix(in srgb, #d79921 68%, var(--another-opencode-for-obsidian-text-normal))",
          "--v2-state-border-warning":
            "color-mix(in srgb, #d79921 52%, var(--another-opencode-for-obsidian-border))",
          "--v2-state-bg-danger": "color-mix(in srgb, #cc241d 20%, transparent)",
          "--v2-state-fg-danger":
            "color-mix(in srgb, #cc241d 68%, var(--another-opencode-for-obsidian-text-normal))",
          "--v2-state-border-danger":
            "color-mix(in srgb, #cc241d 52%, var(--another-opencode-for-obsidian-border))",
          "--v2-state-bg-info": "color-mix(in srgb, #458588 20%, transparent)",
          "--v2-state-fg-info":
            "color-mix(in srgb, #458588 68%, var(--another-opencode-for-obsidian-text-normal))",
          "--v2-state-border-info":
            "color-mix(in srgb, #458588 52%, var(--another-opencode-for-obsidian-border))",
        },
      },
      {
        "--another-opencode-for-obsidian-page-background": "rgba(0, 0, 0, 0.25)",
        "--another-opencode-for-obsidian-background-primary": "#000",
        "--another-opencode-for-obsidian-background-secondary": "rgb(29, 32, 33)",
        "--another-opencode-for-obsidian-text-normal": "#f1f1f1",
        "--another-opencode-for-obsidian-border": "rgb(60, 56, 54)",
        "--another-opencode-for-obsidian-success": "rgb(84, 182, 122)",
        "--another-opencode-for-obsidian-warning": "rgb(215, 166, 66)",
        "--another-opencode-for-obsidian-danger": "rgb(219, 92, 92)",
        "--another-opencode-for-obsidian-info": "rgb(95, 163, 231)",
      }
    );

    expect(checks.map((check) => check.ok)).toEqual([true, true, true, true, true]);
  });
});

describe("runtimeThemeChecks", () => {
  test("names root state separately from visible background samples", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "body",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
      },
      "#000000"
    );

    expect(checks[0].name).toBe(
      "runtime iframe document roots use the Obsidian base and keep the OpenCode app root transparent"
    );
    expect(checks[1].name).toBe("runtime theme diagnostics use current visibleBackgrounds field");
    expect(checks.map((check) => check.ok)).toEqual([true, true, true, true, true, true]);
    expect(checks[1].name).toBe("runtime theme diagnostics use current visibleBackgrounds field");
    expect(checks[1].detail).toEqual({
      hasVisibleBackgrounds: true,
      hasLargeElementSamples: true,
      hasLegacyOpaqueBackgrounds: false,
      hint: undefined,
    });
    expect(checks[2].name).toBe(
      "runtime page background samples do not repaint the page background"
    );
    expect(checks[2].detail).toEqual({
      expectedRootBackground: "#000000",
      normalizedExpectedRootBackground: "rgb(0, 0, 0)",
      largeBackgrounds: [],
      largeElementSamples: [],
      pageBackgrounds: [],
      localSurfaceBackgrounds: [],
      unmatchedLargeBackgrounds: [],
    });
    expect(checks[3].name).toBe("runtime dialog overlay uses a translucent scrim when present");
    expect(checks[3].detail).toEqual({
      observedDialogOverlay: false,
      dialogOverlays: [],
      opaqueDialogOverlays: [],
      brightDialogOverlays: [],
    });
    expect(checks[4].name).toBe(
      "runtime OpenCode shell canvas stays transparent over the host backdrop"
    );
    expect(checks[4].detail).toEqual({
      observedBackgroundStrongerSurface: false,
      backgroundStrongerSurfaces: [],
      transparentBackgroundStrongerSurfaces: [],
      invalidBackgroundStrongerSurfaces: [],
    });
    expect(checks[5].name).toBe(
      "runtime OpenCode local surfaces stay within Obsidian material density"
    );
    expect(checks[5].detail).toEqual({
      composerMaxAlpha: 0.32,
      dockMaxAlpha: 0.56,
      localMaterialSurfaces: [],
      denseLocalMaterialSurfaces: [],
    });
  });

  test("matches hsla theme variables against computed rgb document roots", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgb(38, 33, 28)",
            backgroundImage: "none",
          },
          {
            tag: "body",
            id: null,
            backgroundColor: "rgb(38, 33, 28)",
            backgroundImage: "none",
          },
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
      },
      "hsla(29, 16%, 13%, 1)"
    );

    expect(checks[0].ok).toBe(true);
    expect(checks[0].detail).toMatchObject({
      normalizedExpectedRootBackground: "rgb(38, 33, 28)",
    });
  });

  test("does not accept the old opaqueBackgrounds field", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            backgroundImage: "none",
          },
        ],
        opaqueBackgrounds: [
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            backgroundImage: "none",
            area: 1200,
          },
        ],
      },
      "transparent"
    );

    expect(checks[0].ok).toBe(false);
    expect(checks[1].ok).toBe(false);
    expect(checks[1].detail).toEqual({
      hasVisibleBackgrounds: false,
      hasLargeElementSamples: false,
      hasLegacyOpaqueBackgrounds: true,
      hint: "The running Obsidian plugin is still using an older bundle. Reload the plugin after building.",
    });
    expect(checks[2].ok).toBe(false);
    expect(checks[3].ok).toBe(true);
  });

  test("rejects large background samples that do not use the expected background", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "body",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgb(8, 8, 8)",
            backgroundImage: "none",
            area: 1200,
          },
        ],
        largeElementSamples: [],
      },
      "#000000"
    );

    expect(checks[0].ok).toBe(true);
    expect(checks[1].ok).toBe(true);
    expect(checks[2].ok).toBe(false);
    expect(checks[3].ok).toBe(true);
    expect((checks[2].detail as any).unmatchedLargeBackgrounds).toEqual([
      {
        tag: "div",
        id: "root",
        className: null,
        dataComponent: null,
        dataSlot: null,
        backgroundColor: "rgb(8, 8, 8)",
        backgroundImage: "none",
        opacity: null,
        position: null,
        zIndex: null,
        area: 1200,
      },
    ]);
  });

  test("rejects the previous black translucent root overlay", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0.25)",
            backgroundImage: "none",
            area: 1200,
          },
        ],
        largeElementSamples: [],
      },
      "transparent"
    );

    expect(checks[0].ok).toBe(false);
    expect(checks[1].ok).toBe(true);
    expect(checks[2].ok).toBe(false);
    expect(checks[3].ok).toBe(true);
    expect((checks[2].detail as any).unmatchedLargeBackgrounds).toEqual([
      {
        tag: "div",
        id: "root",
        className: null,
        dataComponent: null,
        dataSlot: null,
        backgroundColor: "rgba(0, 0, 0, 0.25)",
        backgroundImage: "none",
        opacity: null,
        position: null,
        zIndex: null,
        area: 1200,
      },
    ]);
  });

  test("allows large local surfaces while keeping the page root transparent", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "body",
            id: null,
            backgroundColor: "rgb(0, 0, 0)",
            backgroundImage: "none",
          },
          {
            tag: "div",
            id: "root",
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [
          {
            tag: "div",
            id: null,
            dataComponent: null,
            dataSlot: "panel",
            backgroundColor: "color(srgb 0.113725 0.12549 0.129412 / 0.44)",
            backgroundImage: "none",
            area: 3200,
          },
        ],
        largeElementSamples: [],
      },
      "#000000"
    );

    expect(checks.map((check) => check.ok)).toEqual([true, true, true, true, true, true]);
    expect((checks[2].detail as any).pageBackgrounds).toHaveLength(0);
    expect((checks[2].detail as any).localSurfaceBackgrounds).toHaveLength(1);
  });

  test("rejects a dense session composer material", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "form",
            id: null,
            className: "group/prompt-input min-h-[96px] w-full rounded-xl bg-v2-background-bg-base",
            dataComponent: "session-composer",
            dataDockSurface: "shell",
            backgroundColor: "color(srgb 0.113725 0.12549 0.129412 / 0.44)",
            backgroundImage: "none",
            area: 37632,
          },
        ],
      },
      "transparent"
    );

    expect(checks[5].ok).toBe(false);
    expect((checks[5].detail as any).denseLocalMaterialSurfaces).toHaveLength(1);
  });

  test("allows denser local material when workspace background is enabled", () => {
    const checks = runtimeThemeChecks(
      {
        sourceBoundary: {
          workspaceBackgroundState: "enabled",
        },
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "form",
            id: null,
            className: "group/prompt-input min-h-[96px] w-full rounded-xl bg-v2-background-bg-base",
            dataComponent: "session-composer",
            dataDockSurface: "shell",
            backgroundColor: "color(srgb 0.113725 0.12549 0.129412 / 0.44)",
            backgroundImage: "none",
            area: 37632,
          },
        ],
      },
      "transparent"
    );

    expect(checks[5].ok).toBe(true);
    expect(checks[5].detail).toMatchObject({
      composerMaxAlpha: 0.48,
      dockMaxAlpha: 0.82,
      denseLocalMaterialSurfaces: [],
    });
  });

  test("accepts a light Obsidian material session composer", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "form",
            id: null,
            className: "group/prompt-input min-h-[96px] w-full rounded-xl bg-v2-background-bg-base",
            dataComponent: "session-composer",
            dataDockSurface: "shell",
            backgroundColor: "color(srgb 0.113725 0.12549 0.129412 / 0.18)",
            backgroundImage: "none",
            area: 37632,
          },
        ],
      },
      "transparent"
    );

    expect(checks[5].ok).toBe(true);
    expect((checks[5].detail as any).denseLocalMaterialSurfaces).toEqual([]);
  });

  test("rejects a shell canvas material that is only visible in large element samples", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [
          {
            tag: "div",
            id: null,
            className: "flex-1 min-h-0 flex flex-col bg-background-stronger rounded-[10px]",
            dataComponent: null,
            dataSlot: null,
            backgroundColor: "color(srgb 0.113725 0.12549 0.129412 / 0.44)",
            backgroundImage: "none",
            area: 380000,
          },
        ],
        surfaceSamples: [],
      },
      "transparent"
    );

    expect(checks[4].ok).toBe(false);
    expect((checks[4].detail as any).invalidBackgroundStrongerSurfaces).toHaveLength(1);
  });

  test("accepts a translucent dialog overlay when settings are open", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "div",
            id: null,
            dataComponent: "dialog-overlay",
            dataSlot: null,
            backgroundColor: "rgba(0, 0, 0, 0.58)",
            backgroundImage: "none",
            area: 10000,
          },
        ],
      },
      "transparent"
    );

    expect(checks[3].ok).toBe(true);
    expect((checks[3].detail as any).opaqueDialogOverlays).toEqual([]);
    expect((checks[3].detail as any).brightDialogOverlays).toEqual([]);
  });

  test("rejects a bright dialog overlay that washes out the Obsidian background", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "div",
            id: null,
            dataComponent: "dialog-overlay",
            dataSlot: null,
            backgroundColor: "color(srgb 0.945098 0.945098 0.945098 / 0.3)",
            backgroundImage: "none",
            area: 10000,
          },
        ],
      },
      "transparent"
    );

    expect(checks[3].ok).toBe(false);
    expect((checks[3].detail as any).brightDialogOverlays).toEqual([
      {
        tag: "div",
        id: null,
        className: null,
        dataComponent: "dialog-overlay",
        dataSlot: null,
        backgroundColor: "color(srgb 0.945098 0.945098 0.945098 / 0.3)",
        backgroundImage: "none",
        opacity: null,
        position: null,
        zIndex: null,
        area: 10000,
      },
    ]);
  });

  test("accepts a transparent background-stronger shell canvas", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "div",
            id: null,
            className: "flex-1 min-h-0 flex flex-col bg-background-stronger rounded-[10px]",
            dataComponent: null,
            dataSlot: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
            area: 380000,
          },
        ],
      },
      "transparent"
    );

    expect(checks[4].ok).toBe(true);
    expect((checks[4].detail as any).transparentBackgroundStrongerSurfaces).toHaveLength(1);
    expect((checks[4].detail as any).invalidBackgroundStrongerSurfaces).toEqual([]);
  });

  test("rejects an opaque dialog overlay when settings are open", () => {
    const checks = runtimeThemeChecks(
      {
        viewport: { width: 100, height: 100 },
        roots: [
          {
            tag: "html",
            id: null,
            backgroundColor: "rgba(0, 0, 0, 0)",
            backgroundImage: "none",
          },
        ],
        visibleBackgrounds: [],
        largeElementSamples: [],
        surfaceSamples: [
          {
            tag: "div",
            id: null,
            dataComponent: "dialog-overlay",
            dataSlot: null,
            backgroundColor: "rgb(6, 7, 7)",
            backgroundImage: "none",
            area: 10000,
          },
        ],
      },
      "transparent"
    );

    expect(checks[3].ok).toBe(false);
    expect((checks[3].detail as any).opaqueDialogOverlays).toEqual([
      {
        tag: "div",
        id: null,
        className: null,
        dataComponent: "dialog-overlay",
        dataSlot: null,
        backgroundColor: "rgb(6, 7, 7)",
        backgroundImage: "none",
        opacity: null,
        position: null,
        zIndex: null,
        area: 10000,
      },
    ]);
  });
});
