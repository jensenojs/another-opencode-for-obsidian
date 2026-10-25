# Change: Add Workspace Context Injection

> **Archived 2026-10-25.** 这个 change 的意图（把打开的笔记与选区带进会话）仍然成立，但记录的实现路径已经死掉：`injectWorkspaceContext` / `maxNotesInContext` / `maxSelectionLength` 设置、`noReply` 旁路消息、`ContextSyncer` 与 `ContextRegistry` 全部在 0.6.0 删除。当前形态见 [docs/plans/v2-attach-spec.md](../../../../docs/plans/v2-attach-spec.md)：候选由 `CandidateRegistry` 持有，随 prompt 请求以 `files` 附件发出。下面保留原文，作为历史设计记录。

## Why

Users working in Obsidian have multiple notes open that provide context for their AI interactions. Currently, OpenCode has no awareness of which notes are open in Obsidian or what text the user has selected, requiring users to manually reference files and copy/paste selections. By automatically injecting the list of open notes and the currently selected text into OpenCode sessions, the AI gains valuable context about the user's current focus, improving response relevance without manual effort.

## What Changes

- Collect currently open note paths from Obsidian's workspace API
- Collect currently selected text from the active editor (if any)
- Create a new OpenCode session when the OpenCode view is first opened (per Obsidian run)
- Preserve and restore the last OpenCode iframe URL when the view is closed/reopened (until Obsidian is restarted)
- Resolve the target session by parsing the `sessionID` from the current iframe URL when context is about to be injected
- Inject open notes and selected text as context into the current OpenCode session using `session.prompt({ noReply: true })`
- Replace previous injected context without using `session.revert()` (update/ignore the previous context part instead)
- Inject context when the OpenCode view becomes active (focus-based refresh); accept brief staleness if workspace changes while the view remains active
- Add settings to enable/disable the feature (enabled by default) and limit the number of notes included

## Impact

- Affected specs: `001-mvp-opencode-embed`
- Affected code:
  - `src/types.ts` - new settings fields
  - `src/main.ts` - session tracking, URL persistence, context injection orchestration
  - `src/OpenCodeView.ts` - use cached URL when available
  - `src/SettingsTab.ts` - new settings UI
  - `src/OpenCodeClient.ts` - **new file** for OpenCode HTTP client wrapper
  - `src/WorkspaceContext.ts` - **new file** for workspace data collection (open notes + selection)
