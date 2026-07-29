import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, requireMethod } from "./_lib/http.js";
import { hasValidSession } from "./_lib/session.js";

const API_ROOT = "https://api.fantasypros.com/public/v2/json";
const SEASON = "2026";

const DATASETS = {
  rankings: {
    path: `/nfl/${SEASON}/consensus-rankings`,
    params: { scoring: "PPR" },
    ttl: 6 * 60 * 60 * 1000,
  },
  projections: {
    path: `/nfl/${SEASON}/projections`,
    params: { scoring: "PPR", ros: "true" },
    ttl: 6 * 60 * 60 * 1000,
  },
  injuries: {
    path: "/nfl/injuries",
    params: { season: SEASON },
    ttl: 15 * 60 * 1000,
  },
  news: {
    path: "/nfl/news",
    params: {},
    ttl: 15 * 60 * 1000,
  },
  players: {
    path: "/nfl/players",
    params: {},
    ttl: 24 * 60 * 60 * 1000,
  },
} as const;

type Dataset = keyof typeof DATASETS | "weekly-projections";
type CacheEntry = {
  expiresAt: number;
  fetchedAt: string;
  value: unknown;
};

const cache = new Map<string, CacheEntry>();
const FANTASY_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"] as const;

class FantasyProsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FantasyProsError";
  }
}

function requestedDataset(request: VercelRequest): Dataset | null {
  const value = Array.isArray(request.query.dataset)
    ? request.query.dataset[0]
    : request.query.dataset;

  return value && (value in DATASETS || value === "weekly-projections")
    ? (value as Dataset)
    : null;
}

function requestedWeek(request: VercelRequest) {
  const raw = Array.isArray(request.query.week)
    ? request.query.week[0]
    : request.query.week;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 18
    ? value
    : null;
}

async function fetchFantasyPros(
  path: string,
  params: Record<string, string>,
) {
  const apiKey = process.env.FANTASYPROS_API_KEY;
  if (!apiKey) throw new Error("FantasyPros is not configured.");

  const search = new URLSearchParams(params);
  const url = `${API_ROOT}${path}${search.size ? `?${search}` : ""}`;
  let upstream: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    upstream = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
      },
    });

    if (upstream.status !== 429 || attempt === 1) break;
    const retryAfter = Number(upstream.headers.get("retry-after"));
    await new Promise((resolve) =>
      setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000),
    );
  }

  if (!upstream?.ok) {
    const status = upstream?.status ?? 502;
    throw new FantasyProsError(`FantasyPros returned ${status}.`, status);
  }

  return upstream.json() as Promise<unknown>;
}

async function fetchPositionDataset(
  dataset: "rankings" | "projections",
  path: string,
  params: Record<string, string>,
) {
  const results = await Promise.allSettled(
    FANTASY_POSITIONS.map(async (position) => ({
      position,
      value: await fetchFantasyPros(path, {
        ...params,
        position,
      }),
    })),
  );
  const positions: Record<string, unknown> = {};
  const unavailable: string[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      positions[result.value.position] = result.value.value;
    } else {
      unavailable.push(FANTASY_POSITIONS[index]);
      const reason = result.reason;
      console.warn(
        JSON.stringify({
          level: "warning",
          message: "FantasyPros position request failed",
          dataset,
          position: FANTASY_POSITIONS[index],
          status: reason instanceof FantasyProsError ? reason.status : null,
          error: reason instanceof Error ? reason.message : String(reason),
        }),
      );
    }
  });

  if (!Object.keys(positions).length) {
    throw new Error(`FantasyPros ${dataset} are temporarily unavailable.`);
  }

  return { positions, unavailable };
}

async function fetchDataset(dataset: Dataset, week: number | null) {
  const cacheKey =
    dataset === "weekly-projections"
      ? `${dataset}:${week ?? "invalid"}`
      : dataset;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  if (dataset === "weekly-projections") {
    if (!week) throw new Error("Choose an NFL week from 1 through 18.");
    const value = await fetchPositionDataset(
      "projections",
      `/nfl/${SEASON}/projections`,
      { scoring: "PPR", week: String(week) },
    );
    const entry: CacheEntry = {
      expiresAt: Date.now() + 60 * 60 * 1000,
      fetchedAt: new Date().toISOString(),
      value,
    };
    cache.set(cacheKey, entry);
    return entry;
  }

  const definition = DATASETS[dataset];
  let value: unknown;

  if (dataset === "rankings" || dataset === "projections") {
    value = await fetchPositionDataset(
      dataset,
      definition.path,
      definition.params as Record<string, string>,
    );
  } else {
    value = await fetchFantasyPros(
      definition.path,
      definition.params as Record<string, string>,
    );
  }

  const entry: CacheEntry = {
    expiresAt: Date.now() + definition.ttl,
    fetchedAt: new Date().toISOString(),
    value,
  };
  cache.set(cacheKey, entry);
  return entry;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (applyCors(request, response)) return;
  if (requireMethod(request, response, ["GET"])) return;

  response.setHeader("Cache-Control", "private, no-store");

  if (!hasValidSession(request)) {
    response.status(401).json({ error: "A valid War Room session is required." });
    return;
  }

  const dataset = requestedDataset(request);
  if (!dataset) {
    response.status(400).json({
      error:
        "Choose rankings, projections, weekly-projections, injuries, news, or players.",
    });
    return;
  }
  const week = dataset === "weekly-projections" ? requestedWeek(request) : null;
  if (dataset === "weekly-projections" && !week) {
    response.status(400).json({ error: "Choose an NFL week from 1 through 18." });
    return;
  }

  const startedAt = Date.now();
  console.log(
    JSON.stringify({
      level: "info",
      message: "Player intelligence request started",
      dataset,
      week,
      requestId: request.headers["x-vercel-id"] ?? null,
    }),
  );

  try {
    const entry = await fetchDataset(dataset, week);
    console.log(
      JSON.stringify({
        level: "info",
        message: "Player intelligence request completed",
        dataset,
        durationMs: Date.now() - startedAt,
      }),
    );
    response.status(200).json({
      attribution: "Data obtained from FantasyPros.",
      dataset,
      week,
      fetchedAt: entry.fetchedAt,
      data: entry.value,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Player intelligence request failed",
        dataset,
        ...(week ? { week } : {}),
        status: error instanceof FantasyProsError ? error.status : null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      }),
    );
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The fantasy data provider could not be reached.",
    });
  }
}
