import { describe, expect, test } from "bun:test";
import {
  GraphIndex,
  type GraphFile,
  type GraphFileCache,
  type GraphPosition,
} from "../../src/graph/GraphIndex";

const pos = (line: number): GraphPosition => ({
  start: { line, col: 0, offset: line * 10 },
  end: { line, col: 5, offset: line * 10 + 5 },
});

function file(path: string): GraphFile {
  const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  return { path, basename };
}

function link(linkpath: string, line: number, original = `[[${linkpath}]]`) {
  return { link: linkpath, original, position: pos(line) };
}

function createFixture() {
  const files = new Map<string, GraphFile>([
    ["Theory/A.md", file("Theory/A.md")],
    ["Practice/B.md", file("Practice/B.md")],
    ["Practice/C.md", file("Practice/C.md")],
    ["Loose.md", file("Loose.md")],
  ]);
  const caches = new Map<string, GraphFileCache | null>([
    [
      "Theory/A.md",
      {
        links: [
          link("Practice/B", 2),
          link("Missing", 3),
          link("Practice/C#Target heading", 4),
          link("Practice/C#Missing heading", 6),
          link("Practice/C#^missing-block", 7),
          link("Practice/C#[^missing-footnote]", 8),
        ],
        embeds: [link("Practice/C#^block-a", 5, "![[Practice/C#^block-a]]")],
        headings: [{ heading: "Root", level: 1, position: pos(0) }],
      },
    ],
    [
      "Practice/B.md",
      {
        links: [link("Practice/C", 1)],
      },
    ],
    [
      "Practice/C.md",
      {
        headings: [{ heading: "Target heading", level: 2, position: pos(8) }],
        blocks: { "block-a": { id: "block-a", position: pos(9) } },
      },
    ],
    ["Loose.md", {}],
  ]);

  const resolveLinkpath = (linkpath: string): GraphFile | null => {
    const path = linkpath.endsWith(".md") ? linkpath : `${linkpath}.md`;
    return files.get(path) ?? null;
  };

  const index = new GraphIndex({
    getMarkdownFiles: () => [...files.values()],
    getFileCache: (target) => caches.get(target.path) ?? null,
    resolvedLinks: () => ({
      "Theory/A.md": {
        "Practice/B.md": 1,
        "Practice/C.md": 5,
        ...(files.has("Missing.md") ? { "Missing.md": 1 } : {}),
      },
      "Practice/B.md": { "Practice/C.md": 1 },
    }),
    unresolvedLinks: (): Record<string, Record<string, number>> =>
      files.has("Missing.md") ? {} : { "Theory/A.md": { Missing: 1 } },
    resolveLinkpath,
    resolveSubpath: (_cache, subpath) => {
      if (subpath === "Target heading" || subpath === "Target-heading") {
        return { kind: "heading", position: pos(8) };
      }
      if (subpath === "^block-a") {
        return { kind: "block", position: pos(9) };
      }
      return null;
    },
    now: () => 1000,
  });

  return { files, caches, index };
}

