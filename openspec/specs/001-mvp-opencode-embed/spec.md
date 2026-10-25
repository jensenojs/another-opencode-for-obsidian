> 0.6.0 更新：本文件描述当前插件行为（attach-only）。MVP 时期的自起服务形态见
> [archive/2026-10-25-improved-opencode-process-management](../../changes/archive/2026-10-25-improved-opencode-process-management/)，
> 结构与删除面见 [docs/plans/v2-attach-spec.md](../../../docs/plans/v2-attach-spec.md)。

## ADDED Requirements

### Requirement: Service Discovery

The plugin SHALL discover OpenCode services by reading state files in `~/.local/state/opencode/` and SHALL NOT start, restart, or terminate any process.

#### Scenario: Services registered by opencode

- **WHEN** the plugin looks for services
- **THEN** it reads every file matching `service*.json` in the opencode state directory
- **AND** treats a file without valid `url` and `password` as unreadable rather than fatal
- **AND** orders candidates with `service.json` first, then by file name

### Requirement: Service Attachment

The plugin SHALL attach to one service by probing `GET /api/info` with Basic authentication (`opencode:<password>`).

#### Scenario: Automatic selection

- **WHEN** the configured service name is `auto`
- **THEN** the plugin probes candidates in order and attaches to the first that answers
- **AND** requires HTTP 200 with `version` and `pid` in the response

#### Scenario: Pinned service

- **WHEN** the configured service name is a specific file name
- **THEN** only that file is considered
- **AND** if it is absent or unreachable the plugin reports unavailable instead of attaching to another service

#### Scenario: No reachable service

- **WHEN** no candidate answers `/api/info`
- **THEN** the plugin enters `unavailable` state with a reason naming the directory and the candidates tried
- **AND** retries every 10 seconds without spawning anything

### Requirement: Service Death Detection

The plugin SHALL treat the OpenCode event stream ending as the authoritative signal that the service is gone.

#### Scenario: Service stops while attached

- **WHEN** the `GET /api/event` stream ends on its own
- **THEN** the plugin transitions to `unavailable`
- **AND** the existing retry loop takes over

#### Scenario: Service returns

- **WHEN** a retry probe succeeds
- **THEN** the plugin attaches without requiring an Obsidian restart
- **AND** points the local proxy at the new service url

### Requirement: HTTP Contract

The plugin SHALL call only `/api/*` endpoints and SHALL NOT fall back to unprefixed routes.

#### Scenario: Session listing

- **WHEN** the plugin lists sessions
- **THEN** it calls `GET /api/session?directory=<absolute path>&limit=<n>&order=<asc|desc>`
- **AND** reads the session list from the response `data` field

#### Scenario: Session creation

- **WHEN** the plugin creates a session
- **THEN** it calls `POST /api/session` with `{title, location: {directory}}` in the body

#### Scenario: Non-JSON response

- **WHEN** a response is not an OpenCode envelope
- **THEN** the call is treated as failed and logged
- **AND** no alternate route is attempted

### Requirement: View Registration

The plugin SHALL register an ItemView that displays in either the Obsidian sidebar or the main editor area based on user settings.

#### Scenario: View activation in sidebar

- **WHEN** the user clicks the ribbon icon or runs the toggle command
- **AND** the default view location is "sidebar"
- **THEN** the view opens in the right sidebar
- **AND** an existing view is revealed

#### Scenario: View activation in main area

- **WHEN** the user clicks the ribbon icon or runs the toggle command
- **AND** the default view location is "main"
- **THEN** the view opens as a tab in the main editor area
- **AND** an existing view in any location is revealed

### Requirement: View State Rendering

The plugin SHALL render different UI content based on the current service state.

#### Scenario: Attached state UI

- **WHEN** the service state is `attached`
- **THEN** the view displays an iframe pointing at the local proxy
- **AND** resolves the current session url once the iframe is ready

#### Scenario: Unavailable state UI

- **WHEN** the service state is `unavailable`
- **THEN** the view displays the state title, the `opencode service start` command, the failure reason, and the log path
- **AND** offers retry, open settings, and copy diagnostics actions

### Requirement: Prompt Context Attachments

The plugin SHALL deliver Obsidian context as prompt request attachments instead of writing separate context messages.

#### Scenario: Included candidates are attached

- **WHEN** a prompt request is forwarded to `POST /api/session/{id}/prompt`
- **THEN** every included candidate becomes a file attachment with a `data:text/plain;base64` uri and an `obsidian-context:<kind>:<label>` name
- **AND** existing request `files` are preserved

#### Scenario: One-shot candidates are consumed

- **WHEN** the prompt request succeeds
- **THEN** one-shot candidates are removed from the registry
- **AND** the number of attachments is recorded for the status bar

#### Scenario: Request fails

- **WHEN** the prompt request fails
- **THEN** candidates stay in the registry and are marked failed

### Requirement: Settings Configuration

The plugin SHALL provide settings for service selection, project directory, default view location, Web UI appearance, and context assist.

#### Scenario: Settings persistence

- **WHEN** the user modifies settings
- **THEN** changes are persisted to plugin data
- **AND** the plugin re-attaches to reflect a changed service selection

#### Scenario: Removed settings

- **WHEN** plugin data still contains retired keys (port, hostname, autoStart, opencodePath, startupTimeout, customCommand, useCustomCommand, keyboardBridge)
- **THEN** they are dropped on load
- **AND** they are not written back

### Requirement: Project Directory Validation

The plugin SHALL validate the project directory setting.

#### Scenario: Valid absolute path

- **WHEN** the user enters an absolute path, a `~` path, or a `C:\` path
- **AND** the path exists and is a directory
- **THEN** the setting is saved

#### Scenario: Invalid path rejection

- **WHEN** the user enters a relative path or a non-existent path
- **THEN** a notice explains the error
- **AND** the setting is not saved

### Requirement: Project Directory Change

The plugin SHALL re-attach to the service when the project directory changes.

#### Scenario: Directory change while attached

- **WHEN** the user changes the project directory
- **THEN** the plugin re-attaches using the new directory
- **AND** does not stop or restart the user's service

### Requirement: Commands Registration

The plugin SHALL register commands for the view and for context actions.

#### Scenario: View commands

- **WHEN** the user runs "Toggle OpenCode panel" (Mod+Shift+O)
- **THEN** the view opens if closed, or closes if open
- **WHEN** the user runs "Toggle OpenCode deep view" (Mod+Shift+L)
- **THEN** the view moves to the main editor area, or returns to the previous editor leaf

#### Scenario: Context commands

- **WHEN** the user runs "Add selection to context" (Mod+Shift+Enter)
- **THEN** the current selection is queued as a candidate
- **AND** a notice is shown when there is no selection to queue
- **WHEN** the user runs "Add current note to context"
- **THEN** the active note is queued as a one-shot candidate

#### Scenario: Diagnostics command

- **WHEN** the user runs "Copy OpenCode diagnostics"
- **THEN** the service diagnostics snapshot is copied to the clipboard

### Requirement: Ribbon Icon

The plugin SHALL add a ribbon icon that activates the OpenCode view in the configured default location.

#### Scenario: Ribbon icon click

- **WHEN** the user clicks the OpenCode ribbon icon
- **THEN** the view is activated in the configured location
