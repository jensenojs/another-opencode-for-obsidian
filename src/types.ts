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

export interface ServerEndpoint {
  hostname: string;
  port: number;
  apiBaseUrl: string;
  uiBaseUrl: string;
  healthUrl: string;
  encodedProjectDirectory: string;
}

export type ContextItemType = "manual" | "auto" | "inbound";
export type ContextProvenanceStatus = "known" | "uncertain";
export type ContextCandidateSourceKind =
  | "workspace"
  | "selection"
  | "manual"
  | "graph"
  | "diagnostic";
export type CandidateLifetime = "dynamic" | "one-shot";
export type ContextCandidateStatus = "active" | "failed";

export interface ContextItem {
  id: string;
  type: ContextItemType;
  label: string;
  text: string;
  sourceFile: string;
  navigationSourceFile?: string;
  startLine?: number;
  endLine?: number;
  messageId?: string;
  partId?: string;
  textLength?: number;
  provenanceStatus?: ContextProvenanceStatus;
  createdAt: number;
}

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
  port: number;
  hostname: string;
  autoStart: boolean;
  opencodePath: string;
  projectDirectory: string;
  startupTimeout: number;
  defaultViewLocation: ViewLocation;
  contextAssist: ContextAssistSettings;
  customCommand: string;
  useCustomCommand: boolean;
  webViewAppearance: WebViewAppearance;
  lastSessionUrl: string;
}

export const CUSTOM_COMMAND_EXAMPLE =
  "opencode serve --hostname {hostname} --port {port} --cors {cors}";

export const DEFAULT_SETTINGS: OpenCodeSettings = {
  port: 14096,
  hostname: "127.0.0.1",
  autoStart: false,
  opencodePath: "opencode",
  projectDirectory: "",
  startupTimeout: 45000,
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
  customCommand: "",
  useCustomCommand: false,
  webViewAppearance: "obsidian",
  lastSessionUrl: "",
};

export function normalizeOpenCodeSettings(
  data: Partial<OpenCodeSettings> | null
): OpenCodeSettings {
  const loaded = stripLegacyContextSourceSettings(data);
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

function stripLegacyContextSourceSettings(
  data: Partial<OpenCodeSettings> | null
): Partial<OpenCodeSettings> {
  if (!data) {
    return {};
  }

  const {
    contextCommitMode: _contextCommitMode,
    candidateSources: _candidateSources,
    maxNotesInContext: _maxNotesInContext,
    maxSelectionLength: _maxSelectionLength,
    injectWorkspaceContext: _injectWorkspaceContext,
    autoAddSelectionContext: _autoAddSelectionContext,
    autoAddBacklinksContext: _autoAddBacklinksContext,
    autoAddCursorContext: _autoAddCursorContext,
    ...settings
  } = data as Partial<OpenCodeSettings> & {
    contextCommitMode?: unknown;
    candidateSources?: unknown;
    maxNotesInContext?: unknown;
    maxSelectionLength?: unknown;
    injectWorkspaceContext?: unknown;
    autoAddSelectionContext?: unknown;
    autoAddBacklinksContext?: unknown;
    autoAddCursorContext?: unknown;
  };

  return settings;
}

export const OPENCODE_VIEW_TYPE = "opencode-view";

export function getExplicitCustomCommand(
  settings: Pick<OpenCodeSettings, "customCommand">
): string {
  return settings.customCommand.trim();
}

export function usesExplicitCustomCommand(
  settings: Pick<OpenCodeSettings, "customCommand" | "useCustomCommand">
): boolean {
  return settings.useCustomCommand && getExplicitCustomCommand(settings).length > 0;
}

export function createServerEndpoint(
  settings: Pick<OpenCodeSettings, "hostname" | "port">,
  projectDirectory: string
): ServerEndpoint {
  const encodedProjectDirectory = Buffer.from(projectDirectory).toString("base64");
  const apiBaseUrl = `http://${settings.hostname}:${settings.port}`;

  return {
    hostname: settings.hostname,
    port: settings.port,
    apiBaseUrl,
    uiBaseUrl: `${apiBaseUrl}/${encodedProjectDirectory}`,
    healthUrl: `${apiBaseUrl}/global/health`,
    encodedProjectDirectory,
  };
}
