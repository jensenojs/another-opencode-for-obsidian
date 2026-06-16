import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { App } from "obsidian";
import type { ContextItemNavigator as ContextItemNavigatorClass } from "../../src/context/ContextItemNavigator";
import {
  GraphIndex,
  type GraphFile,
  type GraphPosition,
  type GraphReference,
} from "../../src/graph/GraphIndex";
import type { ContextItem } from "../../src/types";

class FakeTFile {
  constructor(public path: string) {}
}

class FakeTFolder {
  constructor(public path: string) {}
}

mock.module("obsidian", () => ({
  Notice: class Notice {},
  getLinkpath: (linktext: string) => linktext.split("#", 1)[0],
  parseLinktext: (linktext: string) => {
    const subpathIndex = linktext.indexOf("#");
    if (subpathIndex === -1) {
      return { path: linktext, subpath: "" };
    }
    return {
      path: linktext.slice(0, subpathIndex),
      subpath: linktext.slice(subpathIndex + 1),
    };
  },
}));

let ContextItemNavigator: typeof ContextItemNavigatorClass;

beforeAll(async () => {
  ({ ContextItemNavigator } = await import("../../src/context/ContextItemNavigator"));
});

function createItem(
  sourceFile: string,
  startLine?: number,
  navigationSourceFile?: string
): ContextItem {
  return {
    id: "msg_1:prt_1",
    type: "manual",
    label: sourceFile,
    text: "context text",
    sourceFile,
    ...(navigationSourceFile ? { navigationSourceFile } : {}),
    startLine,
    messageId: "msg_1",
    partId: "prt_1",
    createdAt: 123,
  };
}

function createApp(files: Record<string, unknown>): {
  app: App;
  opened: Array<{ file: unknown; openState: unknown }>;
} {
  const opened: Array<{ file: unknown; openState: unknown }> = [];
  const app = {
    vault: {
      getFileByPath: (path: string) => (files[path] instanceof FakeTFile ? files[path] : null),
      getFolderByPath: (path: string) => (files[path] instanceof FakeTFolder ? files[path] : null),
    },
    workspace: {
      getLeaf: () => ({
        openFile: async (file: unknown, openState: unknown) => {
          opened.push({ file, openState });
        },
      }),
    },
  } as unknown as App;

  return { app, opened };
}

function createGraphIndex(): GraphIndex {
  const files = new Map<string, GraphFile>([
    ["source.md", { path: "source.md", basename: "source" }],
    ["target.md", { path: "target.md", basename: "target" }],
  ]);
  const index = new GraphIndex({
    getMarkdownFiles: () => [...files.values()],
    getFileCache: (file) =>
      file.path === "target.md"
        ? {
            headings: [{ heading: "Target heading", level: 2, position: pos(6) }],
            blocks: { "block-a": { id: "block-a", position: pos(7) } },
          }
        : { links: [link("Missing", 4)] },
    resolvedLinks: () => ({ "source.md": { "target.md": 1 } }),
    unresolvedLinks: () => ({ "source.md": { Missing: 1 } }),
    resolveLinkpath: (linkpath) => {
      const path = linkpath.endsWith(".md") ? linkpath : `${linkpath}.md`;
      return files.get(path) ?? null;
    },
    resolveSubpath: (_cache, subpath) => {
      if (subpath === "Target heading") {
        return { kind: "heading", position: pos(6) };
      }
      if (subpath === "^block-a") {
        return { kind: "block", position: pos(7) };
      }
      if (subpath === "[^note-a]") {
        return { kind: "footnote", position: pos(8) };
      }
      return null;
    },
  });
  index.bootstrap();
  return index;
}

function pos(line: number): GraphPosition {
  return {
    start: { line, col: 0, offset: line * 10 },
    end: { line, col: 5, offset: line * 10 + 5 },
  };
}

function link(linkpath: string, line: number) {
  return { link: linkpath, original: `[[${linkpath}]]`, position: pos(line) };
}

function reference(overrides: Partial<GraphReference>): GraphReference {
  return {
    sourcePath: "source.md",
    raw: "[[Missing]]",
    linkpath: "Missing",
    kind: "link",
    position: pos(4),
    resolution: "unresolved",
    resolutionReason: "missing-target",
    ...overrides,
  };
}

