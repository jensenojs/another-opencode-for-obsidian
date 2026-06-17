import * as Obsidian from "obsidian";

export type PluginLanguage = "en" | "zh-CN";

const EN_TEXT = {
  commands: {
    ribbonTooltip: "OpenCode",
    togglePanel: "Toggle OpenCode panel",
    openPanel: "Open OpenCode panel",
    copyDiagnostics: "Copy OpenCode diagnostics",
    addSelectionToContext: "Add selection to OpenCode context",
    addCurrentNoteToContext: "Add current note to OpenCode context",
    startServer: "Start OpenCode server",
    stopServer: "Stop OpenCode server",
  },
  notices: {
    selectTextBeforeAdding: "Select text in a note before adding OpenCode context",
    contextNotAddedNoSession:
      "OpenCode context was not added. Open an active OpenCode session first.",
    executableFound: (path: string) => `OpenCode executable found at ${path}`,
    executableNotFoundSettings: "Could not find opencode. Please check Settings",
    executableNotFoundInstallation: "Could not find opencode. Please check your installation.",
    serverStarted: "OpenCode server started",
    serverStopped: "OpenCode server stopped",
    openNoteBeforeAdding: "Open a note before adding it to OpenCode context",
    currentNoteReadFailed: "OpenCode could not read the current note. Check the plugin log.",
    currentNoteEmpty: "Current note is empty",
    diagnosticsCopied: "OpenCode diagnostics copied",
    diagnosticsCopyFailed: "Failed to copy OpenCode diagnostics",
    contextDiagnosticsCopied: "OpenCode context diagnostics copied",
    contextRemoveFailed: "OpenCode context was not removed. The remote message was not deleted.",
    candidateAttachFailed: (count: number) =>
      `${count} OpenCode context candidate failed to attach`,
    contextSourceUnavailable: (reason: string) => `OpenCode context source unavailable: ${reason}`,
    projectDirectoryAbsolute: "Project directory must be an absolute path (or start with ~)",
    projectDirectoryMissing: "Project directory does not exist",
    projectDirectoryNotDirectory: "Project directory path is not a directory",
    projectDirectoryValidationFailed: (message: string) => `Failed to validate path: ${message}`,
    startFailure: (firstLine: string, logFile: string) =>
      `${firstLine} Run "Copy OpenCode diagnostics" for details. Log: ${logFile}`,
    startFailureLine: (error: string | null) =>
      error ? `OpenCode failed to start: ${error}` : "OpenCode failed to start.",
  },
  settings: {
    title: "Another OpenCode Settings",
    serverConfiguration: "Server Configuration",
    port: "Port",
    portDesc: "Port number for the OpenCode web server",
    hostname: "Hostname",
    hostnameDesc: "Hostname to bind the server to (usually 127.0.0.1)",
    useCustomCommand: "Use custom command",
    useCustomCommandDesc: "Use a shell command template instead of the executable path",
    learnMore: "Learn more",
    customCommand: "Custom command",
    customCommandDesc:
      "Leave empty to use OpenCode executable path mode. Non-empty commands run through the system shell and must include {hostname} and {port}. Optional variables: {cors}, {projectDirectory}.",
    executablePath: "OpenCode executable path",
    autodetect: "Autodetect",
    projectDirectory: "Project directory",
    projectDirectoryDesc:
      "Override the starting directory for OpenCode. Leave empty to use the vault root.",
    projectDirectoryPlaceholder: "/path/to/project or ~/project",
    behavior: "Behavior",
    autoStartServer: "Auto-start server",
    autoStartServerDesc:
      "Automatically start the OpenCode server when Obsidian opens (not recommended for faster startup)",
    defaultViewLocation: "Default view location",
    defaultViewLocationDesc:
      "Where to open the OpenCode panel: sidebar opens in the right panel, main opens as a tab in the editor area",
    sidebar: "Sidebar",
    mainWindow: "Main window",
    webViewAppearance: "Web view appearance",
    webViewAppearanceDesc:
      "Use Obsidian to inherit the active vault theme, or switch to OpenCode to keep the web UI's native styling.",
    contextAssist: "Context assist",
    contextAssistPageDesc: "Control which Obsidian context is included with the next prompt.",
    enabled: "On",
    disabled: "Off",
    enableContextAssist: "Send context with prompts",
    contextAssistDesc:
      "When you send an OpenCode message, included Obsidian context is sent with that same message. Use the status bar to skip or remove candidates before sending. Selected text clears after a successful send.",
    contextAssistDisabledDesc:
      "Obsidian context is not collected or sent while context assist is off.",
    workspaceClues: "Workspace clues",
    enableWorkspaceClues: "Enable workspace clues",
    workspaceCluesDesc:
      "Send open Obsidian notes and the active location as lightweight background.",
    workspaceCluesDisabledDesc:
      "Open notes and active location are not collected while workspace clues are off.",
    maxOpenNotes: "Max open notes",
    maxOpenNotesDesc: "Limit how many open notes are included.",
    includeActiveLocation: "Include active location",
    includeActiveLocationDesc: "Include the active note and line when available.",
    selectionSnippets: "Selected text",
    enableSelectionSnippets: "Enable selected text",
    selectionSnippetsDesc: "Send recent Obsidian selections as one-shot context.",
    selectionSnippetsDisabledDesc:
      "Selections are not watched or queued while selected text is off.",
    maxSelectionSnippets: "Recent selection count",
    maxSelectionSnippetsDesc: "Keep only the most recent selected snippets.",
    maxCharsPerSnippet: "Max chars per snippet",
    maxCharsPerSnippetDesc: "Trim selected text before it becomes context.",
    serverStatus: "Server Status",
    serverStatusDesc: "View the running server, diagnostics, and controls.",
    stopped: "Stopped",
    starting: "Starting...",
    running: "Running",
    error: "Error",
    statusLabel: "Status: ",
    command: "Command",
    stderr: "Stderr",
    log: "Log",
    statusFile: "Status",
    startServer: "Start Server",
    stopServer: "Stop Server",
    restartServer: "Restart Server",
    pleaseWait: "Please wait...",
  },
  view: {
    stoppedTitle: "OpenCode is stopped",
    stoppedMessage: "Click the button below to start the OpenCode server.",
    startOpenCode: "Start OpenCode",
    startingTitle: "Starting OpenCode...",
    startingMessage: "Please wait while the server starts up.",
    failedTitle: "Failed to start OpenCode",
    genericStartError: "There was an error starting the OpenCode server.",
    retry: "Retry",
    openSettings: "Open Settings",
    copyDiagnostics: "Copy diagnostics",
    diagnosticMode: "Mode",
    diagnosticCommand: "Command",
    diagnosticWorkingDirectory: "Working directory",
    diagnosticHealthCheck: "Health check",
    diagnosticStderr: "Stderr",
    diagnosticLog: "Log",
    diagnosticStatus: "Status",
  },
  context: {
    statusText: (committed: number, candidates: number) =>
      candidates === 0 ? `ctx ${committed}` : `ctx ${committed}+${candidates}`,
    statusTitle: (committed: number, candidates: number, total: number) =>
      `${committed} committed, ${candidates} candidate OpenCode context item${total === 1 ? "" : "s"}`,
    popoverTitle: (_committed: number, _candidates: number) => "Context",
    copyDiagnostics: "Copy diagnostics",
    candidates: "Candidates",
    nextMessageIncludes: "Next message",
    skip: "Skip",
    skipOnce: "Skip once",
    include: "Include",
    toggleCandidateTitle: "Toggle this local candidate for the next message",
    currentSessionContext: "Committed",
    noActiveContext: "No active context",
    remove: "Remove",
    removeCandidateTitle: "Remove this local candidate",
    removeTitle: "Remove from current OpenCode session context",
    provenance: (status: string) => `provenance ${status}`,
    chars: (count: number) => `${count} chars`,
    included: "included",
    skipped: "skipped",
    failedStatus: (reason: string | null) => (reason ? `failed ${reason}` : "failed"),
    sourceResolved: "source resolved",
    sourceResolvedAtLine: (line: number) => `source resolved at line ${line}`,
    unresolved: {
      emptySource: "empty source",
      syntheticSource: (source: string) => `${source} is a synthetic source`,
      externalUrl: (source: string) => `${source} is outside this vault`,
      missingFile: (source: string) => `${source} does not exist in this vault`,
      folder: (source: string) => `${source} is a folder`,
      unresolvedHeading: (source: string) => `${source} contains an unresolved heading reference`,
      unresolvedBlock: (source: string) => `${source} contains an unresolved block reference`,
      unresolvedFootnote: (source: string) => `${source} contains an unresolved footnote reference`,
      unresolvedSubpath: (source: string) => `${source} contains an unresolved subpath reference`,
    },
  },
};

