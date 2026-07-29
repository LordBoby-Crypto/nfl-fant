import { useCallback, useEffect, useState } from "react";
import { getWeeklyOutlook } from "../services/sleeper";
import type { WeeklyOutlook } from "../types";

interface WeeklyState {
  data: WeeklyOutlook | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

export function useWeeklyOutlook(
  leagueId: string,
  playoffWeekStart: number,
  active: boolean,
) {
  const [state, setState] = useState<WeeklyState>({
    data: null,
    error: null,
    loading: false,
    refreshing: false,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active || !leagueId) return;
    const controller = new AbortController();
    setState((current) => ({
      ...current,
      error: null,
      loading: !current.data,
      refreshing: Boolean(current.data),
    }));

    getWeeklyOutlook(leagueId, playoffWeekStart, controller.signal)
      .then((data) => {
        setState({
          data,
          error: null,
          loading: false,
          refreshing: false,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "Sleeper weekly data could not be loaded.",
          loading: false,
          refreshing: false,
        }));
      });

    return () => controller.abort();
  }, [active, leagueId, playoffWeekStart, refreshKey]);

  return { ...state, refresh };
}
