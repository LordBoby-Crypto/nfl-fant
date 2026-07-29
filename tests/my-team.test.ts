import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeLeagueTeams,
  optimizeLineup,
  type TeamPlayer,
} from "../src/features/my-team/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  LeagueSnapshot,
  SleeperPlayer,
} from "../src/types.ts";

function teamPlayer(
  id: string,
  position: TeamPlayer["position"],
  projectedPoints: number,
  currentStarter = false,
  injuryStatus = "",
): TeamPlayer {
  return {
    id,
    sleeperId: id,
    name: `Player ${id}`,
    position,
    team: "DAL",
    injuryStatus,
    byeWeek: 8,
    projectedPoints,
    ecr: Number(id),
    positionRank: `${position}${id}`,
    currentStarter,
    reserve: false,
    intelligence: null,
  };
}

function intelligence(
  id: string,
  position: PlayerIntelligence["position"],
  projectedPoints: number,
): PlayerIntelligence {
  return {
    id: `fp-${id}`,
    name: `Player ${id}`,
    team: "DAL",
    position,
    positionRank: `${position}${id}`,
    ecr: Number(id),
    tier: 1,
    adp: Number(id),
    projectedPoints,
    expertBest: Number(id),
    expertWorst: Number(id) + 2,
    expertAverage: Number(id) + 1,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 8,
    news: [],
  };
}

test("lineup optimizer starts the strongest eligible players and flex", () => {
  const players = [
    teamPlayer("1", "QB", 310, true),
    teamPlayer("2", "RB", 180, true),
    teamPlayer("3", "RB", 240, false),
    teamPlayer("4", "WR", 230, true),
    teamPlayer("5", "WR", 210, false),
    teamPlayer("6", "TE", 150, true),
    teamPlayer("7", "K", 125, true),
    teamPlayer("8", "DST", 120, true),
  ];
  const result = optimizeLineup(
    players,
    ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BN"],
  );
  assert.equal(result.lineup.find((slot) => slot.label === "RB")?.player?.id, "3");
  assert.equal(result.lineup.find((slot) => slot.label === "FLEX")?.player?.id, "5");
  assert.equal(result.lineup.find((slot) => slot.label === "RB")?.change, "start");
  assert.equal(result.bench.some((player) => player.id === "2"), true);
});

test("injured players are not promoted over healthy lineup options", () => {
  const result = optimizeLineup(
    [
      teamPlayer("1", "RB", 260, true, "Injured Reserve"),
      teamPlayer("2", "RB", 185, false),
    ],
    ["RB", "BN"],
  );
  assert.equal(result.lineup[0].player?.id, "2");
});

test("league analysis ranks all teams and identifies thin positions", () => {
  const snapshot: LeagueSnapshot = {
    league: {
      league_id: "league",
      name: "THE League",
      season: "2026",
      status: "pre_draft",
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
      status: "pre_draft",
      start_time: null,
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
      { user_id: "u1", display_name: "Strong", avatar: null, metadata: null },
      { user_id: "u2", display_name: "Thin", avatar: null, metadata: null },
    ],
    rosters: [
      {
        roster_id: 1,
        owner_id: "u1",
        players: ["1", "2", "3", "4", "5", "6", "7", "8"],
        keepers: [],
        reserve: [],
        starters: ["1", "2", "3", "4", "5", "6", "7"],
        settings: { wins: 0, losses: 0, ties: 0, waiver_position: 0, waiver_budget_used: 0 },
      },
      {
        roster_id: 2,
        owner_id: "u2",
        players: ["9", "10"],
        keepers: [],
        reserve: [],
        starters: ["9", "10"],
        settings: { wins: 0, losses: 0, ties: 0, waiver_position: 0, waiver_budget_used: 0 },
      },
    ],
    fetchedAt: 0,
  };
  const positions: PlayerIntelligence["position"][] = [
    "QB", "RB", "WR", "TE", "WR", "K", "DST", "RB", "QB", "RB",
  ];
  const board = positions.map((position, index) =>
    intelligence(String(index + 1), position, 310 - index * 12),
  );
  const sleeperPlayers = Object.fromEntries(
    positions.map((position, index) => {
      const id = String(index + 1);
      return [id, {
        player_id: id,
        first_name: "Player",
        last_name: id,
        full_name: `Player ${id}`,
        position: position === "DST" ? "DEF" : position,
        fantasy_positions: [position],
        team: "DAL",
        injury_status: null,
        status: "Active",
        age: 25,
        years_exp: 3,
      } satisfies SleeperPlayer];
    }),
  );
  const analyses = analyzeLeagueTeams({
    snapshot,
    picks: [],
    board,
    sleeperPlayers,
  });
  const strong = analyses.find((team) => team.rosterId === 1)!;
  const thin = analyses.find((team) => team.rosterId === 2)!;
  assert.equal(analyses.length, 2);
  assert.equal(strong.strength.rank, 1);
  assert.equal(thin.weaknesses.some((weakness) => weakness.severity === "critical"), true);
  assert.equal(strong.lineup.every((slot) => slot.player), true);
});