export type PluginText = typeof EN_TEXT;

const ZH_CN_TEXT: PluginText = {
  commands: {
    ribbonTooltip: "OpenCode",
    togglePanel: "切换 OpenCode 面板",
    openPanel: "打开 OpenCode 面板",
    copyDiagnostics: "复制 OpenCode 诊断",
    addSelectionToContext: "将选中文本加入 OpenCode 上下文",
    addCurrentNoteToContext: "将当前笔记加入 OpenCode 上下文",
    startServer: "启动 OpenCode 服务器",
    stopServer: "停止 OpenCode 服务器",
  },
  notices: {
    selectTextBeforeAdding: "请先在笔记中选择文本，再加入 OpenCode 上下文",
    contextNotAddedNoSession: "未加入 OpenCode 上下文。请先打开一个活跃的 OpenCode session。",
    executableFound: (path: string) => `已找到 OpenCode 可执行文件：${path}`,
    executableNotFoundSettings: "找不到 opencode。请检查设置。",
    executableNotFoundInstallation: "找不到 opencode。请检查安装。",
    serverStarted: "OpenCode 服务器已启动",
    serverStopped: "OpenCode 服务器已停止",
    openNoteBeforeAdding: "请先打开一篇笔记，再加入 OpenCode 上下文",
    currentNoteReadFailed: "OpenCode 无法读取当前笔记。请检查插件日志。",
    currentNoteEmpty: "当前笔记为空",
    diagnosticsCopied: "OpenCode 诊断已复制",
    diagnosticsCopyFailed: "复制 OpenCode 诊断失败",
    contextDiagnosticsCopied: "OpenCode 上下文诊断已复制",
    contextRemoveFailed: "OpenCode 上下文未移除。远端 message 没有被删除。",
    candidateAttachFailed: (count: number) => `${count} 个 OpenCode 上下文候选附加失败`,
    contextSourceUnavailable: (reason: string) => `OpenCode 上下文来源不可用：${reason}`,
    projectDirectoryAbsolute: "项目目录必须是绝对路径，或以 ~ 开头",
    projectDirectoryMissing: "项目目录不存在",
    projectDirectoryNotDirectory: "项目目录路径不是文件夹",
    projectDirectoryValidationFailed: (message: string) => `验证路径失败：${message}`,
    startFailure: (firstLine: string, logFile: string) =>
      `${firstLine} 运行“复制 OpenCode 诊断”查看详情。日志：${logFile}`,
    startFailureLine: (error: string | null) =>
      error ? `OpenCode 启动失败：${error}` : "OpenCode 启动失败。",
  },
  settings: {
    title: "Another OpenCode 设置",
    serverConfiguration: "服务器配置",
    port: "端口",
    portDesc: "OpenCode web 服务器端口",
    hostname: "主机名",
    hostnameDesc: "服务器绑定的主机名，通常是 127.0.0.1",
    useCustomCommand: "使用自定义命令",
    useCustomCommandDesc: "使用 shell 命令模板，而不是可执行文件路径",
    learnMore: "了解更多",
    customCommand: "自定义命令",
    customCommandDesc:
      "留空时使用 OpenCode 可执行文件路径模式。非空命令会通过系统 shell 运行，并且必须包含 {hostname} 和 {port}。可选变量：{cors}、{projectDirectory}。",
    executablePath: "OpenCode 可执行文件路径",
    autodetect: "自动检测",
    projectDirectory: "项目目录",
    projectDirectoryDesc: "覆盖 OpenCode 的启动目录。留空时使用 vault 根目录。",
    projectDirectoryPlaceholder: "/path/to/project 或 ~/project",
    behavior: "行为",
    autoStartServer: "自动启动服务器",
    autoStartServerDesc: "Obsidian 打开时自动启动 OpenCode 服务器，不建议在追求快速启动时开启",
    defaultViewLocation: "默认打开位置",
    defaultViewLocationDesc:
      "OpenCode 面板打开位置：侧边栏会打开到右侧面板，主窗口会作为编辑区标签页打开",
    sidebar: "侧边栏",
    mainWindow: "主窗口",
    webViewAppearance: "Web view 外观",
    webViewAppearanceDesc:
      "选择 Obsidian 时继承当前 vault 主题；选择 OpenCode 时保留 web UI 原生样式。",
    contextAssist: "上下文辅助",
    contextAssistPageDesc: "控制哪些 Obsidian 上下文会随下一条消息发送。",
    enabled: "开",
    disabled: "关",
    enableContextAssist: "发送时附加上下文",
    contextAssistDesc:
      "发送 OpenCode 消息时，插件会把已包含的 Obsidian 上下文随同一条消息发送。状态栏里可以临时跳过或移除候选。选中文本发送成功后会自动清空。",
    contextAssistDisabledDesc: "关闭后不会收集或发送 Obsidian 上下文。",
    workspaceClues: "工作区线索",
    enableWorkspaceClues: "启用工作区线索",
    workspaceCluesDesc: "把当前打开的 Obsidian 笔记和活动位置作为轻量背景随消息发送。",
    workspaceCluesDisabledDesc: "关闭后不会收集打开笔记和活动位置。",
    maxOpenNotes: "打开的笔记数量上限",
    maxOpenNotesDesc: "限制进入上下文的打开笔记数量",
    includeActiveLocation: "包含当前活动位置",
    includeActiveLocationDesc: "可用时包含当前笔记和行号",
    selectionSnippets: "选中文本",
    enableSelectionSnippets: "启用选中文本",
    selectionSnippetsDesc: "把你最近在 Obsidian 中选中的文本作为一次性候选上下文。",
    selectionSnippetsDisabledDesc: "关闭后不监听选中文本，也不会维护选中文本队列。",
    maxSelectionSnippets: "最近选中文本数量",
    maxSelectionSnippetsDesc: "只保留最近选中的若干段文本",
    maxCharsPerSnippet: "单段文本长度上限",
    maxCharsPerSnippetDesc: "选中文本进入上下文前先按这个长度截断",
    serverStatus: "服务器状态",
    serverStatusDesc: "查看运行中的服务器、诊断信息和控制按钮。",
    stopped: "已停止",
    starting: "启动中...",
    running: "运行中",
    error: "错误",
    statusLabel: "状态：",
    command: "命令",
    stderr: "标准错误",
    log: "日志",
    statusFile: "状态文件",
    startServer: "启动服务器",
    stopServer: "停止服务器",
    restartServer: "重启服务器",
    pleaseWait: "请稍候...",
  },
  view: {
    stoppedTitle: "OpenCode 已停止",
    stoppedMessage: "点击下面的按钮启动 OpenCode 服务器。",
    startOpenCode: "启动 OpenCode",
    startingTitle: "正在启动 OpenCode...",
    startingMessage: "请等待服务器启动。",
    failedTitle: "OpenCode 启动失败",
    genericStartError: "启动 OpenCode 服务器时出现错误。",
    retry: "重试",
    openSettings: "打开设置",
    copyDiagnostics: "复制诊断",
    diagnosticMode: "模式",
    diagnosticCommand: "命令",
    diagnosticWorkingDirectory: "工作目录",
    diagnosticHealthCheck: "健康检查",
    diagnosticStderr: "标准错误",
    diagnosticLog: "日志",
    diagnosticStatus: "状态",
  },
  context: {
    statusText: (committed: number, candidates: number) =>
      candidates === 0 ? `ctx ${committed}` : `ctx ${committed}+${candidates}`,
    statusTitle: (committed: number, candidates: number) =>
      `${committed} 个已提交上下文，${candidates} 个候选上下文`,
    popoverTitle: (_committed: number, _candidates: number) => "上下文",
    copyDiagnostics: "复制诊断",
    candidates: "候选",
    nextMessageIncludes: "下一条消息",
    skip: "跳过",
    skipOnce: "跳过一次",
    include: "包含",
    toggleCandidateTitle: "切换这个本地候选是否进入下一条消息",
    currentSessionContext: "已提交",
    noActiveContext: "没有活跃上下文",
    remove: "移除",
    removeCandidateTitle: "移除这个本地候选",
    removeTitle: "从当前 OpenCode session 上下文中移除",
    provenance: (status: string) => `来源 ${status}`,
    chars: (count: number) => `${count} 字符`,
    included: "已包含",
    skipped: "已跳过",
    failedStatus: (reason: string | null) => (reason ? `失败 ${reason}` : "失败"),
    sourceResolved: "来源已解析",
    sourceResolvedAtLine: (line: number) => `来源已解析到第 ${line} 行`,
    unresolved: {
      emptySource: "来源为空",
      syntheticSource: (source: string) => `${source} 是合成来源`,
      externalUrl: (source: string) => `${source} 不在当前 vault 中`,
      missingFile: (source: string) => `${source} 在当前 vault 中不存在`,
      folder: (source: string) => `${source} 是文件夹`,
      unresolvedHeading: (source: string) => `${source} 包含无法解析的标题引用`,
      unresolvedBlock: (source: string) => `${source} 包含无法解析的块引用`,
      unresolvedFootnote: (source: string) => `${source} 包含无法解析的脚注引用`,
      unresolvedSubpath: (source: string) => `${source} 包含无法解析的 subpath 引用`,
    },
  },
};

