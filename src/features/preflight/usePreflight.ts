import { useEffect, useState } from "react";
import type { PlayerIntelligence } from "../player-intelligence/model";
import {
  calculatePlayerMatchCoverage,
  getSleeperPlayerCatalog,
  type PlayerMatchCoverage,
} from "../../services/sleeper";

interface PlayerFeedState {
  coverage: PlayerMatchCoverage | null;
  error: string | null;
  loading: boolean;
  durationMs: number | null;
  attempts: number | null;
  lastSuccessfulAt: number | null;
}

export function usePreflightPlayerMatch(
  board: PlayerIntelligence[],
  active: boolean,
  refreshKey: number,
) {
  const [state, setState] = useState<PlayerFeedState>({
    coverage: null,
    error: null,
    loading: false,
    durationMs: null,
    attempts: null,
    lastSuccessfulAt: null,
  });

  useEffect(() => {
    if (!active || !board.length) return;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    getSleeperPlayerCatalog(controller.signal)
      .then((result) => {
        setState({
          coverage: calculatePlayerMatchCoverage(board, result.players),
          error: null,
          loading: false,
          durationMs: result.telemetry.durationMs,
          attempts: result.telemetry.attempts,
          lastSuccessfulAt: result.fetchedAt,
        });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState((current) => ({
          ...current,
          error:
            reason instanceof Error
              ? reason.message
              : "Sleeper player matching could not be completed.",
          loading: false,
        }));
      });
    return () => controller.abort();
  }, [active, board, refreshKey]);

  return state;
}

export function useOnlineState() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, []);
  return online;
}
