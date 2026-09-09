import assert from "node:assert/strict";
import test from "node:test";
import {
  activeRosterPlayerIds,
  analyzeTrade,
  assessAutomaticTradeMarket,
  findTradeSuggestions,
} from "../src/features/trades/engine.ts";
import type { TeamPlayer } from "../src/features/my-team/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type { LeagueSnapshot, SleeperPlayer } from "../src/types.ts";

interface FixturePlayer {
  id: string;
  name: string;
  position: PlayerIntelligence["position"];
  projection: number;
  ecr: number;
  rosterId: number;
}

const fixturePlayers: FixturePlayer[] = [
  { id: "u-qb", name: "User Quarterback", position: "QB", projection: 310, ecr: 22, rosterId: 1 },
  { id: "u-rb1", name: "User Lead Back", position: "RB", projection: 245, ecr: 24, rosterId: 1 },
  { id: "u-rb2", name: "User Thin Back", position: "RB", projection: 118, ecr: 158, rosterId: 1 },
  { id: "u-wr1", name: "User Alpha Wideout", position: "WR", projection: 282, ecr: 12, rosterId: 1 },
  { id: "u-wr2", name: "User Wideout Two", position: "WR", projection: 262, ecr: 19, rosterId: 1 },
  { id: "u-wr3", name: "User Surplus Wideout", position: "WR", projection: 250, ecr: 32, rosterId: 1 },
  { id: "u-te", name: "User Tight End", position: "TE", projection: 166, ecr: 76, rosterId: 1 },
  { id: "u-k", name: "User Kicker", position: "K", projection: 112, ecr: 205, rosterId: 1 },
  { id: "u-dst", name: "User Defense", position: "DST", projection: 108, ecr: 198, rosterId: 1 },
  { id: "u-b1", name: "User Bench Back", position: "RB", projection: 72, ecr: 220, rosterId: 1 },
  { id: "u-b2", name: "User Bench Receiver", position: "WR", projection: 220, ecr: 55, rosterId: 1 },
  { id: "u-b3", name: "User Bench Tight End", position: "TE", projection: 64, ecr: 232, rosterId: 1 },
  { id: "p-qb", name: "Partner Quarterback", position: "QB", projection: 305, ecr: 28, rosterId: 2 },
  { id: "p-rb1", name: "Partner Alpha Back", position: "RB", projection: 284, ecr: 9, rosterId: 2 },
  { id: "p-rb2", name: "Partner Back Two", position: "RB", projection: 258, ecr: 17, rosterId: 2 },
  { id: "p-rb3", name: "Partner Surplus Back", position: "RB", projection: 250, ecr: 32, rosterId: 2 },
  { id: "p-wr1", name: "Partner Wideout One", position: "WR", projection: 184, ecr: 91, rosterId: 2 },
  { id: "p-wr2", name: "Partner Thin Wideout", position: "WR", projection: 105, ecr: 181, rosterId: 2 },
  { id: "p-te", name: "Partner Tight End", position: "TE", projection: 160, ecr: 83, rosterId: 2 },
  { id: "p-k", name: "Partner Kicker", position: "K", projection: 110, ecr: 208, rosterId: 2 },
  { id: "p-dst", name: "Partner Defense", position: "DST", projection: 106, ecr: 201, rosterId: 2 },
  { id: "p-b1", name: "Partner Bench Back", position: "RB", projection: 70, ecr: 222, rosterId: 2 },
  { id: "p-b2", name: "Partner Bench Receiver", position: "WR", projection: 66, ecr: 228, rosterId: 2 },
  { id: "p-b3", name: "Partner Bench Tight End", position: "TE", projection: 62, ecr: 234, rosterId: 2 },
];

