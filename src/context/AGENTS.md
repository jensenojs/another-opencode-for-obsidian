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
  -> prompt context projection policy
  -> prompt injector or OpenCode Web UI adapter

context evidence click
  -> ContextItemNavigator
  -> Obsidian vault / metadata / GraphIndex resolution
  -> WorkspaceLeaf.openFile
```

OpenCode Web UI details belong in `bridge/`. This module should hand over already decided context candidates or navigation requests through typed interfaces. Context source drivers should not import bridge internals; `ContextManager` or a narrow adapter boundary connects the two sides.

StatusBar and OpenCode native prompt context cards are two display/control surfaces for the same candidate state:

- StatusBar toggle writes `CandidateRegistry.setIncluded(candidateId, included)`.
- OpenCode plugin-owned card close must also become `CandidateRegistry.setIncluded(candidateId, false)`.
- OpenCode native comment cards can be mirrored as `opencode-native-comment` candidates. Native comment card close also writes `CandidateRegistry.setIncluded(candidateId, false)`.
- Mirrored native comment close preserves the OpenCode comments store. It only removes the prompt context card; explicit comment deletion is a separate action.
- Candidate removal is a separate action from skipping. Removal deletes the candidate from `CandidateRegistry`; skipping keeps it recoverable.
- One-shot candidates are removed only by explicit remove or successful send consumption.
- Current workspace dynamic candidates use skip-on-next-send and are restored by `consumeSent()`. Future dynamic sources must declare their post-send policy explicitly before they share that behavior.

Do not add another local state store for StatusBar or native card visibility. If a UI needs to show whether something will be sent, derive that from `CandidateRegistry` plus bridge sync results.

Workspace active cursor and selected text are different source facts:

- Workspace owns active file/line. A collapsed editor cursor belongs under the workspace dynamic candidate and may project to one workspace native file card.
- Selection owns explicit non-empty selected text. A one-line selection is valid only when the editor range is not collapsed; same line with different `ch` positions is still a real selection.
- Do not turn plain click/cursor movement into one-shot selection candidates. If Obsidian briefly reports stale selected text while the editor range is already collapsed, ignore it as selection source input.
- Repeated or overlapping real selections are upserted in `CandidateRegistry` and should restore `included=true`, because a fresh selection is a fresh user intent.

Expected oc-ctx implementation shape:

```text
ContextSourceDriver / OpenCode native comment mirror
  -> CandidateRegistry
  -> buildPromptContextProjections()
    -> native-file-card  -> bridge/NativePromptContextBridge
    -> synthetic-text    -> PromptContextInjector
    -> status-only       -> StatusBar
```

`ContextCandidate` must carry enough typed source data to rebuild a skipped candidate. For `opencode-native-comment`, that means the original OpenCode file item fields needed to restore the card: key, path, selection, comment, commentID, commentOrigin, and preview. Do not keep that data only in a bridge-side map.

Settings switches stop sources and clear their candidates. Candidate `included=false` is a per-candidate skip state. Do not keep disabled sources running just to show skipped candidates.

`PromptContextInjector` should only consume `synthetic-text` projections. It should not read all included candidates directly once native file-card projections are enabled, because that would send the same file-like context through two paths.

Bridge sync failure belongs to projection sync state, not source fact state by default. Use candidate `status="failed"` for source discovery failures; use projection sync result for unreadable OpenCode path, key conflict, port unavailable, or bundle patch failure.
