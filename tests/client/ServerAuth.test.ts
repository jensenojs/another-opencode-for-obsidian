import { describe, expect, test } from "bun:test";
import { buildServerAuthHeader } from "../../src/client/ServerAuth";

describe("ServerAuth", () => {
  test("returns undefined without a password", () => {
    expect(buildServerAuthHeader(null)).toBeUndefined();
    expect(buildServerAuthHeader(undefined)).toBeUndefined();
    expect(buildServerAuthHeader("")).toBeUndefined();
  });

  test("builds a Basic header with the default opencode username", () => {
    const header = buildServerAuthHeader("secret");
    expect(header).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`);
  });
});
