import { useCallback, useState } from "react";
import type { ManualKeeper } from "./strategy";

const STORAGE_KEY = "war-room.draft-strategy.v1";

export interface DraftStrategySettings {
  manualKeepers: ManualKeeper[];
  simulationRuns: 50 | 100 | 250;
}

const DEFAULT_SETTINGS: DraftStrategySettings = {
  manualKeepers: [],
  simulationRuns: 100,
};

function readStrategy(): DraftStrategySettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as
      Partial<DraftStrategySettings>;
    const simulationRuns =
      value.simulationRuns === 50 ||
      value.simulationRuns === 100 ||
      value.simulationRuns === 250
        ? value.simulationRuns
        : 100;
    return {
      simulationRuns,
      manualKeepers: Array.isArray(value.manualKeepers)
        ? value.manualKeepers.filter(
            (keeper) =>
              keeper &&
              typeof keeper.id === "string" &&
              typeof keeper.playerId === "string" &&
              typeof keeper.rosterId === "number" &&
              typeof keeper.round === "number",
          )
        : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useDraftStrategy() {
  const [settings, setSettings] =
    useState<DraftStrategySettings>(readStrategy);

  const persist = useCallback(
    (
      update: (
        current: DraftStrategySettings,
      ) => DraftStrategySettings,
    ) => {
      setSettings((current) => {
        const next = update(current);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const addKeeper = useCallback(
    (keeper: Omit<ManualKeeper, "id">) =>
      persist((current) => ({
        ...current,
        manualKeepers: [
          ...current.manualKeepers.filter(
            (candidate) =>
              candidate.playerId !== keeper.playerId &&
              !(
                candidate.rosterId === keeper.rosterId &&
                candidate.round === keeper.round
              ),
          ),
          {
            ...keeper,
            id: `manual-${Date.now()}-${keeper.rosterId}-${keeper.playerId}`,
          },
        ],
      })),
    [persist],
  );

  const removeKeeper = useCallback(
    (id: string) =>
      persist((current) => ({
        ...current,
        manualKeepers: current.manualKeepers.filter(
          (keeper) => keeper.id !== id,
        ),
      })),
    [persist],
  );

  const setSimulationRuns = useCallback(
    (simulationRuns: DraftStrategySettings["simulationRuns"]) =>
      persist((current) => ({ ...current, simulationRuns })),
    [persist],
  );

  return {
    ...settings,
    addKeeper,
    removeKeeper,
    setSimulationRuns,
  };
}
