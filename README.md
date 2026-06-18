# Another OpenCode for Obsidian

[English](README.md) · [简体中文](README_CN.md)

Run [OpenCode](https://opencode.ai/) inside Obsidian without giving up the parts
that make Obsidian useful: panes, theme, hotkeys, links, context, and local
diagnostics.

The upstream plugin proves the simple idea: OpenCode's Web UI can run inside an
Obsidian pane. This fork keeps that idea and fills in the parts needed for daily
use: view placement, Obsidian theme fit, shortcut ownership, vault navigation,
context provenance, and diagnostics.

This fork is beta software. It is ready for local use and BRAT installation.

_This is a third-party fork. It is not affiliated with OpenCode or Obsidian._

## Highlights

- **Two view modes**: open OpenCode in the sidebar, or use `Mod+Shift+L` for main editor deep view.
- **Obsidian-aware Web UI**: optional Obsidian-derived appearance without
  patching OpenCode component class names.
- **Shortcut conflict control**: Obsidian and OpenCode shortcuts are indexed
  together and conflicts are handled in plugin settings.
- **Vault navigation from OpenCode**: file paths, wikilinks, headings, blocks,
  footnotes, diff rows, and markdown paths open existing Obsidian notes.
- **Context with provenance**: workspace and selection context keep source
  metadata, restore state, and safe navigation targets.
- **Useful diagnostics**: server, bridge, keyboard, theme, and context state are
  available from the plugin and XDG status files.

## Quick Links

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Settings](#settings)
- [Diagnostics](#diagnostics)
- [Possible Future Work](#possible-future-work)

## What This Plugin Does Differently

### OpenCode is usable inside Obsidian

The main work in this fork is integration. OpenCode remains OpenCode: its Web UI is still the conversation surface, and the plugin does not replace it with a custom chat view. The plugin handles the parts that only Obsidian can know.

| Area               | What changed in this fork                                                                                                                                                                                             | Why it matters in Obsidian                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| View placement     | OpenCode can open in the sidebar or in the main editor area. The deep view command defaults to `Mod+Shift+L` and returns to the previous editor leaf when toggled again.                                              | You can use OpenCode as a side panel while reading, or as a focused editor view without losing your previous note.                        |
| Theme fit          | The embedded Web UI can use OpenCode's own appearance or an Obsidian-derived appearance. Obsidian mode maps stable theme variables and avoids patching OpenCode component class names.                                | The iframe does not feel like a separate app pasted over the vault, and theme fixes stay tied to stable token surfaces.                   |
| Keyboard ownership | Obsidian hotkeys and OpenCode keybinds are normalized into one shortcut index. Conflicts appear in the plugin settings panel and can be assigned to Obsidian or OpenCode.                                             | Shortcuts such as the pane toggle, deep view, OpenCode sidebar toggle, and app settings can coexist without hardcoded special cases.      |
| Click navigation   | Vault paths, wikilinks, headings, blocks, footnotes, diff rows, and markdown paths shown inside OpenCode can open the existing Obsidian note. Missing targets do not create files.                                    | File references shown by OpenCode become usable vault navigation, while Obsidian remains the source of truth for whether a target exists. |
| Context visibility | Workspace and selection context carry source metadata, provenance, restore state, and safe navigation targets. The status bar and OpenCode context surface are kept in sync where the Web UI exposes the needed port. | You can see what context may affect the next prompt, where it came from, and whether it can be opened again.                              |
| Diagnostics        | Runtime diagnostics include server launch state, bridge state, shortcut policy, context projection state, theme state, and XDG log/status paths.                                                                      | When something breaks, the plugin can report the relevant Obsidian/OpenCode boundary instead of only saying that the iframe failed.       |

The bridge is limited to the places where iframe state must cross into
Obsidian: theme payloads, shortcut decisions, vault navigation requests, prompt
context cards, and diagnostics.

### GraphRAG is possible future work

GraphIndex already gives the plugin a factual view of vault links through Obsidian `Vault` and `MetadataCache`. GraphRAG can sit above that later, but the plugin does not depend on it being built.

For now, the product is complete enough without a ranking layer. Future GraphRAG work should be treated as personal exploration unless it directly improves the existing OpenCode-in-Obsidian workflow.

## Current Status

Works today:

- Start or attach to an OpenCode server from Obsidian.
- Open the OpenCode Web UI in the sidebar or main editor area.
- Use either OpenCode's native appearance or an Obsidian-derived appearance.
- Open OpenCode in the sidebar, or use `Mod+Shift+L` for deep view.
- See keyboard conflicts in plugin settings and choose whether Obsidian or
  OpenCode owns each conflicting shortcut.
- Send included Obsidian workspace and selection candidates with the same
  OpenCode prompt as synthetic text parts.
- Keep automatic context out of the visible OpenCode transcript while avoiding
  separate empty context messages.
- Show next-message context candidates in an Obsidian status bar surface and
  sync native OpenCode context cards when available.
- Navigate context items back to existing vault content without creating missing
  files.
- Restore plugin context after session reload with `known` or `uncertain`
  provenance.
- Copy diagnostics that include metadata, message/part IDs, text length,
  provenance status, server launch state, and runtime paths without copying note
  bodies.
- Consume OpenCode `/api/event` as a read-only diagnostics stream.

Still experimental:

- The Obsidian-style Web UI appearance is usable, but theme compatibility depends
  on Obsidian themes, Electron rendering, and OpenCode token changes.
- Automatic context sources are useful for local workflows, but they are still
  conservative and visible by design.
- GraphRAG ranking and derived knowledge discovery are not part of the current
  product surface.

## Installation

### BRAT

Use [BRAT](https://github.com/TfTHacker/obsidian42-brat) for beta installation.

1. Install BRAT from Obsidian Community Plugins.
2. Open BRAT settings.
3. Click **Add Beta plugin**.
4. Enter:

   ```text
   jensenojs/another-opencode-for-obsidian
   ```

5. Select the latest release.
6. Enable **Another OpenCode for Obsidian** in Obsidian Settings -> Community Plugins.

BRAT requires GitHub releases with `manifest.json`, `main.js`, and `styles.css`
attached. Releases from this fork are published for that installation path.

### Manual Install

Download these files from the latest release and place them in:

```text
<vault>/.obsidian/plugins/another-opencode-for-obsidian/
```

Required files:

- `manifest.json`
- `main.js`
- `styles.css`

Then reload Obsidian and enable the plugin.

### Development Install

```bash
git clone https://github.com/jensenojs/another-opencode-for-obsidian.git
cd another-opencode-for-obsidian
bun install
bun run build
bun run harness install --vault /path/to/vault
```

## Requirements

- Obsidian desktop.
- OpenCode CLI installed or a custom command that starts `opencode serve`.
- Bun for development and local builds.

GUI-launched Obsidian on macOS and Linux may not inherit the same `PATH` as your
terminal. If OpenCode or local MCP tools cannot be found, prefer an absolute
`opencodePath` or an explicit custom command.

## Basic Usage

- Use the ribbon icon or command palette to open the OpenCode pane.
- Use the ribbon icon, command palette, or Obsidian hotkeys to toggle the side pane.
- Use `Mod+Shift+L` to toggle deep view in the main editor area.
- Start the OpenCode server from the plugin controls, or configure auto-start.
- Use the OpenCode Web UI normally.
- Add current note or selection context from Obsidian commands.
- Use the status bar context surface to inspect, navigate, or ignore sent
  context.
- Use the plugin settings panel to inspect keyboard shortcut conflicts.

The plugin does not create missing vault files when navigating context sources.
If a source cannot be resolved, it is reported as unresolved instead of using
Obsidian's link-open behavior.

## Vault Navigation And Link Resolution

Vault navigation opens existing Obsidian evidence only. The plugin resolves
vault paths, wikilinks, headings, blocks, and footnotes through Obsidian APIs and
the GraphIndex fact layer, then opens the resolved `TFile` with
`WorkspaceLeaf.openFile()`.

This keeps one resolver contract for context navigation and any later graph
experiments. Future graph features should consume the same vault facts instead
of building another link parser.

Relevant Obsidian API references:

- [MetadataCache](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache)
- [MetadataCache.getFirstLinkpathDest](https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache/getFirstLinkpathDest)
- [parseLinktext](https://docs.obsidian.md/Reference/TypeScript+API/parseLinktext)
- [getLinkpath](https://docs.obsidian.md/Reference/TypeScript+API/getLinkpath)
- [resolveSubpath](https://docs.obsidian.md/Reference/TypeScript+API/resolveSubpath)
- [WorkspaceLeaf.openFile](https://docs.obsidian.md/Reference/TypeScript+API/WorkspaceLeaf/openFile)
- [Workspace.openLinkText](https://docs.obsidian.md/Reference/TypeScript+API/Workspace/openLinkText) is a link-open reference, not this plugin's evidence-navigation entry point.

## Settings

### Server Startup

The default path mode resolves and runs `opencode serve` directly. It does not
start a shell, and it does not read `.zshrc`, `.bashrc`, PowerShell profiles, or
other shell startup files.

The OpenCode server inherits the environment of the Obsidian desktop process,
with `NODE_USE_SYSTEM_CA=1` added by the plugin. This is a common source of
startup problems. Obsidian is a GUI app, so the environment visible to the
plugin may be smaller or different than the environment in your terminal. If
`opencode serve` works in Terminal but fails from Obsidian, check whether the
Obsidian process can see the same `PATH`, Node version manager, proxy variables,
MCP tool paths, and API token variables.

Path mode is usually best when one of these is true:

- `opencode` is installed in a common location that the plugin can resolve;
- the OpenCode executable path is configured as an absolute path;
- OpenCode does not need shell-only setup before `serve` starts.

If path mode fails, copy diagnostics and compare:

- `processEnvironment.pathEntries`: PATH entries visible to Obsidian;
- `processEnvironment.envKeys`: environment variable names visible to
  Obsidian;
- `lastSpawnEnvironment.pathEntries`: PATH entries passed to the OpenCode
  server;
- `lastSpawnEnvironment.envKeys`: environment variable names passed to the
  OpenCode server;
- `lastDisplayCommand`: the final command after placeholders were expanded;
- `lastResolvedExecutable`: the executable path used by path mode;
- `lastStderr` and `lastHealthError`: what failed after launch.

Enable **Use custom command** only when path mode cannot provide the environment
OpenCode needs, or when OpenCode must be launched through a version manager,
wrapper script, shell profile, proxy setup, or managed runtime. The command is a
shell template and should include `{hostname}` and `{port}`.

Available placeholders:

- `{hostname}`
- `{port}`
- `{cors}` expands to `app://obsidian.md`
- `{projectDirectory}`

Basic example:

```bash
opencode serve --hostname {hostname} --port {port} --cors {cors}
```

Recommended macOS/Linux template when you know the executable path:

```bash
zsh -lc 'exec "$HOME/.local/bin/opencode" serve --hostname {hostname} --port {port} --cors {cors}'
```

Template when `opencode` is provided by a shell setup file:

```bash
zsh -lc 'source "$HOME/.zshrc"; exec opencode serve --hostname {hostname} --port {port} --cors {cors}'
```

Template with explicit environment variables:

```bash
zsh -lc 'export HTTPS_PROXY=http://127.0.0.1:7890; export NO_PROXY=127.0.0.1,localhost; exec "$HOME/.local/bin/opencode" serve --hostname {hostname} --port {port} --cors {cors}'
```

Template with an extra OpenCode server flag:

```bash
zsh -lc 'exec "$HOME/.local/bin/opencode" serve --hostname {hostname} --port {port} --cors {cors} --shutdown-after-last-client'
```

Use extra flags only when your installed OpenCode version supports them. The
important part of the template is the explicit process environment: the shell
entry, the binary path or sourced setup file, and the `serve` placeholders.

Windows template:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& 'C:\path\to\opencode.exe' serve --hostname {hostname} --port {port} --cors {cors}"
```

Custom command mode is explicit. It still starts from Obsidian's process
environment, so write the missing executable path, profile source, proxy
variables, MCP paths, or token setup into the template.

### Web View Appearance

Two modes are available:

- `OpenCode`: keep OpenCode's own Web UI styling.
- `Obsidian`: derive OpenCode Web UI tokens from the active Obsidian theme.

Obsidian appearance mode maps stable Obsidian CSS variables onto OpenCode
appearance tokens. It does not patch OpenCode component class names. The goal is
to make the embedded Web UI feel like it belongs inside Obsidian while keeping
the OpenCode UI intact.

Relevant upstream surfaces:

- [Obsidian CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables)
- [OpenCode v2 theme tokens](https://github.com/sst/opencode/blob/dev/packages/ui/src/v2/styles/theme.css)
- [OpenCode Tailwind color entry](https://github.com/sst/opencode/blob/dev/packages/ui/src/styles/tailwind/colors.css)

### Context Assist

Automatic context is being re-centered on OpenCode's native prompt context
cards. The plugin should keep the Obsidian-specific strategy work: discovering
workspace clues, selected text, and future vault evidence. The OpenCode Web UI
should own the visible "next message context" card whenever the context can be
represented there.

The bridge is still part of the product value. OpenCode owns its Web UI and
Obsidian owns vault navigation, so this plugin can add narrow iframe hooks for
actions that need both sides. A plugin-owned context card can render inside
OpenCode's native prompt context area, while its click navigation can post back
to Obsidian and open the existing vault file. Those hooks should preserve the
boundary: iframe-side code captures or applies OpenCode UI actions, while
context discovery and inclusion policy stay in the context layer.

The earlier prompt-coupled path kept candidates in the Obsidian plugin status
bar and appended included candidates as `synthetic` parts when the prompt was
sent. That path is useful as a historical mechanism, but it should not keep
expanding as the main user-facing control surface.

Current bridge direction:

- [bridge module guide](src/bridge/AGENTS.md) records the local Obsidian and
  OpenCode source anchors.
- [native prompt context bridge design](docs/plans/2026-06-18-opencode-native-prompt-context-bridge.md)
  records the live experiment, bridge API, and candidate-to-card sync design.
- `src/bridge/OpenCodePromptContextAdapter.ts` records the OpenCode native
  prompt context card shape used by future integration work.
- Use a live Web UI bridge that calls `prompt.context.add(item)` inside
  OpenCode's `PromptProvider` tree. Direct prompt storage writes are only useful
  as debugging evidence because they do not update the current Solid store.
- Obsidian-owned cards should not fake OpenCode review comments. The native card
  can show, remove, and submit them; navigation back to Obsidian belongs in the
  plugin injection bridge.

First-phase sources:

- workspace clues: currently open notes and optional active location;
- selected text: recent selections, kept as one-shot candidates and removed
  after a successful send.

The automatic path does not create a separate context message and does not use
`noReply`. A successful send consumes one-shot selected text candidates while
keeping dynamic workspace context available for later prompts. If the prompt
request fails, included candidates stay local and are marked failed.

Legacy/manual context messages can still be restored and removed. Restored
context is treated carefully:

- valid plugin provenance restores as `known`;
- old or invalid context restores as `uncertain`;
- uncertain context is shown as coming from the OpenCode session, not from a
  trusted vault file.

Future backlink, block-reference, summary, or graph-derived sources should use
the same candidate lifecycle instead of writing directly to the OpenCode
session.

## Diagnostics

Runtime logs and status live under the XDG state directory:

```bash
$XDG_STATE_HOME/another-opencode-for-obsidian/another-opencode-for-obsidian.log
$XDG_STATE_HOME/another-opencode-for-obsidian/status.json
```

If `XDG_STATE_HOME` is unset, the plugin uses:

```text
~/.local/state/another-opencode-for-obsidian/
```

Useful commands:

```bash
bun run dev:status
bun run dev:logs
bun run dev:doctor
bun run dev:bridge
bun run dev:theme
bun run dev:theme:fixture
```

`dev:bridge` checks local OpenCode and Obsidian contract files. It does not fetch
remote URLs.

`dev:theme` checks the running Obsidian plugin instance. `dev:theme:fixture`
checks the current workspace code without requiring an Obsidian reload.

## Development

```bash
bun install
bun run build
bun test
bun run check
```

`bun run check` runs formatting checks, lint, typecheck, production build, and
tests.

Some tests start temporary HTTP servers on `127.0.0.1`. In sandboxed agent
environments this may require explicit permission for loopback listening.

## Possible Future Work

The main product milestone is a stable OpenCode-in-Obsidian workflow:

- OpenCode remains the text interaction surface.
- Obsidian provides visible context, vault evidence, safe navigation, and
  diagnostics.
- The user can see what context was sent and where it came from.

That milestone is the current focus. Possible future work includes GraphRAG over
the Obsidian vault:

- GraphIndex is the factual layer over Obsidian `Vault` and `MetadataCache`.
- Derived indexes could help discover useful relationships, gaps, and context
  candidates.
- Recommendation and ranking policy should stay above GraphIndex, not inside it.

This is optional research work. It should not silently auto-inject context or
turn the vault graph into a hidden ranking system.

## Troubleshooting and Issue Reports

The plugin tries to keep startup and bridge failures observable. If OpenCode
does not start, the view and settings panel show the mode, command, working
directory, health check result, stderr, log path, and status path. The **Copy
diagnostics** command includes the same fields plus a short process environment
summary. It does not copy full note text.

When reporting a problem, include:

- Obsidian version and OS.
- OpenCode version.
- Plugin version.
- Start mode: path mode or custom command.
- If you use path mode, include the configured OpenCode path and whether
  **Autodetect** found anything.
- If you use custom command mode, include the exact custom command.
- Whether the OpenCode pane restored an existing session or created a new one.
- The copied diagnostics from the plugin UI or `status.json`.
- Relevant recent lines from the XDG log.

Common startup failures are usually visible in these fields:

- `lastDisplayCommand`: what the plugin tried to run;
- `lastResolvedExecutable`: the resolved executable path, when path mode is
  used;
- `lastCwd`: the vault/project directory used as the process working directory;
- `lastStderr`: stderr from the OpenCode process;
- `lastHealthError`: why the configured health endpoint was not accepted;
- `processEnvironment` and `lastSpawnEnvironment`: PATH and shell information
  visible to Obsidian and to the spawned process.
