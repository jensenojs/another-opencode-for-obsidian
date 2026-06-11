import { expect, test } from "bun:test";
import type { ContextItem, ContextSuggestion } from "../../src/types";

type UnexpectedContextItemKeys = Extract<keyof ContextItem, "sourceKey">;
const contextItemHasNoSourceKey: UnexpectedContextItemKeys extends never ? true : false = true;

test("ContextItem keeps the frozen context contract", () => {
  const item = {
    id: "ctx-1",
    type: "manual",
    label: "Selection",
    text: "selected text",
    sourceFile: "notes/example.md",
    startLine: 12,
    endLine: 14,
    messageId: "msg_1",
    partId: "part_1",
    createdAt: 1760000000000,
  } satisfies ContextItem;

  expect(item.type).toBe("manual");
  expect(contextItemHasNoSourceKey).toBe(true);
});

test("ContextSuggestion keeps the frozen suggestion contract", () => {
  const suggestion = {
    id: "suggestion-1",
    label: "Backlink",
    text: "suggested context",
    sourceFile: "notes/backlink.md",
    startLine: 3,
    endLine: 6,
    priority: 10,
  } satisfies ContextSuggestion;

  expect(suggestion.priority).toBe(10);
});
