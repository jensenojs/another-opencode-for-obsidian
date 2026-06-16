# TUI and Obsidian plugin coexistence

The terminal OpenCode TUI can remain the main conversation surface. The Obsidian plugin should add Obsidian-native evidence and control around that conversation.

## Product boundary

The plugin owns:

- current session context visibility;
- context provenance and safe vault navigation;
- GraphIndex facts and later GraphRAG evidence;
- diagnostics for server, proxy, theme, context, and graph state;
- explicit Obsidian-side control surfaces.

The terminal TUI owns:

- fast text interaction;
- keyboard-first model conversation;
- user-specific attach workflows configured outside the default plugin path.

The plugin should not try to replace the TUI just because it embeds the OpenCode Web UI. The Web UI remains one entry point.

## Server modes

Path mode is the default plugin-owned lifecycle:

```bash
opencode serve --hostname {hostname} --port {port} --cors app://obsidian.md
```

`ServerManager` owns this process lifecycle. It resolves the executable, starts the process, checks `/global/health`, records diagnostics, and stops the process on unload.

Custom command mode is an explicit user contract. The command must include `{hostname}` and `{port}`. It may include `{cors}` and `{projectDirectory}`. The command caller owns PATH and absolute path behavior.

Your local patched branch can be used here, for example:

```bash
~/.local/opt/opencode-attach-test/bin/opencode serve --hostname {hostname} --port {port} --shutdown-after-last-client
```

That branch is not a default plugin dependency. The stable plugin contract is still the local server health endpoint and OpenCode HTTP/session APIs.

## Session identity

`CurrentContextSession` owns current session id resolution. It consumes cached iframe URL, OpenCode leaf iframe URL, and `OpenCodeClient.resolveSessionId()`.

`ContextManager`, Context Surface, GraphIndex, event bridge, permission, question, and TUI features should consume this session entry point. They should not reparse iframe URLs.

## Observable checks

Shared TUI/plugin workflows should be diagnosed through observable state:

- server mode, command, PID, health URL, stderr, and startup error from `ServerManager.getDiagnostics()`;
- XDG status and logs through harness;
- session id from `CurrentContextSession`;
- context provenance from `ContextSyncer` / `ContextProvenance`;
- graph state from future GraphIndex diagnostics.

Attach support should start as a documented custom command workflow. If the plugin later needs built-in attach/session selection, that should be a separate implementation task that consumes the same diagnostics and session resolver boundaries.

