# Context control surface

This document is the current source for context UI and interaction. It also
absorbs the still-valid context lifecycle contract from the older context
management plan.

## Background

The context surface is the Obsidian-native control surface for OpenCode
discussion evidence. It should not behave like a debug table. It should let the
user see which vault facts may influence the current session, navigate back to
the Markdown evidence, and decide which candidates should stay attached or
become attached.

The surface consumes facts from context, navigation, graph, and later event
modules. It does not parse Obsidian links, inspect iframe URLs, call OpenCode
APIs, or maintain graph state.

The original problem remains: context should not be a black box. OpenCode
context messages are injected without asking the model to answer immediately,
so the user needs an Obsidian-native way to inspect, navigate, include/exclude,
and remove that evidence.

## Goals

- Render context and candidate evidence as compact capsules.
- Keep the default view narrow and low-noise.
- Let single click navigate to the relevant Markdown evidence.
- Let double click and the right-side state icon toggle candidate inclusion.
- Keep session removal explicit and scoped to the current OpenCode session.
- Make broken links useful maintenance objects: clicking them opens the source
  Markdown position where the bad reference is written.
- Leave room for later permission, question, event, and hook signals without
  showing empty placeholder sections.

## Non-goals

- No automatic vault writes.
- No automatic context injection from GraphRAG candidates.
- No `workspace.openLinkText()` navigation from this surface.
- No link parsing or GraphIndex logic inside `ContextStatusBar`.
- No default display of audit fields such as `known`, `resolved`, character
  count, message id, part id, or created time.
- No permanent empty candidate, hooks, or diagnostics sections.

## Context Lifecycle Contract

Each active context item corresponds to an OpenCode message text part owned by
this plugin.

- `ContextSyncer` writes context messages through `OpenCodeClient`.
- New context message text starts with the `<!-- oc-ctx -->` marker.
- New context message text contains an `oc-ctx-provenance` JSON comment with
  source path, range, type, label, text length, and creation time.
- Ignoring/removing active context patches the remote part as ignored. It is
  scoped to the current session and does not delete vault content.
- `ContextManager` owns context item lifecycle and active item snapshots.
- `ContextStatusBar` receives snapshots and renders them; it does not write
  remote context itself.

Restore rules:

- A restored part with valid provenance becomes `provenanceStatus: "known"`.
- A restored part with only the marker or invalid provenance becomes
  `provenanceStatus: "uncertain"`.
- Uncertain provenance must stay visible as uncertain. The UI must not pretend
  it knows the vault source.
- Diagnostics can include source, range, text length, message id, part id,
  provenance status, and navigation resolution. Diagnostics must not copy the
  full note text by default.

The marker and provenance format have a single source in
`ContextProvenance`. Do not duplicate this format in UI code.

## Runtime Flow

```text
Obsidian command or auto source
  -> ContextManager
  -> ContextSyncer
  -> OpenCodeClient
  -> OpenCode session message part
  -> ContextStatusBar renders current snapshot

OpenCode session restore
  -> ContextManager
  -> ContextSyncer.restore()
  -> ContextProvenance.parse()
  -> ContextStatusBar renders known or uncertain context

Capsule click
  -> ContextStatusBar delegated open action
  -> ContextItemNavigator or GraphIndex-backed navigator
  -> open existing target or source occurrence
```

Implementation should keep these directions separate. The surface can ask for
navigation, toggling, diagnostics, and removal. It should not reach across the
boundary and perform those responsibilities itself.

## Stable Source APIs

The stable Obsidian facts come from the local `obsidian` dependency:

- `MetadataCache.getFirstLinkpathDest(linkpath, sourcePath)` resolves a linkpath
  to an existing `TFile` when Obsidian can resolve it.
- `MetadataCache.resolvedLinks` and `MetadataCache.unresolvedLinks` provide
  source-to-target link facts, but only as aggregate counts.
- `CachedMetadata.links`, `embeds`, `headings`, `blocks`, and cache positions
  provide reference occurrences and Markdown locations.
