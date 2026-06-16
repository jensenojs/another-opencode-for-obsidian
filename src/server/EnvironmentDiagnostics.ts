export interface EnvironmentDiagnostics {
  platform: NodeJS.Platform;
  pathKey: string | null;
  path: string | null;
  pathEntries: string[];
  shell: string | null;
  envKeys: string[];
  secretLikeEnvKeys: string[];
}

export function collectEnvironmentDiagnostics(
  env: NodeJS.ProcessEnv = process.env
): EnvironmentDiagnostics {
  const pathKey = resolvePathKey(env);
  const path = pathKey ? (env[pathKey] ?? null) : null;
  const envKeys = Object.keys(env).sort();

  return {
    platform: process.platform,
    pathKey,
    path,
    pathEntries: splitPathEntries(path),
    shell: env.SHELL ?? env.ComSpec ?? env.COMSPEC ?? null,
    envKeys,
    secretLikeEnvKeys: envKeys.filter(isSecretLikeEnvKey),
  };
}

function resolvePathKey(env: NodeJS.ProcessEnv): string | null {
  if (typeof env.PATH === "string") {
    return "PATH";
  }
  if (typeof env.Path === "string") {
    return "Path";
  }
  return null;
}

function splitPathEntries(path: string | null): string[] {
  if (!path) {
    return [];
  }
  const separator = process.platform === "win32" ? ";" : ":";
  return path.split(separator).filter(Boolean);
}

function isSecretLikeEnvKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("key")
  );
}
