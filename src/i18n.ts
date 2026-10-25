import * as Obsidian from "obsidian";

export type PluginLanguage = "en" | "zh-CN";

const EN_TEXT = {
  commands: {
    ribbonTooltip: "OpenCode",
    togglePanel: "Toggle OpenCode panel",
    toggleDeepView: "Toggle OpenCode deep view",
    openPanel: "Open OpenCode panel",
    copyDiagnostics: "Copy OpenCode diagnostics",
    addSelectionToContext: "Add selection to OpenCode context",
    addCurrentNoteToContext: "Add current note to OpenCode context",
  },
  notices: {
    selectTextBeforeAdding: "Select text in a note before adding OpenCode context",
    contextCandidateNotQueued: "OpenCode context was not queued",
    openNoteBeforeAdding: "Open a note before adding it to OpenCode context",
    currentNoteReadFailed: "OpenCode could not read the current note. Check the plugin log.",
    currentNoteEmpty: "Current note is empty",
    diagnosticsCopied: "OpenCode diagnostics copied",
    diagnosticsCopyFailed: "Failed to copy OpenCode diagnostics",
    contextDiagnosticsCopied: "OpenCode context diagnostics copied",
    contextSourceUnavailable: (reason: string) => `OpenCode context source unavailable: ${reason}`,
    projectDirectoryAbsolute: "Project directory must be an absolute path (or start with ~)",
    projectDirectoryMissing: "Project directory does not exist",
    projectDirectoryNotDirectory: "Project directory path is not a directory",
    projectDirectoryValidationFailed: (message: string) => `Failed to validate path: ${message}`,
  },
  settings: {
    title: "Another OpenCode Settings",
    serviceConfiguration: "OpenCode service",
    serviceName: "Service",
    serviceNameDesc:
      "Which state file to attach to. Leave auto to use the running service registered in the OpenCode state directory.",
    serviceNamePlaceholder: "auto",
    projectDirectory: "Project directory",
    projectDirectoryDesc:
      "Override the starting directory for OpenCode. Leave empty to use the vault root.",
    projectDirectoryPlaceholder: "/path/to/project or ~/project",
    behavior: "Behavior",
    defaultViewLocation: "Default view location",
    defaultViewLocationDesc:
      "Where to open the OpenCode panel: sidebar opens in the right panel, main opens as a tab in the editor area",
    sidebar: "Sidebar",
    mainWindow: "Main window",
    webViewAppearance: "Web view appearance",
    webViewAppearanceDesc:
      "Use Obsidian to inherit the active vault theme, or switch to OpenCode to keep the web UI's native styling.",
    contextAssist: "Context assist",
    enabled: "On",
    disabled: "Off",
    enableContextAssist: "Send context with prompts",
    contextAssistDesc:
      "Included Obsidian context is added to the same OpenCode message when you send. Use the status bar to skip or remove candidates before sending. Selected text clears after a successful send.",
    contextAssistDisabledDesc:
      "Obsidian context is not collected or sent while context assist is off.",
    workspaceClues: "Workspace clues",
    workspaceCluesDesc:
      "Send open Obsidian notes and the active location as lightweight background.",
    workspaceCluesDisabledDesc:
      "Open notes and active location are not collected while workspace clues are off.",
    maxOpenNotes: "Max open notes",
    maxOpenNotesDesc: "Limit how many open notes are included.",
    includeActiveLocation: "Include active location",
    includeActiveLocationDesc: "Include the active note and line when available.",
    selectionSnippets: "Selected text",
    selectionSnippetsDesc: "Recent Obsidian selections become one-shot candidates before you send.",
    selectionSnippetsDisabledDesc:
      "Selections are not watched or queued while selected text is off.",
    maxSelectionSnippets: "Recent selection count",
    maxSelectionSnippetsDesc: "Keep only the most recent selected snippets.",
    maxCharsPerSnippet: "Max chars per snippet",
    maxCharsPerSnippetDesc: "Trim selected text before it becomes context.",
    serviceStatus: "Service",
    serviceStatusDesc: "The running OpenCode service this vault attaches to.",
    attached: "Attached",
    unavailable: "Not found",
    statusLabel: "Status: ",
    reason: "Detail",
    log: "Log",
    statusFile: "Status",
  },
  view: {
    unavailableTitle: "OpenCode service not found",
    unavailableMessage:
      "The plugin attaches to a running OpenCode service and never starts one. Run the command below, then this view connects on its own.",
    unavailableCommand: "opencode service start",
    retry: "Reconnect",
    openSettings: "Open Settings",
    copyDiagnostics: "Copy diagnostics",
    diagnosticReason: "Detail",
    diagnosticLog: "Log",
  },
  context: {
    statusText: (count: number) => `${count}`,
    statusTitle: (includedCandidates: number, totalCandidates: number) =>
      totalCandidates > 0
        ? `${includedCandidates} of ${totalCandidates} context candidate${totalCandidates === 1 ? "" : "s"} will be sent with the next OpenCode prompt`
        : "No Obsidian context queued for the next OpenCode prompt",
    popoverTitle: (candidates: number) => (candidates > 0 ? `Context (${candidates})` : "Context"),
    copyDiagnostics: "Copy diagnostics",
    nextMessageIncludes: "Next prompt",
    lastDelivery: (count: number) =>
      `Last prompt carried ${count} context file${count === 1 ? "" : "s"}`,
    skip: "Skip",
    skipOnce: "Skip next",
    include: "Include",
    toggleCandidateTitle: "Toggle this local candidate for the next prompt",
    noActiveContext: "No Obsidian context queued",
    remove: "Remove",
    removeCandidateTitle: "Remove this local candidate",
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
    toggleDeepView: "切换 OpenCode 深聊视图",
    openPanel: "打开 OpenCode 面板",
    copyDiagnostics: "复制 OpenCode 诊断",
    addSelectionToContext: "将选中文本加入 OpenCode 上下文",
    addCurrentNoteToContext: "将当前笔记加入 OpenCode 上下文",
  },
  notices: {
    selectTextBeforeAdding: "请先在笔记中选择文本，再加入 OpenCode 上下文",
    contextCandidateNotQueued: "上下文未加入队列",
    openNoteBeforeAdding: "请先打开一篇笔记，再加入 OpenCode 上下文",
    currentNoteReadFailed: "OpenCode 无法读取当前笔记。请检查插件日志。",
    currentNoteEmpty: "当前笔记为空",
    diagnosticsCopied: "OpenCode 诊断已复制",
    diagnosticsCopyFailed: "复制 OpenCode 诊断失败",
    contextDiagnosticsCopied: "OpenCode 上下文诊断已复制",
    contextSourceUnavailable: (reason: string) => `OpenCode 上下文来源不可用：${reason}`,
    projectDirectoryAbsolute: "项目目录必须是绝对路径，或以 ~ 开头",
    projectDirectoryMissing: "项目目录不存在",
    projectDirectoryNotDirectory: "项目目录路径不是文件夹",
    projectDirectoryValidationFailed: (message: string) => `验证路径失败：${message}`,
  },
  settings: {
    title: "Another OpenCode 设置",
    serviceConfiguration: "OpenCode 服务",
    serviceName: "服务",
    serviceNameDesc:
      "选择要接入的 state 文件。保持 auto 时使用 OpenCode 状态目录里注册的正在运行的服务。",
    serviceNamePlaceholder: "auto",
    projectDirectory: "项目目录",
    projectDirectoryDesc: "覆盖 OpenCode 的启动目录。留空时使用 vault 根目录。",
    projectDirectoryPlaceholder: "/path/to/project 或 ~/project",
    behavior: "行为",
    defaultViewLocation: "默认打开位置",
    defaultViewLocationDesc:
      "OpenCode 面板打开位置：侧边栏会打开到右侧面板，主窗口会作为编辑区标签页打开",
    sidebar: "侧边栏",
    mainWindow: "主窗口",
    webViewAppearance: "Web view 外观",
    webViewAppearanceDesc:
      "选择 Obsidian 时继承当前 vault 主题；选择 OpenCode 时保留 web UI 原生样式。",
    contextAssist: "上下文辅助",
    enabled: "开",
    disabled: "关",
    enableContextAssist: "发送时附加上下文",
    contextAssistDesc:
      "发送 OpenCode 消息时，已包含的 Obsidian 上下文会随同一条消息发送。发送前可在状态栏临时跳过或移除候选。选中文本发送成功后会自动清空。",
    contextAssistDisabledDesc: "关闭后不会收集或发送 Obsidian 上下文。",
    workspaceClues: "工作区线索",
    workspaceCluesDesc: "把当前打开的 Obsidian 笔记和活动位置作为轻量背景随消息发送。",
    workspaceCluesDisabledDesc: "关闭后不会收集打开笔记和活动位置。",
    maxOpenNotes: "打开的笔记数量上限",
    maxOpenNotesDesc: "限制进入上下文的打开笔记数量",
    includeActiveLocation: "包含当前活动位置",
    includeActiveLocationDesc: "可用时包含当前笔记和行号",
    selectionSnippets: "选中文本",
    selectionSnippetsDesc: "把你最近在 Obsidian 中选中的文本作为一次性候选上下文。",
    selectionSnippetsDisabledDesc: "关闭后不监听选中文本，也不会维护选中文本队列。",
    maxSelectionSnippets: "最近选中文本数量",
    maxSelectionSnippetsDesc: "只保留最近选中的若干段文本",
    maxCharsPerSnippet: "单段文本长度上限",
    maxCharsPerSnippetDesc: "选中文本进入上下文前先按这个长度截断",
    serviceStatus: "服务",
    serviceStatusDesc: "当前 vault 接入的 OpenCode 服务。",
    attached: "已连接",
    unavailable: "未发现服务",
    statusLabel: "状态：",
    reason: "细节",
    log: "日志",
    statusFile: "状态文件",
  },
  view: {
    unavailableTitle: "未发现 OpenCode 服务",
    unavailableMessage:
      "插件只接入已运行的 OpenCode 服务，不会自己启动进程。运行下面的命令后，这个视图会自动连接。",
    unavailableCommand: "opencode service start",
    retry: "重新连接",
    openSettings: "打开设置",
    copyDiagnostics: "复制诊断",
    diagnosticReason: "细节",
    diagnosticLog: "日志",
  },
  context: {
    statusText: (count: number) => `${count}`,
    statusTitle: (includedCandidates: number, totalCandidates: number) =>
      totalCandidates > 0
        ? `下一条 prompt 将带上 ${includedCandidates}/${totalCandidates} 个上下文候选`
        : "下一条 prompt 没有待发送的 Obsidian 上下文",
    popoverTitle: (candidates: number) => (candidates > 0 ? `上下文（${candidates}）` : "上下文"),
    copyDiagnostics: "复制诊断",
    nextMessageIncludes: "下一条 prompt",
    lastDelivery: (count: number) => `上一次 prompt 带了 ${count} 个上下文附件`,
    skip: "跳过",
    skipOnce: "本条不带",
    include: "包含",
    toggleCandidateTitle: "切换这个本地候选是否进入下一条 prompt",
    noActiveContext: "没有待发送的 Obsidian 上下文",
    remove: "移除",
    removeCandidateTitle: "移除这个本地候选",
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
