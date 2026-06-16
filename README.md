# Another OpenCode for Obsidian

Another OpenCode for Obsidian embeds [OpenCode](https://opencode.ai/) in
Obsidian and adds Obsidian-native context, provenance, navigation, and
diagnostics around the running OpenCode session.

The current goal is practical: make OpenCode usable from inside Obsidian without
turning this plugin into a second chat client. The OpenCode Web UI remains the
main conversation surface. The plugin adds the Obsidian-side facts that the Web
UI does not know by itself: which vault context was sent, where it came from,
whether it can be restored safely, and how to get back to the source note.

This fork is beta software. It is ready for local use and BRAT installation, but
larger GraphRAG features are still research and design work.

_This is a third-party fork. It is not affiliated with OpenCode or Obsidian._

## What This Plugin Does Differently

Many Obsidian integrations stop at embedding a Web UI in a side pane. This
plugin treats the Web UI as one surface inside a larger Obsidian workflow. The
proxy is not only a port forwarder. It is the boundary where iframe-local
OpenCode UI facts become Obsidian-side facts that can be validated against the
vault, the workspace, and the plugin's own runtime diagnostics.

The first visible result is navigation. When OpenCode shows a vault file, diff
row, wikilink, heading, block, footnote, or markdown path, the plugin can route
that click back to the existing Obsidian note. Hover feedback uses the same
detection path as click handling, so the UI only hints when the same element can
actually request navigation. Missing targets fail silently and never create new
files.

The same bridge shape is meant to carry more than navigation. Context is tracked
as Obsidian evidence with provenance, restore state, source metadata, and safe
navigation targets. OpenCode events are consumed as read-only diagnostics before
they become UI controls. Future hooks, permission surfaces, TUI coexistence, and
GraphRAG-derived suggestions should follow the same rule: OpenCode exposes what
happened, Obsidian resolves it against vault facts, and the plugin presents the
smallest native control surface needed for the user to inspect or act.

## Current Status

Works today:

- Start or attach to an OpenCode server from Obsidian.
- Open the OpenCode Web UI in an Obsidian pane.
- Use either OpenCode's native appearance or an Obsidian-derived appearance.
- Add Obsidian note, selection, workspace, backlink, and cursor context to the
  current OpenCode session.
- Keep plugin context hidden from the visible OpenCode transcript by sending it
  as synthetic OpenCode text parts.
- Show active context items in an Obsidian status bar surface.
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
- GraphIndex exists as a factual vault-link read model. GraphRAG ranking and
  derived knowledge discovery are not part of the first usable release.

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
<vault>/.obsidian/plugins/opencode-obsidian/
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
- Start the OpenCode server from the plugin controls, or configure auto-start.
- Use the OpenCode Web UI normally.
- Add current note or selection context from Obsidian commands.
- Use the status bar context surface to inspect, navigate, or ignore sent
  context.

The plugin does not create missing vault files when navigating context sources.
If a source cannot be resolved, it is reported as unresolved instead of using
Obsidian's link-open behavior.

## Vault Navigation And Link Resolution

Vault navigation opens existing Obsidian evidence only. The plugin resolves
vault paths, wikilinks, headings, blocks, and footnotes through Obsidian APIs and
the GraphIndex fact layer, then opens the resolved `TFile` with
`WorkspaceLeaf.openFile()`.

This keeps one resolver contract for current context navigation and future
GraphRAG work. GraphRAG can rank or explain relationships above GraphIndex, but
it should consume the same vault facts instead of building another link parser.

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

The default path mode resolves and runs `opencode serve` directly.

Enable **Use custom command** when you need shell-specific setup, a wrapper
script, a patched OpenCode binary, or a managed runtime. The command is a shell
template and should include `{hostname}` and `{port}`.

Available placeholders:

- `{hostname}`
- `{port}`
- `{cors}` expands to `app://obsidian.md`
- `{projectDirectory}`

Example:

```bash
opencode serve --hostname {hostname} --port {port} --cors {cors}
```

Custom command mode is explicit. The plugin does not automatically source
`.zshrc`, `.bashrc`, PowerShell profiles, or other shell startup files.

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

### Context

The plugin can send explicit and automatic context into the current OpenCode
session.

Supported context sources:

- current note
- current selection
- currently open workspace notes
- active note backlinks
- cursor position

Each context item records metadata such as type, label, source file, optional
navigation source, line range, text length, message ID, part ID, creation time,
and provenance status.

Restored context is treated carefully:

- valid plugin provenance restores as `known`;
- old or invalid context restores as `uncertain`;
- uncertain context is shown as coming from the OpenCode session, not from a
  trusted vault file.

## Diagnostics

Runtime logs and status live under the XDG state directory:

```bash
$XDG_STATE_HOME/opencode-obsidian/opencode-obsidian.log
$XDG_STATE_HOME/opencode-obsidian/status.json
```

If `XDG_STATE_HOME` is unset, the plugin uses:

```text
~/.local/state/opencode-obsidian/
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

## Product Direction

The first product milestone is a stable OpenCode-in-Obsidian workflow:

- OpenCode remains the text interaction surface.
- Obsidian provides visible context, vault evidence, safe navigation, and
  diagnostics.
- The user can see what context was sent and where it came from.

The next research direction is GraphRAG over the Obsidian vault:

- GraphIndex is the factual layer over Obsidian `Vault` and `MetadataCache`.
- Derived GraphRAG indexes should help discover useful relationships, gaps, and
  context candidates.
- Recommendation and ranking policy should stay above GraphIndex, not inside it.

That future layer should help new knowledge emerge from the user's notes. It
should not silently auto-inject context or turn the vault graph into a hidden
echo chamber.

## Reporting Issues

When reporting a problem, include:

- Obsidian version and OS.
- OpenCode version.
- Plugin version.
- Start mode: path mode or custom command.
- The exact custom command or executable path if relevant.
- The copied diagnostics from the plugin UI or `status.json`.
- Relevant recent lines from the XDG log.

Diagnostics intentionally avoid copying full note text.