const TEXT_BY_LANGUAGE: Record<PluginLanguage, PluginText> = {
  en: EN_TEXT,
  "zh-CN": ZH_CN_TEXT,
};

let languageOverrideForTests: string | null = null;

export function getPluginLanguage(): PluginLanguage {
  return resolvePluginLanguage(readConfiguredLanguage(), readRuntimeLanguage());
}

export function getText(language: PluginLanguage = getPluginLanguage()): PluginText {
  return TEXT_BY_LANGUAGE[language];
}

export function normalizePluginLanguage(language: string | null | undefined): PluginLanguage {
  const normalized = language?.trim().toLowerCase();
  if (normalized?.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function resolvePluginLanguage(
  configuredLanguage: string | null | undefined,
  runtimeLanguage: string | null | undefined
): PluginLanguage {
  const configured = configuredLanguage?.trim();
  return normalizePluginLanguage(configured ? configured : runtimeLanguage);
}

export function setPluginLanguageForTests(language: string | null): void {
  languageOverrideForTests = language;
}

function readConfiguredLanguage(): string | null {
  if (languageOverrideForTests !== null) {
    return languageOverrideForTests;
  }

  const getLanguage = (Obsidian as { getLanguage?: () => string }).getLanguage;
  if (typeof getLanguage === "function") {
    return getLanguage();
  }

  return null;
}

function readRuntimeLanguage(): string | null {
  if (typeof navigator !== "undefined") {
    return navigator.language;
  }

  return null;
}
