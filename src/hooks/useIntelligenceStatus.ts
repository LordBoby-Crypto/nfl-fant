import { useEffect, useState } from "react";
import {
  getIntelligenceStatus,
  isIntelligenceBackendLinked,
  type IntelligenceStatus,
} from "../services/intelligence";

export function useIntelligenceStatus() {
  const [data, setData] = useState<IntelligenceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseTimeMs, setResponseTimeMs] = useState<number | null>(null);
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const linked = isIntelligenceBackendLinked();

  useEffect(() => {
    if (!linked) return;
    const controller = new AbortController();
    const startedAt = performance.now();
    setLoading(true);
    setError(null);

    getIntelligenceStatus(controller.signal)
      .then((next) => {
        setData(next);
        setResponseTimeMs(Math.round(performance.now() - startedAt));
        setLastSuccessfulAt(Date.now());
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The intelligence backend could not be reached.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [linked, refreshKey]);

  return {
    data,
    error,
    linked,
    loading,
    responseTimeMs,
    lastSuccessfulAt,
    refresh: () => setRefreshKey((value) => value + 1),
  };
}
