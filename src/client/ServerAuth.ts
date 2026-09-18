// Shared server-auth fact: OpenCode v2 `serve` always generates a password
// (printed to stdout as "server password <pw>") and enforces HTTP Basic auth
// with username "opencode". V1 servers print no such line and are unsecured
// unless OPENCODE_SERVER_PASSWORD is set — the same header is correct there.
export function buildServerAuthHeader(password: string | null | undefined): string | undefined {
  if (!password) {
    return undefined;
  }
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

// Extracts the password that OpenCode v2 `serve` prints to stdout:
//   server password <pw>
export function parseServerPassword(stdout: string): string | null {
  return stdout.match(/server password (\S+)/)?.[1] ?? null;
}
