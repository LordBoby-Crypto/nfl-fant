import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWaiverAssistant,
  summarizeWaiverBids,
} from "../src/features/waivers/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  LeagueSnapshot,
  SleeperPlayer,
  SleeperTransaction,
} from "../src/types.ts";

function intelligence(
  id: string,
  name: string,
  position: PlayerIntelligence["position"],
  projection: number,
  ecr: number,
): PlayerIntelligence {
  return {
    id,
    name,
    team: "DAL",
    position,
    positionRank: `${position}${ecr}`,
    ecr,
    tier: 1,
    adp: ecr,
    projectedPoints: projection,
    expertBest: ecr - 2,
    expertWorst: ecr + 2,
    expertAverage: ecr,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 8,
    news: [],
  };
}

function sleeper(
  id: string,
  name: string,
  position: string,
): SleeperPlayer {
  const [first_name, ...last] = name.split(" ");
  return {
    player_id: id,
    first_name,
    last_name: last.join(" "),
    full_name: name,
    position,
    fantasy_positions: [position],
    team: "DAL",
    injury_status: null,
    status: "Active",
    age: 25,
    years_exp: 3,
  };
}

function snapshot(userPlayers = ["1", "2", "3", "4", "5", "6", "7", "8"]): LeagueSnapshot {
  return {
    league: {
      league_id: "league",
      name: "THE League",
      season: "2026",
      status: "in_season",
      total_rosters: 2,
      draft_id: "draft",
      previous_league_id: null,
      roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BN"],
      settings: {
        num_teams: 2,
        playoff_teams: 1,
        playoff_week_start: 15,
        reserve_slots: 0,
        waiver_budget: 100,
        trade_deadline: 10,
        max_keepers: 0,
      },
      scoring_settings: { rec: 1 },
    },
    draft: {
      draft_id: "draft",
      league_id: "league",
      type: "snake",
      status: "complete",
      start_time: 0,
      draft_order: null,
      slot_to_roster_id: { "1": 1, "2": 2 },
      settings: {
        teams: 2,
        rounds: 8,
        pick_timer: 60,
        slots_qb: 1,
        slots_rb: 1,
        slots_wr: 1,
        slots_te: 1,
        slots_flex: 1,
        slots_k: 1,
        slots_def: 1,
        slots_bn: 1,
      },
    },
    users: [
      { user_id: "user", display_name: "User", avatar: null, metadata: null },
      { user_id: "other", display_name: "Other", avatar: null, metadata: null },
    ],
    rosters: [
      {
        roster_id: 1,
        owner_id: "user",
        players: userPlayers,
        keepers: [],
        reserve: [],
        starters: userPlayers.slice(0, 7),
        settings: {
          wins: 0,
          losses: 0,
          ties: 0,
          waiver_position: 4,
          waiver_budget_used: 35,
        },
      },
      {
        roster_id: 2,
        owner_id: "other",
        players: ["9", "10", "11", "12", "13", "14", "15", "16"],
        keepers: [],
        reserve: [],
        starters: ["9", "10", "11", "12", "13", "14", "15"],
        settings: {
          wins: 0,
          losses: 0,
          ties: 0,
          waiver_position: 2,
          waiver_budget_used: 0,
        },
      },
    ],
    fetchedAt: 0,
  };
}

const rosterPositions = [
  "QB", "RB", "WR", "TE", "WR", "K", "DST", "RB",
  "QB", "RB", "WR", "TE", "WR", "K", "DST", "RB",
] as const;
const sleeperPlayers = Object.fromEntries(
  rosterPositions.map((position, index) => {
    const id = String(index + 1);
    return [id, sleeper(id, `Roster Player ${id}`, position)];
  }),
);
const rosterBoard = rosterPositions.map((position, index) =>
  intelligence(
    `fp-${index + 1}`,
    `Roster Player ${index + 1}`,
    position,
    270 - index * 9,
    index + 20,
  ),
);

function transaction(bid: number, id: string): SleeperTransaction {
  return {
    transaction_id: id,
    type: "waiver",
    status: "complete",
    status_updated: 0,
    created: 0,
    leg: 1,
    roster_ids: [1],
    adds: { "20": 1 },
    drops: null,
    settings: { waiver_bid: bid },
    metadata: null,
  };
}

test("waiver bid climate uses completed FAAB claims only", () => {
  const failed = { ...transaction(99, "failed"), status: "failed" };
  const freeAgent = { ...transaction(0, "free"), type: "free_agent" };
  const result = summarizeWaiverBids([
    transaction(5, "1"),
    transaction(11, "2"),
    transaction(30, "3"),
    failed,
    freeAgent,
  ]);
  assert.deepEqual(result, {
    completedBids: 3,
    medianWinningBid: 11,
    highestWinningBid: 30,
  });
});

test("waiver assistant excludes rostered players and recommends a safe drop", () => {
  const freeAgent = intelligence("free-rb", "Breakout Runner", "RB", 310, 18);
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...rosterBoard,
      freeAgent,
      intelligence("free-wr", "Depth Receiver", "WR", 125, 145),
    ],
    sleeperPlayers: {
      ...sleeperPlayers,
      trend: sleeper("trend", "Breakout Runner", "RB"),
    },
    trendingAdds: [{ player_id: "trend", count: 6200 }],
    transactions: [transaction(9, "1"), transaction(15, "2")],
    userRosterId: 1,
  });

  assert.equal(result.remainingBudget, 65);
  assert.equal(result.spentBudget, 35);
  assert.equal(result.recommendations.some((item) => item.player.name === "Roster Player 1"), false);
  assert.equal(result.recommendations[0].player.name, "Breakout Runner");
  assert.equal(result.recommendations[0].drop?.player.name, "Roster Player 8");
  assert.equal(result.recommendations[0].trendingAdds, 6200);
  assert.equal(result.recommendations[0].faab.target <= 65, true);
  assert.equal(result.recommendations[0].faab.high <= 65, true);
  assert.equal(result.recommendations[0].rosterGain > 0, true);
});

test("an open roster spot produces an add-only recommendation", () => {
  const result = buildWaiverAssistant({
    snapshot: snapshot(["1", "2", "3", "4", "5", "6", "7"]),
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("free-rb", "Breakout Runner", "RB", 310, 18),
    ],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  assert.equal(result.rosterSpotsOpen, 1);
  assert.equal(result.recommendations[0].drop, null);
  assert.equal(result.recommendations[0].need, "Open slot");
});

test("zero remaining FAAB never recommends an unaffordable bid", () => {
  const noBudget = snapshot();
  noBudget.rosters[0].settings.waiver_budget_used = 100;
  const result = buildWaiverAssistant({
    snapshot: noBudget,
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("free-rb", "Breakout Runner", "RB", 310, 18),
    ],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  assert.equal(result.remainingBudget, 0);
  assert.deepEqual(result.recommendations[0].faab, {
    low: 0,
    target: 0,
    high: 0,
    budgetPercent: 0,
  });
});
