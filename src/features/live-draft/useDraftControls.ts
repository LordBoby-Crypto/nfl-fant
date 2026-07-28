import { useCallback, useState } from "react";
import type { DraftControlKind, DraftControlState } from "./engine";

const STORAGE_KEY = "war-room.draft-controls.v1";
const EMPTY_CONTROLS: DraftControlState = {
  watchlist: [],
  queue: [],
  target: [],
  sleeper: [],
  avoid: [],
};

function readControls(): DraftControlState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as
      Partial<DraftControlState>;
    return {
      watchlist: Array.isArray(value.watchlist) ? value.watchlist : [],
      queue: Array.isArray(value.queue) ? value.queue : [],
      target: Array.isArray(value.target) ? value.target : [],
      sleeper: Array.isArray(value.sleeper) ? value.sleeper : [],
      avoid: Array.isArray(value.avoid) ? value.avoid : [],
    };
  } catch {
    return EMPTY_CONTROLS;
  }
}

export function useDraftControls() {
  const [controls, setControls] = useState<DraftControlState>(readControls);

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { controls, moveQueue, toggle: update };
}
