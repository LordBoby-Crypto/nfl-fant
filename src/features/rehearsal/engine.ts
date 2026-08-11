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
import { forecastNextTurnMarket } from "../live-draft/strategy.ts";
import { buildNextTurnForecast } from "../live-draft/nextTurnForecast.ts";

export interface DraftRehearsalSettingsChange {
  atPick: number;
  draft: Draft;
  board: PlayerIntelligence[];
  fingerprint: string;
}

export interface DraftRehearsalInput {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slot: number;
  controls: DraftControlState;
  initialPicks?: SleeperDraftPick[];
  forecastRuns?: number;
  settingsFingerprint?: string;
  settingsChanges?: DraftRehearsalSettingsChange[];
}

export interface RehearsalTimingSummary {
  p50: number;
  p95: number;
  max: number;
}

export interface DraftRehearsalCycle {
  completedPick: number;
  selectedPlayerId: string;
  settingsFingerprint: string;
  availablePlayers: number;
  recommendationLeaderId: string | null;
  forecastForPick: number | null;
}

export interface DraftRehearsalResult {
  slot: number;
  totalPicks: number;
  completedPicks: number;
  uniquePlayers: number;
  completed: boolean;
  userSelections: string[];
  rankingRecalculations: number;
  recommendationRecalculations: number;
  forecastRecalculations: number;
  selectedPlayerRemovalChecks: number;
  settingsFingerprints: string[];
  rankingTimingMs: RehearsalTimingSummary;
  recommendationTimingMs: RehearsalTimingSummary;
  forecastTimingMs: RehearsalTimingSummary;
  responseTimingMs: RehearsalTimingSummary;
  cycles: DraftRehearsalCycle[];
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

function timingSummary(values: number[]): RehearsalTimingSummary {
  return {
    p50: rounded(percentile(values, 50)),
    p95: rounded(percentile(values, 95)),
    max: rounded(Math.max(0, ...values)),
  };
}

export function runFullDraftRehearsal({
  draft,
  users,
  rosters,
  board,
  userRosterId,
  slot,
  controls,
  initialPicks = [],
  forecastRuns = 8,
  settingsFingerprint = "initial-settings",
  settingsChanges = [],
}: DraftRehearsalInput): DraftRehearsalResult {
  let activeDraft = draft;
  let activeBoard = board;
  let activeFingerprint = settingsFingerprint;
  let totalPicks = activeDraft.settings.teams * activeDraft.settings.rounds;
  const slotMap = createSimulationSlotMap(activeDraft, userRosterId, slot);
  const picks: SleeperDraftPick[] = [...initialPicks];
  const selectedIds = new Set(picks.map((pick) => String(pick.player_id)));
  const selectedNames = new Set(
    picks.map((pick) => normalizePlayerName(pickPlayerName(pick))),
  );
  const userSelections: string[] = [];
  const rankingTimes: number[] = [];
  const recalculationTimes: number[] = [];
  const forecastTimes: number[] = [];
  const responseTimes: number[] = [];
  const appliedChanges = new Set<number>();
  const fingerprints = new Set([activeFingerprint]);
  const cycles: DraftRehearsalCycle[] = [];
  let removalChecks = 0;
  const violations: string[] = [];

  while (picks.length < totalPicks) {
    let cursor = getDraftCursor(activeDraft, picks, userRosterId, slotMap);
    for (let index = 0; index < settingsChanges.length; index += 1) {
      const change = settingsChanges[index];
      if (!change || appliedChanges.has(index) || cursor.currentPick < change.atPick) {
        continue;
      }
      if (
        change.draft.settings.teams !== activeDraft.settings.teams ||
        change.draft.settings.rounds !== activeDraft.settings.rounds
      ) {
        violations.push(
          `Settings change at pick ${change.atPick} altered teams or rounds during an active draft.`,
        );
        appliedChanges.add(index);
        continue;
      }
      activeDraft = change.draft;
      activeBoard = change.board;
      activeFingerprint = change.fingerprint;
      fingerprints.add(activeFingerprint);
      totalPicks = activeDraft.settings.teams * activeDraft.settings.rounds;
      appliedChanges.add(index);
      cursor = getDraftCursor(activeDraft, picks, userRosterId, slotMap);
    }
    if (cursor.complete || cursor.currentRosterId === null) break;
    const available = availablePlayers(activeBoard, picks);
    const teams = buildTeamDraftStates({
      draft: activeDraft,
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
          allPlayers: activeBoard,
          teams,
          userRosterId,
          cursor,
          controls,
          draft: activeDraft,
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
        draft: activeDraft,
        pickNumber: cursor.currentPick,
        player: selected,
        rosterId: currentTeam.rosterId,
        ownerId: currentTeam.ownerId,
      }),
    );
    selectedIds.add(String(selected.id));
    selectedNames.add(normalizedName);
    if (cursor.isUserTurn) userSelections.push(selected.name);

    const responseStartedAt = performance.now();
    const rankingStartedAt = performance.now();
    const nextAvailable = availablePlayers(activeBoard, picks);
    rankingTimes.push(performance.now() - rankingStartedAt);
    removalChecks += 1;
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

    const nextCursor = getDraftCursor(activeDraft, picks, userRosterId, slotMap);
    let recommendationLeaderId: string | null = null;
    let forecastForPick: number | null = null;
    if (!nextCursor.complete) {
      const nextTeams = buildTeamDraftStates({
        draft: activeDraft,
        users,
        rosters,
        picks,
        slotMap,
      });
      const startedAt = performance.now();
      const nextRecommendations = recommendPlayers({
        available: nextAvailable,
        allPlayers: activeBoard,
        teams: nextTeams,
        userRosterId,
        cursor: nextCursor,
        controls,
        draft: activeDraft,
        slotMap,
      });
      recalculationTimes.push(performance.now() - startedAt);
      recommendationLeaderId = nextRecommendations[0]?.player.id ?? null;
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

      const forecastStartedAt = performance.now();
      const market = forecastNextTurnMarket({
        draft: activeDraft,
        users,
        rosters,
        picks,
        board: activeBoard,
        userRosterId,
        slotMap,
        runs: forecastRuns,
      });
      const nextForecast = buildNextTurnForecast({
        generatedForPick: nextCursor.currentPick,
        nextUserPick: nextCursor.nextUserPick,
        recommendations: nextRecommendations,
        tierBreaks: new Map(),
        market,
      });
      forecastTimes.push(performance.now() - forecastStartedAt);
      forecastForPick = nextForecast.generatedForPick;
      if (nextForecast.generatedForPick !== nextCursor.currentPick) {
        violations.push(
          `Forecast did not advance after pick ${cursor.currentPick}.`,
        );
      }
      const draftedInForecast = nextForecast.likelyPicks.some((pick) =>
        pick.players.some((candidate) =>
          String(candidate.player.id) === String(selected.id) ||
          normalizePlayerName(candidate.player.name) === normalizedName
        )
      );
      if (draftedInForecast) {
        violations.push(
          `${selected.name} remained in the forecast after selection.`,
        );
      }
    }
    responseTimes.push(performance.now() - responseStartedAt);
    cycles.push({
      completedPick: cursor.currentPick,
      selectedPlayerId: String(selected.id),
      settingsFingerprint: activeFingerprint,
      availablePlayers: nextAvailable.length,
      recommendationLeaderId,
      forecastForPick,
    });
  }

  const finalCursor = getDraftCursor(activeDraft, picks, userRosterId, slotMap);
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
    rankingRecalculations: rankingTimes.length,
    recommendationRecalculations: recalculationTimes.length,
    forecastRecalculations: forecastTimes.length,
    selectedPlayerRemovalChecks: removalChecks,
    settingsFingerprints: [...fingerprints],
    rankingTimingMs: timingSummary(rankingTimes),
    recommendationTimingMs: timingSummary(recalculationTimes),
    forecastTimingMs: timingSummary(forecastTimes),
    responseTimingMs: timingSummary(responseTimes),
    cycles,
    violations,
  };
}
