import { describe, expect, test } from "bun:test";
import type { OpenCodeClient, OpenCodeMessage } from "../../src/client/OpenCodeClient";
import { formatContextMessageText } from "../../src/context/ContextProvenance";
import { ContextSyncer } from "../../src/context/ContextSyncer";
import type { ContextItem } from "../../src/types";

describe("ContextSyncer", () => {
  test("creates a ContextItem from an accepted OpenCode context message", async () => {
    const calls: Array<Parameters<OpenCodeClient["addContextMessage"]>> = [];
    const syncer = new ContextSyncer({
      addContextMessage: async (...args: Parameters<OpenCodeClient["addContextMessage"]>) => {
        calls.push(args);
        return { messageId: "msg_1", partId: "prt_1" };
      },
    } as unknown as OpenCodeClient);

    const item = await syncer.add({
      sessionId: "ses_1",
      type: "manual",
      label: "note.md:2",
      text: "selected text",
      sourceFile: "note.md",
      navigationSourceFile: "note.md",
      startLine: 2,
      endLine: 2,
    });

    expect(calls[0][0]).toBe("ses_1");
    expect(calls[0][1]).toBe("selected text");
    expect(calls[0][2]).toMatchObject({
      version: 1,
      type: "manual",
      label: "note.md:2",
      sourceFile: "note.md",
      navigationSourceFile: "note.md",
      startLine: 2,
      endLine: 2,
      textLength: "selected text".length,
    });
    expect(typeof calls[0][2]?.createdAt).toBe("number");
    expect(item).toMatchObject({
      id: "msg_1:prt_1",
      type: "manual",
      label: "note.md:2",
      text: "selected text",
      sourceFile: "note.md",
      navigationSourceFile: "note.md",
      startLine: 2,
      endLine: 2,
      messageId: "msg_1",
      partId: "prt_1",
      textLength: "selected text".length,
      provenanceStatus: "known",
    });
  });

  test("ignores remote parts before local removal", async () => {
    const ignored: string[] = [];
    const syncer = new ContextSyncer({
      ignorePart: async (sessionId: string, messageId: string, partId: string) => {
        ignored.push(`${sessionId}:${messageId}:${partId}`);
        return true;
      },
    } as unknown as OpenCodeClient);
    const item: ContextItem = {
      id: "msg_1:prt_1",
      type: "manual",
      label: "note.md",
      text: "selected text",
      sourceFile: "note.md",
      messageId: "msg_1",
      partId: "prt_1",
      createdAt: 123,
    };

    expect(await syncer.remove("ses_1", item)).toBe(true);
    expect(ignored).toEqual(["ses_1:msg_1:prt_1"]);
  });

  test("restores active plugin context messages with known provenance", async () => {
    const messages: OpenCodeMessage[] = [
      {
        info: { id: "msg_1", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_1",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: formatContextMessageText("restored", {
              version: 1,
              type: "auto",
              label: "Backlinks: note.md",
              sourceFile: "note.md",
              navigationSourceFile: "note.md",
              startLine: 3,
              endLine: 5,
              textLength: "restored".length,
              createdAt: 456,
            }),
            time: { start: 123 },
          },
          {
            id: "prt_2",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "<!-- oc-ctx -->\nignored",
            ignored: true,
          },
          {
            id: "prt_3",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "normal user message",
          },
        ],
      },
    ];
    const syncer = new ContextSyncer({
      listSessionMessages: async () => messages,
    } as unknown as OpenCodeClient);

    expect(await syncer.restore("ses_1")).toEqual([
      {
        id: "msg_1:prt_1",
        type: "auto",
        label: "Backlinks: note.md",
        text: "restored",
        sourceFile: "note.md",
        navigationSourceFile: "note.md",
        startLine: 3,
        endLine: 5,
        messageId: "msg_1",
        partId: "prt_1",
        textLength: "restored".length,
        provenanceStatus: "known",
        createdAt: 456,
      },
    ]);
  });

  test("restores old context messages as uncertain provenance and skips ignored parts", async () => {
    const messages: OpenCodeMessage[] = [
      {
        info: { id: "msg_1", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_1",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "<!-- oc-ctx -->\nrestored",
            time: { start: 123 },
          },
          {
            id: "prt_2",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: "<!-- oc-ctx -->\nignored",
            ignored: true,
          },
        ],
      },
    ];
    const syncer = new ContextSyncer({
      listSessionMessages: async () => messages,
    } as unknown as OpenCodeClient);

    expect(await syncer.restore("ses_1")).toEqual([
      {
        id: "msg_1:prt_1",
        type: "manual",
        label: "Restored context",
        text: "restored",
        sourceFile: "OpenCode session",
        messageId: "msg_1",
        partId: "prt_1",
        textLength: "restored".length,
        provenanceStatus: "uncertain",
        createdAt: 123,
      },
    ]);
  });

  test("restores invalid provenance as uncertain without trusting the encoded source", async () => {
    const messages: OpenCodeMessage[] = [
      {
        info: { id: "msg_1", sessionID: "ses_1" },
        parts: [
          {
            id: "prt_1",
            sessionID: "ses_1",
            messageID: "msg_1",
            type: "text",
            text: formatContextMessageText("changed text", {
              version: 1,
              type: "manual",
              label: "note.md",
              sourceFile: "note.md",
              navigationSourceFile: "note.md",
              startLine: 4,
              endLine: 4,
              textLength: "original text".length,
              createdAt: 456,
            }),
            time: { start: 123 },
          },
        ],
      },
    ];
    const syncer = new ContextSyncer({
      listSessionMessages: async () => messages,
    } as unknown as OpenCodeClient);

    expect(await syncer.restore("ses_1")).toEqual([
      {
        id: "msg_1:prt_1",
        type: "manual",
        label: "Restored context",
        text: "changed text",
        sourceFile: "OpenCode session",
        messageId: "msg_1",
        partId: "prt_1",
        textLength: "changed text".length,
        provenanceStatus: "uncertain",
        createdAt: 123,
      },
    ]);
  });
});
