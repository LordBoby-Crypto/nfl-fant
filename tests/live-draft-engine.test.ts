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
  type DraftRecommendation,
  type RecommendationFactor,
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
  overrides: Partial<PlayerIntelligence> = {},
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
    leagueRank: ecr,
    leaguePositionRank: ecr,
    leagueTier: 1,
    replacementValue: 40 - ecr,
    scarcityAdjustedValue: 45 - ecr,
    ...overrides,
  };
}

function draftedPlayer(
  pickNo: number,
  player: PlayerIntelligence,
  rosterId: number,
): SleeperDraftPick {
  return {
    player_id: player.id,
    picked_by: `u${rosterId}`,
    roster_id: rosterId,
    round: Math.floor((pickNo - 1) / draft.settings.teams) + 1,
    draft_slot: rosterId,
    pick_no: pickNo,
    is_keeper: false,
    metadata: {
      first_name: player.name.split(" ")[0],
      last_name: player.name.split(" ").slice(1).join(" "),
      team: player.team,
      position: player.position,
    },
  };
}

function factorScore(
  recommendation: DraftRecommendation,
  key: RecommendationFactor["key"],
) {
  return recommendation.factors?.find((factor) => factor.key === key)?.score ?? 0;
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

test("availability never exposes duplicate provider rows for the same player", () => {
  const duplicate = {
    ...board[0],
    id: "other-provider-id",
    name: "  Alpha Runner Jr. ",
  };
  const remaining = availablePlayers([board[0], duplicate, board[1]], []);
  assert.deepEqual(remaining.map((item) => item.id), ["1", "2"]);
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
    draft,
  });
  assert.equal(recommendations.length, 5);
  assert.equal(recommendations.some((item) => item.player.id === "1"), false);
  assert.equal(recommendations[0].player.id, "2");
  assert.equal(recommendations.every((item) => item.reasons.length === 16), true);
  assert.deepEqual(
    recommendations[0].factors?.map((factor) => factor.key),
    [
      "league-value",
      "rank",
      "replacement",
      "tier-scarcity",
      "adp",
      "outcome-range",
      "availability-risk",
      "expert-agreement",
      "offense-role",
      "roster-fit",
      "bench-balance",
      "concentration",
      "stack-correlation",
      "draft-market",
      "opponent-demand",
      "draft-controls",
    ],
  );
  assert.equal(recommendations[0].outcomeRange?.expected, 298);
});

test("avoided players never re-enter recommendations when the pool is small", () => {
  const smallBoard = board.slice(0, 4);
  const teams = buildTeamDraftStates({ draft, users, rosters, picks: [] });
  const recommendations = recommendPlayers({
    available: smallBoard,
    allPlayers: smallBoard,
    teams,
    userRosterId: 2,
    cursor: getDraftCursor(draft, [], 2),
    controls: {
      watchlist: [],
      queue: [],
      target: [],
      sleeper: [],
      avoid: smallBoard.map((player) => player.id),
    },
  });
  assert.deepEqual(recommendations, []);
});

test("SUPER_FLEX demand and unfilled starters beat redundant bench depth", () => {
  const superflexDraft: Draft = {
    ...draft,
    settings: {
      ...draft.settings,
      slots_super_flex: 1,
    },
  };
  const firstQb = player("qb-1", "Roster Quarterback", "QB", 20);
  const secondQb = player("qb-2", "Superflex Quarterback", "QB", 21);
  const thirdQb = player("qb-3", "Excess Quarterback", "QB", 22);
  const receiver = player("wr-open", "Open Starter Receiver", "WR", 23);
  const picks = [
    draftedPlayer(1, firstQb, 2),
    draftedPlayer(2, secondQb, 2),
  ];
  const teams = buildTeamDraftStates({
    draft: superflexDraft,
    users,
    rosters,
    picks,
  });
  const recommendations = recommendPlayers({
    available: [thirdQb, receiver],
    allPlayers: [firstQb, secondQb, thirdQb, receiver],
    teams,
    userRosterId: 2,
    cursor: getDraftCursor(superflexDraft, picks, 2),
    controls: {
      watchlist: [],
      queue: [],
      target: [],
      sleeper: [],
      avoid: [],
    },
    draft: superflexDraft,
  });
  const excess = recommendations.find((item) => item.player.id === thirdQb.id)!;
  const openStarter = recommendations.find(
    (item) => item.player.id === receiver.id,
  )!;
  assert.equal(recommendations[0].player.id, receiver.id);
  assert.equal(factorScore(excess, "bench-balance") < 0, true);
  assert.equal(
    factorScore(openStarter, "roster-fit") >
      factorScore(excess, "roster-fit"),
    true,
  );
});

