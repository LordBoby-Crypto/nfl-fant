import type { PlayerIntelligence } from "../player-intelligence/model";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../../types";
import {
  availablePlayers,
  buildTeamDraftStates,
  cpuPlayerScore,
  createSimulatedPick,
  createSimulationSlotMap,
  getDraftCursor,
  normalizePlayerName,
  pickPlayerName,
  recommendPlayers,
  type DraftControlState,
} from "../live-draft/engine.ts";

export interface DraftRehearsalInput {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slot: number;
  controls: DraftControlState;
}

export interface DraftRehearsalResult {
  slot: number;
  totalPicks: number;
  completedPicks: number;
  uniquePlayers: number;
  completed: boolean;
  userSelections: string[];
  recommendationRecalculations: number;
  recommendationTimingMs: {
    p50: number;
    p95: number;
    max: number;
  };
  violations: string[];
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function rounded(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function runFullDraftRehearsal({
  draft,
  users,
  rosters,
  board,
  userRosterId,
  slot,
  controls,
}: DraftRehearsalInput): DraftRehearsalResult {
  const totalPicks = draft.settings.teams * draft.settings.rounds;
  const slotMap = createSimulationSlotMap(draft, userRosterId, slot);
  const picks: SleeperDraftPick[] = [];
  const selectedIds = new Set<string>();
  const selectedNames = new Set<string>();
  const userSelections: string[] = [];
  const recalculationTimes: number[] = [];
  const violations: string[] = [];

  while (picks.length < totalPicks) {
    const cursor = getDraftCursor(draft, picks, userRosterId, slotMap);
    if (cursor.complete || cursor.currentRosterId === null) break;
    const available = availablePlayers(board, picks);
    const teams = buildTeamDraftStates({
      draft,
      users,
      rosters,
      picks,
      slotMap,
    });
    const currentTeam = teams.find(
      (team) => team.rosterId === cursor.currentRosterId,
    );
    if (!currentTeam || !available.length) {
      violations.push(
        `Pick ${cursor.currentPick} could not resolve a team or available player.`,
      );
      break;
    }

    const recommendations = cursor.isUserTurn
      ? recommendPlayers({
          available,
          allPlayers: board,
          teams,
          userRosterId,
          cursor,
          controls,
          draft,
          slotMap,
        })
      : [];
    const selected = cursor.isUserTurn
      ? recommendations[0]?.player ?? available[0]
      : [...available]
          .slice(0, 80)
          .sort(
            (left, right) =>
              cpuPlayerScore(right, currentTeam, cursor.currentRound) -
              cpuPlayerScore(left, currentTeam, cursor.currentRound),
          )[0];
    const normalizedName = normalizePlayerName(selected.name);
    if (
      selectedIds.has(String(selected.id)) ||
      selectedNames.has(normalizedName)
    ) {
      violations.push(
        `Pick ${cursor.currentPick} attempted to select ${selected.name} twice.`,
      );
      break;
    }

    picks.push(
      createSimulatedPick({
        draft,
        pickNumber: cursor.currentPick,
        player: selected,
        rosterId: currentTeam.rosterId,
        ownerId: currentTeam.ownerId,
      }),
    );
    selectedIds.add(String(selected.id));
    selectedNames.add(normalizedName);
    if (cursor.isUserTurn) userSelections.push(selected.name);

    const nextAvailable = availablePlayers(board, picks);
    if (
      nextAvailable.some(
        (player) =>
          String(player.id) === String(selected.id) ||
          normalizePlayerName(player.name) === normalizedName,
      )
    ) {
      violations.push(
        `Selected player ${selected.name} remained in the available pool.`,
      );
    }

    const nextCursor = getDraftCursor(draft, picks, userRosterId, slotMap);
    if (!nextCursor.complete) {
      const nextTeams = buildTeamDraftStates({
        draft,
        users,
        rosters,
        picks,
        slotMap,
      });
      const startedAt = performance.now();
      const nextRecommendations = recommendPlayers({
        available: nextAvailable,
        allPlayers: board,
        teams: nextTeams,
        userRosterId,
        cursor: nextCursor,
        controls,
        draft,
        slotMap,
      });
      recalculationTimes.push(performance.now() - startedAt);
      const draftedRecommendation = nextRecommendations.find(
        (recommendation) =>
          selectedIds.has(String(recommendation.player.id)) ||
          selectedNames.has(normalizePlayerName(recommendation.player.name)),
      );
      if (draftedRecommendation) {
        violations.push(
          `${draftedRecommendation.player.name} remained recommended after selection.`,
        );
      }
    }
  }

  const finalCursor = getDraftCursor(draft, picks, userRosterId, slotMap);
  const selectedFromPicks = new Set(
    picks.map(
      (pick) =>
        `${String(pick.player_id)}:${normalizePlayerName(pickPlayerName(pick))}`,
    ),
  );
  if (selectedFromPicks.size !== picks.length) {
    violations.push("The completed board contains a duplicate player.");
  }

  return {
    slot,
    totalPicks,
    completedPicks: picks.length,
    uniquePlayers: selectedFromPicks.size,
    completed: finalCursor.complete,
    userSelections,
    recommendationRecalculations: recalculationTimes.length,
    recommendationTimingMs: {
      p50: rounded(percentile(recalculationTimes, 50)),
      p95: rounded(percentile(recalculationTimes, 95)),
      max: rounded(Math.max(0, ...recalculationTimes)),
    },
    violations,
  };
}
