import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Draft, SleeperDraftPick } from "../../types.ts";
import type { PlayerBoardData, PlayerIntelligence } from "../player-intelligence/model.ts";
import {
  loadSecureSyncVault,
  readSyncCredentials,
  saveSecureSyncVault,
} from "../safety/sync.ts";
import type {
  DraftControlState,
  DraftRecommendation,
} from "./engine.ts";
import type { RecommendationProof } from "./recommendationProof.ts";
import {
  attachActualSelections,
  buildDataFreshness,
  manualDraftedPicks,
  markPlayerDraftedManually,
  mergeLiveReliabilityStates,
  normalizeLiveReliabilityState,
  readLiveReliabilityState,
  reconcileManualCorrections,
  recordRecommendationRevision,
  reverseManualCorrection,
  writeLiveReliabilityState,
} from "./liveReliability.ts";

export type ReliabilitySyncStatus =
  | "local"
  | "connecting"
  | "synced"
  | "offline";

export function useLiveReliability(input: {
  draft: Draft;
  userRosterId: number | null;
  livePicks: SleeperDraftPick[];
  board: PlayerBoardData | null;
  picksFetchedAt: number | null;
  controls: DraftControlState;
  syncActive: boolean;
}) {
  const draftId = input.draft.draft_id;
  const [state, setState] = useState(() => readLiveReliabilityState(draftId));
  const [syncStatus, setSyncStatus] = useState<ReliabilitySyncStatus>("local");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const syncReady = useRef(false);
  const lastSavedAt = useRef(0);

  useEffect(() => {
    syncReady.current = false;
    lastSavedAt.current = 0;
    setState(readLiveReliabilityState(draftId));
    setSyncStatus("local");
    setSyncMessage(null);
  }, [draftId]);

  useEffect(() => {
    setState((current) => {
      let next = reconcileManualCorrections(current, input.livePicks);
      if (input.userRosterId !== null) {
        next = attachActualSelections(next, input.livePicks, input.userRosterId);
      }
      if (next === current) return current;
      writeLiveReliabilityState(next);
      return next;
    });
  }, [input.livePicks, input.userRosterId]);

  const recordRecommendations = useCallback((record: {
    pickNumber: number;
    round: number;
    slot: number;
    recommendations: DraftRecommendation[];
    proofs: Map<string, RecommendationProof>;
  }) => {
    setState((current) => {
      const next = recordRecommendationRevision(current, {
        pickNumber: record.pickNumber,
        round: record.round,
        slot: record.slot,
        recommendations: record.recommendations,
        proofs: record.proofs,
        picks: input.livePicks,
      });
      if (next === current) return current;
      writeLiveReliabilityState(next);
      return next;
    });
  }, [input.livePicks]);

  useEffect(() => {
    const credentials = readSyncCredentials();
    if (!input.syncActive || !credentials) {
      syncReady.current = false;
      setSyncStatus("local");
      return;
    }
    const controller = new AbortController();
    setSyncStatus("connecting");
    loadSecureSyncVault(credentials, controller.signal)
      .then((result) => {
        const remote = result.backup.liveReliability;
        setState((current) => {
          const normalizedRemote = remote && remote.draftId === draftId
            ? normalizeLiveReliabilityState(remote, draftId)
            : null;
          const merged = normalizedRemote
            ? mergeLiveReliabilityStates(
                current,
                normalizedRemote,
              )
            : current;
          const differsFromRemote = !normalizedRemote ||
            JSON.stringify(merged) !== JSON.stringify(normalizedRemote);
          const ready = differsFromRemote
            ? { ...merged, updatedAt: Math.max(Date.now(), merged.updatedAt + 1) }
            : merged;
          writeLiveReliabilityState(ready);
          lastSavedAt.current = normalizedRemote?.updatedAt ?? 0;
          return ready;
        });
        syncReady.current = true;
        setSyncStatus("synced");
        setSyncMessage("History and corrections are linked to the encrypted device vault.");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        syncReady.current = true;
        setSyncStatus("offline");
        setSyncMessage(
          "Cross-device sync is unavailable. Changes remain safe on this device and will retry after the next update.",
        );
      });
    return () => controller.abort();
  }, [draftId, input.syncActive]);

  useEffect(() => {
    if (!input.syncActive || !syncReady.current || state.updatedAt <= lastSavedAt.current) {
      return;
    }
    const credentials = readSyncCredentials();
    if (!credentials) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSyncStatus("connecting");
      saveSecureSyncVault(
        input.controls,
        credentials,
        controller.signal,
        state,
      )
        .then(() => {
          lastSavedAt.current = state.updatedAt;
          setSyncStatus("synced");
          setSyncMessage("History and corrections synced across connected devices.");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSyncStatus("offline");
          setSyncMessage("Cross-device sync will retry after the next local change.");
        });
    }, 1_500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input.controls, input.syncActive, state]);

  const markDrafted = useCallback((player: PlayerIntelligence) => {
    setState((current) => {
      const next = markPlayerDraftedManually(current, player);
      writeLiveReliabilityState(next);
      return next;
    });
  }, []);

  const reverseCorrection = useCallback((correctionId: string) => {
    setState((current) => {
      const next = reverseManualCorrection(current, correctionId);
      writeLiveReliabilityState(next);
      return next;
    });
  }, []);

  const activeManualPicks = useMemo(() => manualDraftedPicks(state), [state]);
  const freshness = useMemo(
    () => buildDataFreshness(
      input.board,
      input.picksFetchedAt,
      input.draft.status,
    ),
    [input.board, input.draft.status, input.picksFetchedAt],
  );

  return {
    state,
    activeManualPicks,
    freshness,
    syncStatus,
    syncMessage,
    markDrafted,
    reverseCorrection,
    recordRecommendations,
  };
}