test("the engine scores useful stacks, bye/risk concentration and role uncertainty", () => {
  const rosterQb = player("stack-qb", "Dallas Quarterback", "QB", 15, {
    team: "DAL",
    byeWeek: 9,
  });
  const stackReceiver = player("stack-wr", "Dallas Receiver", "WR", 16, {
    team: "DAL",
    byeWeek: 9,
  });
  const uncertainReceiver = player(
    "risk-wr",
    "Uncertain Receiver",
    "WR",
    16,
    {
      team: "NYJ",
      byeWeek: 9,
      injuryStatus: "Questionable",
      news: [
        {
          id: "role",
          title: "Workload competition",
          summary: "Expected to split snaps in a committee.",
          impact: "Uncertain role and limited workload.",
          publishedAt: null,
          sourceUrl: null,
        },
      ],
    },
  );
  const picks = [draftedPlayer(1, rosterQb, 2)];
  const teams = buildTeamDraftStates({ draft, users, rosters, picks });
  const recommendations = recommendPlayers({
    available: [uncertainReceiver, stackReceiver],
    allPlayers: [rosterQb, uncertainReceiver, stackReceiver],
    teams,
    userRosterId: 2,
    cursor: getDraftCursor(draft, picks, 2),
    controls: {
      watchlist: [],
      queue: [],
      target: [],
      sleeper: [],
      avoid: [],
    },
    draft,
  });
  const stack = recommendations.find((item) => item.player.id === stackReceiver.id)!;
  const uncertain = recommendations.find(
    (item) => item.player.id === uncertainReceiver.id,
  )!;
  assert.equal(
    factorScore(stack, "stack-correlation") > 0,
    true,
  );
  assert.equal(uncertain.risk, "Medium");
  assert.equal(
    factorScore(uncertain, "availability-risk") < 0,
    true,
  );
  assert.equal(
    (uncertain.outcomeRange?.ceiling ?? 0) -
      (uncertain.outcomeRange?.floor ?? 0) >
      (stack.outcomeRange?.ceiling ?? 0) - (stack.outcomeRange?.floor ?? 0),
    true,
  );
});

test("all opponent rosters, picks before the turn, runs and slides affect market pressure", () => {
  const runPlayers = Array.from({ length: 4 }, (_, index) =>
    player(`run-${index}`, `Run Back ${index}`, "RB", index + 1),
  );
  const otherPlayers = [
    player("recent-wr", "Recent Receiver", "WR", 5),
    player("recent-te", "Recent Tight End", "TE", 6),
  ];
  const picks = [...runPlayers, ...otherPlayers].map((item, index) =>
    draftedPlayer(index + 1, item, (index % 4) + 1),
  );
  const slidingBack = player("slide-rb", "Sliding Runner", "RB", 7, {
    adp: 1,
  });
  const teams = buildTeamDraftStates({ draft, users, rosters, picks });
  const recommendation = recommendPlayers({
    available: [slidingBack],
    allPlayers: [...runPlayers, ...otherPlayers, slidingBack],
    teams,
    userRosterId: 2,
    cursor: getDraftCursor(draft, picks, 2),
    controls: {
      watchlist: [slidingBack.id],
      queue: [slidingBack.id],
      target: [slidingBack.id],
      sleeper: [slidingBack.id],
      avoid: [],
    },
    draft,
  })[0];
  const market = recommendation.factors?.find(
    (factor) => factor.key === "draft-market",
  );
  const opponents = recommendation.factors?.find(
    (factor) => factor.key === "opponent-demand",
  );
  const saved = recommendation.factors?.find(
    (factor) => factor.key === "draft-controls",
  );
  assert.equal((market?.score ?? 0) >= 10, true);
  assert.match(market?.value ?? "", /4 RBs in the last 6 picks/);
  assert.match(opponents?.value ?? "", /opponent roster/);
  assert.equal((saved?.score ?? 0) > 20, true);
  assert.match(saved?.value ?? "", /Watch.*Target.*Sleeper.*Queue #1/);
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
