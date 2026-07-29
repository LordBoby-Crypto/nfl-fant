import assert from "node:assert/strict";
import test from "node:test";
import {
  availablePlayers,
  createSimulationSlotMap,
  getDraftCursor,
  getPickNumberForRoundSlot,
} from "../src/features/live-draft/engine.ts";
import {
  buildSlotDraftPlans,
  forecastOpponentPicks,
  runDraftSimulations,
} from "../src/features/live-draft/strategy.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../src/types.ts";

function player(
  index: number,
  position: PlayerIntelligence["position"],
): PlayerIntelligence {
  return {
    id: String(index),
    name: `Player ${index}`,
    position,
    team: "DAL",
    positionRank: `${position}${index}`,
    ecr: index,
    tier: Math.ceil(index / 5),
    adp: index,
    projectedPoints: 300 - index,
    expertBest: index - 2,
    expertWorst: index + 2,
    expertAverage: index,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 7 + (index % 4),
    news: [],
  };
}

const positions: PlayerIntelligence["position"][] = [
  "RB",
  "WR",
  "RB",
  "WR",
  "TE",
  "QB",
  "RB",
  "WR",
  "RB",
  "WR",
  "TE",
  "QB",
  "RB",
  "WR",
  "K",
  "DST",
];
const board = positions.map((position, index) => player(index + 1, position));

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
    slots_rb: 1,
    slots_wr: 1,
    slots_te: 0,
    slots_flex: 0,
    slots_k: 0,
    slots_def: 0,
    slots_bn: 0,
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

const controls = {
  watchlist: [],
  queue: [],
  target: ["8"],
  sleeper: [],
  avoid: [],
};

test("sparse draft data finds the first open pick instead of using array length", () => {
  const futurePick = {
    player_id: "8",
    picked_by: "u2",
    roster_id: 2,
    round: 2,
    draft_slot: 2,
    pick_no: 7,
    is_keeper: false,
    metadata: {
      first_name: "Player",
      last_name: "8",
      position: "WR",
    },
  } satisfies SleeperDraftPick;
  assert.equal(getDraftCursor(draft, [futurePick], 2).currentPick, 1);
  assert.equal(availablePlayers(board, [futurePick]).some((item) => item.id === "8"), false);

  const firstSixPicks = Array.from({ length: 6 }, (_, index) => ({
    ...futurePick,
    player_id: String(index + 1),
    roster_id: (index % 4) + 1,
    round: Math.floor(index / 4) + 1,
    draft_slot: ((index % 4) + 1),
    pick_no: index + 1,
    is_keeper: false,
  }));
  const afterSparsePick = getDraftCursor(
    draft,
    [...firstSixPicks, futurePick],
    2,
  );
  assert.equal(afterSparsePick.currentPick, 8);
  assert.equal(afterSparsePick.nextUserPick, 10);
});

test("opponent forecast models each selection before the user's turn", () => {
  const slotMap = createSimulationSlotMap(draft, 3, 3);
  const forecast = forecastOpponentPicks({
    draft,
    users,
    rosters,
    picks: [],
    board,
    userRosterId: 3,
    slotMap,
  });
  assert.equal(forecast.length, 2);
  assert.deepEqual(
    forecast.map((item) => item.pickNumber),
    [1, 2],
  );
  assert.equal(forecast.every((item) => item.rosterId !== 3), true);
  assert.equal(forecast.every((item) => item.alternatives.length === 2), true);
});

test("Monte Carlo simulations are repeatable for a fixed seed", () => {
  const input = {
    draft,
    users,
    rosters,
    picks: [] as SleeperDraftPick[],
    board,
    userRosterId: 2,
    slotMap: draft.slot_to_roster_id,
    controls,
    runs: 12,
    seed: 44,
  };
  const first = runDraftSimulations(input);
  const second = runDraftSimulations(input);
  assert.deepEqual(first, second);
  assert.equal(first.runs, 12);
  assert.equal(first.commonPlayers.length > 0, true);
  assert.equal(first.averageGrade >= 0 && first.averageGrade <= 100, true);
});

test("every draft slot receives a clean redraft opening plan", () => {
  const plans = buildSlotDraftPlans({
    draft,
    board,
    controls,
  });
  assert.equal(plans.length, 4);
  assert.deepEqual(
    plans.map((plan) => plan.slot),
    [1, 2, 3, 4],
  );
  for (const plan of plans) {
    assert.equal(plan.targets.length, 3);
    assert.equal(
      plan.targets[1].pickNumber,
      getPickNumberForRoundSlot(2, plan.slot, 4, "snake"),
    );
  }
});

test("the production 14-team shape receives all fourteen snake plans", () => {
  const fourteenTeamDraft: Draft = {
    ...draft,
    slot_to_roster_id: Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => [
        String(index + 1),
        index + 1,
      ]),
    ),
    settings: {
      ...draft.settings,
      teams: 14,
      rounds: 3,
    },
  };
  const plans = buildSlotDraftPlans({
    draft: fourteenTeamDraft,
    board,
    controls,
  });
  assert.equal(plans.length, 14);
  assert.equal(plans[13].slot, 14);
  assert.equal(plans[13].targets[0].pickNumber, 14);
  assert.equal(plans[13].targets[1].pickNumber, 15);
});
