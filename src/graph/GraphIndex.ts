export type GraphMetadataStatus = "indexed" | "pending" | "unavailable";
export type GraphReferenceKind = "link" | "embed";
export type GraphSubpathKind = "heading" | "block" | "footnote";
export type GraphReferenceResolution = "resolved" | "unresolved";
export type GraphReferenceResolutionReason =
  | "target-resolved"
  | "missing-target"
  | "unresolved-heading"
  | "unresolved-block"
  | "unresolved-footnote"
  | "unresolved-subpath";

export type GraphPosition = {
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
};

export type GraphHeading = {
  heading: string;
  level: number;
  position: GraphPosition;
};

export type GraphBlock = {
  id: string;
  position: GraphPosition;
};

export type GraphReference = {
  sourcePath: string;
  raw: string;
  linkpath: string;
  displayText?: string;
  kind: GraphReferenceKind;
  position: GraphPosition;
  targetPath?: string;
  subpath?: string;
  subpathKind?: GraphSubpathKind;
  subpathPosition?: GraphPosition;
  resolution: GraphReferenceResolution;
  resolutionReason: GraphReferenceResolutionReason;
};

export type GraphNode = {
  path: string;
  basename: string;
  folderSegments: string[];
  exists: boolean;
  metadataStatus: GraphMetadataStatus;
  headings: GraphHeading[];
  blocks: GraphBlock[];
  inDegree: number;
  outDegree: number;
  unresolvedCount: number;
};

export type GraphEdge = {
  sourcePath: string;
  targetPath: string;
  count: number;
  references: GraphReference[];
  kindSummary: Record<GraphReferenceKind, number>;
  subpathSummary: Record<GraphSubpathKind, number>;
};

export type GraphStats = {
  nodeCount: number;
  edgeCount: number;
  referenceCount: number;
  unresolvedReferenceCount: number;
  orphanCount: number;
  metadataPendingCount: number;
  metadataUnavailableCount: number;
  version: number;
  lastIndexedAt: number;
};

export type GraphSnapshot = {
  nodesByPath: Record<string, GraphNode>;
  referencesBySource: Record<string, GraphReference[]>;
  outgoingBySource: Record<string, GraphEdge[]>;
  incomingByTarget: Record<string, GraphEdge[]>;
  unresolvedBySource: Record<string, GraphReference[]>;
  unresolvedByLinkpath: Record<string, GraphReference[]>;
  headingsByPath: Record<string, GraphHeading[]>;
  blocksByPath: Record<string, GraphBlock[]>;
  stats: GraphStats;
  version: number;
};

export type GraphFile = {
  path: string;
  basename: string;
};

export type GraphCacheReference = {
  link: string;
  original?: string;
  displayText?: string;
  position: GraphPosition;
};

export type GraphFileCache = {
  links?: GraphCacheReference[];
  embeds?: GraphCacheReference[];
  headings?: GraphHeading[];
  blocks?: Record<string, GraphBlock>;
};

export type GraphIndexDeps = {
  getMarkdownFiles: () => GraphFile[];
  getFileCache: (file: GraphFile) => GraphFileCache | null;
  resolvedLinks: () => Record<string, Record<string, number>>;
  unresolvedLinks: () => Record<string, Record<string, number>>;
  resolveLinkpath: (linkpath: string, sourcePath: string) => GraphFile | null;
  resolveSubpath: (
    cache: GraphFileCache,
    subpath: string
  ) => { kind: GraphSubpathKind; position: GraphPosition } | null;
  now?: () => number;
};

export type GraphNeighborhoodOptions = {
  depth: 1 | 2 | 3;
  direction: "incoming" | "outgoing" | "both";
};

export type GraphNeighborhood = {
  seedPaths: string[];
  depth: 1 | 2 | 3;
  direction: "incoming" | "outgoing" | "both";
  paths: string[];
  edges: GraphEdge[];
};