- `parseLinktext(linktext)` splits a linktext into path and subpath.
- `resolveSubpath(cache, subpath)` resolves heading, block, and footnote
  subpaths from a file cache.

The long-lived resolver should consume these facts through `GraphIndex` or a
GraphIndex-backed navigator. The surface itself should receive a resolved action
shape and render it.

## Evidence Model

The surface should treat rows as evidence capsules. The row can represent:

- active context already attached to the current OpenCode session;
- candidate context that could be attached;
- broken-link evidence from GraphIndex;
- later OpenCode signals such as permission, question, event, or hook state.

The same capsule visual language can serve all of them, but the action semantics
must remain distinct.

### Active Context

An active context capsule is already present in the OpenCode session.

- Single click navigates to the evidence source.
- Double click toggles local inclusion/dim state when that state is available.
- The right-side remove icon ignores/removes the remote context part from the
  current session.
- Removal never deletes a vault file and never claims to undo historical model
  output.

### Candidate Context

A candidate capsule has not been committed as active session context.

- Candidate capsules default to included.
- Double click toggles included/excluded.
- The right-side state icon performs the same toggle for discoverability.
- Excluded candidates dim in place instead of disappearing.
- A separate explicit add/send action decides when included candidates become
  session context.

### Broken Link Evidence

A broken link capsule is a Markdown maintenance object.

- Legal target references navigate to the existing target file, heading, block,
  or footnote.
- Illegal target references navigate to the existing source Markdown occurrence
  where the bad reference is written.
- If the source occurrence is unavailable, the capsule can only expand details;
  it must not attempt to open or create the missing target.
- The visual abnormal state is a small warning accent, such as an orange dot or
  left rail. The default capsule should not print a long explanation.

## Default UI

The default popover should be compact:

- width: about `320px` to `360px`;
- one slim header;
- one vertical list of capsules;
- no empty candidate or signal section;
- no permanent diagnostics table.

Default active context:

```text
OpenCode                  ctx 1    [diagnostics]

[ Workspace context                 [remove] ]
  Obsidian workspace
```

Default broken reference:

```text
OpenCode                  ctx 1    [diagnostics]

[ Broken link                         [!] ]
  A.md:42 -> MissingNote
```

The warning icon or accent is enough in the default row. Clicking the capsule
opens the source occurrence. Expanding details can show `missing target`,
`unresolved heading`, `unresolved block`, or other reason text.

## Details

Audit information belongs in details or diagnostics, not the default capsule.

Details can include:

- context type;
- provenance status;
- navigation resolution;
- source path and source position;
- target path and target subpath;
- character count;
- message id and part id;
- created time.

Diagnostics can copy these structured fields, but must not copy note text or
conversation text by default.

## StatusBar Boundary

`ContextStatusBar` owns visual rendering and local interaction:

- render capsule rows;
- call provided navigation/open actions;
- call provided toggle/remove actions;
- copy diagnostics through shared formatters;
- show details for the selected capsule.

`ContextStatusBar` must not:

- parse wikilinks;
- consume `MetadataCache` directly;
- call `workspace.openLinkText()`;
- call OpenCode HTTP APIs;
- maintain graph indexes;
- decide GraphRAG ranking or candidate generation.

This keeps the surface replaceable. It can host context, candidates, and later
signals while GraphIndex, ContextManager, and event bridge modules own the facts.

## Acceptance

- Normal capsules only show title and source in the default view.
- Healthy states such as `known` and `resolved` do not render by default.
- Abnormal states render as a compact warning accent.
- Single click navigates through `ContextItemNavigator` or a
  GraphIndex-backed equivalent.
- Illegal references navigate to their source Markdown occurrence when that
  occurrence is known.
- Double click and the right-side state icon toggle candidate inclusion where
  the row is a candidate.
- Active context removal remains an explicit session-scoped action.
- Empty candidate, hooks, and diagnostics sections are not rendered.
- Tests cover legal target navigation, illegal source-occurrence navigation,
  toggle state, remove action, and diagnostics redaction.
