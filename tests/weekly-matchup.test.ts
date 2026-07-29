import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyDecisionModel,
} from "../src/features/weekly/engine.ts";
import type {
  LineupAssignment,
  TeamAnalysis,
  TeamPlayer,
} from "../src/features/my-team/engine.ts";
import type {
  LeagueSnapshot,
  SleeperMatchup,
  WeeklyOutlook,
} from "../src/types.ts";

function player(
  id: string,
  projectedPoints: number,
  currentStarter: boolean,
  injuryStatus = "",
): TeamPlayer {
  return {
    id,
    sleeperId: id,
    name: `Player ${id}`,
    position: "RB",
    team: "DAL",
    injuryStatus,
    byeWeek: 8,
    projectedPoints,
    ecr: 25,
    positionRank: "RB25",
    currentStarter,
    reserve: false,
    intelligence: {
      id,
      name: `Player ${id}`,
      team: "DAL",
      position: "RB",
      positionRank: "RB25",
      ecr: 25,
      tier: 3,
      adp: 28,
      projectedPoints,
      expertBest: 20,
      expertWorst: 35,
      expertAverage: 26,
      injuryStatus,
      injuryDetail: injuryStatus ? "Knee" : "",
      practiceStatus: injuryStatus ? "Did not practice" : "",
      byeWeek: 8,
      news: [],
    },
  };
}

function team(
  rosterId: number,
  overall: number,
  projection: number,
  lineup: LineupAssignment[] = [],
  players: TeamPlayer[] = [],
): TeamAnalysis {
  return {
    rosterId,
    teamName: `Team ${rosterId}`,
    players,
    lineup,
    bench: players.filter(
      (candidate) =>
        !lineup.some(
          (assignment) =>
            assignment.player?.sleeperId === candidate.sleeperId,
        ),
    ),
    depth: [],
    weaknesses: [],
    strength: {
      overall,
      rank: rosterId,
      totalTeams: 4,
      starterScore: overall,
      depthScore: overall,
      healthScore: 100,
      tier: overall >= 78 ? "Contender" : "Middle tier",
      confidence: "High",
    },
    projectedPoints: projection,
    lineupChanges: lineup.filter(
      (assignment) => assignment.change === "start",
    ).length,
    unresolvedPlayers: 0,
  };
}

