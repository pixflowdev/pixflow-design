const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 150;

export type OdProxyRetryOptions = {
  attempts?: number;
  backoffMs?: number;
  delay?: (ms: number) => Promise<void>;
};

export async function fetchOdTargetWithTransientRetry(
  request: Request,
  target: string,
  fetchImpl: typeof fetch,
  options: OdProxyRetryOptions = {},
): Promise<Response> {
  const attempts = RETRYABLE_METHODS.has(request.method)
    ? options.attempts ?? DEFAULT_ATTEMPTS
    : 1;
  const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchImpl(new Request(target, request));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const waitMs = backoffMs * attempt;
      console.warn("[open-design packaged] od:// proxy fetch failed; retrying", {
        attempt,
        attempts,
        message: error instanceof Error ? error.message : String(error),
        target,
        waitMs,
      });
      await delay(waitMs);
    }
  }
  throw lastError;
}
