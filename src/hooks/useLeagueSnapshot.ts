import { useCallback, useEffect, useState } from "react";
import { getLeagueSnapshotWithTelemetry } from "../services/sleeper";
import {
  cacheLeagueSnapshot,
  readCachedLeagueSnapshot,
} from "../services/offline";
import type { LeagueSnapshot, LeagueSnapshotTelemetry } from "../types";

interface SnapshotState {
  data: LeagueSnapshot | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  telemetry: LeagueSnapshotTelemetry | null;
  lastSuccessfulAt: number | null;
}

export function useLeagueSnapshot() {
  const [cachedAtStart] = useState(readCachedLeagueSnapshot);
  const [state, setState] = useState<SnapshotState>({
    data: cachedAtStart?.value ?? null,
    error: null,
    loading: true,
    refreshing: false,
    telemetry: null,
    lastSuccessfulAt: cachedAtStart?.savedAt ?? null,
  });

  const refresh = useCallback(async (silent = false) => {
    setState((current) => ({
      ...current,
      error: null,
      loading: current.data ? false : true,
      refreshing: silent ? current.refreshing : true,
    }));

    try {
      const result = await getLeagueSnapshotWithTelemetry();
      cacheLeagueSnapshot(result.snapshot);
      setState({
        data: result.snapshot,
        error: null,
        loading: false,
        refreshing: false,
        telemetry: result.telemetry,
        lastSuccessfulAt: result.snapshot.fetchedAt,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Sleeper could not be reached.",
        loading: false,
        refreshing: false,
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getLeagueSnapshotWithTelemetry(controller.signal)
      .then((result) => {
        cacheLeagueSnapshot(result.snapshot);
        setState({
          data: result.snapshot,
          error: null,
          loading: false,
          refreshing: false,
          telemetry: result.telemetry,
          lastSuccessfulAt: result.snapshot.fetchedAt,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((current) => ({
          data: current.data,
          error:
            error instanceof Error
              ? error.message
              : "Sleeper could not be reached.",
          loading: false,
          refreshing: false,
          telemetry: null,
          lastSuccessfulAt: current.lastSuccessfulAt,
        }));
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!state.data) return;
    const interval = state.data.draft.status === "drafting" ? 10_000 : 60_000;
    const timer = window.setInterval(() => void refresh(true), interval);
    return () => window.clearInterval(timer);
  }, [refresh, state.data]);

  return { ...state, refresh };
}
