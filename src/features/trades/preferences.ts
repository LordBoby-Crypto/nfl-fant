import type { TeamPlayer, TeamPosition } from "../my-team/engine";

export type TradeFormatPreference =
  | "any"
  | "one-for-one"
  | "receive-package"
  | "send-package";

export interface TradePreferences {
  protectedPlayerIds: string[];
  wantedPositions: TeamPosition[];
  tradablePositions: TeamPosition[];
  formatPreference: TradeFormatPreference;
  minimumImpact: number;
}

export const TRADE_POSITIONS: TeamPosition[] = ["QB", "RB", "WR", "TE"];

export const DEFAULT_TRADE_PREFERENCES: TradePreferences = {
  protectedPlayerIds: [],
  wantedPositions: [],
  tradablePositions: [],
  formatPreference: "any",
  minimumImpact: 0.5,
};

export function tradePreferencesStorageKey(leagueId: string, rosterId: number) {
  return `war-room.trade-preferences.v1.${leagueId}.${rosterId}`;
}

function validPositions(value: unknown): TeamPosition[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (position): position is TeamPosition =>
      typeof position === "string" &&
      TRADE_POSITIONS.includes(position as TeamPosition),
  ))];
}

export function normalizeTradePreferences(value: unknown): TradePreferences {
  if (!value || typeof value !== "object") return DEFAULT_TRADE_PREFERENCES;
  const candidate = value as Partial<TradePreferences>;
  const formats: TradeFormatPreference[] = [
    "any",
    "one-for-one",
    "receive-package",
    "send-package",
  ];
  return {
    protectedPlayerIds: Array.isArray(candidate.protectedPlayerIds)
      ? [...new Set(candidate.protectedPlayerIds.filter(
          (id): id is string => typeof id === "string" && Boolean(id),
        ))]
      : [],
    wantedPositions: validPositions(candidate.wantedPositions),
    tradablePositions: validPositions(candidate.tradablePositions),
    formatPreference: formats.includes(candidate.formatPreference as TradeFormatPreference)
      ? candidate.formatPreference as TradeFormatPreference
      : "any",
    minimumImpact:
      typeof candidate.minimumImpact === "number" &&
      Number.isFinite(candidate.minimumImpact)
        ? Math.max(0.2, Math.min(5, candidate.minimumImpact))
        : DEFAULT_TRADE_PREFERENCES.minimumImpact,
  };
}

export function automaticCornerstoneIds(players: TeamPlayer[]) {
  return players
    .filter((player) => player.ecr !== null && player.ecr <= 24)
    .map((player) => player.sleeperId);
}
