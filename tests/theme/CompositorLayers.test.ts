import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";

describe("Obsidian appearance compositor layers", () => {
  test("keeps editor backdrop layers out of the Obsidian host", () => {
    const styles = normalizeLineEndings(readFileSync("styles.css", "utf8"));

    expect(styles).toContain(".opencode-appearance-obsidian::before");
    expect(styles).not.toContain("contain: paint");
    expect(styles).not.toContain(".opencode-appearance-obsidian::after");
    expect(styles).toContain("background-color: transparent;");
    expect(styles).toContain("content: none;");
    expect(styles).not.toContain(
      "background-color: var(--another-opencode-for-obsidian-pane-background"
    );
    expect(styles).not.toContain(
      "background-image: var(--another-opencode-for-obsidian-editor-background-image"
    );
    expect(styles).not.toContain(".opencode-appearance-obsidian.opencode-view-running::before");
    expect(styles).not.toContain(".opencode-iframe::before");
    expect(styles).not.toContain(".opencode-iframe::after");
    expect(styles).not.toContain(".opencode-iframe-probe");
  });

  test("keeps the iframe element from painting a black Obsidian appearance backdrop", () => {
    const styles = normalizeLineEndings(readFileSync("styles.css", "utf8"));
    const viewSource = readFileSync("src/ui/OpenCodeView.ts", "utf8");
    const defaultIframeRule = ".opencode-iframe {\n  width: 100%;";
    const obsidianIframeRule =
      ".opencode-appearance-obsidian .opencode-iframe {\n  background-color: transparent;\n}";

    expect(styles).toContain(".opencode-appearance-obsidian .opencode-iframe");
    expect(styles).toContain(obsidianIframeRule);
    expect(styles.indexOf(obsidianIframeRule)).toBeGreaterThan(styles.indexOf(defaultIframeRule));
    expect(viewSource).not.toMatch(/allowtransparency\\s*:/);
    expect(viewSource).not.toContain('allowtransparency: "true"');
  });
});

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, "\n");
}
