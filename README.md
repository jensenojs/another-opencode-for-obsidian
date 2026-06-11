# OpenCode plugin for Obsidian

Give your notes AI capability by embedding Opencode [OpenCode](https://opencode.ai) AI assistant directly in Obsidian:

<img src="./assets/opencode_in_obsidian.png" alt="OpenCode embeded in Obsidian" />

**Use cases:**

- Summarize and distill long-form content
- Draft, edit, and refine your writing
- Query and explore your knowledge base
- Generate outlines and structured notes

This plugin uses OpenCode's web view that can be embedded directly into Obsidian window. Usually similar plugins would use the ACP protocol, but I want to see how how much is possible without having to implement (and manage) a custom chat UI - I want the full power of OpenCode in my Obsidian.

_Note: plugin author is not afiliated with OpenCode or Obsidian - this is a 3rd party software._

## Requirements

- Desktop only (uses Node.js child processes)
- [OpenCode CLI](https://opencode.ai) installed
- [Bun](https://bun.sh) installed

## Installation

### For Users (BRAT - Recommended for Beta Testing)

The easiest way to install this plugin during beta is via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewer's Auto-update Tool):

1. Install the BRAT plugin from Obsidian Community Plugins
2. Open BRAT settings and click "Add Beta plugin"
3. Enter: `mtymek/opencode-obsidian`
4. Click "Add Plugin" - BRAT will install the latest release automatically
5. Enable the OpenCode plugin in Obsidian Settings > Community Plugins

BRAT will automatically check for updates and notify you when new versions are available.

### For Developers

If you want to contribute or develop the plugin:

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/mtymek/opencode-obsidian.git
   cd opencode-obsidian
   bun install
   ```
2. Build and link it into a vault:
   ```bash
   bun run build
   bun run harness install --vault /path/to/vault
   ```
3. Enable in Obsidian Settings > Community Plugins
4. Use the harness while developing:
   ```bash
   bun run harness status --vault /path/to/vault
   bun run harness logs --lines 120
   bun run dev:bridge --opencode /path/to/opencode
   ```

## Usage

- Click the terminal icon in the ribbon, or
- `Cmd/Ctrl+Shift+O` to toggle the panel
- Server starts automatically when you open the panel

## Settings

### Custom Command Mode

Enable "Use custom command" when you need more control over how OpenCode starts—for example, to add extra CLI flags, use a custom wrapper script, or run OpenCode through a container or virtual environment.

When using custom command:

- Empty value uses the normal executable path mode.
- A non-empty value is a shell command template. It must include `{hostname}` and `{port}` so the plugin and server share one endpoint.
- `{cors}` expands to `app://obsidian.md`.
- `{projectDirectory}` expands to the active project directory.
- GUI-launched Obsidian may not inherit your terminal PATH. Use an absolute executable path or a leading `~` path in non-empty custom commands.

Example:

```bash
opencode serve --hostname {hostname} --port {port} --cors {cors}
```

Other settings (port, hostname, auto-start, view location, context injection) are available through the settings UI and are self-explanatory.

### Web view appearance

The embedded web view can use either:

- `Obsidian`: inherit the active Obsidian theme. Page-level OpenCode background tokens stay transparent, while local controls and panels use translucent surfaces derived from Obsidian variables.
- `OpenCode`: keep OpenCode's own web UI styling.

The Obsidian mode uses the stable CSS-variable surfaces exposed by both apps. It reads Obsidian variables such as `--background-primary`, `--text-normal`, and `--interactive-accent`, then injects OpenCode token overrides such as `--background-base`, `--surface-raised-base`, `--text-strong`, and `--border-weak-base` through the local proxy. The page background tokens are transparent so Obsidian owns the pane material; local OpenCode surfaces remain translucent for readability. This code does not target OpenCode component class names.

Relevant upstream surfaces:

- Obsidian CSS variables: https://docs.obsidian.md/Reference/CSS+variables/CSS+variables
- OpenCode theme tokens: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/theme.css
- OpenCode Tailwind token mapping: https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css

### Context injection (experimental)

This plugin can automatically inject context to the running OC instance: list of open notes and currently selected text.

Currently, this is work-in-progress feature with some limitations - it won't work when creating new session from OC interface.

## Development diagnostics

Runtime logs and status are written under the XDG state directory:

```bash
$XDG_STATE_HOME/opencode-obsidian/opencode-obsidian.log
$XDG_STATE_HOME/opencode-obsidian/status.json
```

If `XDG_STATE_HOME` is unset, the plugin uses `~/.local/state`.

The harness reads these files directly:

```bash
bun run harness paths
bun run harness status --vault /path/to/vault
bun run harness logs --lines 120
bun run harness doctor --vault /path/to/vault
bun run dev:bridge --opencode /path/to/opencode
bun run dev:theme --vault /path/to/vault
```

See the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/) for the state directory convention.

When startup fails, the panel and settings page show the same diagnostics written to `status.json`: the effective start mode, command, stderr, health-check error, and log path.

The intended path is visible first: a user should not have to know where logs live before seeing why startup failed. The harness commands move the same evidence between machines. For appearance issues, `bun run dev:theme` reads the running proxy HTML and reports whether the Obsidian/OpenCode appearance switch injected the expected tokens.

### Reporting issues

Please include the diagnostics requested by the bug report template when opening an issue:

- Click "Copy diagnostics" in the plugin error panel and paste the JSON.
- Include recent lines from the XDG log path shown in diagnostics.
- Include Obsidian version, OS, OpenCode version, start mode, and the exact custom command or executable path.
- Describe the project/vault path shape: spaces, Unicode, `%`, Windows drive letters, UNC paths, symlinks, or network mounts.

The client follows OpenCode's JS SDK behavior for project directories: `x-opencode-directory` is percent-encoded before it is sent, and the server decodes it before loading the instance. This matters for non-ASCII paths and Windows-style paths.

### Bridge contract checks

`bun run dev:bridge` checks this plugin against local contract files:

- OpenCode HTTP: `/path/to/opencode/packages/sdk/openapi.json`
- OpenCode hooks: `/path/to/opencode/packages/plugin/src/index.ts`
- Obsidian workspace events: `node_modules/obsidian/obsidian.d.ts`

The command does not fetch remote URLs. To test a newer upstream, update the local OpenCode checkout or npm dependency, then rerun the harness.

## Windows Troubleshooting

If you see "Executable not found at 'opencode'" despite opencode being installed:

1. Find your opencode.cmd path:

   ```
   where opencode.cmd
   ```

2. Configure the full path in plugin settings:
   ```
   C:\Users\{username}\AppData\Roaming\npm\opencode.cmd
   ```

This is due to Electron/Obsidian not fully inheriting PATH on Windows.
