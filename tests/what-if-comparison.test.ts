import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import {
  availablePlayers,
  buildTeamDraftStates,
  getDraftCursor,
  getDraftSlotForPick,
  recommendPlayers,
  type DraftControlState,
} from "../src/features/live-draft/engine.ts";
import { buildWhatIfComparison } from "../src/features/live-draft/whatIfComparison.ts";
import type { Draft, LeagueUser, Roster, SleeperDraftPick } from "../src/types.ts";

function player(
  id: string,
  name: string,
  position: PlayerIntelligence["position"],
  rank: number,
  tier: number,
  overrides: Partial<PlayerIntelligence> = {},
): PlayerIntelligence {
  return {
    id,
    name,
    team: rank % 2 ? "DAL" : "BUF",
    position,
    positionRank: `${position}${rank}`,
    ecr: rank,
    tier,
    adp: rank,
    projectedPoints: 310 - rank * 2,
    expertBest: rank - 2,
    expertWorst: rank + 2,
    expertAverage: rank,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: rank % 2 ? 7 : 9,
    news: [],
    leagueRank: rank,
    leaguePositionRank: rank,
    leagueTier: tier,
    replacementValue: 50 - rank,
    scarcityAdjustedValue: 55 - rank,
    scoringConfidence: "high",
    ...overrides,
  };
}

const draft: Draft = {
  draft_id: "draft",
  league_id: "league",
  type: "snake",
  status: "drafting",
  start_time: null,
  draft_order: { u1: 1, u2: 2, u3: 3, u4: 4 },
  slot_to_roster_id: { "1": 1, "2": 2, "3": 3, "4": 4 },
  settings: {
    teams: 4,
    rounds: 6,
    pick_timer: 60,
    slots_qb: 1,
    slots_rb: 1,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 0,
    slots_k: 0,
    slots_def: 0,
    slots_bn: 1,
  },
};

const users: LeagueUser[] = Array.from({ length: 4 }, (_, index) => ({
  user_id: `u${index + 1}`,
  display_name: `Team ${index + 1}`,
  avatar: null,
  metadata: null,
}));

const rosters: Roster[] = Array.from({ length: 4 }, (_, index) => ({
  roster_id: index + 1,
  owner_id: `u${index + 1}`,
  players: [],
  keepers: [],
  reserve: [],
  starters: [],
  settings: {
    wins: 0,
    losses: 0,
    ties: 0,
    waiver_position: 0,
    waiver_budget_used: 0,
  },
}));

function pick(
  pickNumber: number,
  id: string,
  position: PlayerIntelligence["position"],
): SleeperDraftPick {
  const slot = getDraftSlotForPick(pickNumber, draft.settings.teams, draft.type);
  const rosterId = Number(draft.slot_to_roster_id[String(slot)]);
  return {
    player_id: id,
    picked_by: `u${rosterId}`,
    roster_id: rosterId,
    round: Math.floor((pickNumber - 1) / draft.settings.teams) + 1,
    draft_slot: slot,
    pick_no: pickNumber,
    is_keeper: false,
    metadata: {
      first_name: `Drafted${pickNumber}`,
      last_name: "Player",
      position,
      team: "FA",
    },
  };
}

const board = [
  player("rb-a", "Alpha Runner", "RB", 8, 1),
  player("wr-a", "Bravo Receiver", "WR", 10, 1),
  player("rb-b", "Charlie Runner", "RB", 28, 3, {
    replacementValue: 24,
  }),
  player("wr-b", "Delta Receiver", "WR", 22, 2),
  player("te-a", "Echo Tight End", "TE", 24, 2),
  player("qb-a", "Foxtrot Quarterback", "QB", 26, 2),
  ...Array.from({ length: 18 }, (_, index) =>
    player(
      `depth-${index}`,
      `Depth Player ${index}`,
      index % 2 ? "WR" : "RB",
      40 + index,
      4 + Math.floor(index / 6),
    ),
  ),
];

