import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, requireMethod } from "./_lib/http.js";
import { hasValidSession } from "./_lib/session.js";

const API_ROOT = "https://api.fantasypros.com/public/v2/json";
const SEASON = "2026";

const DATASETS = {
  rankings: {
    path: `/nfl/${SEASON}/consensus-rankings`,
    params: { scoring: "PPR", position: "ALL" },
    ttl: 6 * 60 * 60 * 1000,
  },
  projections: {
    path: `/nfl/${SEASON}/projections`,
    params: { scoring: "PPR" },
    ttl: 6 * 60 * 60 * 1000,
  },
  injuries: {
    path: "/nfl/injuries",
    params: { season: SEASON, week: "draft" },
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

type Dataset = keyof typeof DATASETS;
type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<Dataset, CacheEntry>();
const PROJECTION_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"] as const;

function requestedDataset(request: VercelRequest): Dataset | null {
  const value = Array.isArray(request.query.dataset)
    ? request.query.dataset[0]
    : request.query.dataset;

  return value && value in DATASETS ? (value as Dataset) : null;
}

async function fetchFantasyPros(
  path: string,
  params: Record<string, string>,
) {
  const apiKey = process.env.FANTASYPROS_API_KEY;
  if (!apiKey) throw new Error("FantasyPros is not configured.");

  const search = new URLSearchParams(params);
  const url = `${API_ROOT}${path}${search.size ? `?${search}` : ""}`;
  const upstream = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!upstream.ok) {
    throw new Error(`FantasyPros returned ${upstream.status}.`);
  }

  return upstream.json() as Promise<unknown>;
}

async function fetchDataset(dataset: Dataset) {
  const cached = cache.get(dataset);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const definition = DATASETS[dataset];
  let value: unknown;

  if (dataset === "projections") {
    const results = await Promise.allSettled(
      PROJECTION_POSITIONS.map(async (position) => ({
        position,
        value: await fetchFantasyPros(definition.path, {
          ...definition.params,
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
        unavailable.push(PROJECTION_POSITIONS[index]);
      }
    });

    if (!Object.keys(positions).length) {
      throw new Error("FantasyPros projections are temporarily unavailable.");
    }
    value = { positions, unavailable };
  } else {
    value = await fetchFantasyPros(
      definition.path,
      definition.params as Record<string, string>,
    );
  }

  cache.set(dataset, {
    expiresAt: Date.now() + definition.ttl,
    value,
  });
  return value;
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
      error: "Choose rankings, projections, injuries, news, or players.",
    });
    return;
  }

  try {
    const data = await fetchDataset(dataset);
    response.status(200).json({
      attribution: "Data obtained from FantasyPros.",
      dataset,
      fetchedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    response.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The fantasy data provider could not be reached.",
    });
  }
}
