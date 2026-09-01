const API_ROOT = "https://api.fantasypros.com/public/v2/json";

export const FANTASY_RANKING_POSITIONS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DST",
] as const;
const FANTASY_PROJECTION_POSITIONS = "QB:RB:WR:TE:K:DST:DL:LB:DB";

export type ProviderErrorCode =
  | "provider_access_denied"
  | "provider_rate_limited"
  | "provider_unavailable";

export class FantasyProsError extends Error {
  readonly status: number;
  readonly code: ProviderErrorCode;

  constructor(message: string, status: number, code: ProviderErrorCode) {
    super(message);
    this.name = "FantasyProsError";
    this.status = status;
    this.code = code;
  }
}

function providerError(status: number) {
  if (status === 401 || status === 402 || status === 403) {
    return new FantasyProsError(
      "FantasyPros rejected the production API key. Confirm that the key is active and includes personal production access.",
      status,
      "provider_access_denied",
    );
  }
  if (status === 429) {
    return new FantasyProsError(
      "FantasyPros rate limit reached. The last saved board remains available; try again after the provider limit resets.",
      status,
      "provider_rate_limited",
    );
  }
  return new FantasyProsError(
    `FantasyPros is temporarily unavailable (provider status ${status}).`,
    status,
    "provider_unavailable",
  );
}

export async function fetchFantasyPros(
  path: string,
  params: Record<string, string>,
  retryBudget = { remaining: 2 },
) {
  const apiKey = process.env.FANTASYPROS_API_KEY;
  if (!apiKey) throw new Error("FantasyPros is not configured.");

  const search = new URLSearchParams(params);
  const url = `${API_ROOT}${path}${search.size ? `?${search}` : ""}`;
  let upstream: Response | null = null;

  for (let attempt = 0; ; attempt += 1) {
    upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
    });

    if (upstream.status !== 429 || retryBudget.remaining <= 0) break;
    retryBudget.remaining -= 1;
    const retryAfter = Number(upstream.headers.get("retry-after"));
    const backoff = 250 * 2 ** attempt;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Number.isFinite(retryAfter)
          ? Math.min(2_000, Math.max(backoff, retryAfter * 1_000))
          : backoff,
      ),
    );
  }

  if (!upstream?.ok) {
    throw providerError(upstream?.status ?? 502);
  }

  return upstream.json() as Promise<unknown>;
}

export async function fetchRankingDataset(
  path: string,
  params: Record<string, string>,
) {
  const results: PromiseSettledResult<{ position: string; value: unknown }>[] = [];
  const retryBudget = { remaining: 2 };
  for (let index = 0; index < FANTASY_RANKING_POSITIONS.length; index += 2) {
    const batch = FANTASY_RANKING_POSITIONS.slice(index, index + 2);
    const batchResults = await Promise.allSettled(
      batch.map(async (position) => ({
        position,
        value: await fetchFantasyPros(path, { ...params, position }, retryBudget),
      })),
    );
    results.push(...batchResults);
    const providerWideRateLimit = batchResults.every(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof FantasyProsError &&
        result.reason.code === "provider_rate_limited",
    );
    if (providerWideRateLimit) break;
  }
  const positions: Record<string, unknown> = {};
  const unavailable: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      positions[result.value.position] = result.value.value;
    } else {
      unavailable.push(FANTASY_RANKING_POSITIONS[index]);
      const reason = result.reason;
      console.warn(
        JSON.stringify({
          level: "warning",
          message: "FantasyPros position request failed",
          dataset: "rankings",
          position: FANTASY_RANKING_POSITIONS[index],
          status: reason instanceof FantasyProsError ? reason.status : null,
          error: reason instanceof Error ? reason.message : String(reason),
        }),
      );
    }
  });

  if (!Object.keys(positions).length) {
    const providerFailure = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected" && result.reason instanceof FantasyProsError,
    );
    if (providerFailure) throw providerFailure.reason;
    throw new Error("FantasyPros rankings are temporarily unavailable.");
  }

  return { positions, unavailable };
}

export async function fetchProjectionDataset(
  path: string,
  params: Record<string, string>,
) {
  const value = await fetchFantasyPros(path, {
    ...params,
    positions: FANTASY_PROJECTION_POSITIONS,
  });
  return { positions: { combined: value }, unavailable: [] };
}
