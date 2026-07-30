import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostDraftReport,
  gradeLetter,
  isDraftComplete,
  shouldAutoOpenPostDraft,
} from "../src/features/post-draft/engine.ts";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  LeagueSnapshot,
  SleeperDraftPick,
  SleeperPlayer,
} from "../src/types.ts";

function player(
  id: string,
  name: string,
  position: PlayerIntelligence["position"],
  market: number,
  projectedPoints: number,
  options: Partial<PlayerIntelligence> = {},
): PlayerIntelligence {
  return {
    id,
    name,
    position,
    team: "DAL",
    positionRank: `${position}${market}`,
    ecr: market,
    tier: 2,
    adp: market,
    projectedPoints,
    expertBest: market - 2,
    expertWorst: market + 2,
    expertAverage: market,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 7,
    news: [],
    ...options,
  };
}

function sleeper(
  id: string,
  name: string,
  position: string,
  injuryStatus: string | null = null,
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
    injury_status: injuryStatus,
    status: "Active",
    age: 25,
    years_exp: 3,
  };
}

function pick(
  playerId: string,
  name: string,
  position: string,
  pickNo: number,
  rosterId: number,
): SleeperDraftPick {
  const [first_name, ...last] = name.split(" ");
  return {
    player_id: playerId,
    picked_by: rosterId === 1 ? "user" : "other",
    roster_id: rosterId,
    round: Math.ceil(pickNo / 14),
    draft_slot: rosterId,
    pick_no: pickNo,
    is_keeper: false,
    metadata: {
      first_name,
      last_name: last.join(" "),
      team: "DAL",
      position,
    },
  };
}

const userBoard = [
  player("1", "Anchor Runner", "RB", 1, 280),
  player("2", "Scarce Receiver", "WR", 15, 245),
  player("3", "Early Kicker", "K", 40, 120),
  player("4", "Waited Runner", "RB", 12, 250),
  player("5", "Steady Tight End", "TE", 25, 190),
  player("6", "Steady Quarterback", "QB", 32, 300),
  player("7", "Steady Defense", "DST", 33, 125),
  player("8", "Waited Receiver", "WR", 33, 230, {
    injuryStatus: "Questionable",
  }),
];
const opponentBoard = [
  player("9", "Other Quarterback", "QB", 2, 270),
  player("10", "Other Runner", "RB", 3, 220),
  player("11", "Other Receiver", "WR", 4, 215),
  player("12", "Other Tight End", "TE", 5, 175),
  player("13", "Other Flex", "WR", 6, 190),
  player("14", "Other Kicker", "K", 70, 115),
  player("15", "Other Defense", "DST", 71, 110),
  player("16", "Other Bench", "RB", 72, 160),
];
const availableBoard = [
  player("17", "Free Agent Star", "WR", 7, 255, { byeWeek: 9 }),
  player("18", "Free Agent Runner", "RB", 18, 225, { byeWeek: 10 }),
  player("19", "Free Agent Quarterback", "QB", 45, 260, { byeWeek: 11 }),
];
const board = [...userBoard, ...opponentBoard, ...availableBoard];

const picks = [
  pick("1", "Anchor Runner", "RB", 1, 1),
  pick("9", "Other Quarterback", "QB", 2, 2),
  pick("10", "Other Runner", "RB", 3, 2),
  pick("11", "Other Receiver", "WR", 4, 2),
  pick("12", "Other Tight End", "TE", 5, 2),
  pick("13", "Other Flex", "WR", 6, 2),
  pick("14", "Other Kicker", "K", 7, 2),
  pick("2", "Scarce Receiver", "WR", 8, 1),
  pick("15", "Other Defense", "DST", 9, 2),
  pick("16", "Other Bench", "RB", 10, 2),
  pick("3", "Early Kicker", "K", 17, 1),
  pick("4", "Waited Runner", "RB", 24, 1),
  pick("5", "Steady Tight End", "TE", 25, 1),
  pick("6", "Steady Quarterback", "QB", 32, 1),
  pick("7", "Steady Defense", "DST", 33, 1),
  pick("8", "Waited Receiver", "WR", 40, 1),
];

