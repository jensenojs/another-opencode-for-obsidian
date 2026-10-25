// Shared server-auth fact: the OpenCode service registers its password in the
// state file (`~/.local/state/opencode/service*.json`) and enforces HTTP Basic
// auth with username "opencode" on `/api/*`.
export function buildServerAuthHeader(password: string | null | undefined): string | undefined {
  if (!password) {
    return undefined;
  }
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}
