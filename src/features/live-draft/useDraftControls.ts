import { useCallback, useState } from "react";
import type { DraftControlKind, DraftControlState } from "./engine";
import { normalizeDraftControls } from "../safety/model";

export const DRAFT_CONTROLS_STORAGE_KEY = "war-room.draft-controls.v1";
const EMPTY_CONTROLS: DraftControlState = {
  watchlist: [],
  queue: [],
  target: [],
  sleeper: [],
  avoid: [],
};

export function readDraftControls(): DraftControlState {
  try {
    return normalizeDraftControls(
      JSON.parse(localStorage.getItem(DRAFT_CONTROLS_STORAGE_KEY) ?? "{}"),
    );
  } catch {
    return EMPTY_CONTROLS;
  }
}

function writeControls(controls: DraftControlState) {
  try {
    localStorage.setItem(DRAFT_CONTROLS_STORAGE_KEY, JSON.stringify(controls));
  } catch {
    // Keep the active tab usable when browser storage is unavailable.
  }
}

export function useDraftControls() {
  const [controls, setControls] = useState<DraftControlState>(readDraftControls);

  const update = useCallback(
    (kind: DraftControlKind, playerId: string) => {
      setControls((current) => {
        const exists = current[kind].includes(playerId);
        const next = {
          ...current,
          [kind]: exists
            ? current[kind].filter((id) => id !== playerId)
            : [...current[kind], playerId],
        };
        writeControls(next);
        return next;
      });
    },
    [],
  );

  const moveQueue = useCallback((playerId: string, direction: -1 | 1) => {
    setControls((current) => {
      const index = current.queue.indexOf(playerId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.queue.length) return current;
      const queue = [...current.queue];
      [queue[index], queue[target]] = [queue[target], queue[index]];
      const next = { ...current, queue };
      writeControls(next);
      return next;
    });
  }, []);

  const replace = useCallback((value: DraftControlState) => {
    const next = normalizeDraftControls(value);
    writeControls(next);
    setControls(next);
  }, []);

  return { controls, moveQueue, replace, toggle: update };
}
