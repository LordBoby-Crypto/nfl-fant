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
    params: { scoring: "PPR", position: "ALL" },
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

type Dataset = keyof typeof DATASETS;
type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<Dataset, CacheEntry>();

function requestedDataset(request: VercelRequest): Dataset | null {
  const value = Array.isArray(request.query.dataset)
    ? request.query.dataset[0]
    : request.query.dataset;

  return value && value in DATASETS ? (value as Dataset) : null;
}

async function fetchDataset(dataset: Dataset) {
  const cached = cache.get(dataset);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const apiKey = process.env.FANTASYPROS_API_KEY;
  if (!apiKey) throw new Error("FantasyPros is not configured.");

  const definition = DATASETS[dataset];
  const search = new URLSearchParams(definition.params);
  const url = `${API_ROOT}${definition.path}${search.size ? `?${search}` : ""}`;
  const upstream = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
  });

  if (!upstream.ok) {
    throw new Error(`FantasyPros returned ${upstream.status}.`);
  }

  const value: unknown = await upstream.json();
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