const controls: DraftControlState = {
  watchlist: [],
  queue: [],
  target: [],
  sleeper: [],
  avoid: [],
};

const completedPicks = Array.from({ length: 12 }, (_, index) => {
  const pickNumber = index + 1;
  const userPick = [1, 8, 9].includes(pickNumber);
  return pick(pickNumber, `drafted-${pickNumber}`, userPick ? "RB" : "WR");
});

function comparison() {
  const available = availablePlayers(board, completedPicks);
  const teams = buildTeamDraftStates({
    draft,
    users,
    rosters,
    picks: completedPicks,
  });
  const cursor = getDraftCursor(draft, completedPicks, 1);
  const recommendations = recommendPlayers({
    available,
    allPlayers: board,
    teams,
    userRosterId: 1,
    cursor,
    controls,
    draft,
    slotMap: draft.slot_to_roster_id,
    limit: available.length,
  });
  return buildWhatIfComparison({
    candidates: [board[0], board[1]],
    available,
    allPlayers: board,
    currentRecommendations: recommendations,
    market: {
      runs: 240,
      interveningPicks: 3,
      picks: [],
      survivalByPlayer: new Map([
        ["rb-a", 31],
        ["wr-a", 68],
        ["rb-b", 84],
        ["wr-b", 79],
      ]),
      positionDemand: [
        { position: "RB", expectedSelections: 2.4, share: 0.8, risk: "Likely run" },
        { position: "WR", expectedSelections: 0.6, share: 0.2, risk: "Stable" },
      ],
    },
    draft,
    users,
    rosters,
    picks: completedPicks,
    userRosterId: 1,
    cursor,
    controls,
    slotMap: draft.slot_to_roster_id,
  });
}

test("each possible selection projects a distinct roster and next recommendation", () => {
  const result = comparison();
  const runner = result.scenarios.find((scenario) => scenario.player.id === "rb-a")!;
  const receiver = result.scenarios.find((scenario) => scenario.player.id === "wr-a")!;

  assert.equal(result.scenarios.length, 2);
  assert.equal(result.selectionPick, 16);
  assert.equal(runner.roster.positionCount, 4);
  assert.equal(receiver.roster.positionCount, 1);
  assert.equal(runner.excessiveDepth, true);
  assert.equal(receiver.excessiveDepth, false);
  assert.notEqual(runner.nextRecommendation?.player.id, "rb-a");
  assert.notEqual(receiver.nextRecommendation?.player.id, "wr-a");
  assert.equal(runner.nextUserPick, 17);
  assert.match(runner.explanation, /projected next recommendation/);
  assert.match(result.winnerExplanation, /what-if recommendation/);
});

test("what-if analysis exposes survival, tier, replacement and weaker-position costs", () => {
  const result = comparison();
  const runner = result.scenarios.find((scenario) => scenario.player.id === "rb-a")!;

  assert.equal(runner.survivalProbability, 31);
  assert.equal(runner.waitLabel, "Draft now");
  assert.match(runner.tierConsequence, /Tier 3/);
  assert.match(runner.replacementConsequence, /value-over-replacement/);
  assert.equal(runner.weakerByWaiting[0].position, "RB");
  assert.equal(runner.weakerByWaiting[0].risk, "Likely run");
  assert.equal((runner.weakerByWaiting[0].rankDrop ?? 0) > 0, true);
  assert.equal(runner.positiveFactors.length > 0, true);
  assert.equal(runner.negativeFactors.some((factor) => factor.key === "bench-balance"), true);
});

test("Draft Rankings and Draft Room both expose the shared comparison controls", () => {
  const rankings = readFileSync(
    new URL("../src/features/player-intelligence/PlayerIntelligencePage.tsx", import.meta.url),
    "utf8",
  );
  const draftRoom = readFileSync(
    new URL("../src/features/live-draft/LiveDraftRoom.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [rankings, draftRoom]) {
    assert.match(source, /ComparePlayerButton/);
    assert.match(source, /WhatIfComparisonPanel/);
    assert.match(source, /buildWhatIfComparison/);
  }
});
