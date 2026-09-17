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
  overrides: Partial<SleeperPlayer> = {},
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
    active: true,
    depth_chart_position: position,
    depth_chart_order: 1,
    search_rank: 100,
    age: 25,
    years_exp: 3,
    ...overrides,
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
    index === 7 ? 95 : 270 - index * 9,
    index === 7 ? 190 : index + 20,
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

test("a defense stays DST and replaces the weak rostered defense", () => {
  const weakDefenseBoard = rosterBoard.map((player) =>
    player.name === "Roster Player 7"
      ? intelligence("fp-7", "Roster Player 7", "DST", 45, 240)
      : player,
  );
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...weakDefenseBoard,
      intelligence("fp-ne", "New England Patriots", "DST", 155, 90),
    ],
    sleeperPlayers: {
      ...sleeperPlayers,
      ne: sleeper("ne", "New England Patriots", "DEF"),
    },
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const defense = result.recommendations.find(
    (item) => item.player.name === "New England Patriots",
  );
  assert.equal(defense?.position, "DST");
  assert.equal(defense?.drop?.player.position, "DST");
  assert.equal(defense?.drop?.player.name, "Roster Player 7");
});

test("a harmful swap is shown only as hold and not as an actionable upgrade", () => {
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("bad-wr", "Replacement Level Receiver", "WR", 35, 280),
    ],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const candidate = result.recommendations.find(
    (item) => item.player.name === "Replacement Level Receiver",
  );
  assert.equal(candidate?.actionVerdict, "Hold");
  assert.equal(candidate?.priority, "Watch");
  assert.equal(result.upgradeCount, 0);
  assert.match(result.noUpgradeReason ?? "", /none produced a meaningful improvement/i);
});

test("automatic protection prevents a cornerstone from becoming the suggested drop", () => {
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("free-te", "Useful Tight End", "TE", 180, 80),
    ],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  assert.equal(
    result.recommendations.some((item) => item.drop?.player.ecr === 20),
    false,
  );
  assert.equal(
    result.protectedPlayers.some((item) => item.player.name === "Roster Player 1"),
    true,
  );
});

test("a recent completed drop is labeled as a waiver claim", () => {
  const now = Date.UTC(2026, 8, 17, 16, 0, 0);
  const dropped: SleeperTransaction = {
    ...transaction(0, "drop"),
    type: "free_agent",
    status_updated: now - 12 * 60 * 60 * 1000,
    created: now - 12 * 60 * 60 * 1000,
    adds: null,
    drops: { "free-rb": 2 },
  };
  const league = snapshot();
  league.league.settings.waiver_clear_days = 2;
  const result = buildWaiverAssistant({
    snapshot: league,
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("fp-free-rb", "Breakout Runner", "RB", 310, 18),
    ],
    sleeperPlayers: {
      ...sleeperPlayers,
      "free-rb": sleeper("free-rb", "Breakout Runner", "RB"),
    },
    trendingAdds: [],
    transactions: [dropped],
    userRosterId: 1,
    now,
  });
  const recommendation = result.recommendations.find(
    (item) => item.player.name === "Breakout Runner",
  );
  assert.equal(recommendation?.availability, "Waivers");
  assert.equal(recommendation?.actionVerdict, "Claim now");
});

