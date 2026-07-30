import { useCallback, useEffect, useRef, useState } from "react";
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
import type { LeagueScoringContext } from "./scoring.ts";
import {
  cachePlayerBoard,
  readCachedPlayerBoard,
  selectRecoverablePlayerBoard,
} from "../../services/offline";

const DATASETS: IntelligenceDataset[] = [
  "rankings",
  "projections",
  "injuries",
  "news",
  "players",
];

export function useWarRoom(
  active: boolean,
  weeklyProjectionWeek: number | null = null,
  scoringContext:
    | (LeagueScoringContext & { fingerprint?: string })
    | null = null,
) {
  const [session, setSession] = useState<WarRoomSession | null>(() =>
    readWarRoomSession(),
  );
  const [cachedAtStart] = useState(readCachedPlayerBoard);
  const [board, setBoard] = useState<PlayerBoardData | null>(
    () => cachedAtStart?.value ?? null,
  );
  const boardRef = useRef(board);
  const [weeklyBoard, setWeeklyBoard] = useState<PlayerBoardData | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<number | null>(null);
  const [usingCachedBoard, setUsingCachedBoard] = useState(Boolean(cachedAtStart));
  const [cachedBoardSavedAt, setCachedBoardSavedAt] = useState<number | null>(
    cachedAtStart?.savedAt ?? null,
  );

  const lock = useCallback(() => {
    clearWarRoomSession();
    setSession(null);
    setWeeklyBoard(null);
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
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    if (!active || !session) return;
    const controller = new AbortController();
    setLoadingData(true);
    setDataError(null);

    const requestedDatasets = weeklyProjectionWeek
      ? [...DATASETS, "weekly-projections" as const]
      : DATASETS;

    Promise.allSettled(
      requestedDatasets.map((dataset) =>
        getIntelligenceDataset(
          dataset,
          session.token,
          controller.signal,
          dataset === "weekly-projections" ? weeklyProjectionWeek ?? undefined : undefined,
        ),
      ),
    )
      .then((results) => {
        const responses: IntelligenceResponse[] = [];
        const failures: Partial<Record<IntelligenceDataset, string>> = {};
        let unauthorized = false;

        results.forEach((result, index) => {
          const dataset = requestedDatasets[index];
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

        const nextBoard = buildPlayerBoard(
          responses,
          failures,
          scoringContext,
        );
        const hasFreshRankings = responses.some(
          (response) => response.dataset === "rankings",
        );
        const selection = selectRecoverablePlayerBoard(
          boardRef.current,
          nextBoard,
          hasFreshRankings,
        );
        boardRef.current = selection.value;
        setBoard(selection.value);
        setUsingCachedBoard(selection.usingCachedBoard);
        if (hasFreshRankings && nextBoard.players.length) {
          cachePlayerBoard(nextBoard);
          setCachedBoardSavedAt(Date.now());
        }
        if (responses.length) setLastSuccessfulAt(Date.now());
        const weeklyProjection = responses.find(
          (response) => response.dataset === "weekly-projections",
        );
        if (weeklyProjection) {
          const weeklyResponses: IntelligenceResponse[] = [
            ...responses.filter(
              (response) =>
                response.dataset !== "projections" &&
                response.dataset !== "weekly-projections",
            ),
            {
              ...weeklyProjection,
              dataset: "projections",
            },
          ];
          const weeklyFailures = { ...failures };
          if (failures["weekly-projections"]) {
            weeklyFailures.projections = failures["weekly-projections"];
          }
          setWeeklyBoard(
            buildPlayerBoard(
              weeklyResponses,
              weeklyFailures,
              scoringContext,
            ),
          );
        } else if (weeklyProjectionWeek) {
          const weeklyFailures = {
            ...failures,
            projections:
              failures["weekly-projections"] ??
              "Weekly projections are not published yet.",
          };
          setWeeklyBoard(
            buildPlayerBoard(
              responses.filter(
                (response) => response.dataset !== "projections",
              ),
              weeklyFailures,
              scoringContext,
            ),
          );
        } else {
          setWeeklyBoard(null);
        }
        if (!responses.length) {
          setDataError("FantasyPros did not return any player data.");
        } else if (!nextBoard.players.length) {
          setDataError(
            failures.rankings ??
              "FantasyPros did not return a usable 2026 consensus rankings board.",
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
  }, [
    active,
    lock,
    refreshKey,
    scoringContext,
    scoringContext?.fingerprint,
    session,
    weeklyProjectionWeek,
  ]);

  return {
    board,
    weeklyBoard,
    dataError,
    isUnlocked: Boolean(session),
    loadingData,
    loggingIn,
    login,
    loginError,
    lock,
    refresh,
    sessionExpiresAt: session?.expiresAt ?? null,
    lastSuccessfulAt,
    usingCachedBoard,
    cachedBoardSavedAt,
  };
}
