import assert from "node:assert/strict";
import test from "node:test";
import {
  availablePlayers,
  buildTeamDraftStates,
  createSimulatedPick,
  createSimulationSlotMap,
  getDraftCursor,
  getDraftSlotForPick,
  recommendPlayers,
  simulateToUserTurn,
} from "../src/features/live-draft/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../src/types.ts";

function player(
  id: string,
  name: string,
  position: PlayerIntelligence["position"],
  ecr: number,
): PlayerIntelligence {
  return {
    id,
    name,
    position,
    team: "DAL",
    positionRank: `${position}${ecr}`,
    ecr,
    tier: 1,
    adp: ecr,
    projectedPoints: 300 - ecr,
    expertBest: ecr - 2,
    expertWorst: ecr + 2,
    expertAverage: ecr,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 7,
    news: [],
  };
}

const draft: Draft = {
  draft_id: "draft",
  league_id: "league",
  type: "snake",
  status: "pre_draft",
  start_time: null,
  draft_order: null,
  slot_to_roster_id: { "1": 1, "2": 2, "3": 3, "4": 4 },
  settings: {
    teams: 4,
    rounds: 3,
    pick_timer: 60,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 1,
    slots_k: 1,
    slots_def: 1,
    slots_bn: 2,
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

const board = [
  player("1", "Alpha Runner", "RB", 1),
  player("2", "Beta Receiver", "WR", 2),
  player("3", "Gamma Runner", "RB", 3),
  player("4", "Delta Receiver", "WR", 4),
  player("5", "Echo Tight End", "TE", 5),
  player("6", "Foxtrot Quarterback", "QB", 6),
  player("7", "Golf Runner", "RB", 7),
  player("8", "Hotel Receiver", "WR", 8),
  player("9", "India Runner", "RB", 9),
  player("10", "Juliet Receiver", "WR", 10),
  player("11", "Kilo Tight End", "TE", 11),
  player("12", "Lima Quarterback", "QB", 12),
];

test("snake slots reverse every round", () => {
  assert.deepEqual(
    Array.from({ length: 12 }, (_, index) =>
      getDraftSlotForPick(index + 1, 4, "snake"),
    ),
    [1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4],
  );
});

test("simulation slot selection swaps the user's roster without duplicates", () => {
  const map = createSimulationSlotMap(draft, 2, 3);
  assert.deepEqual(map, { "1": 1, "2": 3, "3": 2, "4": 4 });
  assert.equal(new Set(Object.values(map)).size, 4);
});

test("draft cursor reports the current team and next user turn", () => {
  const map = createSimulationSlotMap(draft, 2, 3);
  const cursor = getDraftCursor(draft, [{ pick_no: 1 }, { pick_no: 2 }] as SleeperDraftPick[], 2, map);
  assert.equal(cursor.currentPick, 3);
  assert.equal(cursor.currentRosterId, 2);
  assert.equal(cursor.isUserTurn, true);
  assert.equal(cursor.picksUntilUser, 0);
});

test("unassigned drafts do not treat roster number as draft position", () => {
  const cursor = getDraftCursor(draft, [], 2, {});
  assert.equal(cursor.currentRosterId, null);
  assert.equal(cursor.nextUserPick, null);
  assert.equal(cursor.picksUntilUser, null);
});

test("drafted players are removed by both id and normalized name", () => {
  const picks = [
    {
      player_id: "1",
      metadata: { first_name: "Alpha", last_name: "Runner", position: "RB" },
    },
    {
      player_id: "different-provider-id",
      metadata: { first_name: "Beta", last_name: "Receiver Jr.", position: "WR" },
    },
  ] as SleeperDraftPick[];
  const remaining = availablePlayers(board, picks);
  assert.equal(remaining.some((item) => item.id === "1"), false);
  assert.equal(remaining.some((item) => item.id === "2"), false);
});

test("recommendations honor avoid and target controls while explaining all factors", () => {
  const teams = buildTeamDraftStates({ draft, users, rosters, picks: [] });
  const cursor = getDraftCursor(draft, [], 2);
  const recommendations = recommendPlayers({
    available: board,
    allPlayers: board,
    teams,
    userRosterId: 2,
    cursor,
    controls: {
      watchlist: [],
      queue: [],
      target: ["2"],
      sleeper: [],
      avoid: ["1"],
    },
  });
  assert.equal(recommendations.length, 5);
  assert.equal(recommendations.some((item) => item.player.id === "1"), false);
  assert.equal(recommendations[0].player.id, "2");
  assert.equal(recommendations.every((item) => item.reasons.length === 6), true);
});

test("pre-draft simulator stops at each user turn", () => {
  const slotMap = createSimulationSlotMap(draft, 2, 3);
  const beforeFirstTurn = simulateToUserTurn({
    draft,
    users,
    rosters,
    picks: [],
    board,
    userRosterId: 2,
    slotMap,
  });
  assert.equal(beforeFirstTurn.length, 2);
  assert.equal(getDraftCursor(draft, beforeFirstTurn, 2, slotMap).isUserTurn, true);

  const selection = createSimulatedPick({
    draft,
    pickNumber: 3,
    player: availablePlayers(board, beforeFirstTurn)[0],
    rosterId: 2,
    ownerId: "u2",
  });
  const beforeSecondTurn = simulateToUserTurn({
    draft,
    users,
    rosters,
    picks: [...beforeFirstTurn, selection],
    board,
    userRosterId: 2,
    slotMap,
  });
  assert.equal(beforeSecondTurn.length, 5);
  assert.equal(getDraftCursor(draft, beforeSecondTurn, 2, slotMap).currentPick, 6);
  assert.equal(getDraftCursor(draft, beforeSecondTurn, 2, slotMap).isUserTurn, true);
});
