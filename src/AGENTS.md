# Source Owner Map

This source tree is a bridge between two local gold standards:

- Obsidian public plugin API from `node_modules/obsidian/obsidian.d.ts`.
- OpenCode local package exports, SDK output, server source, and Web UI source from the configured local checkout.

Owner map:

- `context/` owns Obsidian facts: workspace/editor events, vault files, metadata/link resolution, candidate lifecycle, and safe navigation.
- `bridge/` owns the Obsidian <-> OpenCode boundary: OpenCode Web UI proxy transport, HTML injection, iframe hooks, local iframe messages, OpenCode server event diagnostics, theme injection, and future Web UI prompt-context adapter execution.
- `client/` owns OpenCode server HTTP calls from the Obsidian plugin main process.
- `ui/` owns Obsidian ItemView rendering and user-facing Obsidian plugin controls.
- `graph/` owns Obsidian metadata facts prepared for navigation and future GraphRAG derivation.

Cross-product hooks should have a visible owner before code is added:

```text
Obsidian event/source
  -> context source / candidate
  -> OpenCode Web UI adapter
  -> bridge-injected iframe hook or future live bridge
  -> OpenCode native UI

OpenCode iframe action
  -> bridge local message
  -> Obsidian main thread validation
  -> context navigator or diagnostics

OpenCode server event
  -> OpenCodeBridge
  -> runtime diagnostics
```

If an OpenCode capability is a public package export or SDK endpoint, consume that surface. If it exists only inside OpenCode Web UI source, express it through a small adapter type in `bridge/` and keep the internal shape there.
