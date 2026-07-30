import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLeagueSnapshotWithTelemetry,
  USER_ID,
} from "../services/sleeper";
import {
  cacheLeagueSnapshot,
  readCachedLeagueSnapshot,
} from "../services/offline";
import type { LeagueSnapshot, LeagueSnapshotTelemetry } from "../types";
import {
  buildLeagueSettingsModel,
  diffLeagueSettings,
  type SettingsChange,
} from "../features/league-settings/model";

interface SnapshotState {
  data: LeagueSnapshot | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  telemetry: LeagueSnapshotTelemetry | null;
  lastSuccessfulAt: number | null;
  settingsChanges: SettingsChange[];
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
    settingsChanges: [],
  });
  const dataRef = useRef(state.data);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setState((current) => ({
      ...current,
      error: null,
      loading: current.data ? false : true,
      refreshing: silent ? current.refreshing : true,
    }));

    try {
      const result = await getLeagueSnapshotWithTelemetry();
      cacheLeagueSnapshot(result.snapshot);
      setState((current) => {
        const previous = current.data
          ? buildLeagueSettingsModel(current.data, USER_ID)
          : null;
        const next = buildLeagueSettingsModel(result.snapshot, USER_ID);
        const changes =
          previous && previous.fingerprint !== next.fingerprint
            ? diffLeagueSettings(previous, next)
            : current.settingsChanges;
        dataRef.current = result.snapshot;
        return {
          data: result.snapshot,
          error: null,
          loading: false,
          refreshing: false,
          telemetry: result.telemetry,
          lastSuccessfulAt: result.snapshot.fetchedAt,
          settingsChanges: changes,
        };
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
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getLeagueSnapshotWithTelemetry(controller.signal)
      .then((result) => {
        cacheLeagueSnapshot(result.snapshot);
        setState((current) => {
          const previous = current.data
            ? buildLeagueSettingsModel(current.data, USER_ID)
            : null;
          const next = buildLeagueSettingsModel(result.snapshot, USER_ID);
          dataRef.current = result.snapshot;
          return {
            data: result.snapshot,
            error: null,
            loading: false,
            refreshing: false,
            telemetry: result.telemetry,
            lastSuccessfulAt: result.snapshot.fetchedAt,
            settingsChanges:
              previous && previous.fingerprint !== next.fingerprint
                ? diffLeagueSettings(previous, next)
                : current.settingsChanges,
          };
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
          settingsChanges: current.settingsChanges,
        }));
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const reconnect = () => void refresh(false);
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [refresh]);

  useEffect(() => {
    if (!state.data) return;
    const interval = state.data.draft.status === "drafting" ? 10_000 : 60_000;
    const timer = window.setInterval(() => void refresh(true), interval);
    return () => window.clearInterval(timer);
  }, [refresh, state.data]);

  const ensureFresh = useCallback(
    async (maximumAgeMs = 10_000) => {
      const snapshot = dataRef.current;
      if (!snapshot || Date.now() - snapshot.fetchedAt > maximumAgeMs) {
        await refresh(true);
      }
    },
    [refresh],
  );

  const dismissSettingsChanges = useCallback(() => {
    setState((current) => ({ ...current, settingsChanges: [] }));
  }, []);

  return {
    ...state,
    refresh,
    ensureFresh,
    dismissSettingsChanges,
  };
}
