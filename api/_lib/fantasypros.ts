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
export const NFL_REGULAR_SEASON_START = Date.parse(
  "2026-09-09T20:20:00-04:00",
);
export const PROJECTION_FALLBACK_TTL = 15 * 60 * 1_000;

export type ProjectionMode = "preseason" | "rest-of-season";

export function projectionCacheExpiresAt(
  completedAt: number,
  ttl: number,
  mode: ProjectionMode,
  selectedAt: number,
) {
  const normalExpiry = completedAt + ttl;
  if (mode !== "preseason") return normalExpiry;
  if (selectedAt < NFL_REGULAR_SEASON_START) {
    return Math.min(normalExpiry, NFL_REGULAR_SEASON_START);
  }
  return Math.min(normalExpiry, completedAt + PROJECTION_FALLBACK_TTL);
}

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

function projectionPlayerCount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const players = (value as Record<string, unknown>).players;
  return Array.isArray(players) ? players.length : 0;
}

export async function fetchSeasonProjectionDataset(
  path: string,
  params: Record<string, string>,
  now = Date.now(),
) {
  const retryBudget = { remaining: 2 };
  const baseParams = { ...params };
  delete baseParams.week;
  delete baseParams.ros;

  const preseason = {
    mode: "preseason",
    params: { ...baseParams, week: "0" },
  } as const;
  const restOfSeason = {
    mode: "rest-of-season",
    params: { ...baseParams, ros: "true" },
  } as const;
  const attempts = now >= NFL_REGULAR_SEASON_START
    ? [restOfSeason, preseason]
    : [preseason, restOfSeason];

  for (const attempt of attempts) {
    const value = await fetchFantasyPros(
      path,
      {
        ...attempt.params,
        positions: FANTASY_PROJECTION_POSITIONS,
      },
      retryBudget,
    );
    const playerCount = projectionPlayerCount(value);
    console.log(
      JSON.stringify({
        level: "info",
        message: "FantasyPros projection response received",
        mode: attempt.mode,
        playerCount,
      }),
    );
    if (playerCount > 0) {
      return {
        positions: { combined: value },
        unavailable: [],
        mode: attempt.mode,
        selectedAt: now,
      };
    }
  }

  throw new FantasyProsError(
    "FantasyPros returned no 2026 preseason or rest-of-season projections.",
    200,
    "provider_unavailable",
  );
}
