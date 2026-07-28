import { useCallback, useEffect, useState } from "react";
import { getLeagueSnapshot } from "../services/sleeper";
import type { LeagueSnapshot } from "../types";

interface SnapshotState {
  data: LeagueSnapshot | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

export function useLeagueSnapshot() {
  const [state, setState] = useState<SnapshotState>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });

  const refresh = useCallback(async (silent = false) => {
    setState((current) => ({
      ...current,
      error: null,
      loading: current.data ? false : true,
      refreshing: silent ? current.refreshing : true,
    }));

    try {
      const data = await getLeagueSnapshot();
      setState({
        data,
        error: null,
        loading: false,
        refreshing: false,
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

    getLeagueSnapshot(controller.signal)
      .then((data) => {
        setState({
          data,
          error: null,
          loading: false,
          refreshing: false,
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Sleeper could not be reached.",
          loading: false,
          refreshing: false,
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!state.data || state.data.draft.status !== "drafting") return;
    const timer = window.setInterval(() => void refresh(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, state.data]);

  return { ...state, refresh };
}