export type GraphSubpathResolution =
  | {
      status: "resolved";
      path: string;
      subpath: string;
      kind: GraphSubpathKind;
      position: GraphPosition;
    }
  | { status: "unresolved"; path: string; subpath: string };

export type GraphRootCoverage = {
  roots: Record<string, number>;
  pathCount: number;
};

type StoredFile = {
  file: GraphFile;
  cache: GraphFileCache | null;
};

export class GraphIndex {
  private files = new Map<string, StoredFile>();
  private snapshot: GraphSnapshot = createEmptySnapshot(0, 0);
  private version = 0;
  private now: () => number;

  constructor(private deps: GraphIndexDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  bootstrap(): GraphSnapshot {
    this.files.clear();
    for (const file of this.deps.getMarkdownFiles()) {
      this.files.set(file.path, {
        file,
        cache: this.deps.getFileCache(file),
      });
    }
    return this.rebuild();
  }

  changed(file: GraphFile, cache: GraphFileCache): GraphSnapshot {
    this.files.set(file.path, { file, cache });
    return this.rebuild();
  }

  resolve(): GraphSnapshot {
    this.syncFilesFromDeps();
    return this.rebuild();
  }

  deleted(file: GraphFile): GraphSnapshot {
    this.files.delete(file.path);
    return this.rebuild();
  }

  renamed(file: GraphFile, oldPath: string): GraphSnapshot {
    const previous = this.files.get(oldPath);
    this.files.delete(oldPath);
    this.files.set(file.path, {
      file,
      cache: previous?.cache ?? this.deps.getFileCache(file),
    });
    return this.rebuild();
  }

  created(file: GraphFile): GraphSnapshot {
    this.files.set(file.path, {
      file,
      cache: this.deps.getFileCache(file),
    });
    return this.rebuild();
  }

  getSnapshot(): GraphSnapshot {
    return this.snapshot;
  }

  getNode(path: string): GraphNode | null {
    return this.snapshot.nodesByPath[path] ?? null;
  }

  getOutgoing(path: string): GraphEdge[] {
    return this.snapshot.outgoingBySource[path] ?? [];
  }

  getIncoming(path: string): GraphEdge[] {
    return this.snapshot.incomingByTarget[path] ?? [];
  }

  getReferencesBetween(sourcePath: string, targetPath: string): GraphReference[] {
    return this.getOutgoing(sourcePath)
      .filter((edge) => edge.targetPath === targetPath)
      .flatMap((edge) => edge.references);
  }

  getReferencesFrom(sourcePath: string): GraphReference[] {
    return this.snapshot.referencesBySource[sourcePath] ?? [];
  }

  getReferenceOccurrence(sourcePath: string, linkpath: string): GraphReference | null {
    return (
      this.getReferencesFrom(sourcePath).find((reference) => reference.linkpath === linkpath) ??
      null
    );
  }

  getUnresolvedFrom(sourcePath: string): GraphReference[] {
    return this.snapshot.unresolvedBySource[sourcePath] ?? [];
  }

  getUnresolvedByLinkpath(linkpath: string): GraphReference[] {
    return this.snapshot.unresolvedByLinkpath[linkpath] ?? [];
  }

  resolveLinkpath(linkpath: string, sourcePath: string): GraphNode | null {
    const file = this.deps.resolveLinkpath(stripSubpath(linkpath).path, sourcePath);
    return file ? this.getNode(file.path) : null;
  }

  resolveSubpath(targetPath: string, subpath: string): GraphSubpathResolution {
    const target = this.files.get(targetPath);
    const resolved = target?.cache ? this.resolveReferenceSubpath(target.cache, subpath) : null;
    return resolved
      ? {
          status: "resolved",
          path: targetPath,
          subpath,
          kind: resolved.kind,
          position: resolved.position,
        }
      : { status: "unresolved", path: targetPath, subpath };
  }

  getHeadings(path: string): GraphHeading[] {
    return this.snapshot.headingsByPath[path] ?? [];
  }

  getBlocks(path: string): GraphBlock[] {
    return this.snapshot.blocksByPath[path] ?? [];
  }

  getNeighborhood(
    seedPath: string | string[],
    options: GraphNeighborhoodOptions
  ): GraphNeighborhood {
    const seedPaths = Array.isArray(seedPath) ? seedPath : [seedPath];
    const seenPaths = new Set(seedPaths);
    const seenEdges = new Map<string, GraphEdge>();
    let frontier = seedPaths;

    for (let distance = 0; distance < options.depth; distance += 1) {
      const nextFrontier: string[] = [];
      for (const path of frontier) {
        for (const edge of this.getNeighborhoodEdges(path, options.direction)) {
          const key = `${edge.sourcePath}->${edge.targetPath}`;
          seenEdges.set(key, edge);
          const nextPath = edge.sourcePath === path ? edge.targetPath : edge.sourcePath;
          if (!seenPaths.has(nextPath)) {
            seenPaths.add(nextPath);
            nextFrontier.push(nextPath);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) {
        break;
      }
    }

    return {
      seedPaths,
      depth: options.depth,
      direction: options.direction,
      paths: [...seenPaths],
      edges: [...seenEdges.values()],
    };
  }

  getOrphans(): GraphNode[] {
    return Object.values(this.snapshot.nodesByPath).filter(
      (node) => node.inDegree === 0 && node.outDegree === 0
    );
  }

  getStats(): GraphStats {
    return this.snapshot.stats;
  }

  topByInDegree(limit: number): GraphNode[] {
    return sortByDegree(Object.values(this.snapshot.nodesByPath), "inDegree").slice(0, limit);
  }

  topByOutDegree(limit: number): GraphNode[] {
    return sortByDegree(Object.values(this.snapshot.nodesByPath), "outDegree").slice(0, limit);
  }

  getCrossRootCoverage(paths: string | string[]): GraphRootCoverage {
    const targetPaths = Array.isArray(paths) ? paths : [paths];
    const roots: Record<string, number> = {};
    for (const path of targetPaths) {
      const root = path.split("/")[0] || path;
      roots[root] = (roots[root] ?? 0) + 1;
    }
    return {
      roots,
      pathCount: targetPaths.length,
    };
  }

  private rebuild(): GraphSnapshot {
    this.version += 1;
    const nodesByPath: Record<string, GraphNode> = {};
    const references: GraphReference[] = [];
    const headingsByPath: Record<string, GraphHeading[]> = {};
    const blocksByPath: Record<string, GraphBlock[]> = {};

    for (const { file, cache } of this.files.values()) {
      const headings = cache?.headings ?? [];
      const blocks = Object.values(cache?.blocks ?? {});
      nodesByPath[file.path] = {
        path: file.path,
        basename: file.basename,
        folderSegments: getFolderSegments(file.path),
        exists: true,
        metadataStatus: cache ? "indexed" : "pending",
        headings,
        blocks,
        inDegree: 0,
        outDegree: 0,
        unresolvedCount: 0,
      };
      headingsByPath[file.path] = headings;
      blocksByPath[file.path] = blocks;
      references.push(...this.referencesFromCache(file.path, cache));
    }

    const edgeBuckets = new Map<string, GraphReference[]>();
    const referencesBySource: Record<string, GraphReference[]> = {};
    const unresolvedBySource: Record<string, GraphReference[]> = {};
    const unresolvedByLinkpath: Record<string, GraphReference[]> = {};

    for (const reference of references) {
      pushRecord(referencesBySource, reference.sourcePath, reference);
      if (reference.resolution === "resolved" && reference.targetPath) {
        const key = `${reference.sourcePath}\u0000${reference.targetPath}`;
        edgeBuckets.set(key, [...(edgeBuckets.get(key) ?? []), reference]);
      } else {
        pushRecord(unresolvedBySource, reference.sourcePath, reference);
        pushRecord(unresolvedByLinkpath, reference.linkpath, reference);
        nodesByPath[reference.sourcePath].unresolvedCount += 1;
      }
    }

    const outgoingBySource: Record<string, GraphEdge[]> = {};
    const incomingByTarget: Record<string, GraphEdge[]> = {};
    for (const bucket of edgeBuckets.values()) {
      const first = bucket[0];
      const edge: GraphEdge = {
        sourcePath: first.sourcePath,
        targetPath: first.targetPath!,
        count: bucket.length,
        references: bucket,
        kindSummary: countKinds(bucket),
        subpathSummary: countSubpaths(bucket),
      };
      pushRecord(outgoingBySource, edge.sourcePath, edge);
      pushRecord(incomingByTarget, edge.targetPath, edge);
    }

    for (const node of Object.values(nodesByPath)) {
      node.outDegree = outgoingBySource[node.path]?.length ?? 0;
      node.inDegree = incomingByTarget[node.path]?.length ?? 0;
    }

    const stats: GraphStats = {
      nodeCount: Object.keys(nodesByPath).length,
      edgeCount: edgeBuckets.size,
      referenceCount: references.length,
      unresolvedReferenceCount: Object.values(unresolvedBySource).reduce(
        (total, refs) => total + refs.length,
        0
      ),
      orphanCount: Object.values(nodesByPath).filter(
        (node) => node.inDegree === 0 && node.outDegree === 0
      ).length,
      metadataPendingCount: Object.values(nodesByPath).filter(
        (node) => node.metadataStatus === "pending"
      ).length,
      metadataUnavailableCount: Object.values(nodesByPath).filter(
        (node) => node.metadataStatus === "unavailable"
      ).length,
      version: this.version,
      lastIndexedAt: this.now(),
    };

    this.snapshot = {
      nodesByPath,
      referencesBySource,
      outgoingBySource,
      incomingByTarget,
      unresolvedBySource,
      unresolvedByLinkpath,
      headingsByPath,
      blocksByPath,
      stats,
      version: this.version,
    };
    return this.snapshot;
  }

  private referencesFromCache(sourcePath: string, cache: GraphFileCache | null): GraphReference[] {
    if (!cache) {
      return [];
    }

    return [
      ...(cache.links ?? []).map((reference) =>
        this.createReference(sourcePath, reference, "link")
      ),
      ...(cache.embeds ?? []).map((reference) =>
        this.createReference(sourcePath, reference, "embed")
      ),
    ];
  }

  private createReference(
    sourcePath: string,
    reference: GraphCacheReference,
    kind: GraphReferenceKind
  ): GraphReference {
    const stripped = stripSubpath(reference.link);
    const target = this.deps.resolveLinkpath(stripped.path, sourcePath);
    const resolvedTargets = this.deps.resolvedLinks()[sourcePath] ?? {};
    const unresolvedLinkpaths = this.deps.unresolvedLinks()[sourcePath] ?? {};
    const targetPathCandidate =
      target &&
      this.files.has(target.path) &&
      resolvedTargets[target.path] > 0 &&
      !unresolvedLinkpaths[stripped.path]
        ? target.path
        : undefined;
    const targetCache = targetPathCandidate ? this.files.get(targetPathCandidate)?.cache : null;
    const subpathResult =
      stripped.subpath && targetCache
        ? this.resolveReferenceSubpath(targetCache, stripped.subpath)
        : null;
    const targetPath = targetPathCandidate;
    const subpathKind = stripped.subpath
      ? (subpathResult?.kind ?? inferSubpathKind(stripped.subpath))
      : undefined;
    const resolution =
      targetPath && (!stripped.subpath || subpathResult) ? "resolved" : "unresolved";
    return {
      sourcePath,
      raw: reference.original ?? reference.link,
      linkpath: stripped.path,
      displayText: reference.displayText,
      kind,
      position: reference.position,
      targetPath,
      subpath: stripped.subpath,
      subpathKind,
      subpathPosition: subpathResult?.position,
      resolution,
      resolutionReason: getResolutionReason({
        targetPath,
        subpath: stripped.subpath,
        subpathKind,
        subpathResolved: Boolean(subpathResult),
      }),
    };
  }

  private resolveReferenceSubpath(
    cache: GraphFileCache,
    subpath: string
  ): { kind: GraphSubpathKind; position: GraphPosition } | null {
    return this.deps.resolveSubpath(cache, subpath);
  }

  private getNeighborhoodEdges(
    path: string,
    direction: "incoming" | "outgoing" | "both"
  ): GraphEdge[] {
    if (direction === "incoming") {
      return this.getIncoming(path);
    }
    if (direction === "outgoing") {
      return this.getOutgoing(path);
    }
    return [...this.getOutgoing(path), ...this.getIncoming(path)];
  }

  private syncFilesFromDeps(): void {
    const nextFiles = new Map<string, GraphFile>();
    for (const file of this.deps.getMarkdownFiles()) {
      nextFiles.set(file.path, file);
      if (!this.files.has(file.path)) {
        this.files.set(file.path, {
          file,
          cache: this.deps.getFileCache(file),
        });
      }
    }

    for (const path of this.files.keys()) {
      if (!nextFiles.has(path)) {
        this.files.delete(path);
      }
    }
  }
}

function createEmptySnapshot(version: number, lastIndexedAt: number): GraphSnapshot {
  return {
    nodesByPath: {},
    referencesBySource: {},
    outgoingBySource: {},
    incomingByTarget: {},
    unresolvedBySource: {},
    unresolvedByLinkpath: {},
    headingsByPath: {},
    blocksByPath: {},
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      referenceCount: 0,
      unresolvedReferenceCount: 0,
      orphanCount: 0,
      metadataPendingCount: 0,
      metadataUnavailableCount: 0,
      version,
      lastIndexedAt,
    },
    version,
  };
}

function stripSubpath(linkpath: string): { path: string; subpath?: string } {
  const subpathIndex = linkpath.indexOf("#");
  if (subpathIndex === -1) {
    return { path: linkpath };
  }
  return {
    path: linkpath.slice(0, subpathIndex),
    subpath: linkpath.slice(subpathIndex + 1),
  };
}

function inferSubpathKind(subpath: string): GraphSubpathKind {
  if (subpath.startsWith("^")) {
    return "block";
  }
  if (subpath.startsWith("[^")) {
    return "footnote";
  }
  return "heading";
}

function getFolderSegments(path: string): string[] {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1) : [];
}

function pushRecord<T>(record: Record<string, T[]>, key: string, value: T): void {
  record[key] = [...(record[key] ?? []), value];
}

function countKinds(references: GraphReference[]): Record<GraphReferenceKind, number> {
  return {
    link: references.filter((reference) => reference.kind === "link").length,
    embed: references.filter((reference) => reference.kind === "embed").length,
  };
}

function countSubpaths(references: GraphReference[]): Record<GraphSubpathKind, number> {
  return {
    heading: references.filter((reference) => reference.subpathKind === "heading").length,
    block: references.filter((reference) => reference.subpathKind === "block").length,
    footnote: references.filter((reference) => reference.subpathKind === "footnote").length,
  };
}

function sortByDegree(nodes: GraphNode[], field: "inDegree" | "outDegree"): GraphNode[] {
  return [...nodes].sort((a, b) => b[field] - a[field] || a.path.localeCompare(b.path));
}

function getResolutionReason(input: {
  targetPath?: string;
  subpath?: string;
  subpathKind?: GraphSubpathKind;
  subpathResolved: boolean;
}): GraphReferenceResolutionReason {
  if (!input.targetPath) {
    return "missing-target";
  }
  if (!input.subpath) {
    return "target-resolved";
  }
  if (input.subpathResolved) {
    return "target-resolved";
  }
  if (input.subpathKind === "heading") {
    return "unresolved-heading";
  }
  if (input.subpathKind === "block") {
    return "unresolved-block";
  }
  if (input.subpathKind === "footnote") {
    return "unresolved-footnote";
  }
  return "unresolved-subpath";
}
