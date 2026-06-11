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

- The command is a template. Empty value means the default template.
- The template must include `{hostname}` and `{port}` so the plugin and server share one endpoint.
- `{cors}` expands to `app://obsidian.md`.
- `{projectDirectory}` expands to the active project directory.

Example:
```bash
opencode serve --hostname {hostname} --port {port} --cors {cors}
```

Other settings (port, hostname, auto-start, view location, context injection) are available through the settings UI and are self-explanatory.

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
```

See the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/) for the state directory convention.

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
