export type ViewLocation = "sidebar" | "main";
export type WebViewAppearance = "opencode" | "obsidian";

export interface ContextAssistSettings {
  enabled: boolean;
  workspace: {
    enabled: boolean;
    maxOpenNotes: number;
    includeActiveLocation: boolean;
  };
  selection: {
    enabled: boolean;
    maxSnippets: number;
    maxCharsPerSnippet: number;
  };
}

export interface WebViewTheme {
  colorScheme: "light" | "dark";
  variables: Record<string, string>;
}

export type ContextCandidateSourceKind = "workspace" | "selection" | "manual";
export type CandidateLifetime = "dynamic" | "one-shot";
export type ContextCandidateStatus = "active" | "failed";

export interface ContextCandidate {
  id: string;
  sourceId: string;
  sourceKind: ContextCandidateSourceKind;
  identityKey: string;
  fingerprint: string;
  label: string;
  text: string;
  sourceFile: string;
  navigationSourceFile?: string;
  startLine?: number;
  endLine?: number;
  included: boolean;
  lifetime: CandidateLifetime;
  status: ContextCandidateStatus;
  statusReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OpenCodeSettings {
  serviceName: string;
  projectDirectory: string;
  defaultViewLocation: ViewLocation;
  contextAssist: ContextAssistSettings;
  webViewAppearance: WebViewAppearance;
  lastSessionUrl: string;
}

export const DEFAULT_SETTINGS: OpenCodeSettings = {
  serviceName: "auto",
  projectDirectory: "",
  defaultViewLocation: "sidebar",
  contextAssist: {
    enabled: true,
    workspace: {
      enabled: true,
      maxOpenNotes: 3,
      includeActiveLocation: true,
    },
    selection: {
      enabled: true,
      maxSnippets: 3,
      maxCharsPerSnippet: 500,
    },
  },
  webViewAppearance: "obsidian",
  lastSessionUrl: "",
};

export function normalizeOpenCodeSettings(
  data: Partial<OpenCodeSettings> | null
): OpenCodeSettings {
  const loaded = stripRetiredSettings(data);
  const loadedContextAssist = (loaded.contextAssist ?? {}) as Partial<ContextAssistSettings>;
  const contextAssist: ContextAssistSettings = {
    ...DEFAULT_SETTINGS.contextAssist,
    ...loadedContextAssist,
    workspace: {
      ...DEFAULT_SETTINGS.contextAssist.workspace,
      ...((loadedContextAssist.workspace ?? {}) as Partial<ContextAssistSettings["workspace"]>),
    },
    selection: {
      ...DEFAULT_SETTINGS.contextAssist.selection,
      ...((loadedContextAssist.selection ?? {}) as Partial<ContextAssistSettings["selection"]>),
    },
  };

  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    contextAssist,
  };
}

function stripRetiredSettings(data: Partial<OpenCodeSettings> | null): Partial<OpenCodeSettings> {
  if (!data) {
    return {};
  }

  const {
    port: _port,
    hostname: _hostname,
    autoStart: _autoStart,
    opencodePath: _opencodePath,
    startupTimeout: _startupTimeout,
    customCommand: _customCommand,
    useCustomCommand: _useCustomCommand,
    keyboardBridge: _keyboardBridge,
    webUiVaultNavigationPrimaryClick: _legacyPrimaryClick,
    contextCommitMode: _contextCommitMode,
    candidateSources: _candidateSources,
    maxNotesInContext: _maxNotesInContext,
    maxSelectionLength: _maxSelectionLength,
    injectWorkspaceContext: _injectWorkspaceContext,
    autoAddSelectionContext: _autoAddSelectionContext,
    autoAddBacklinksContext: _autoAddBacklinksContext,
    autoAddCursorContext: _autoAddCursorContext,
    ...settings
  } = data as Record<string, unknown>;

  return settings as Partial<OpenCodeSettings>;
}

export const OPENCODE_VIEW_TYPE = "opencode-view";
