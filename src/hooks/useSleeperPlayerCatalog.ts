import { useEffect, useState } from "react";
import { getSleeperPlayerCatalog } from "../services/sleeper";
import type { SleeperPlayer } from "../types";

interface CatalogState {
  players: Record<string, SleeperPlayer>;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_STATE: CatalogState = {
  players: {},
  fetchedAt: null,
  loading: false,
  error: null,
};

/** Loads Sleeper's catalog once so waiver candidates have exact Sleeper IDs. */
export function useSleeperPlayerCatalog(active: boolean) {
  const [state, setState] = useState<CatalogState>(EMPTY_STATE);

  useEffect(() => {
    if (!active) {
      setState(EMPTY_STATE);
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    getSleeperPlayerCatalog(controller.signal)
      .then((result) => {
        setState({
          players: result.players,
          fetchedAt: result.fetchedAt,
          loading: false,
          error: null,
        });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState((current) => ({
          ...current,
          loading: false,
          error:
            reason instanceof Error
              ? reason.message
              : "Sleeper's available-player catalog could not be loaded.",
        }));
      });
    return () => controller.abort();
  }, [active]);

  return state;
}
