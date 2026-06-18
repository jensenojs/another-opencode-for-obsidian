import type { App, Hotkey } from "obsidian";
import type { KeyboardBridgeShortcutOwner } from "../types";

export type ShortcutPlatform = "mac" | "other";
export type ShortcutSourceKind = "obsidian" | "opencode";

export interface KeyboardShortcutEntry {
  source: ShortcutSourceKind;
  commandId: string;
  title: string;
  signature: string;
  display: string;
  keybind: string;
  disabled?: boolean;
  hidden?: boolean;
  bridgeOwned?: boolean;
}

export interface ObsidianShortcutCollection {
  available: boolean;
  reason?: "commands-unavailable" | "hotkey-manager-unavailable";
  diagnostics: Record<string, unknown>;
  shortcuts: KeyboardShortcutEntry[];
}

export interface OpenCodeKeyboardCatalogItem {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  keybind?: string;
  disabled?: boolean;
  hidden?: boolean;
}

export interface OpenCodeKeyboardCatalogSnapshot {
  options: OpenCodeKeyboardCatalogItem[];
  catalog: OpenCodeKeyboardCatalogItem[];
}

export interface KeyboardPolicyEntry {
  signature: string;
  display: string;
  owner: KeyboardBridgeShortcutOwner;
  commandId?: string;
  reason: "bridge-owned" | "user-conflict-policy" | "default-obsidian";
}

export interface KeyboardConflict {
  signature: string;
  display: string;
  obsidian: KeyboardShortcutEntry[];
  opencode: KeyboardShortcutEntry[];
  policy: KeyboardPolicyEntry;
}

export interface KeyboardShortcutIndex {
  platform: ShortcutPlatform;
  status:
    | "available"
    | "obsidian-hotkeys-unavailable"
    | "opencode-catalog-unavailable"
    | "unavailable";
  obsidian: ObsidianShortcutCollection;
  opencodeAvailable: boolean;
  opencodeDiagnostics: Record<string, unknown>;
  obsidianShortcutCount: number;
  opencodeShortcutCount: number;
  conflictCount: number;
  conflicts: KeyboardConflict[];
  policy: Record<string, KeyboardPolicyEntry>;
  obsidianBySignature: Record<string, KeyboardShortcutEntry[]>;
  opencodeBySignature: Record<string, KeyboardShortcutEntry[]>;
}

interface ObsidianCommandRecord {
  id?: string;
  name?: string;
  hotkeys?: Hotkey[];
}

interface ObsidianCommandManagerShape {
  commands?: Record<string, ObsidianCommandRecord>;
  executeCommandById?: (id: string) => unknown;
}

interface ObsidianHotkeyManagerShape {
  customKeys?: Record<string, Hotkey[]>;
  defaultKeys?: Record<string, Hotkey[]>;
}

interface ObsidianRuntimeShape {
  commands?: ObsidianCommandManagerShape;
  hotkeyManager?: ObsidianHotkeyManagerShape;
}

const MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"] as const;
const HAS_OWN = Object.prototype.hasOwnProperty;

export function detectShortcutPlatform(): ShortcutPlatform {
  const navigatorPlatform =
    typeof navigator === "object" && typeof navigator.platform === "string"
      ? navigator.platform
      : "";
  if (/(Mac|iPod|iPhone|iPad)/.test(navigatorPlatform)) {
    return "mac";
  }
  if (typeof process === "object" && process.platform === "darwin") {
    return "mac";
  }
  return "other";
}

