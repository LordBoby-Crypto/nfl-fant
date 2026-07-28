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
}

const API_ROOT = (import.meta.env.VITE_INTELLIGENCE_API_URL as string | undefined)
  ?.trim()
  .replace(/\/$/, "");

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
