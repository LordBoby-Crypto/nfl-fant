import { useCallback, useEffect, useState } from "react";
import {
  getDraftPicksWithTelemetry,
  reconcileDraftPicks,
} from "../services/sleeper";
import type { DraftPickTelemetry, SleeperDraftPick } from "../types";

interface DraftPickState {
  picks: SleeperDraftPick[];
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  fetchedAt: number | null;
  telemetry: DraftPickTelemetry | null;
  consecutiveErrors: number;
  retainedAfterError: boolean;
}

export function useDraftPicks(
  draftId: string | null,
  status: "pre_draft" | "drafting" | "complete" | null,
  active: boolean,
) {
  const [state, setState] = useState<DraftPickState>({
    picks: [],
    error: null,
    loading: false,
    refreshing: false,
    fetchedAt: null,
    telemetry: null,
    consecutiveErrors: 0,
    retainedAfterError: false,
  });

  const refresh = useCallback(async (silent = false) => {
    if (!draftId) return;
    setState((current) => ({
      ...current,
      error: null,
      loading: current.fetchedAt === null,
      refreshing: silent ? current.refreshing : true,
    }));
    try {
      const result = await getDraftPicksWithTelemetry(draftId);
      setState((current) => {
        const reconciled = reconcileDraftPicks(current.picks, result.picks);
        return {
          picks: reconciled.picks,
          error: reconciled.regressed
            ? "Sleeper returned a shorter pick list. The last complete board was retained."
            : null,
          loading: false,
          refreshing: false,
          fetchedAt: Date.now(),
          telemetry: {
            ...result.telemetry,
            retained: reconciled.retained,
          },
          consecutiveErrors: 0,
          retainedAfterError: reconciled.regressed,
        };
      });
    } catch (reason) {
      setState((current) => ({
        ...current,
        error:
          reason instanceof Error
            ? reason.message
            : "Sleeper draft picks could not be loaded.",
        loading: false,
        refreshing: false,
        consecutiveErrors: current.consecutiveErrors + 1,
        retainedAfterError: current.picks.length > 0,
      }));
    }
  }, [draftId]);

  useEffect(() => {
    if (!active || !draftId) return;
    const controller = new AbortController();
    setState((current) => ({
      ...current,
      loading: current.fetchedAt === null,
    }));
    getDraftPicksWithTelemetry(draftId, controller.signal)
      .then((result) => {
        setState((current) => {
          const reconciled = reconcileDraftPicks(current.picks, result.picks);
          return {
            picks: reconciled.picks,
            error: reconciled.regressed
              ? "Sleeper returned a shorter pick list. The last complete board was retained."
              : null,
            loading: false,
            refreshing: false,
            fetchedAt: Date.now(),
            telemetry: {
              ...result.telemetry,
              retained: reconciled.retained,
            },
            consecutiveErrors: 0,
            retainedAfterError: reconciled.regressed,
          };
        });
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setState((current) => ({
          ...current,
          error:
            reason instanceof Error
              ? reason.message
              : "Sleeper draft picks could not be loaded.",
          loading: false,
          refreshing: false,
          consecutiveErrors: current.consecutiveErrors + 1,
          retainedAfterError: current.picks.length > 0,
        }));
      });
    return () => controller.abort();
  }, [active, draftId]);

  useEffect(() => {
    if (!active || !draftId || !status) return;
    const interval = status === "drafting" ? 5_000 : 30_000;
    const timer = window.setInterval(() => void refresh(true), interval);
    return () => window.clearInterval(timer);
  }, [active, draftId, refresh, status]);

  return { ...state, refresh };
}