function snapshot(): LeagueSnapshot {
  const rosterPlayers = (rosterId: number) =>
    fixturePlayers
      .filter((player) => player.rosterId === rosterId)
      .map((player) => player.id);
  return {
    league: {
      league_id: "league",
      name: "THE League",
      season: "2026",
      status: "in_season",
      total_rosters: 2,
      draft_id: "draft",
      previous_league_id: null,
      roster_positions: [
        "QB",
        "RB",
        "RB",
        "WR",
        "WR",
        "TE",
        "FLEX",
        "K",
        "DEF",
        "BN",
        "BN",
        "BN",
      ],
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
      start_time: null,
      draft_order: null,
      slot_to_roster_id: { "1": 1, "2": 2 },
      settings: {
        teams: 2,
        rounds: 12,
        pick_timer: 60,
        slots_qb: 1,
        slots_rb: 2,
        slots_wr: 2,
        slots_te: 1,
        slots_flex: 1,
        slots_k: 1,
        slots_def: 1,
        slots_bn: 3,
      },
    },
    users: [
      {
        user_id: "user",
        display_name: "Your Team",
        avatar: null,
        metadata: { team_name: "Your Team" },
      },
      {
        user_id: "partner",
        display_name: "Trade Partner",
        avatar: null,
        metadata: { team_name: "Trade Partner" },
      },
    ],
    rosters: [
      {
        roster_id: 1,
        owner_id: "user",
        players: rosterPlayers(1),
        keepers: [],
        reserve: [],
        starters: rosterPlayers(1).slice(0, 9),
        settings: {
          wins: 0,
          losses: 0,
          ties: 0,
          waiver_position: 1,
          waiver_budget_used: 0,
        },
      },
      {
        roster_id: 2,
        owner_id: "partner",
        players: rosterPlayers(2),
        keepers: [],
        reserve: [],
        starters: rosterPlayers(2).slice(0, 9),
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

function board(): PlayerIntelligence[] {
  return fixturePlayers.map((player) => ({
    id: `fp-${player.id}`,
    name: player.name,
    team: "DAL",
    position: player.position,
    positionRank: `${player.position}${player.ecr}`,
    ecr: player.ecr,
    tier: 1,
    adp: player.ecr,
    projectedPoints: player.projection,
    expertBest: Math.max(1, player.ecr - 3),
    expertWorst: player.ecr + 4,
    expertAverage: player.ecr,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 8,
    news: [],
  }));
}

function sleeperPlayers(): Record<string, SleeperPlayer> {
  return Object.fromEntries(
    fixturePlayers.map((player) => [
      player.id,
      {
        player_id: player.id,
        first_name: player.name.split(" ")[0],
        last_name: player.name.split(" ").slice(1).join(" "),
        full_name: player.name,
        position: player.position === "DST" ? "DEF" : player.position,
        fantasy_positions: [player.position],
        team: "DAL",
        injury_status: null,
        status: "Active",
        age: 25,
        years_exp: 3,
      } satisfies SleeperPlayer,
    ]),
  );
}

function marketPlayer({
  id,
  name,
  position,
  projection,
  ecr,
}: {
  id: string;
  name: string;
  position: TeamPlayer["position"];
  projection: number;
  ecr: number;
}): TeamPlayer {
  return {
    sleeperId: id,
    name,
    team: "NFL",
    position,
    positionRank: `${position}${ecr}`,
    ecr,
    tier: 1,
    projectedPoints: projection,
    injuryStatus: "",
    reserve: false,
    starter: true,
  };
}

test("market guard rejects Tyler Warren for Parker Washington", () => {
  const result = assessAutomaticTradeMarket({
    userSends: [marketPlayer({ id: "warren", name: "Tyler Warren", position: "TE", projection: 205, ecr: 48 })],
    partnerSends: [marketPlayer({ id: "washington", name: "Parker Washington", position: "WR", projection: 142, ecr: 126 })],
  });
  assert.equal(result.eligible, false);
  assert.equal(result.fairnessScore < 64, true);
  assert.equal(result.reasons.some((reason) => reason.includes("one-for-one")), true);
});

test("market guard protects Justin Jefferson from a weak two-player package", () => {
  const result = assessAutomaticTradeMarket({
    userSends: [marketPlayer({ id: "jefferson", name: "Justin Jefferson", position: "WR", projection: 292, ecr: 8 })],
    partnerSends: [
      marketPlayer({ id: "mcmillan", name: "Tetairoa McMillan", position: "WR", projection: 242, ecr: 29 }),
      marketPlayer({ id: "harvey", name: "RJ Harvey", position: "RB", projection: 188, ecr: 67 }),
    ],
    userDrops: [marketPlayer({ id: "nailor", name: "Jalen Nailor", position: "WR", projection: 118, ecr: 174 })],
  });
  assert.equal(result.eligible, false);
  assert.equal(
    result.reasons.some((reason) => reason.includes("lacks a comparable centerpiece")),
    true,
  );
});

test("market guard allows a real cornerstone package with premium value", () => {
  const result = assessAutomaticTradeMarket({
    userSends: [marketPlayer({ id: "star", name: "Elite Wideout", position: "WR", projection: 286, ecr: 10 })],
    partnerSends: [
      marketPlayer({ id: "centerpiece", name: "Near-Elite Back", position: "RB", projection: 275, ecr: 15 }),
      marketPlayer({ id: "plus", name: "Useful Wideout", position: "WR", projection: 226, ecr: 44 }),
    ],
  });
  assert.equal(result.eligible, true);
  assert.equal(result.fairnessScore >= 64, true);
});

test("trade analyzer rebuilds both lineups and measures both teams' needs", () => {
  const result = analyzeTrade({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    partnerRosterId: 2,
    userSends: ["u-wr3"],
    partnerSends: ["p-rb3"],
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.user.sent.map((player) => player.sleeperId), ["u-wr3"]);
  assert.deepEqual(result.user.received.map((player) => player.sleeperId), ["p-rb3"]);
  assert.equal(result.user.after.players.some((player) => player.sleeperId === "p-rb3"), true);
  assert.equal(result.partner.after.players.some((player) => player.sleeperId === "u-wr3"), true);
  assert.equal(result.user.positionImpacts.some((impact) => impact.position === "RB"), true);
  assert.equal(result.partner.positionImpacts.some((impact) => impact.position === "WR"), true);
  assert.equal(result.reasons.length > 0, true);
});

test("trade analyzer penalizes an offer that creates an uncovered lineup need", () => {
  const result = analyzeTrade({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    partnerRosterId: 2,
    userSends: ["u-rb2"],
    partnerSends: ["p-qb"],
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.partner.needsCreated.includes("QB"), true);
  assert.equal(result.partner.after.lineup.some((slot) => slot.slot === "QB" && !slot.player), true);
  assert.equal(["favors-you", "needs-work"].includes(result.verdict), true);
  assert.equal(result.warnings.some((warning) => warning.includes("QB")), true);
});

test("trade analyzer validates ownership on both sides", () => {
  const result = analyzeTrade({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    partnerRosterId: 2,
    userSends: ["p-rb1"],
    partnerSends: ["u-wr1"],
  });
  assert.deepEqual(result, {
    valid: false,
    error: "Your side includes a player who is not on your roster.",
  });
});

test("trade analyzer requires real assets from both teams", () => {
  const result = analyzeTrade({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    partnerRosterId: 2,
    userSends: [],
    partnerSends: ["p-rb3"],
  });
  assert.deepEqual(result, {
    valid: false,
    error: "Select at least one player from each team.",
  });
});

test("multi-player offers preserve unique rosters and package evidence", () => {
  const result = analyzeTrade({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    partnerRosterId: 2,
    userSends: ["u-wr2", "u-wr3", "u-wr3"],
    partnerSends: ["p-rb2", "p-rb3"],
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.user.sent.length, 2);
  assert.equal(result.partner.sent.length, 2);
  assert.equal(result.userPackageValue > 0, true);
  assert.equal(result.partnerPackageValue > 0, true);
  assert.equal(result.fairnessScore >= 0 && result.fairnessScore <= 100, true);
});

test("automatic trade finder scans opponents and returns responsible offers", () => {
  const suggestions = findTradeSuggestions({
    snapshot: snapshot(),
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
  });
  assert.equal(suggestions.length > 0, true);
  const best = suggestions[0];
  assert.equal(best.analysis.valid, true);
  assert.equal(best.analysis.user.impactScore > 0, true);
  assert.equal(best.analysis.partner.impactScore >= -1.5, true);
  assert.equal(
    suggestions.every((suggestion) =>
      ["helps-both", "balanced"].includes(suggestion.analysis.verdict),
    ),
    true,
  );
  assert.equal(best.analysis.fairnessScore >= 55, true);
  assert.equal(
    suggestions.some((suggestion) =>
      [...suggestion.userSends, ...suggestion.partnerSends].some(
        (player) => player.position === "K" || player.position === "DST",
      ),
    ),
    false,
  );
  assert.equal(
    best.analysis.warnings.some((warning) => warning.includes("uncovered")),
    false,
  );
});

test("automatic finder keeps any uneven packages responsible after roster cuts", () => {
  const fullSnapshot = snapshot();
  const suggestions = findTradeSuggestions({
    snapshot: fullSnapshot,
    picks: [],
    board: board(),
    sleeperPlayers: sleeperPlayers(),
    userRosterId: 1,
    limit: 30,
  });
  const packages = suggestions.filter((suggestion) => suggestion.format !== "one-for-one");
  assert.equal(suggestions.length > 0, true);
  for (const suggestion of packages) {
    assert.equal(
      suggestion.format === "two-for-one"
        ? suggestion.partnerDrops.length
        : suggestion.userDrops.length,
      1,
    );
    assert.equal(
      suggestion.analysis.warnings.some(
        (warning) => warning.includes("uncovered") || warning.includes("over the"),
      ),
      false,
    );
    assert.equal(
      suggestion.analysis.user.after.players.length <=
        fullSnapshot.league.roster_positions.length,
      true,
    );
    assert.equal(
      suggestion.analysis.partner.after.players.length <=
        fullSnapshot.league.roster_positions.length,
      true,
    );
  }
});

test("active roster occupancy excludes IR and taxi but retains unresolved IDs", () => {
  const roster = snapshot().rosters[0];
  roster.reserve = ["u-b3"];
  roster.taxi = ["u-b1"];
  const activeIds = activeRosterPlayerIds(roster, []);
  assert.equal(activeIds.includes("u-b3"), false);
  assert.equal(activeIds.includes("u-b1"), false);
  assert.equal(activeIds.includes("u-b2"), true);
  roster.players.push("unresolved-player");
  assert.equal(
    activeRosterPlayerIds(roster, []).includes("unresolved-player"),
    true,
  );
});