export function normalizeShortcutConfig(
  config: string | undefined,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string[] {
  if (!config || config.trim() === "" || config.trim().toLowerCase() === "none") {
    return [];
  }

  const signatures: string[] = [];
  for (const combo of splitShortcutConfig(config)) {
    const signature = normalizeShortcutCombo(combo, platform);
    if (signature) {
      signatures.push(signature);
    }
  }
  return signatures;
}

export function normalizeShortcutCombo(
  combo: string,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string | null {
  const parts = combo
    .trim()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const modifiers = createEmptyModifierState();
  let key = "";

  for (const part of parts) {
    const normalized = normalizeShortcutToken(part);
    if (normalized === "mod") {
      modifiers[platform === "mac" ? "meta" : "ctrl"] = true;
      continue;
    }
    if (normalized === "cmd" || normalized === "command") {
      modifiers.meta = true;
      continue;
    }
    if (normalized === "control") {
      modifiers.ctrl = true;
      continue;
    }
    if (normalized === "option") {
      modifiers.alt = true;
      continue;
    }
    if (
      normalized === "ctrl" ||
      normalized === "meta" ||
      normalized === "shift" ||
      normalized === "alt"
    ) {
      modifiers[normalized] = true;
      continue;
    }
    key = normalizeShortcutKey(part);
  }

  if (!key) {
    return null;
  }

  return signatureFromParts(modifiers, key);
}

export function normalizeHotkey(
  hotkey: Hotkey,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string | null {
  if (!hotkey || typeof hotkey.key !== "string") {
    return null;
  }

  const modifiers = createEmptyModifierState();
  for (const modifier of hotkey.modifiers ?? []) {
    const normalized = normalizeShortcutToken(modifier);
    if (normalized === "mod") {
      modifiers[platform === "mac" ? "meta" : "ctrl"] = true;
      continue;
    }
    if (normalized === "cmd" || normalized === "command") {
      modifiers.meta = true;
      continue;
    }
    if (normalized === "control") {
      modifiers.ctrl = true;
      continue;
    }
    if (normalized === "option") {
      modifiers.alt = true;
      continue;
    }
    if (
      normalized === "ctrl" ||
      normalized === "meta" ||
      normalized === "shift" ||
      normalized === "alt"
    ) {
      modifiers[normalized] = true;
    }
  }

  const key = normalizeShortcutKey(hotkey.key);
  return key ? signatureFromParts(modifiers, key) : null;
}

export function normalizeKeyboardEventLike(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): string | null {
  const key = normalizeShortcutKey(event.key);
  if (
    !key ||
    key === "control" ||
    key === "ctrl" ||
    key === "meta" ||
    key === "shift" ||
    key === "alt"
  ) {
    return null;
  }
  return signatureFromParts(
    {
      ctrl: Boolean(event.ctrlKey),
      meta: Boolean(event.metaKey),
      shift: Boolean(event.shiftKey),
      alt: Boolean(event.altKey),
    },
    key
  );
}

export function formatShortcutSignature(
  signature: string,
  platform: ShortcutPlatform = detectShortcutPlatform()
): string {
  const parts = signature.split("+").filter(Boolean);
  const key = parts[parts.length - 1] ?? "";
  const modifierSet = new Set(parts.slice(0, -1));

  if (platform === "mac") {
    const out: string[] = [];
    if (modifierSet.has("ctrl")) out.push("⌃");
    if (modifierSet.has("alt")) out.push("⌥");
    if (modifierSet.has("shift")) out.push("⇧");
    if (modifierSet.has("meta")) out.push("⌘");
    out.push(displayKey(key));
    return out.join("");
  }

  const out: string[] = [];
  if (modifierSet.has("ctrl")) out.push("Ctrl");
  if (modifierSet.has("alt")) out.push("Alt");
  if (modifierSet.has("shift")) out.push("Shift");
  if (modifierSet.has("meta")) out.push("Meta");
  out.push(displayKey(key));
  return out.join("+");
}

export function isNormalizedShortcutSignature(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    return false;
  }
  const parts = value.split("+");
  if (parts.length === 0) {
    return false;
  }
  const key = parts[parts.length - 1];
  if (!/^[a-z0-9._-]+$/.test(key)) {
    return false;
  }
  const modifiers = parts.slice(0, -1);
  const seen = new Set<string>();
  for (const modifier of modifiers) {
    if (
      !MODIFIER_ORDER.includes(modifier as (typeof MODIFIER_ORDER)[number]) ||
      seen.has(modifier)
    ) {
      return false;
    }
    seen.add(modifier);
  }
  return true;
}

export function collectObsidianShortcuts(
  app: App,
  platform: ShortcutPlatform = detectShortcutPlatform()
): ObsidianShortcutCollection {
  const runtime = app as unknown as ObsidianRuntimeShape;
  const commandManager = runtime.commands;
  const hotkeyManager = runtime.hotkeyManager;
  const diagnostics = {
    hasCommandManager: Boolean(commandManager),
    hasCommandsRecord: isPlainRecord(commandManager?.commands),
    hasExecuteCommandById: typeof commandManager?.executeCommandById === "function",
    hasHotkeyManager: Boolean(hotkeyManager),
    hasCustomKeys: isPlainRecord(hotkeyManager?.customKeys),
    hasDefaultKeys: isPlainRecord(hotkeyManager?.defaultKeys),
  };

  if (
    !commandManager ||
    !isPlainRecord(commandManager.commands) ||
    typeof commandManager.executeCommandById !== "function"
  ) {
    return {
      available: false,
      reason: "commands-unavailable",
      diagnostics,
      shortcuts: [],
    };
  }

  if (
    !hotkeyManager ||
    !isPlainRecord(hotkeyManager.customKeys) ||
    !isPlainRecord(hotkeyManager.defaultKeys)
  ) {
    return {
      available: false,
      reason: "hotkey-manager-unavailable",
      diagnostics,
      shortcuts: [],
    };
  }

  const shortcuts: KeyboardShortcutEntry[] = [];
  for (const commandId of Object.keys(commandManager.commands).sort()) {
    const command = commandManager.commands[commandId];
    const hotkeys = resolveEffectiveHotkeys(commandId, command, hotkeyManager);
    for (const hotkey of hotkeys) {
      const signature = normalizeHotkey(hotkey, platform);
      if (!signature) {
        continue;
      }
      shortcuts.push({
        source: "obsidian",
        commandId,
        title: command.name || commandId,
        signature,
        display: formatShortcutSignature(signature, platform),
        keybind: hotkeyToConfig(hotkey),
        bridgeOwned: isBridgeOwnedObsidianCommand(commandId),
      });
    }
  }

  return {
    available: true,
    diagnostics,
    shortcuts,
  };
}

export function buildKeyboardShortcutIndex(input: {
  obsidian: ObsidianShortcutCollection;
  opencode: OpenCodeKeyboardCatalogSnapshot | null;
  platform?: ShortcutPlatform;
  conflictOwners?: Record<string, KeyboardBridgeShortcutOwner>;
}): KeyboardShortcutIndex {
  const platform = input.platform ?? detectShortcutPlatform();
  const opencodeShortcuts = input.opencode
    ? collectOpenCodeShortcuts(input.opencode, platform)
    : [];
  const obsidianShortcuts = input.obsidian.available ? input.obsidian.shortcuts : [];
  const obsidianBySignature = groupShortcutsBySignature(obsidianShortcuts);
  const opencodeBySignature = groupShortcutsBySignature(opencodeShortcuts);
  const signatures = Array.from(
    new Set([...Object.keys(obsidianBySignature), ...Object.keys(opencodeBySignature)])
  ).sort();
  const policy: Record<string, KeyboardPolicyEntry> = {};
  const conflicts: KeyboardConflict[] = [];
  const conflictOwners = input.conflictOwners ?? {};

  for (const signature of signatures) {
    const obsidian = obsidianBySignature[signature] ?? [];
    const opencode = opencodeBySignature[signature] ?? [];
    const bridgeOwned = obsidian.find((entry) => entry.bridgeOwned);
    const hasConflict = obsidian.length > 0 && opencode.length > 0;
    const display = formatShortcutSignature(signature, platform);

    if (bridgeOwned) {
      policy[signature] = {
        signature,
        display,
        owner: "obsidian",
        commandId: bridgeOwned.commandId,
        reason: "bridge-owned",
      };
    } else if (hasConflict && conflictOwners[signature] === "opencode") {
      policy[signature] = {
        signature,
        display,
        owner: "opencode",
        reason: "user-conflict-policy",
      };
    } else if (hasConflict) {
      policy[signature] = {
        signature,
        display,
        owner: "obsidian",
        commandId: obsidian[0]?.commandId,
        reason: "default-obsidian",
      };
    }

    if (hasConflict) {
      conflicts.push({
        signature,
        display,
        obsidian,
        opencode,
        policy: policy[signature],
      });
    }
  }

  const opencodeAvailable = Boolean(input.opencode);
  return {
    platform,
    status: statusFor(input.obsidian.available, opencodeAvailable),
    obsidian: input.obsidian,
    opencodeAvailable,
    opencodeDiagnostics: {
      hasCatalog: Boolean(input.opencode),
      catalogCount: input.opencode?.catalog.length ?? 0,
      optionCount: input.opencode?.options.length ?? 0,
    },
    obsidianShortcutCount: obsidianShortcuts.length,
    opencodeShortcutCount: opencodeShortcuts.length,
    conflictCount: conflicts.length,
    conflicts,
    policy,
    obsidianBySignature,
    opencodeBySignature,
  };
}

export function createKeyboardPolicyUpdatePayload(
  index: KeyboardShortcutIndex,
  revision: number
): { revision: number; entries: KeyboardPolicyEntry[] } {
  const entries = Object.values(index.policy).filter(
    (entry) => entry.owner === "obsidian" && typeof entry.commandId === "string"
  );
  return {
    revision,
    entries,
  };
}

export function summarizeKeyboardShortcutIndex(
  index: KeyboardShortcutIndex
): Record<string, unknown> {
  return {
    status: index.status,
    platform: index.platform,
    obsidianShortcutCount: index.obsidianShortcutCount,
    opencodeShortcutCount: index.opencodeShortcutCount,
    conflictCount: index.conflictCount,
    obsidianAvailable: index.obsidian.available,
    opencodeAvailable: index.opencodeAvailable,
    unavailableReason: index.obsidian.reason ?? null,
  };
}

function collectOpenCodeShortcuts(
  snapshot: OpenCodeKeyboardCatalogSnapshot,
  platform: ShortcutPlatform
): KeyboardShortcutEntry[] {
  const byId = new Map<string, OpenCodeKeyboardCatalogItem>();
  for (const item of snapshot.catalog) {
    if (isOpenCodeCatalogItem(item)) {
      byId.set(item.id, item);
    }
  }
  for (const item of snapshot.options) {
    if (isOpenCodeCatalogItem(item)) {
      byId.set(item.id, { ...byId.get(item.id), ...item });
    }
  }

  const shortcuts: KeyboardShortcutEntry[] = [];
  for (const item of Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))) {
    if (item.id.startsWith("suggested.") || item.hidden || item.disabled) {
      continue;
    }
    for (const signature of normalizeShortcutConfig(item.keybind, platform)) {
      shortcuts.push({
        source: "opencode",
        commandId: item.id,
        title: item.title || item.id,
        signature,
        display: formatShortcutSignature(signature, platform),
        keybind: item.keybind ?? "",
        disabled: item.disabled,
        hidden: item.hidden,
      });
    }
  }
  return shortcuts;
}

