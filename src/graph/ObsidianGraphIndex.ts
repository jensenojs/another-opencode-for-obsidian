import { TFile, resolveSubpath, type App, type CachedMetadata, type TAbstractFile } from "obsidian";
import {
  GraphIndex,
  type GraphFile,
  type GraphFileCache,
  type GraphPosition,
  type GraphSubpathKind,
} from "./GraphIndex";

export function createObsidianGraphIndex(app: App): GraphIndex {
  return new GraphIndex({
    getMarkdownFiles: () => app.vault.getMarkdownFiles(),
    getFileCache: (file) => {
      const tFile = app.vault.getFileByPath(file.path);
      return tFile ? (app.metadataCache.getFileCache(tFile) as GraphFileCache | null) : null;
    },
    resolvedLinks: () => app.metadataCache.resolvedLinks,
    unresolvedLinks: () => app.metadataCache.unresolvedLinks,
    resolveLinkpath: (linkpath, sourcePath) =>
      app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath),
    resolveSubpath: resolveObsidianSubpath,
  });
}

export function isMarkdownTFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

export function toGraphFile(file: TFile): GraphFile {
  return {
    path: file.path,
    basename: file.basename,
  };
}

function resolveObsidianSubpath(
  cache: GraphFileCache,
  subpath: string
): { kind: GraphSubpathKind; position: GraphPosition } | null {
  const result = resolveSubpath(cache as CachedMetadata, normalizeObsidianSubpath(subpath));
  if (!result) {
    return null;
  }
  return {
    kind: result.type,
    position: {
      start: result.start,
      end: result.end ?? result.start,
    },
  };
}

function normalizeObsidianSubpath(subpath: string): string {
  return subpath.startsWith("#") ? subpath : `#${subpath}`;
}
