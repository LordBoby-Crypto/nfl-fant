import type { LeagueSnapshot } from "../../types";
import type { TradeSuggestion } from "./engine";

export interface StoredTradeOpportunities {
  rosterFingerprint: string;
  opportunityIds: string[];
  rosterState?: Record<string, string[]>;
  savedAt: number;
}

export interface TradeOpportunityAlert {
  count: number;
  opportunityIds: string[];
  changedRosterIds: number[];
  changeSummary: string;
}

export function tradeRosterState(snapshot: LeagueSnapshot) {
  return Object.fromEntries(
    snapshot.rosters.map((roster) => [
      String(roster.roster_id),
      [...new Set([
        ...(roster.players ?? []).map(String),
        ...(roster.reserve ?? []).map(String),
      ])].sort(),
    ]),
  );
}

export function changedTradeRosters(
  previous: Record<string, string[]> | undefined,
  current: Record<string, string[]>,
) {
  if (!previous) return [];
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((rosterId) =>
      (previous[rosterId] ?? []).join(",") !==
      (current[rosterId] ?? []).join(","),
    )
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
}

export function tradeRosterFingerprint(snapshot: LeagueSnapshot) {
  return snapshot.rosters
    .map((roster) =>
      [
        roster.roster_id,
        [...(roster.players ?? [])].map(String).sort().join(","),
        [...(roster.reserve ?? [])].map(String).sort().join(","),
      ].join(":"),
    )
    .sort()
    .join("|");
}

export function tradeOpportunityStorageKey(leagueId: string, rosterId: number) {
  return `war-room.trade-opportunities.v1.${leagueId}.${rosterId}`;
}

export function tradeOpportunityIds(suggestions: TradeSuggestion[]) {
  return [...new Set(suggestions.map((suggestion) => suggestion.id))].sort();
}

export function detectTradeOpportunityAlert(
  previous: StoredTradeOpportunities | null,
  rosterFingerprint: string,
  opportunityIds: string[],
  rosterState: Record<string, string[]> = {},
): TradeOpportunityAlert | null {
  if (!previous || previous.rosterFingerprint === rosterFingerprint) return null;
  const known = new Set(previous.opportunityIds);
  const newIds = opportunityIds.filter((id) => !known.has(id));
  if (!newIds.length) return null;
  const changedRosterIds = changedTradeRosters(previous.rosterState, rosterState);
  return {
    count: newIds.length,
    opportunityIds: newIds,
    changedRosterIds,
    changeSummary: changedRosterIds.length
      ? `${changedRosterIds.length} roster${changedRosterIds.length === 1 ? "" : "s"} changed since the last scan.`
      : "Sleeper reported a roster change since the last scan.",
  };
}
