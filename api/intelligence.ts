import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, requireMethod } from "./_lib/http.js";
import { hasValidSession } from "./_lib/session.js";
import {
  FantasyProsError,
  fetchFantasyPros,
  fetchProjectionDataset,
  fetchRankingDataset,
  fetchSeasonProjectionDataset,
  projectionCacheExpiresAt,
  type ProjectionMode,
} from "./_lib/fantasypros.js";

const SEASON = "2026";

const DATASETS = {
  rankings: {
    path: `/nfl/${SEASON}/consensus-rankings`,
    params: { scoring: "PPR" },
    ttl: 6 * 60 * 60 * 1000,
  },
  projections: {
    path: `/nfl/${SEASON}/projections`,
    params: { scoring: "PPR" },
    ttl: 6 * 60 * 60 * 1000,
  },
  injuries: {
    path: "/nfl/injuries",
    params: { year: SEASON },
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
const inFlight = new Map<string, Promise<CacheEntry>>();

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

async function loadDataset(dataset: Dataset, week: number | null) {
  const cacheKey =
    dataset === "weekly-projections"
      ? `${dataset}:${week ?? "invalid"}`
      : dataset;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  if (dataset === "weekly-projections") {
    if (!week) throw new Error("Choose an NFL week from 1 through 18.");
    const value = await fetchProjectionDataset(
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

  if (dataset === "rankings") {
    value = await fetchRankingDataset(
      definition.path,
      definition.params as Record<string, string>,
    );
  } else if (dataset === "projections") {
    value = await fetchSeasonProjectionDataset(
      definition.path,
      definition.params as Record<string, string>,
    );
  } else {
    value = await fetchFantasyPros(
      definition.path,
      definition.params as Record<string, string>,
    );
  }

  const cachedAt = Date.now();
  const projectionMode = dataset === "projections" &&
      value && typeof value === "object" && !Array.isArray(value) &&
      ((value as Record<string, unknown>).mode === "preseason" ||
        (value as Record<string, unknown>).mode === "rest-of-season")
    ? (value as { mode: ProjectionMode }).mode
    : "rest-of-season";
  const projectionSelectedAt = dataset === "projections" &&
      value && typeof value === "object" && !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).selectedAt === "number"
    ? (value as { selectedAt: number }).selectedAt
    : cachedAt;
  const entry: CacheEntry = {
    expiresAt: dataset === "projections"
      ? projectionCacheExpiresAt(
          cachedAt,
          definition.ttl,
          projectionMode,
          projectionSelectedAt,
        )
      : cachedAt + definition.ttl,
    fetchedAt: new Date().toISOString(),
    value,
  };
  cache.set(cacheKey, entry);
  return entry;
}

async function fetchDataset(dataset: Dataset, week: number | null) {
  const cacheKey = dataset === "weekly-projections"
    ? `${dataset}:${week ?? "invalid"}`
    : dataset;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = loadDataset(dataset, week).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, request);
  return request;
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
      ...(error instanceof FantasyProsError ? { code: error.code } : {}),
    });
  }
}
