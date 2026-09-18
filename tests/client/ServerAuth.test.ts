import { describe, expect, test } from "bun:test";
import { buildServerAuthHeader, parseServerPassword } from "../../src/client/ServerAuth";

describe("ServerAuth", () => {
  test("returns undefined without a password (v1 unsecured servers)", () => {
    expect(buildServerAuthHeader(null)).toBeUndefined();
    expect(buildServerAuthHeader(undefined)).toBeUndefined();
    expect(buildServerAuthHeader("")).toBeUndefined();
  });

  test("builds a Basic header with the default opencode username", () => {
    const header = buildServerAuthHeader("secret");
    expect(header).toBe(`Basic ${Buffer.from("opencode:secret").toString("base64")}`);
  });
});

describe("parseServerPassword", () => {
  test("extracts the password from v2 serve stdout", () => {
    expect(
      parseServerPassword("server listening on http://127.0.0.1:4096\nserver password abc-123_XY\n")
    ).toBe("abc-123_XY");
  });

  test("returns null for v1-style stdout without a password line", () => {
    expect(
      parseServerPassword("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.\n")
    ).toBeNull();
    expect(parseServerPassword("")).toBeNull();
  });
});
