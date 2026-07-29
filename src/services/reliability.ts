export interface RetryResult<T> {
  value: T;
  attempts: number;
  durationMs: number;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown) => boolean;
}

function abortError() {
  return new DOMException("The request was aborted.", "AbortError");
}

function wait(delayMs: number, signal?: AbortSignal) {
  if (!delayMs) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function withAutomaticRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const maxAttempts = Math.max(1, options.attempts ?? 3);
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      return {
        value: await operation(attempt),
        attempts: attempt,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
      const retry =
        attempt < maxAttempts && (options.shouldRetry?.(error) ?? true);
      if (!retry) break;
      await wait((options.baseDelayMs ?? 250) * 2 ** (attempt - 1), options.signal);
    }
  }

  throw lastError;
}