const snapshot: LeagueSnapshot = {
  league: {
    league_id: "league",
    name: "THE League",
    season: "2026",
    status: "in_season",
    total_rosters: 14,
    draft_id: "draft",
    previous_league_id: null,
    roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF", "BN"],
    settings: {
      num_teams: 14,
      playoff_teams: 6,
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
    start_time: 1,
    draft_order: { user: 1, other: 2 },
    slot_to_roster_id: { "1": 1, "2": 2 },
    settings: {
      teams: 14,
      rounds: 17,
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
    { user_id: "user", display_name: "User Team", avatar: null, metadata: null },
    { user_id: "other", display_name: "Other Team", avatar: null, metadata: null },
  ],
  rosters: [
    {
      roster_id: 1,
      owner_id: "user",
      players: userBoard.map((item) => item.id),
      keepers: [],
      reserve: [],
      starters: ["1", "2", "4", "5", "6", "7", "8"],
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
      owner_id: "other",
      players: opponentBoard.map((item) => item.id),
      keepers: [],
      reserve: [],
      starters: opponentBoard.slice(0, 7).map((item) => item.id),
      settings: {
        wins: 0,
        losses: 0,
        ties: 0,
        waiver_position: 2,
        waiver_budget_used: 0,
      },
    },
  ],
  fetchedAt: 1,
};

const sleeperPlayers = Object.fromEntries(
  [...userBoard, ...opponentBoard].map((item) => [
    item.id,
    sleeper(
      item.id,
      item.name,
      item.position === "DST" ? "DEF" : item.position,
      item.id === "8" ? "Questionable" : null,
    ),
  ]),
);

const controls: DraftControlState = {
  queue: [],
  watchlist: [],
  target: ["17"],
  sleeper: [],
  avoid: [],
};

function report() {
  return buildPostDraftReport({
    snapshot,
    picks,
    board,
    weeklyBoard: board.map((item) => ({
      ...item,
      projectedPoints:
        item.id === "8" ? 2 : (item.projectedPoints ?? 0) / 17,
    })),
    sleeperPlayers,
    userRosterId: 1,
    controls,
  })!;
}

test("post-draft mode activates only when Sleeper marks the draft complete", () => {
  assert.equal(isDraftComplete(snapshot), true);
  assert.equal(
    isDraftComplete({
      draft: { ...snapshot.draft, status: "drafting" },
    }),
    false,
  );
  assert.equal(shouldAutoOpenPostDraft("drafting", "complete"), true);
  assert.equal(shouldAutoOpenPostDraft("pre_draft", "complete"), true);
  assert.equal(shouldAutoOpenPostDraft("complete", "complete"), false);
});

test("numeric grades map to stable letter boundaries", () => {
  assert.equal(gradeLetter(94), "A+");
  assert.equal(gradeLetter(80), "B+");
  assert.equal(gradeLetter(64), "C");
  assert.equal(gradeLetter(40), "D");
});

test("selection review separates justified and unnecessary reaches", () => {
  const value = report();
  assert.equal(value.justifiedReaches.some((item) => item.name === "Scarce Receiver"), true);
  assert.equal(value.unnecessaryReaches.some((item) => item.name === "Early Kicker"), true);
  assert.equal(value.worstSelection?.name, "Early Kicker");
});

test("wait wins and best selection use actual pick versus market value", () => {
  const value = report();
  assert.equal(value.waitedOn.some((item) => item.name === "Waited Runner"), true);
  assert.equal(value.waitedOn.some((item) => item.name === "Waited Receiver"), true);
  assert.equal(value.bestSelection?.name, "Waited Runner");
});

test("report exposes four component grades and an honest overall explanation", () => {
  const value = report();
  assert.equal(Object.keys(value.grades).length, 4);
  assert.match(value.overall.explanation, /#\d+ of 2/);
  assert.match(value.overall.explanation, /unnecessary reach/);
  assert.equal(value.overall.score >= 0 && value.overall.score <= 100, true);
});

test("bye and injury concentrations are surfaced instead of hidden in the grade", () => {
  const value = report();
  assert.equal(value.byeConcentrations.some((item) => item.title.startsWith("Week 7")), true);
  assert.equal(value.injuryConcentration.players.includes("Waited Receiver"), true);
  assert.equal(value.grades.risk.explanation.includes("Higher is safer"), true);
});

test("undrafted rankings and saved draft intent seed the first waiver watchlist", () => {
  const value = report();
  assert.equal(value.bestAvailable[0].name, "Free Agent Star");
  assert.equal(value.waiverWatchlist[0].player.name, "Free Agent Star");
  assert.equal(value.waiverWatchlist[0].preferenceMatch, true);
});

test("Week 1 lineup uses the weekly board and returns weaknesses in priority order", () => {
  const value = report();
  assert.equal(value.weekOneProjectionReady, true);
  assert.equal(value.weekOneLineup.every((slot) => slot.player), true);
  assert.equal(value.weaknesses.length > 0, true);
});

test("missing FantasyPros matches are counted and never assigned fake value grades", () => {
  const unmatchedPick = pick("missing", "Unknown Rookie", "WR", 41, 1);
  const value = buildPostDraftReport({
    snapshot,
    picks: [...picks, unmatchedPick],
    board,
    weeklyBoard: null,
    sleeperPlayers: {
      ...sleeperPlayers,
      missing: sleeper("missing", "Unknown Rookie", "WR"),
    },
    userRosterId: 1,
    controls,
  })!;
  assert.equal(value.ungradedSelections, 1);
  assert.equal(value.reviewedSelections, 9);
});

test("the immediate report uses completed picks when Sleeper rosters are still lagging", () => {
  const laggingSnapshot = {
    ...snapshot,
    rosters: snapshot.rosters.map((roster) => ({ ...roster, players: [] })),
  };
  const value = buildPostDraftReport({
    snapshot: laggingSnapshot,
    picks,
    board,
    weeklyBoard: null,
    sleeperPlayers,
    userRosterId: 1,
    controls,
  })!;
  assert.equal(value.team.players.length, 8);
  assert.equal(value.reviewedSelections, 8);
});
