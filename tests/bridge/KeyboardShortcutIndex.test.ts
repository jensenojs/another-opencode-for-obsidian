import { describe, expect, test } from "bun:test";
import {
  buildKeyboardShortcutIndex,
  collectObsidianShortcuts,
  createKeyboardPolicyUpdatePayload,
  formatShortcutSignature,
  normalizeShortcutCombo,
  normalizeShortcutConfig,
  normalizeKeyboardEventLike,
  type OpenCodeKeyboardCatalogSnapshot,
} from "../../src/bridge/KeyboardShortcutIndex";

describe("KeyboardShortcutIndex", () => {
  test("normalizes Mod and comma shortcuts on macOS", () => {
    expect(normalizeShortcutCombo("Mod+,", "mac")).toBe("meta+comma");
    expect(normalizeShortcutCombo("Cmd+,", "mac")).toBe("meta+comma");
    expect(normalizeShortcutCombo("Meta+comma", "mac")).toBe("meta+comma");
    expect(normalizeShortcutConfig("mod+comma", "mac")).toEqual(["meta+comma"]);
    expect(formatShortcutSignature("meta+comma", "mac")).toBe("⌘,");
  });

  test("keeps Ctrl+L and Cmd+L distinct on macOS", () => {
    expect(normalizeShortcutCombo("Ctrl+L", "mac")).toBe("ctrl+l");
    expect(normalizeShortcutCombo("Cmd+L", "mac")).toBe("meta+l");
    expect(
      normalizeKeyboardEventLike({
        key: "l",
        ctrlKey: true,
      })
    ).toBe("ctrl+l");
    expect(
      normalizeKeyboardEventLike({
        key: "l",
        metaKey: true,
      })
    ).toBe("meta+l");
  });

  test("keeps shifted and alt combinations stable", () => {
    expect(normalizeShortcutCombo("Mod+Alt+Shift+P", "mac")).toBe("alt+shift+meta+p");
    expect(normalizeShortcutCombo("Ctrl+Alt+Shift+P", "other")).toBe("ctrl+alt+shift+p");
  });

  test("collects Obsidian hotkeys with custom keys overriding defaults", () => {
    const app = fakeObsidianApp({
      commands: {
        "app:open-settings": { name: "Open settings" },
        "plugin:toggle-opencode-view": { name: "Toggle OpenCode" },
        "plugin:toggle-opencode-deep-view": { name: "Toggle OpenCode deep view" },
      },
      customKeys: {
        "app:open-settings": [{ modifiers: ["Mod"], key: "p" }],
      },
      defaultKeys: {
        "app:open-settings": [{ modifiers: ["Mod"], key: "," }],
        "plugin:toggle-opencode-view": [{ modifiers: ["Mod"], key: "l" }],
        "plugin:toggle-opencode-deep-view": [{ modifiers: ["Mod", "Shift"], key: "l" }],
      },
    });

    const collection = collectObsidianShortcuts(app as any, "mac");

    expect(collection.available).toBe(true);
    expect(collection.shortcuts.map((shortcut) => shortcut.signature).sort()).toEqual([
      "meta+l",
      "meta+p",
      "shift+meta+l",
    ]);
    expect(
      collection.shortcuts.find((shortcut) => shortcut.signature === "meta+l")?.bridgeOwned
    ).toBe(true);
  });

  test("reports Obsidian hotkey source unavailable when internals are missing", () => {
    const collection = collectObsidianShortcuts({ commands: {} } as any, "mac");

    expect(collection.available).toBe(false);
    expect(collection.reason).toBe("commands-unavailable");
    expect(collection.shortcuts).toEqual([]);
  });

  test("builds conflicts and defaults them to Obsidian", () => {
    const obsidian = collectObsidianShortcuts(
      fakeObsidianApp({
        commands: {
          "app:open-settings": { name: "Open settings" },
        },
        customKeys: {},
        defaultKeys: {
          "app:open-settings": [{ modifiers: ["Mod"], key: "," }],
        },
      }) as any,
      "mac"
    );
    const index = buildKeyboardShortcutIndex({
      obsidian,
      opencode: openCodeCatalog(),
      platform: "mac",
      conflictOwners: {},
    });

    expect(index.conflictCount).toBe(1);
    expect(index.conflicts[0].signature).toBe("meta+comma");
    expect(index.conflicts[0].policy).toMatchObject({
      owner: "obsidian",
      commandId: "app:open-settings",
      reason: "default-obsidian",
    });
    expect(index.policy["meta+comma"]).toMatchObject({
      owner: "obsidian",
      commandId: "app:open-settings",
      reason: "default-obsidian",
    });
  });

  test("uses user conflict policy and plugin bridge-owned shortcuts for Obsidian dispatch", () => {
    const obsidian = collectObsidianShortcuts(
      fakeObsidianApp({
        commands: {
          "app:open-settings": { name: "Open settings" },
          "plugin:toggle-opencode-view": { name: "Toggle OpenCode" },
          "plugin:toggle-opencode-deep-view": { name: "Toggle OpenCode deep view" },
        },
        customKeys: {},
        defaultKeys: {
          "app:open-settings": [{ modifiers: ["Mod"], key: "," }],
          "plugin:toggle-opencode-view": [{ modifiers: ["Mod"], key: "l" }],
          "plugin:toggle-opencode-deep-view": [{ modifiers: ["Mod", "Shift"], key: "l" }],
        },
      }) as any,
      "mac"
    );
    const index = buildKeyboardShortcutIndex({
      obsidian,
      opencode: openCodeCatalog(),
      platform: "mac",
      conflictOwners: { "meta+comma": "opencode" },
    });
    const payload = createKeyboardPolicyUpdatePayload(index, 7);

    expect(index.policy["meta+comma"]).toMatchObject({
      owner: "opencode",
      reason: "user-conflict-policy",
    });
    expect(index.policy["meta+l"]).toMatchObject({
      owner: "obsidian",
      commandId: "plugin:toggle-opencode-view",
      reason: "bridge-owned",
    });
    expect(index.policy["shift+meta+l"]).toMatchObject({
      owner: "obsidian",
      commandId: "plugin:toggle-opencode-deep-view",
      reason: "bridge-owned",
    });
    expect(payload).toMatchObject({
      revision: 7,
      entries: [
        { signature: "meta+l", owner: "obsidian" },
        { signature: "shift+meta+l", owner: "obsidian" },
      ],
    });
  });
});

function fakeObsidianApp(input: {
  commands: Record<string, { name: string }>;
  customKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
  defaultKeys?: Record<string, Array<{ modifiers: string[]; key: string }>>;
}): unknown {
  return {
    commands: {
      commands: input.commands,
      executeCommandById: () => undefined,
    },
    hotkeyManager: {
      customKeys: input.customKeys ?? {},
      defaultKeys: input.defaultKeys ?? {},
    },
  };
}

function openCodeCatalog(): OpenCodeKeyboardCatalogSnapshot {
  return {
    options: [
      {
        id: "settings.open",
        title: "Open settings",
        keybind: "mod+comma",
      },
      {
        id: "input.focus",
        title: "Focus input",
        keybind: "ctrl+l",
      },
    ],
    catalog: [],
  };
}
