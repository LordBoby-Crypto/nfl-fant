import { useCallback, useEffect, useState } from "react";
import { getDraftPicks } from "../services/sleeper";
import type { SleeperDraftPick } from "../types";

interface DraftPickState {
  picks: SleeperDraftPick[];
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  fetchedAt: number | null;
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
      const picks = await getDraftPicks(draftId);
      setState({
        picks: [...picks].sort((left, right) => left.pick_no - right.pick_no),
        error: null,
        loading: false,
        refreshing: false,
        fetchedAt: Date.now(),
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
    getDraftPicks(draftId, controller.signal)
      .then((picks) => {
        setState({
          picks: [...picks].sort((left, right) => left.pick_no - right.pick_no),
          error: null,
          loading: false,
          refreshing: false,
          fetchedAt: Date.now(),
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
