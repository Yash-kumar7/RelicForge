import { env } from "../../env.js";
import {
  MeshyAuthError,
  MeshyError,
  MeshyRateLimitError,
  MeshyServerError,
  MeshyValidationError,
} from "../../lib/errors.js";

const BASE = "https://api.meshy.ai/openapi";

/**
 * The only module in the repo that knows Meshy's URL. Everything else goes
 * through the typed wrappers built on top of this.
 */
export async function meshyFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.MESHY_API_KEY}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
    });
  } catch (err) {
    throw new MeshyServerError(
      `Network failure calling ${path}: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return res;

  const body = await res.text().catch(() => "");
  const message = `${res.status} ${path}: ${body.slice(0, 400)}`;

  if (res.status === 401 || res.status === 403) throw new MeshyAuthError(message, res.status, body);
  if (res.status === 400) throw new MeshyValidationError(message, res.status, body);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 5) * 1000;
    throw new MeshyRateLimitError(message, res.status, body, retryAfter);
  }
  if (res.status >= 500) throw new MeshyServerError(message, res.status, body);
  throw new MeshyError(message, res.status, body);
}

export async function meshyJson<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const res = await meshyFetch(path, init);
  return (await res.json()) as T;
}

/** Retries only what is worth retrying, see the error taxonomy. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 1000 } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof MeshyError && err.retryable;
      if (!retryable || attempt === attempts) throw err;
      const wait =
        err instanceof MeshyRateLimitError
          ? err.retryAfterMs
          : baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastError;
}
