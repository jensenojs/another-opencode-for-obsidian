import { type OpenCodeClient, type OpenCodeMessage } from "../client/OpenCodeClient";
import { parseContextMessageText, type ContextMessageProvenance } from "./ContextProvenance";
import type { ContextItem } from "../types";

export type ContextSyncParams = {
  sessionId: string;
  type: ContextItem["type"];
  label: string;
  text: string;
  sourceFile: string;
  navigationSourceFile?: string;
  startLine?: number;
  endLine?: number;
};

export class ContextSyncer {
  constructor(private client: OpenCodeClient) {}

  async add(params: ContextSyncParams): Promise<ContextItem | null> {
    const createdAt = Date.now();
    const provenance: ContextMessageProvenance = {
      version: 1,
      type: params.type,
      label: params.label,
      sourceFile: params.sourceFile,
      ...(params.navigationSourceFile ? { navigationSourceFile: params.navigationSourceFile } : {}),
      startLine: params.startLine,
      endLine: params.endLine,
      textLength: params.text.length,
      createdAt,
    };
    const ref = await this.client.addContextMessage(params.sessionId, params.text, provenance);
    if (!ref) {
      return null;
    }

    return {
      id: createItemId(ref.messageId, ref.partId),
      type: params.type,
      label: params.label,
      text: params.text,
      sourceFile: params.sourceFile,
      ...(params.navigationSourceFile ? { navigationSourceFile: params.navigationSourceFile } : {}),
      startLine: params.startLine,
      endLine: params.endLine,
      messageId: ref.messageId,
      partId: ref.partId,
      textLength: params.text.length,
      provenanceStatus: "known",
      createdAt,
    };
  }

  async remove(sessionId: string, item: ContextItem): Promise<boolean> {
    if (!item.messageId || !item.partId) {
      return true;
    }

    return this.client.deleteMessage(sessionId, item.messageId);
  }

  async restore(sessionId: string): Promise<ContextItem[] | null> {
    const messages = await this.client.listSessionMessages(sessionId);
    if (!messages) {
      return null;
    }

    const restoredItems = messages.flatMap((message) => restoreItemsFromMessage(message));
    const ignoredContextMessages = messages.filter(isIgnoredPluginContextMessage);

    for (const message of ignoredContextMessages) {
      await this.client.deleteMessage(sessionId, message.info.id);
    }

    return restoredItems;
  }
}

function restoreItemsFromMessage(message: OpenCodeMessage): ContextItem[] {
  if (!isPluginContextMessage(message)) {
    return [];
  }

  return message.parts
    .filter((part) => !part.ignored)
    .flatMap((part) => {
      const parsed = parseContextMessageText(part.text!);
      if (!parsed) {
        return [];
      }
      const provenance = parsed.provenance;
      return {
        id: createItemId(message.info.id, part.id),
        type: provenance?.type ?? "manual",
        label: provenance?.label ?? "Restored context",
        text: parsed.text,
        sourceFile: provenance?.sourceFile ?? "OpenCode session",
        ...(provenance?.navigationSourceFile
          ? { navigationSourceFile: provenance.navigationSourceFile }
          : {}),
        startLine: provenance?.startLine,
        endLine: provenance?.endLine,
        messageId: message.info.id,
        partId: part.id,
        textLength: provenance?.textLength ?? parsed.text.length,
        provenanceStatus: parsed.provenanceStatus,
        createdAt: provenance?.createdAt ?? part.time?.start ?? Date.now(),
      };
    });
}

function isIgnoredPluginContextMessage(message: OpenCodeMessage): boolean {
  return isPluginContextMessage(message) && message.parts.every((part) => part.ignored);
}

function isPluginContextMessage(message: OpenCodeMessage): boolean {
  return message.parts.length > 0 && message.parts.every(isPluginContextPart);
}

function isPluginContextPart(part: OpenCodeMessage["parts"][number]): boolean {
  return (
    part.type === "text" &&
    typeof part.text === "string" &&
    parseContextMessageText(part.text) !== null
  );
}

function createItemId(messageId: string, partId: string): string {
  return `${messageId}:${partId}`;
}
