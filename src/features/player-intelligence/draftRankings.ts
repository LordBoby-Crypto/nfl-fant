import type { SleeperDraftPick } from "../../types";
import {
  buildDraftedPlayerLookup,
  draftPickForPlayer,
  normalizePlayerName,
  pickPlayerName,
  type DraftedPlayerLookup,
  type TeamDraftState,
} from "../live-draft/engine.ts";
import type {
  PlayerIntelligence,
  PlayerPosition,
} from "./model.ts";

export type DraftRankingAvailability = "ALL" | "AVAILABLE" | "DRAFTED";

export interface DraftRankingFilters {
  query: string;
  position: "ALL" | Exclude<PlayerPosition, "—">;
  tier: "ALL" | number;
  team: "ALL" | string;
  status: "ALL" | string;
  availability: DraftRankingAvailability;
}

export interface OffBoardEntry {
  pick: SleeperDraftPick;
  player: PlayerIntelligence | null;
  playerName: string;
  teamName: string;
}

export function playerStatusLabel(player: PlayerIntelligence) {
  return player.injuryStatus.trim() || "No designation";
}

export function filterDraftRankingPlayers({
  players,
  drafted,
  filters,
}: {
  players: PlayerIntelligence[];
  drafted: DraftedPlayerLookup;
  filters: DraftRankingFilters;
}) {
  const query = filters.query.trim().toLocaleLowerCase();
  return players.filter((player) => {
    const pick = draftPickForPlayer(player, drafted);
    if (filters.availability === "AVAILABLE" && pick) return false;
    if (filters.availability === "DRAFTED" && !pick) return false;
    if (filters.position !== "ALL" && player.position !== filters.position) {
      return false;
    }
    if (
      filters.tier !== "ALL" &&
      (player.leagueTier ?? player.tier) !== filters.tier
    ) {
      return false;
    }
    if (filters.team !== "ALL" && player.team !== filters.team) return false;
    if (
      filters.status !== "ALL" &&
      playerStatusLabel(player) !== filters.status
    ) {
      return false;
    }
    return (
      !query ||
      player.name.toLocaleLowerCase().includes(query) ||
      player.team.toLocaleLowerCase().includes(query) ||
      player.position.toLocaleLowerCase().includes(query) ||
      playerStatusLabel(player).toLocaleLowerCase().includes(query)
    );
  });
}

export function buildOffBoardEntries({
  picks,
  players,
  teams,
}: {
  picks: SleeperDraftPick[];
  players: PlayerIntelligence[];
  teams: TeamDraftState[];
}) {
  const playersById = new Map(
    players.map((player) => [String(player.id), player]),
  );
  const playersByName = new Map(
    players.map((player) => [normalizePlayerName(player.name), player]),
  );
  const teamsByRoster = new Map(
    teams.map((team) => [team.rosterId, team.name]),
  );

  return [...picks]
    .sort((left, right) => right.pick_no - left.pick_no)
    .map((pick): OffBoardEntry => {
      const player =
        playersById.get(String(pick.player_id)) ??
        playersByName.get(normalizePlayerName(pickPlayerName(pick))) ??
        null;
      return {
        pick,
        player,
        playerName: player?.name ?? pickPlayerName(pick),
        teamName:
          teamsByRoster.get(Number(pick.roster_id)) ??
          `Roster ${pick.roster_id}`,
      };
    });
}

export function completeDraftRankingState(
  players: PlayerIntelligence[],
  picks: SleeperDraftPick[],
) {
  const drafted = buildDraftedPlayerLookup(picks);
  return {
    drafted,
    available: players.filter((player) => !draftPickForPlayer(player, drafted)),
    draftedPlayers: players.filter((player) =>
      Boolean(draftPickForPlayer(player, drafted)),
    ),
  };
}