function snapshot(): LeagueSnapshot {
  return {
    league: {
      league_id: "league",
      name: "THE League",
      season: "2026",
      status: "in_season",
      total_rosters: 4,
      draft_id: "draft",
      previous_league_id: null,
      roster_positions: ["RB", "BN"],
      settings: {
        num_teams: 4,
        playoff_teams: 2,
        playoff_week_start: 4,
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
      slot_to_roster_id: { "1": 1, "2": 2, "3": 3, "4": 4 },
      settings: {
        teams: 4,
        rounds: 2,
        pick_timer: 60,
        slots_qb: 0,
        slots_rb: 1,
        slots_wr: 0,
        slots_te: 0,
        slots_flex: 0,
        slots_k: 0,
        slots_def: 0,
        slots_bn: 1,
      },
    },
    users: [],
    rosters: [1, 2, 3, 4].map((rosterId) => ({
      roster_id: rosterId,
      owner_id: `u${rosterId}`,
      players: [],
      keepers: [],
      reserve: [],
      starters: [],
      settings: {
        wins: rosterId === 2 ? 1 : 0,
        losses: rosterId === 2 ? 0 : 1,
        ties: 0,
        waiver_position: rosterId,
        waiver_budget_used: 0,
        fpts: 100 - rosterId,
        fpts_decimal: 0,
      },
    })),
    fetchedAt: 0,
  };
}

function matchup(
  rosterId: number,
  matchupId: number,
  points = 0,
): SleeperMatchup {
  return {
    roster_id: rosterId,
    matchup_id: matchupId,
    points,
    custom_points: null,
    starters: [],
    players: [],
  };
}

function outlook(): WeeklyOutlook {
  return {
    state: {
      week: 1,
      display_week: 1,
      leg: 1,
      season: "2026",
      season_type: "regular",
    },
    currentWeek: 1,
    regularSeasonWeeks: 3,
    matchupsByWeek: {
      1: [
        matchup(1, 1, 12),
        matchup(2, 1, 15),
        matchup(3, 2),
        matchup(4, 2),
      ],
      2: [
        matchup(1, 1),
        matchup(3, 1),
        matchup(2, 2),
        matchup(4, 2),
      ],
      3: [
        matchup(1, 1),
        matchup(4, 1),
        matchup(2, 2),
        matchup(3, 2),
      ],
    },
    fetchedAt: 0,
  };
}

function teams() {
  return [
    team(1, 60, 100),
    team(2, 90, 120),
    team(3, 75, 108),
    team(4, 40, 86),
  ];
}

test("weekly matchup uses the published opponent and weekly projections", () => {
  const model = buildWeeklyDecisionModel({
    snapshot: snapshot(),
    outlook: outlook(),
    weeklyTeams: teams(),
    rosTeams: teams(),
    userRosterId: 1,
    playoffIterations: 600,
    seed: 9,
  });
  assert.equal(model.matchup?.opponent.rosterId, 2);
  assert.equal(model.matchup?.userPoints, 12);
  assert.equal(model.matchup?.opponentPoints, 15);
  assert.equal(model.matchup?.projectionSource, "weekly");
  assert.equal((model.matchup?.userWinProbability ?? 100) < 50, true);
});

test("start/sit calls identify the bench upgrade and injury action", () => {
  const start = player("start", 18, false);
  const sit = player("sit", 9, true, "Questionable");
  const injuredStarter = player("injured", 14, true, "Out");
  const lineup: LineupAssignment[] = [
    {
      key: "RB-RB",
      slot: "RB",
      label: "RB",
      player: start,
      change: "start",
    },
    {
      key: "FLEX-FLEX",
      slot: "FLEX",
      label: "FLEX",
      player: injuredStarter,
      change: "keep",
    },
  ];
  const weeklyTeams = [
    team(1, 60, 32, lineup, [start, sit, injuredStarter]),
    ...teams().slice(1),
  ];
  const model = buildWeeklyDecisionModel({
    snapshot: snapshot(),
    outlook: outlook(),
    weeklyTeams,
    rosTeams: teams(),
    userRosterId: 1,
    playoffIterations: 200,
  });
  assert.equal(model.startSit[0].start.sleeperId, "start");
  assert.equal(model.startSit[0].sit?.sleeperId, "sit");
  assert.equal(model.startSit[0].projectedGain, 9);
  assert.equal(
    model.injuries.some(
      (alert) =>
        alert.player.sleeperId === "injured" &&
        alert.severity === "critical" &&
        alert.lineupImpact === "Starter",
    ),
    true,
  );
});

test("playoff simulation is deterministic and schedule strength ranks every team", () => {
  const input = {
    snapshot: snapshot(),
    outlook: outlook(),
    weeklyTeams: teams(),
    rosTeams: teams(),
    userRosterId: 1,
    playoffIterations: 1000,
    seed: 44,
  };
  const first = buildWeeklyDecisionModel(input);
  const second = buildWeeklyDecisionModel(input);
  assert.deepEqual(first.playoffOdds, second.playoffOdds);
  assert.equal(first.playoffOdds[0].rosterId, 2);
  assert.equal(
    first.playoffOdds.reduce((sum, team) => sum + team.probability, 0) >= 198,
    true,
  );
  assert.equal(first.scheduleDifficulty.length, 4);
  assert.equal(first.scheduleDifficulty[0].rosterId, 4);
  assert.equal(first.userSchedule.length, 3);
});

test("missing Sleeper pairings produce honest pending results", () => {
  const empty = outlook();
  empty.matchupsByWeek = { 1: [], 2: [], 3: [] };
  const model = buildWeeklyDecisionModel({
    snapshot: snapshot(),
    outlook: empty,
    weeklyTeams: teams(),
    rosTeams: teams(),
    userRosterId: 1,
  });
  assert.equal(model.matchup, null);
  assert.deepEqual(model.playoffOdds, []);
  assert.equal(
    model.scheduleDifficulty.every((team) => team.label === "Pending"),
    true,
  );
});
