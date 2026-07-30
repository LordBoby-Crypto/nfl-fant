import { validateWarRoomSession } from "./sessionState";

export interface IntelligenceStatus {
  backend: "ready";
  configured: boolean;
  provider: {
    name: string;
    season: number;
    scoring: string;
    datasets: string[];
  };
  security: {
    apiKeyExposed: boolean;
    authentication: string;
  };
  features?: {
    secureSync: boolean;
  };
}

export type IntelligenceDataset =
  | "rankings"
  | "projections"
  | "weekly-projections"
  | "injuries"
  | "news"
  | "players";

export interface IntelligenceResponse {
  attribution: string;
  dataset: IntelligenceDataset;
  fetchedAt: string;
  data: unknown;
}

export interface WarRoomSession {
  token: string;
  expiresAt: number;
}

interface SessionResponse {
  token: string;
  expiresIn: number;
}

const SESSION_STORAGE_KEY = "war-room.session.v1";

const API_ROOT = (import.meta.env.VITE_INTELLIGENCE_API_URL as string | undefined)
  ?.trim()
  .replace(/\/$/, "");

function apiUrl(path: string) {
  if (!API_ROOT) {
    throw new Error("The player-intelligence backend is not linked.");
  }
  return `${API_ROOT}${path}`;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string"
      ? body.error
      : `The War Room returned ${response.status}.`;
  } catch {
    return `The War Room returned ${response.status}.`;
  }
}

export function isIntelligenceBackendLinked() {
  return Boolean(API_ROOT);
}

export async function getIntelligenceStatus(signal?: AbortSignal) {
  if (!API_ROOT) return null;

  const response = await fetch(`${API_ROOT}/api/status`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Intelligence backend returned ${response.status}`);
  }

  return response.json() as Promise<IntelligenceStatus>;
}

export function readWarRoomSession(): WarRoomSession | null {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    const session = validateWarRoomSession(JSON.parse(stored));
    if (!session) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearWarRoomSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function createWarRoomSession(
  password: string,
  signal?: AbortSignal,
) {
  const response = await fetch(apiUrl("/api/session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const value = (await response.json()) as SessionResponse;
  if (
    typeof value.token !== "string" ||
    typeof value.expiresIn !== "number"
  ) {
    throw new Error("The War Room returned an invalid session.");
  }

  const session: WarRoomSession = {
    token: value.token,
    expiresAt: Date.now() + value.expiresIn * 1000,
  };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export async function getIntelligenceDataset(
  dataset: IntelligenceDataset,
  token: string,
  signal?: AbortSignal,
  week?: number,
) {
  const query = new URLSearchParams({ dataset });
  if (dataset === "weekly-projections" && week) {
    query.set("week", String(week));
  }
  const response = await fetch(
    apiUrl(`/api/intelligence?${query}`),
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    },
  );

  if (!response.ok) {
    const error = new Error(await errorMessage(response));
    if (response.status === 401) error.name = "WarRoomUnauthorized";
    throw error;
  }

  return response.json() as Promise<IntelligenceResponse>;
}
