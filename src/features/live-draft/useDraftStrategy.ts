import { useCallback, useState } from "react";

const STORAGE_KEY = "war-room.draft-strategy.v2";
const LEGACY_STORAGE_KEY = "war-room.draft-strategy.v1";

export interface DraftStrategySettings {
  simulationRuns: 50 | 100 | 250;
}

const DEFAULT_SETTINGS: DraftStrategySettings = {
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
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return { simulationRuns };
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

  const setSimulationRuns = useCallback(
    (simulationRuns: DraftStrategySettings["simulationRuns"]) =>
      persist((current) => ({ ...current, simulationRuns })),
    [persist],
  );

  return {
    ...settings,
    setSimulationRuns,
  };
}
