import type { LeagueSnapshot } from "../../types";
import type { TradeSuggestion } from "./engine";

export interface StoredTradeOpportunities {
  rosterFingerprint: string;
  opportunityIds: string[];
  savedAt: number;
}

export interface TradeOpportunityAlert {
  count: number;
  opportunityIds: string[];
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
): TradeOpportunityAlert | null {
  if (!previous || previous.rosterFingerprint === rosterFingerprint) return null;
  const known = new Set(previous.opportunityIds);
  const newIds = opportunityIds.filter((id) => !known.has(id));
  return newIds.length
    ? { count: newIds.length, opportunityIds: newIds }
    : null;
}
