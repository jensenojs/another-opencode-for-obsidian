import type { ContextItem } from "../types";

export const MAX_ACTIVE_CONTEXT_ITEMS = 50;

export class ContextRegistry {
  private items: ContextItem[] = [];
  private itemChangeCallbacks: Array<(items: ContextItem[]) => void> = [];

  getItems(): ContextItem[] {
    return [...this.items];
  }

  onItemsChanged(callback: (items: ContextItem[]) => void): () => void {
    this.itemChangeCallbacks.push(callback);
    callback(this.getItems());
    return () => {
      const index = this.itemChangeCallbacks.indexOf(callback);
      if (index >= 0) {
        this.itemChangeCallbacks.splice(index, 1);
      }
    };
  }

  canAdd(): boolean {
    return this.items.length < MAX_ACTIVE_CONTEXT_ITEMS;
  }

  add(item: ContextItem): ContextItem | null {
    if (!this.canAdd()) {
      return null;
    }

    this.items = [...this.items, item];
    this.emitItemsChanged();
    return item;
  }

  find(itemId: string): ContextItem | null {
    return this.items.find((item) => item.id === itemId) ?? null;
  }

  findAll(predicate: (item: ContextItem) => boolean): ContextItem[] {
    return this.items.filter(predicate);
  }

  remove(itemId: string): ContextItem | null {
    const item = this.find(itemId);
    if (!item) {
      return null;
    }

    this.items = this.items.filter((candidate) => candidate.id !== itemId);
    this.emitItemsChanged();
    return item;
  }

  replaceAll(items: ContextItem[]): ContextItem[] {
    this.items = items.slice(0, MAX_ACTIVE_CONTEXT_ITEMS);
    this.emitItemsChanged();
    return this.getItems();
  }

  clear(): ContextItem[] {
    return this.replaceAll([]);
  }

  private emitItemsChanged(): void {
    const items = this.getItems();
    for (const callback of this.itemChangeCallbacks) {
      callback(items);
    }
  }
}
