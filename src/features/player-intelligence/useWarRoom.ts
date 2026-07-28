import { useCallback, useEffect, useState } from "react";
import {
  clearWarRoomSession,
  createWarRoomSession,
  getIntelligenceDataset,
  readWarRoomSession,
  type IntelligenceDataset,
  type IntelligenceResponse,
  type WarRoomSession,
} from "../../services/intelligence";
import {
  buildPlayerBoard,
  type PlayerBoardData,
} from "./model";

const DATASETS: IntelligenceDataset[] = [
  "rankings",
  "projections",
  "injuries",
  "news",
  "players",
];

export function useWarRoom(active: boolean) {
  const [session, setSession] = useState<WarRoomSession | null>(() =>
    readWarRoomSession(),
  );
  const [board, setBoard] = useState<PlayerBoardData | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const lock = useCallback(() => {
    clearWarRoomSession();
    setSession(null);
    setBoard(null);
    setLoginError(null);
    setDataError(null);
  }, []);

  const login = useCallback(async (password: string) => {
    setLoggingIn(true);
    setLoginError(null);
    try {
      const nextSession = await createWarRoomSession(password);
      setSession(nextSession);
      return true;
    } catch (reason) {
      setLoginError(
        reason instanceof Error
          ? reason.message
          : "The War Room could not be unlocked.",
      );
      return false;
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!active || !session) return;
    const controller = new AbortController();
    setLoadingData(true);
    setDataError(null);

    Promise.allSettled(
      DATASETS.map((dataset) =>
        getIntelligenceDataset(dataset, session.token, controller.signal),
      ),
    )
      .then((results) => {
        const responses: IntelligenceResponse[] = [];
        const failures: Partial<Record<IntelligenceDataset, string>> = {};
        let unauthorized = false;

        results.forEach((result, index) => {
          const dataset = DATASETS[index];
          if (result.status === "fulfilled") {
            responses.push(result.value);
            return;
          }
          if (result.reason instanceof DOMException && result.reason.name === "AbortError") {
            return;
          }
          if (result.reason instanceof Error && result.reason.name === "WarRoomUnauthorized") {
            unauthorized = true;
          }
          failures[dataset] =
            result.reason instanceof Error
              ? result.reason.message
              : `${dataset} could not be loaded.`;
        });

        if (unauthorized) {
          lock();
          setLoginError("Your private session expired. Unlock the War Room again.");
          return;
        }

        const nextBoard = buildPlayerBoard(responses, failures);
        setBoard(nextBoard);
        if (!responses.length) {
          setDataError("FantasyPros did not return any player data.");
        } else if (!nextBoard.players.length) {
          setDataError(
            "FantasyPros responded, but its player records could not be read.",
          );
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setDataError(
          reason instanceof Error
            ? reason.message
            : "Player intelligence could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingData(false);
      });

    return () => controller.abort();
  }, [active, lock, refreshKey, session]);

  return {
    board,
    dataError,
    isUnlocked: Boolean(session),
    loadingData,
    loggingIn,
    login,
    loginError,
    lock,
    refresh,
    sessionExpiresAt: session?.expiresAt ?? null,
  };
}
