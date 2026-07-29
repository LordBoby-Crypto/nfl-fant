import { useCallback, useEffect, useState } from "react";
import { getWaiverActivity } from "../services/sleeper";
import type {
  NflState,
  SleeperTransaction,
  SleeperTrendingPlayer,
} from "../types";

interface WaiverActivityState {
  state: NflState | null;
  transactions: SleeperTransaction[];
  trendingAdds: SleeperTrendingPlayer[];
  fetchedAt: number | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

const EMPTY_STATE: WaiverActivityState = {
  state: null,
  transactions: [],
  trendingAdds: [],
  fetchedAt: null,
  loading: false,
  refreshing: false,
  error: null,
};

export function useWaiverActivity(leagueId: string, active: boolean) {
  const [data, setData] = useState<WaiverActivityState>(EMPTY_STATE);

  const refresh = useCallback(async () => {
    if (!active) return;
    setData((current) => ({
      ...current,
      loading: current.fetchedAt === null,
      refreshing: current.fetchedAt !== null,
      error: null,
    }));
    try {
      const next = await getWaiverActivity(leagueId);
      setData({
        ...next,
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch (reason) {
      setData((current) => ({
        ...current,
        loading: false,
        refreshing: false,
        error:
          reason instanceof Error
            ? reason.message
            : "Sleeper waiver activity could not be loaded.",
      }));
    }
  }, [active, leagueId]);

  useEffect(() => {
    if (!active) {
      setData(EMPTY_STATE);
      return;
    }
    const controller = new AbortController();
    setData((current) => ({ ...current, loading: true, error: null }));
    getWaiverActivity(leagueId, controller.signal)
      .then((next) => {
        setData({
          ...next,
          loading: false,
          refreshing: false,
          error: null,
        });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setData((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error:
            reason instanceof Error
              ? reason.message
              : "Sleeper waiver activity could not be loaded.",
        }));
      });
    return () => controller.abort();
  }, [active, leagueId]);

  return { ...data, refresh };
}
