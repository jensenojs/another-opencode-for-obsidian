# GraphIndex mechanism contract

GraphIndex is an in-memory read model over Obsidian Vault and MetadataCache. Its truth source is the current vault files plus Obsidian metadata, not a persisted plugin database.

## Data model

Paths inside graph nodes, references, and edges use vault-relative `TFile.path` values. Diagnostics or cache code may carry vault name or vault root separately, but graph identity does not require an absolute filesystem path.

Positions preserve Obsidian cache coordinates. `CacheItem.position.start.line` and `col` are 0-based. UI surfaces convert them to 1-based display values.

Main shapes:

- `GraphNode`: path, basename, folder segments, existence, metadata status, headings, blocks, in degree, out degree, unresolved count.
- `GraphReference`: source path, raw text, linkpath, display text, kind, position, target path, subpath, subpath kind, resolution.
- `GraphEdge`: source path, target path, reference count, references, kind summary, subpath summary.
- `GraphSnapshot`: nodes, outgoing edges, incoming edges, unresolved references, headings, blocks, stats, version.

## Maintenance

`GraphIndex.bootstrap()` reads `getMarkdownFiles()` and `getFileCache(file)` and then builds a snapshot. It does not read note body text.

`changed(file, cache)` replaces one source cache and rebuilds the snapshot.

`resolve()` refreshes the current markdown file list and link resolution facts. It is used for Obsidian metadata resolve events.

`deleted(file)` removes the file and incident edges.

`renamed(file, oldPath)` remaps file identity without waiting for metadata changed.

`created(file)` adds a node. If metadata is missing, the node remains `metadataStatus: "pending"` instead of disappearing.

The first implementation rebuilds the snapshot after each event. This keeps the invariant simple: no edge can outlive the file set. If performance requires coalescing later, the public query surface should stay stable.

## Query API

The API returns graph facts:

- `getNode(path)`
- `getOutgoing(path)` / `getIncoming(path)`
- `getReferencesBetween(sourcePath, targetPath)`
- `getUnresolvedFrom(sourcePath)` / `getUnresolvedByLinkpath(linkpath)`
- `resolveLinkpath(linkpath, sourcePath)`
- `resolveSubpath(targetPath, subpath)`
- `getHeadings(path)` / `getBlocks(path)`
- `getNeighborhood(path, { depth, direction })`
- `getOrphans()`
- `getStats()`
- `topByInDegree(limit)` / `topByOutDegree(limit)`
- `getCrossRootCoverage(pathOrPaths)`

The API does not return recommendation, score, should-add-to-context, or vault write decisions. GraphRAG can consume these facts later and expose derived status separately.

## Boundary for ContextItemNavigator

`ContextItemNavigator` remains the production source-opening entry point. A later task can switch its file and subpath resolution to `GraphIndex.resolveLinkpath()` and `GraphIndex.resolveSubpath()`. The navigation surface should not introduce another resolver.

GraphIndex-backed navigation must also preserve reference occurrence evidence.
For a legal reference, navigation can open the existing target file, heading,
block, or footnote. For an illegal reference, navigation should open the
existing source Markdown occurrence where the bad reference is written. The
missing target is never opened and never created.

The fact shape needed by navigation and later GraphRAG includes:

- `sourcePath`
- raw/original link text
- `linkpath`
- optional display text
- reference kind such as link or embed
- source cache position
- resolved target path when available
- target subpath and subpath kind when present
- resolution status and reason when unresolved

This keeps broken links as maintainable Markdown evidence. The surface renders
that evidence as capsules; it does not inspect `MetadataCache` or parse links.