describe("ContextItemNavigator", () => {
  test("opens an existing vault file at the context start line", async () => {
    const file = new FakeTFile("note.md");
    const { app, opened } = createApp({ "note.md": file });
    const navigator = new ContextItemNavigator(app);

    await expect(navigator.open(createItem("note.md", 3))).resolves.toEqual({
      status: "opened",
      path: "note.md",
      line: 2,
    });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 2 } } }]);
  });

  test("resolves an existing source without opening it", () => {
    const file = new FakeTFile("note.md");
    const { app, opened } = createApp({ "note.md": file });
    const navigator = new ContextItemNavigator(app);

    expect(navigator.resolve(createItem("note.md", 4))).toEqual({
      status: "resolved",
      path: "note.md",
      line: 3,
    });
    expect(opened).toEqual([]);
  });

  test("opens a bridge-provided vault path through the same safe navigator", async () => {
    const file = new FakeTFile("target.md");
    const { app, opened } = createApp({ "target.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.openSource("target#Target heading")).resolves.toEqual({
      status: "opened",
      path: "target.md",
      line: 6,
    });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 6 } } }]);
  });

  test("opens a bridge-provided Obsidian wikilink with alias through the same safe navigator", async () => {
    const file = new FakeTFile("target.md");
    const { app, opened } = createApp({ "target.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.openSource("[[target#Target heading|Alias]]")).resolves.toEqual({
      status: "opened",
      path: "target.md",
      line: 6,
    });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 6 } } }]);
  });

  test("opens a bridge-provided vault path at a clicked line", async () => {
    const file = new FakeTFile("target.md");
    const { app, opened } = createApp({ "target.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.openSource("target.md", 159)).resolves.toEqual({
      status: "opened",
      path: "target.md",
      line: 158,
    });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 158 } } }]);
  });

  test("returns missing-file without opening absent sources", async () => {
    const { app, opened } = createApp({});
    const navigator = new ContextItemNavigator(app);

    await expect(navigator.open(createItem("missing.md"))).resolves.toEqual({
      status: "unresolved",
      reason: "missing-file",
      sourceFile: "missing.md",
    });
    expect(opened).toEqual([]);
  });

  test("returns folder without opening folder sources", async () => {
    const { app, opened } = createApp({ folder: new FakeTFolder("folder") });
    const navigator = new ContextItemNavigator(app);

    await expect(navigator.open(createItem("folder"))).resolves.toEqual({
      status: "unresolved",
      reason: "folder",
      sourceFile: "folder",
    });
    expect(opened).toEqual([]);
  });

  test("returns external-url without opening remote URLs", async () => {
    const { app, opened } = createApp({});
    const navigator = new ContextItemNavigator(app);

    await expect(navigator.open(createItem("https://example.com/note"))).resolves.toEqual({
      status: "unresolved",
      reason: "external-url",
      sourceFile: "https://example.com/note",
    });
    expect(opened).toEqual([]);
  });

  test("returns synthetic-source for workspace context", async () => {
    const { app, opened } = createApp({});
    const navigator = new ContextItemNavigator(app);

    await expect(navigator.open(createItem("Obsidian workspace"))).resolves.toEqual({
      status: "unresolved",
      reason: "synthetic-source",
      sourceFile: "Obsidian workspace",
    });
    expect(opened).toEqual([]);
  });

  test("opens a workspace context through its navigation source file", async () => {
    const file = new FakeTFile("note.md");
    const { app, opened } = createApp({ "note.md": file });
    const navigator = new ContextItemNavigator(app);

    await expect(
      navigator.open(createItem("Obsidian workspace", undefined, "note.md"))
    ).resolves.toEqual({
      status: "opened",
      path: "note.md",
      line: null,
    });
    expect(opened).toEqual([{ file, openState: { active: true } }]);
  });

  test("opens a resolved heading reference through GraphIndex", async () => {
    const file = new FakeTFile("target.md");
    const { app, opened } = createApp({ "target.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.open(createItem("target.md#Target heading"))).resolves.toEqual({
      status: "opened",
      path: "target.md",
      line: 6,
    });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 6 } } }]);
  });

  test("returns typed unresolved subpath reasons through GraphIndex", async () => {
    const file = new FakeTFile("note.md");
    const { app, opened } = createApp({ "note.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.open(createItem("note.md#^block"))).resolves.toEqual({
      status: "unresolved",
      reason: "unresolved-block",
      sourceFile: "note.md#^block",
      subpath: "^block",
    });
    expect(opened).toEqual([]);
  });

  test("opens a resolved GraphReference target subpath", async () => {
    const file = new FakeTFile("target.md");
    const { app, opened } = createApp({ "target.md": file });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(
      navigator.openReference(
        reference({
          targetPath: "target.md",
          subpath: "^block-a",
          subpathKind: "block",
          subpathPosition: pos(7),
          resolution: "resolved",
          resolutionReason: "target-resolved",
        })
      )
    ).resolves.toEqual({ status: "opened", path: "target.md", line: 7 });
    expect(opened).toEqual([{ file, openState: { active: true, eState: { line: 7 } } }]);
  });

  test("opens unresolved GraphReference source occurrence instead of missing target", async () => {
    const sourceFile = new FakeTFile("source.md");
    const { app, opened } = createApp({ "source.md": sourceFile });
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(navigator.openReference(reference({}))).resolves.toEqual({
      status: "opened",
      path: "source.md",
      line: 4,
    });
    expect(opened).toEqual([
      { file: sourceFile, openState: { active: true, eState: { line: 4 } } },
    ]);
  });

  test("does not open a missing GraphReference source occurrence", async () => {
    const { app, opened } = createApp({});
    const navigator = new ContextItemNavigator(app, createGraphIndex());

    await expect(
      navigator.openReference(reference({ sourcePath: "missing-source.md" }))
    ).resolves.toEqual({
      status: "unresolved",
      reason: "missing-file",
      sourceFile: "missing-source.md",
    });
    expect(opened).toEqual([]);
  });
});
