import { describe, expect, test } from "bun:test";
import {
  checkApiUse,
  collectOpenApiOperations,
  type LocalApiUse,
} from "../../scripts/harness/bridgeReport";

const openapi = {
  openapi: "3.1.0",
  info: { version: "0.0.0-test" },
  components: {
    schemas: {
      MessageCreate: {
        type: "object",
        required: ["role", "parts"],
        properties: {
          role: { type: "string" },
          parts: { type: "array" },
          noReply: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/session/{sessionID}/message": {
      post: {
        operationId: "session.message.create",
        parameters: [{ in: "query", name: "providerID" }],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MessageCreate" },
            },
          },
        },
      },
    },
    "/global/health": {
      get: {
        operationId: "global.health",
      },
      trace: {
        operationId: "ignored.trace",
      },
    },
  },
};

function apiUse(overrides: Partial<LocalApiUse>): LocalApiUse {
  return {
    source: "src/client/OpenCodeClient.ts",
    line: 1,
    method: "post",
    rawPath: "/session/{}/message?providerID={}",
    path: "/session/{}/message",
    queryParams: ["providerID"],
    body: {
      keys: ["role", "parts", "noReply"],
      hasSpread: false,
    },
    ...overrides,
  };
}

describe("collectOpenApiOperations", () => {
  test("collects only HTTP methods from OpenAPI paths", () => {
    const operations = collectOpenApiOperations(openapi);

    expect(operations.map((operation) => `${operation.method} ${operation.path}`)).toEqual([
      "post /session/{sessionID}/message",
      "get /global/health",
    ]);
  });
});

describe("checkApiUse", () => {
  const operations = collectOpenApiOperations(openapi);

  test("matches local templated paths and declared request bodies", () => {
    expect(checkApiUse(apiUse({}), operations, openapi)).toMatchObject({
      ok: true,
      operationId: "session.message.create",
      matchedPath: "/session/{sessionID}/message",
      missingQueryParams: [],
      unknownBodyKeys: [],
      missingBodyKeys: [],
      bodyNotAllowed: false,
    });
  });

  test("reports undeclared query parameters and unknown body keys", () => {
    expect(
      checkApiUse(
        apiUse({
          rawPath: "/session/{}/message?providerID={}&extra={}",
          queryParams: ["providerID", "extra"],
          body: {
            keys: ["role", "parts", "unexpected"],
            hasSpread: false,
          },
        }),
        operations,
        openapi
      )
    ).toMatchObject({
      ok: false,
      missingQueryParams: ["extra"],
      unknownBodyKeys: ["unexpected"],
      missingBodyKeys: [],
    });
  });

  test("reports missing required body keys unless the local body has a spread", () => {
    expect(
      checkApiUse(
        apiUse({
          body: {
            keys: ["role"],
            hasSpread: false,
          },
        }),
        operations,
        openapi
      )
    ).toMatchObject({
      ok: false,
      missingBodyKeys: ["parts"],
    });

    expect(
      checkApiUse(
        apiUse({
          body: {
            keys: ["role"],
            hasSpread: true,
          },
        }),
        operations,
        openapi
      )
    ).toMatchObject({
      ok: true,
      missingBodyKeys: [],
    });
  });
});
