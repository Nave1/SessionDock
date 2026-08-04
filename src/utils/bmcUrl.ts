export interface BmcUrlInput {
  host: string;
  port?: number;
  useHttps?: boolean;
  path?: string;
}

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "auth",
  "authorization",
  "credential",
  "jwt",
  "key",
  "password",
  "passwd",
  "session",
  "sessionid",
  "sid",
  "ticket",
  "token",
]);

function parseHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid BMC URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BMC URLs must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("BMC URLs must not contain credentials");
  }
  return url;
}

export function normalizeBmcUrl(input: string | BmcUrlInput): string {
  if (typeof input === "string") {
    return parseHttpUrl(input.trim()).toString();
  }

  const host = input.host.trim();
  if (!host) throw new Error("BMC host is required");
  if (host.includes("://")) {
    const parsed = parseHttpUrl(host);
    if (input.path) parsed.pathname = normalizePath(input.path);
    return parsed.toString();
  }

  const scheme = input.useHttps === false ? "http" : "https";
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const port = input.port && input.port !== (scheme === "https" ? 443 : 80) ? `:${input.port}` : "";
  return parseHttpUrl(`${scheme}://${normalizedHost}${port}${normalizePath(input.path)}`).toString();
}

function normalizePath(path?: string): string {
  if (!path?.trim()) return "/";
  return path.trim().startsWith("/") ? path.trim() : `/${path.trim()}`;
}

export function hasSensitiveUrlParameters(value: string): boolean {
  const url = parseHttpUrl(value);
  return [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEYS.has(key.toLowerCase()));
}

export function redactSensitiveUrl(value: string): string {
  const url = parseHttpUrl(value);
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return url.toString();
}

export function safePersistedBmcUrl(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = normalizeBmcUrl(value);
  return hasSensitiveUrlParameters(normalized) ? undefined : normalized;
}