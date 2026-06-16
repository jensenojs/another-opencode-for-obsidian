import { describe, expect, test } from "bun:test";
import { ContextRegistry, MAX_ACTIVE_CONTEXT_ITEMS } from "../../src/context/ContextRegistry";
import type { ContextItem } from "../../src/types";

function item(id: string): ContextItem {
  return {
    id,
    type: "manual",
    label: id,
    text: id,
    sourceFile: "note.md",
    createdAt: 123,
  };
}

describe("ContextRegistry", () => {
  test("stores context items and notifies subscribers with snapshots", () => {
    const registry = new ContextRegistry();
    const seen: ContextItem[][] = [];

    const unsubscribe = registry.onItemsChanged((items) => seen.push(items));
    const first = item("first");

    registry.add(first);
    unsubscribe();
    registry.add(item("second"));

    expect(registry.getItems()).toEqual([first, item("second")]);
    expect(seen).toEqual([[], [first]]);
  });

  test("removes existing items and leaves missing ids unchanged", () => {
    const registry = new ContextRegistry();
    const first = item("first");
    const second = item("second");
    registry.add(first);
    registry.add(second);

    expect(registry.remove("missing")).toBeNull();
    expect(registry.remove("first")).toEqual(first);
    expect(registry.getItems()).toEqual([second]);
  });

  test("caps active context items", () => {
    const registry = new ContextRegistry();

    for (let index = 0; index < MAX_ACTIVE_CONTEXT_ITEMS; index += 1) {
      expect(registry.add(item(`item-${index}`))).not.toBeNull();
    }

    expect(registry.canAdd()).toBe(false);
    expect(registry.add(item("overflow"))).toBeNull();
    expect(registry.getItems()).toHaveLength(MAX_ACTIVE_CONTEXT_ITEMS);
  });

  test("replaceAll is the only restore path and applies the same cap", () => {
    const registry = new ContextRegistry();
    const restored = Array.from({ length: MAX_ACTIVE_CONTEXT_ITEMS + 2 }, (_, index) =>
      item(`restored-${index}`)
    );

    const items = registry.replaceAll(restored);

    expect(items).toHaveLength(MAX_ACTIVE_CONTEXT_ITEMS);
    expect(items[0].id).toBe("restored-0");
    expect(items[items.length - 1]?.id).toBe(`restored-${MAX_ACTIVE_CONTEXT_ITEMS - 1}`);
  });
});
