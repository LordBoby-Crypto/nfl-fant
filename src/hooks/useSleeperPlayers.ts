import { useEffect, useMemo, useState } from "react";
import { getSleeperPlayersByIds } from "../services/sleeper";
import type { SleeperPlayer } from "../types";
import {
  hasCurrentSleeperPlayerData,
  sleeperPlayerIdsKey,
} from "./sleeperPlayerData";

interface PlayerState {
  players: Record<string, SleeperPlayer>;
  loading: boolean;
  error: string | null;
  loadedIdsKey: string;
}

export function useSleeperPlayers(playerIds: string[], active: boolean) {
  const idsKey = useMemo(() => sleeperPlayerIdsKey(playerIds), [playerIds]);
  const [state, setState] = useState<PlayerState>({
    players: {},
    loading: false,
    error: null,
    loadedIdsKey: "",
  });

  useEffect(() => {
    if (!active || !idsKey) {
      setState({ players: {}, loading: false, error: null, loadedIdsKey: "" });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    getSleeperPlayersByIds(idsKey.split(","), controller.signal)
      .then((players) => {
        setState({ players, loading: false, error: null, loadedIdsKey: idsKey });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error:
            reason instanceof Error
              ? reason.message
              : "Sleeper player details could not be loaded.",
        }));
      });

    return () => controller.abort();
  }, [active, idsKey]);

  return {
    ...state,
    current: hasCurrentSleeperPlayerData(state.loadedIdsKey, idsKey, active),
  };
}