test("an occupied reserve slot does not consume an active roster spot", () => {
  const league = snapshot();
  league.league.roster_positions.push("IR");
  league.rosters[0].reserve = ["8"];
  const result = buildWaiverAssistant({
    snapshot: league,
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
  assert.equal(result.recommendations[0].moveType, "add-only");
  assert.equal(result.recommendations[0].drop, null);
});

test("all available players remain visible when the roster has no safe drop", () => {
  const protectedBoard = rosterBoard.map((player, index) => ({
    ...player,
    ecr: index + 1,
  }));
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...protectedBoard,
      intelligence("free-rb", "Available Runner", "RB", 240, 65),
    ],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const available = result.recommendations.find(
    (item) => item.player.name === "Available Runner",
  );
  assert.equal(available?.moveType, "no-safe-drop");
  assert.equal(available?.actionVerdict, "Hold");
  assert.match(available?.warning ?? "", /no safe drop/i);
});

test("the available-player board is not capped at sixty players", () => {
  const candidates = Array.from({ length: 75 }, (_, index) =>
    intelligence(
      `available-${index}`,
      `Available Player ${index}`,
      index % 2 ? "WR" : "RB",
      160 - index,
      80 + index,
    ),
  );
  const result = buildWaiverAssistant({
    snapshot: snapshot(["1", "2", "3", "4", "5", "6", "7"]),
    picks: [],
    board: [...rosterBoard, ...candidates],
    sleeperPlayers,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  assert.equal(result.recommendations.length, 76);
  assert.equal(
    result.recommendations.some((item) => item.player.name === "Available Player 74"),
    true,
  );
});

test("an unverified kicker cannot replace the roster's confirmed starter", () => {
  const board = rosterBoard.map((player) =>
    player.name === "Roster Player 6"
      ? intelligence("mevis", "Harrison Mevis", "K", 145, 145)
      : player,
  );
  const players = {
    ...sleeperPlayers,
    "6": sleeper("6", "Harrison Mevis", "K", {
      team: "LAR",
      depth_chart_position: "K",
      depth_chart_order: 1,
    }),
    matsuzawa: sleeper("matsuzawa", "Kansei Matsuzawa", "K", {
      team: "LV",
      depth_chart_position: null,
      depth_chart_order: null,
      search_rank: 668,
    }),
  };
  const result = buildWaiverAssistant({
    snapshot: snapshot(),
    picks: [],
    board: [
      ...board,
      intelligence("matsuzawa", "Kansei Matsuzawa", "K", 210, 80),
    ],
    sleeperPlayers: players,
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const candidate = result.recommendations.find(
    (item) => item.player.name === "Kansei Matsuzawa",
  );
  assert.equal(candidate?.actionVerdict, "Hold");
  assert.equal(candidate?.priority, "Watch");
  assert.match(candidate?.warning ?? "", /starting kicker/i);
});

test("a backup tight end cannot consume a capped TE spot or trigger a WR drop", () => {
  const league = snapshot();
  league.league.settings.position_limit_te = 1;
  const result = buildWaiverAssistant({
    snapshot: league,
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("farrell", "Luke Farrell", "TE", 85, 210),
    ],
    sleeperPlayers: {
      ...sleeperPlayers,
      farrell: sleeper("farrell", "Luke Farrell", "TE", {
        team: "SF",
        depth_chart_position: "TE",
        depth_chart_order: 2,
        search_rank: 491,
      }),
    },
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const candidate = result.recommendations.find(
    (item) => item.player.name === "Luke Farrell",
  );
  assert.equal(candidate?.actionVerdict, "Hold");
  assert.notEqual(candidate?.drop?.player.position, "WR");
  assert.match(candidate?.warning ?? "", /backup|depth chart/i);
});

test("a temporary quarterback does not replace another position when QB is full", () => {
  const league = snapshot();
  league.league.settings.position_limit_qb = 1;
  const result = buildWaiverAssistant({
    snapshot: league,
    picks: [],
    board: [
      ...rosterBoard,
      intelligence("lock", "Drew Lock", "QB", 330, 190),
    ],
    sleeperPlayers: {
      ...sleeperPlayers,
      lock: sleeper("lock", "Drew Lock", "QB", {
        team: "SEA",
        depth_chart_position: "QB",
        depth_chart_order: 1,
        search_rank: 691,
      }),
      darnold: sleeper("darnold", "Sam Darnold", "QB", {
        team: "SEA",
        injury_status: "Out",
        depth_chart_position: "QB",
        depth_chart_order: 2,
        search_rank: 93,
      }),
    },
    trendingAdds: [],
    transactions: [],
    userRosterId: 1,
  });
  const candidate = result.recommendations.find(
    (item) => item.player.name === "Drew Lock",
  );
  assert.equal(candidate?.actionVerdict, "Hold");
  assert.notEqual(candidate?.drop?.player.position, "WR");
  assert.match(candidate?.warning ?? "", /temporary|Sam Darnold/i);
});
