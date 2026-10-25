# Another OpenCode for Obsidian

[English](README.md) · [简体中文](README_CN.md)

Run [OpenCode](https://opencode.ai/) inside Obsidian without giving up the parts
that make Obsidian useful: panes, theme, links, context, and local diagnostics.

The plugin attaches to an OpenCode service that is already running on this
machine. It reads `~/.local/state/opencode/service*.json`, serves the Web UI
through a local proxy, and hands vault context to the prompt as file
attachments. It never starts, stops, or restarts that service.

0.6.0 is a breaking release: no plugin-managed process, v2 HTTP API only. See
[Upgrading to 0.6.0](#upgrading-to-060).

_This is a third-party fork. It is not affiliated with OpenCode or Obsidian._

## Highlights

- **Two view modes**: open OpenCode in the sidebar, or use `Mod+Shift+L` for main
  editor deep view.
- **Attach, don't manage**: pick which running OpenCode service to talk to; the
  plugin reports its `pid`, version, and URL, and reconnects on its own when the
  service comes back.
- **Obsidian-aware Web UI**: optional Obsidian-derived appearance without
  patching OpenCode component class names.
- **Vault navigation from OpenCode**: file paths, wikilinks, headings, blocks,
  footnotes, diff rows, and markdown paths open existing Obsidian notes.
- **Context as prompt files**: included workspace and selection candidates are
  attached to the next prompt as `data:` file attachments.
- **Useful diagnostics**: service attach state, event stream state, theme state,
  and XDG status files are available from the plugin.

## Quick Links

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Settings](#settings)
- [Diagnostics](#diagnostics)
- [Possible Future Work](#possible-future-work)

## What This Plugin Does Differently

### OpenCode is usable inside Obsidian

The main work in this fork is integration. OpenCode remains OpenCode: its Web UI is still the conversation surface, and the plugin does not replace it with a custom chat view. The plugin handles the parts that only Obsidian can know.

| Area               | What changed in this fork                                                                                                                                                                 | Why it matters in Obsidian                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| View placement     | OpenCode can open in the sidebar or in the main editor area. The deep view command defaults to `Mod+Shift+L` and returns to the previous editor leaf when toggled again.                  | You can use OpenCode as a side panel while reading, or as a focused editor view without losing your previous note.                        |
| Theme fit          | The embedded Web UI can use OpenCode's own appearance or an Obsidian-derived appearance. Obsidian mode maps stable theme variables and avoids patching OpenCode component class names.    | The iframe does not feel like a separate app pasted over the vault, and theme fixes stay tied to stable token surfaces.                   |
| Attach control     | The plugin lists registered services (`service*.json`), verifies them with `GET /api/info`, and can pin one by file name. `auto` picks the first reachable service.                       | One predictable rule decides which OpenCode binary and version you are talking to.                                                        |
| Click navigation   | Vault paths, wikilinks, headings, blocks, footnotes, diff rows, and markdown paths shown inside OpenCode can open the existing Obsidian note. Missing targets do not create files.        | File references shown by OpenCode become usable vault navigation, while Obsidian remains the source of truth for whether a target exists. |
| Context visibility | Included workspace and selection candidates ride along with the next prompt as `data:` file attachments. The status bar shows the queue and how many attachments the last prompt carried. | You can see what context will affect the next prompt and where it came from, without a second message in the transcript.                  |
| Diagnostics        | Runtime diagnostics include service attach state, service identity, event stream state, theme state, and XDG log/status paths.                                                            | When something breaks, the plugin can say whether it failed to find a service, failed to authenticate, or lost a service mid-session.     |

The bridge only covers places where iframe state must cross into Obsidian:
theme payloads, vault navigation requests, and diagnostics. Prompt context is
not one of them: it is written into the prompt request body by the plugin
itself.

### GraphRAG is possible future work

GraphIndex already gives the plugin a factual view of vault links through Obsidian `Vault` and `MetadataCache`. GraphRAG can sit above that later, but the plugin does not depend on it being built.

For now, the product is complete enough without a ranking layer. Future GraphRAG work should be treated as personal exploration unless it directly improves the existing OpenCode-in-Obsidian workflow.

## Current Status

Works today:

- Attach to a running OpenCode v2 service and show its `pid`, version, and URL.
- Open the OpenCode Web UI in the sidebar or main editor area.
- Use either OpenCode's native appearance or an Obsidian-derived appearance.
- Open OpenCode in the sidebar, or use `Mod+Shift+L` for deep view.
- Send included Obsidian workspace and selection candidates with the next prompt
  as file attachments.
- Show queued candidates in an Obsidian status bar surface, with the last
  prompt's attachment count recorded next to them.
- Navigate context candidates back to existing vault content without creating
  missing files.
- Copy diagnostics that include service identity, attach state, event stream
  state, and runtime paths without copying note bodies.
- Show OpenCode `/api/event` activity as read-only diagnostics, and treat a
  dropped stream as the service going away.

Still experimental:

- The Obsidian-style Web UI appearance is usable, but theme compatibility
  depends on Obsidian themes, Electron rendering, and OpenCode token changes.
- Automatic context sources are useful for local workflows, but they are
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

## Upgrading to 0.6.0

0.6.0 removes the plugin's own process management.

- The plugin no longer starts `opencode serve`. Run `opencode service start`, or
  keep a service running through opencode's own service manager.
- Settings drop `port`, `hostname`, `autoStart`, `opencodePath`,
  `startupTimeout`, `customCommand`, `useCustomCommand`, and `keyboardBridge`.
  They are ignored on load and not written back; `serviceName` and
  `projectDirectory` replace them.
- The keyboard bridge and the terminal theme patch are gone. They depended on
  OpenCode Web UI bundle anchors that 2.1.3 no longer has, so shortcut ownership
  is back to being Obsidian's and OpenCode's own concern.

The plugin speaks the v2 HTTP API (`/api/*`) only and needs OpenCode 2.1 or
newer.

## Requirements

- Obsidian desktop.
- OpenCode 2.1 or newer, with its service running.
- Bun for development and local builds.

Terminal environment, `PATH`, and shell profile setup belong to the service
process now. If a service works in your terminal, the plugin reaches it.

## Basic Usage

- Run `opencode service start` once, or let opencode's own service manager keep
  it running.
- Use the ribbon icon or command palette to open the OpenCode pane.
- Use the ribbon icon, command palette, or Obsidian hotkeys to toggle the side
  pane.
- Use `Mod+Shift+L` to toggle deep view in the main editor area.
- Use the OpenCode Web UI normally.
- Add current note or selection context from Obsidian commands.
- Use the status bar context surface to inspect, toggle, or remove queued
  candidates before sending.

When no service is found, the pane shows the command to run and a reconnect
button. Once the service appears in the state directory, the plugin attaches
without restarting Obsidian.

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

### OpenCode service

- **Service**: `auto` attaches to the first registered service that answers
  `GET /api/info`. Enter a file name such as `service-zom.json` to pin the
  plugin to that service; a pinned name never falls back to another one.
- **Project directory**: the vault path sent as `directory=` on session calls.
  Leave it empty to use the vault root.

The plugin does not start a service and does not own its lifetime. Starting,
stopping, ports, providers, and MCP configuration belong to `opencode service`.

When attach fails, the settings panel shows why (no `service*.json` in the state
directory, or no reachable service among the ones found) and the XDG log path
for the full story.

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

Included candidates ride along with the next prompt as file attachments. Each
attachment is `data:text/plain;base64,<body>` named
`obsidian-context:<kind>:<label>`; the body carries the label, the source path
with line range, and the text.

First-phase sources:

- workspace clues: currently open notes and optional active location;
- selected text: recent selections, kept as one-shot candidates and removed
  after a successful send;
- manual: `Add selection to context` and `Add current note to context`.

A successful prompt request consumes one-shot candidates and keeps dynamic
workspace context available for later prompts. If the request fails, included
candidates stay local and are marked failed. The status bar records how many
attachments the last prompt carried.

Candidates live in the plugin, and there is no restore path: the vault file
remains the only truth about what a candidate points at.

Future backlink, block-reference, summary, or graph-derived sources should feed
the same candidate lifecycle instead of writing to the OpenCode session.

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

The plugin tries to keep attach failures observable. When no service is found,
the view and the settings panel show the reason, the reconnect state, and the
XDG log and status paths. The **Copy diagnostics** command includes the same
fields plus the service identity. It does not copy note text or the service
password.

When reporting a problem, include:

- Obsidian version and OS.
- OpenCode version (`opencode --version`, or `version` in `status.json`).
- Plugin version.
- Selected service name: `auto` or a pinned file such as `service-zom.json`.
- Whether the OpenCode pane restored an existing session or created a new one.
- The copied diagnostics from the plugin UI or `status.json`.
- Relevant recent lines from the XDG log.

`status.json` carries `serviceState`, `service` (`name`, `url`, `version`,
`pid`), `serviceError`, `proxyPort`, and `runtimeDiagnostics`. Those fields
separate "no service registered", "pinned service missing", and "service died
mid-session" faster than the log does.

The event stream matters here: when `GET /api/event` drops while the plugin
believes it is attached, the plugin treats that as the service going away and
switches back to the unavailable state, then retries attach every 10 seconds.
