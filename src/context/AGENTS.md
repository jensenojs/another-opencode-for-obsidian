# Context Module

This directory owns Obsidian context facts and lifecycle.

Current owners:

- `ContextManager.ts` coordinates Obsidian workspace/editor events, source drivers, local candidates, legacy context restore, and prompt injection.
- `ContextAutoSources.ts` turns Obsidian source observations into source results.
- `CandidateRegistry.ts` owns local candidate state: identity, included/skipped state, source clear, bounded queues, one-shot consumption, and failure status.
- `PromptContextInjector.ts` owns prompt-request-coupled injection.
- `ContextItemNavigator.ts` owns safe navigation from context evidence to existing Obsidian vault files.
- `WorkspaceContext.ts` and `ContextFormatter.ts` own workspace snapshot collection and formatting.

Context flow:

```text
Obsidian workspace/editor/vault/metadata facts
  -> source driver result
  -> CandidateRegistry
  -> prompt injector or OpenCode Web UI adapter

context evidence click
  -> ContextItemNavigator
  -> Obsidian vault / metadata / GraphIndex resolution
  -> WorkspaceLeaf.openFile
```

OpenCode Web UI details belong in `bridge/`. This module should hand over already decided context candidates or navigation requests through typed interfaces. Context source drivers should not import bridge internals; `ContextManager` or a narrow adapter boundary connects the two sides.