describe("GraphIndex", () => {
  test("bootstraps a graph snapshot from vault files and metadata cache", () => {
    const { index } = createFixture();
    const snapshot = index.bootstrap();

    expect(snapshot.stats).toMatchObject({
      nodeCount: 4,
      edgeCount: 3,
      referenceCount: 8,
      unresolvedReferenceCount: 4,
      orphanCount: 1,
      metadataPendingCount: 0,
      lastIndexedAt: 1000,
    });
    expect(snapshot.nodesByPath["Theory/A.md"]).toMatchObject({
      path: "Theory/A.md",
      basename: "A",
      folderSegments: ["Theory"],
      exists: true,
      metadataStatus: "indexed",
      inDegree: 0,
      outDegree: 2,
      unresolvedCount: 4,
    });
    expect(snapshot.outgoingBySource["Theory/A.md"]).toHaveLength(2);
    expect(snapshot.incomingByTarget["Practice/C.md"]).toHaveLength(2);
    expect(snapshot.unresolvedByLinkpath.Missing[0]).toMatchObject({
      sourcePath: "Theory/A.md",
      linkpath: "Missing",
      resolution: "unresolved",
      resolutionReason: "missing-target",
      position: pos(3),
    });
  });

  test("preserves reference occurrence evidence for resolved and unresolved references", () => {
    const { index } = createFixture();
    index.bootstrap();

    expect(index.getReferencesFrom("Theory/A.md")).toHaveLength(7);
    expect(index.getReferenceOccurrence("Theory/A.md", "Missing")).toMatchObject({
      raw: "[[Missing]]",
      linkpath: "Missing",
      position: pos(3),
      resolution: "unresolved",
      resolutionReason: "missing-target",
    });
    expect(index.getReferencesBetween("Theory/A.md", "Practice/C.md")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "link",
          subpath: "Target heading",
          subpathKind: "heading",
          subpathPosition: pos(8),
          resolution: "resolved",
          resolutionReason: "target-resolved",
        }),
        expect.objectContaining({
          kind: "embed",
          raw: "![[Practice/C#^block-a]]",
          subpath: "^block-a",
          subpathKind: "block",
          subpathPosition: pos(9),
          position: pos(5),
          resolution: "resolved",
        }),
      ])
    );
  });

  test("distinguishes unresolved heading, block, and footnote subpaths", () => {
    const { index } = createFixture();
    index.bootstrap();

    expect(index.getUnresolvedFrom("Theory/A.md")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkpath: "Practice/C",
          subpath: "Missing heading",
          subpathKind: "heading",
          targetPath: "Practice/C.md",
          position: pos(6),
          resolutionReason: "unresolved-heading",
        }),
        expect.objectContaining({
          linkpath: "Practice/C",
          subpath: "^missing-block",
          subpathKind: "block",
          targetPath: "Practice/C.md",
          position: pos(7),
          resolutionReason: "unresolved-block",
        }),
        expect.objectContaining({
          linkpath: "Practice/C",
          subpath: "[^missing-footnote]",
          subpathKind: "footnote",
          targetPath: "Practice/C.md",
          position: pos(8),
          resolutionReason: "unresolved-footnote",
        }),
      ])
    );
  });

  test("updates one source on metadata changed", () => {
    const { index } = createFixture();
    index.bootstrap();

    index.changed(file("Theory/A.md"), {
      links: [link("Practice/C", 7)],
    });

    expect(index.getOutgoing("Theory/A.md")).toHaveLength(1);
    expect(index.getReferencesBetween("Theory/A.md", "Practice/C.md")).toHaveLength(1);
    expect(index.getUnresolvedFrom("Theory/A.md")).toEqual([]);
  });

  test("refreshes resolution facts without reading note text", () => {
    const { files, index } = createFixture();
    index.bootstrap();
    files.set("Missing.md", file("Missing.md"));

    index.resolve();

    expect(index.getNode("Missing.md")).toMatchObject({
      path: "Missing.md",
      metadataStatus: "pending",
    });
    expect(index.getUnresolvedByLinkpath("Missing")).toEqual([]);
    expect(index.getReferencesBetween("Theory/A.md", "Missing.md")).toHaveLength(1);
  });

  test("deletes files and removes incident edges", () => {
    const { index } = createFixture();
    index.bootstrap();

    index.deleted(file("Practice/C.md"));

    expect(index.getNode("Practice/C.md")).toBeNull();
    expect(index.getIncoming("Practice/C.md")).toEqual([]);
    expect(index.getOutgoing("Practice/B.md")).toEqual([]);
  });

  test("renames files without waiting for metadata changed", () => {
    const { files, index } = createFixture();
    index.bootstrap();
    files.delete("Practice/B.md");
    files.set("Practice/Renamed.md", file("Practice/Renamed.md"));

    index.renamed(file("Practice/Renamed.md"), "Practice/B.md");

    expect(index.getNode("Practice/B.md")).toBeNull();
    expect(index.getNode("Practice/Renamed.md")).toMatchObject({
      path: "Practice/Renamed.md",
      metadataStatus: "indexed",
    });
  });

  test("creates pending nodes when metadata is missing", () => {
    const { files, index } = createFixture();
    index.bootstrap();
    files.set("New.md", file("New.md"));

    index.created(file("New.md"));

    expect(index.getNode("New.md")).toMatchObject({
      path: "New.md",
      metadataStatus: "pending",
    });
    expect(index.getStats().metadataPendingCount).toBe(1);
  });

  test("exposes query API for links, subpaths, neighborhood, degree, and roots", () => {
    const { index } = createFixture();
    index.bootstrap();

    expect(index.resolveLinkpath("Practice/C", "Theory/A.md")?.path).toBe("Practice/C.md");
    expect(index.resolveSubpath("Practice/C.md", "Target-heading")).toMatchObject({
      status: "resolved",
      kind: "heading",
      position: pos(8),
    });
    expect(index.resolveSubpath("Practice/C.md", "^block-a")).toMatchObject({
      status: "resolved",
      kind: "block",
      position: pos(9),
    });
    expect(index.getHeadings("Practice/C.md")).toHaveLength(1);
    expect(index.getBlocks("Practice/C.md")).toHaveLength(1);
    expect(index.getNeighborhood("Theory/A.md", { depth: 2, direction: "outgoing" })).toMatchObject(
      {
        paths: ["Theory/A.md", "Practice/B.md", "Practice/C.md"],
      }
    );
    expect(index.getOrphans().map((node) => node.path)).toEqual(["Loose.md"]);
    expect(index.topByInDegree(1)[0].path).toBe("Practice/C.md");
    expect(index.topByOutDegree(1)[0].path).toBe("Theory/A.md");
    expect(index.getCrossRootCoverage(["Theory/A.md", "Practice/B.md", "Practice/C.md"])).toEqual({
      roots: { Theory: 1, Practice: 2 },
      pathCount: 3,
    });
  });
});