function resolveEffectiveHotkeys(
  commandId: string,
  command: ObsidianCommandRecord,
  hotkeyManager: ObsidianHotkeyManagerShape
): Hotkey[] {
  if (HAS_OWN.call(hotkeyManager.customKeys, commandId)) {
    return Array.isArray(hotkeyManager.customKeys?.[commandId])
      ? hotkeyManager.customKeys[commandId]
      : [];
  }
  if (HAS_OWN.call(hotkeyManager.defaultKeys, commandId)) {
    return Array.isArray(hotkeyManager.defaultKeys?.[commandId])
      ? hotkeyManager.defaultKeys[commandId]
      : [];
  }
  return Array.isArray(command.hotkeys) ? command.hotkeys : [];
}

function splitShortcutConfig(config: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of config) {
    if (char === "," && !/\+\s*$/.test(current)) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function createEmptyModifierState(): Record<(typeof MODIFIER_ORDER)[number], boolean> {
  return {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
}

function signatureFromParts(
  modifiers: Record<(typeof MODIFIER_ORDER)[number], boolean>,
  key: string
): string {
  const parts: string[] = [];
  for (const modifier of MODIFIER_ORDER) {
    if (modifiers[modifier]) {
      parts.push(modifier);
    }
  }
  parts.push(key);
  return parts.join("+");
}

function normalizeShortcutToken(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeShortcutKey(value: string): string {
  const normalized = normalizeShortcutToken(value);
  if (normalized === "," || normalized === "comma") return "comma";
  if (normalized === "+" || normalized === "plus") return "plus";
  if (normalized === " ") return "space";
  if (normalized === "esc") return "escape";
  return normalized;
}

function displayKey(key: string): string {
  const named: Record<string, string> = {
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    backspace: "Backspace",
    comma: ",",
    delete: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Esc",
    home: "Home",
    insert: "Insert",
    pagedown: "PageDown",
    pageup: "PageUp",
    plus: "+",
    space: "Space",
    tab: "Tab",
  };
  return (
    named[key] ??
    (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))
  );
}

function groupShortcutsBySignature(
  shortcuts: KeyboardShortcutEntry[]
): Record<string, KeyboardShortcutEntry[]> {
  const grouped: Record<string, KeyboardShortcutEntry[]> = {};
  for (const shortcut of shortcuts) {
    grouped[shortcut.signature] = grouped[shortcut.signature] ?? [];
    grouped[shortcut.signature].push(shortcut);
  }
  return grouped;
}

function hotkeyToConfig(hotkey: Hotkey): string {
  return [...(hotkey.modifiers ?? []), hotkey.key].join("+");
}

function isBridgeOwnedObsidianCommand(commandId: string): boolean {
  return (
    commandId === "toggle-opencode-view" ||
    commandId === "toggle-opencode-deep-view" ||
    commandId.endsWith(":toggle-opencode-view") ||
    commandId.endsWith(":toggle-opencode-deep-view")
  );
}

function isOpenCodeCatalogItem(value: OpenCodeKeyboardCatalogItem): boolean {
  return Boolean(value && typeof value.id === "string" && value.id.trim());
}

function statusFor(
  obsidianAvailable: boolean,
  opencodeAvailable: boolean
): KeyboardShortcutIndex["status"] {
  if (obsidianAvailable && opencodeAvailable) {
    return "available";
  }
  if (!obsidianAvailable && !opencodeAvailable) {
    return "unavailable";
  }
  if (!obsidianAvailable) {
    return "obsidian-hotkeys-unavailable";
  }
  return "opencode-catalog-unavailable";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
