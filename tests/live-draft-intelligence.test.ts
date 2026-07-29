import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDraftBoardRows,
  buildQueueDepletionWarning,
  buildWaitGuidance,
  compareRecommendations,
  detectDraftedControlledPlayers,
  detectPositionRun,
  nextUserDecisionPick,
  tierBreakForPlayer,
} from "../src/features/live-draft/liveIntelligence.ts";
import {
  buildTeamDraftStates,
  getDraftCursor,
  type DraftControlState,
  type DraftRecommendation,
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
  position: PlayerIntelligence["position"],
  ecr: number,
  tier: number,
): PlayerIntelligence {
  return {
    id,
    name: `Player ${id}`,
    position,
    team: "DAL",
    positionRank: `${position}${ecr}`,
    ecr,
    tier,
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
  status: "drafting",
  start_time: null,
  draft_order: null,
  slot_to_roster_id: Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => [String(index + 1), index + 1]),
  ),
  settings: {
    teams: 14,
    rounds: 17,
    pick_timer: 120,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 1,
    slots_k: 1,
    slots_def: 1,
    slots_bn: 8,
  },
};

const users: LeagueUser[] = Array.from({ length: 14 }, (_, index) => ({
  user_id: `u${index + 1}`,
  display_name: `Team ${index + 1}`,
  avatar: null,
  metadata: null,
}));

const rosters: Roster[] = Array.from({ length: 14 }, (_, index) => ({
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
  pickNo: number,
  id: string,
  position: string,
): SleeperDraftPick {
  const slot =
    Math.floor((pickNo - 1) / 14) % 2 === 0
      ? ((pickNo - 1) % 14) + 1
      : 14 - ((pickNo - 1) % 14);
  return {
    player_id: id,
    picked_by: `u${slot}`,
    roster_id: slot,
    round: Math.floor((pickNo - 1) / 14) + 1,
    draft_slot: slot,
    pick_no: pickNo,
    is_keeper: false,
    metadata: {
      first_name: "Player",
      last_name: id,
      position,
    },
  };
}

const controls: DraftControlState = {
  watchlist: [],
  queue: ["a", "b", "c"],
  target: ["b"],
  sleeper: ["c"],
  avoid: [],
};

test("the draft board contains all 238 cells in a 14-team 17-round snake grid", () => {
  const teams = buildTeamDraftStates({ draft, users, rosters, picks: [] });
  const rows = buildDraftBoardRows(draft, teams, [pick(1, "a", "RB")]);
  assert.equal(rows.length, 17);
  assert.equal(rows.every((row) => row.cells.length === 14), true);
  assert.equal(rows.flatMap((row) => row.cells).length, 238);
  assert.equal(rows[0].cells[0].pick?.player_id, "a");
  assert.equal(rows[1].cells[0].pickNumber, 28);
  assert.equal(rows[1].cells[13].pickNumber, 15);
});

test("four running backs in the last six picks triggers a position-run alert", () => {
  const picks = [
    pick(1, "a", "WR"),
    pick(2, "b", "RB"),
    pick(3, "c", "RB"),
    pick(4, "d", "TE"),
    pick(5, "e", "RB"),
    pick(6, "f", "RB"),
  ];
  const alert = detectPositionRun(picks);
  assert.equal(alert?.position, "RB");
  assert.equal(alert?.count, 4);
  assert.equal(alert?.window, 6);
});

test("tier breaks and market position produce explicit draft-now versus wait guidance", () => {
  const available = [
    player("a", "RB", 12, 2),
    player("b", "RB", 13, 2),
    player("c", "RB", 21, 3),
    player("d", "WR", 70, 5),
  ];
  const tierBreak = tierBreakForPlayer(available[0], available);
  assert.equal(tierBreak?.urgent, true);
  assert.equal(tierBreak?.remainingInTier, 2);
  const now = buildWaitGuidance({
    player: available[0],
    nextDecisionPick: 27,
    tierBreak,
    positionRun: null,
  });
  assert.equal(now.guidance, "Draft now");
  assert.equal((now.survivalProbability ?? 100) < 45, true);

  const wait = buildWaitGuidance({
    player: available[3],
    nextDecisionPick: 27,
    tierBreak: tierBreakForPlayer(available[3], available),
    positionRun: null,
  });
  assert.equal(wait.guidance, "Likely safe to wait");
  assert.equal((wait.survivalProbability ?? 0) > 72, true);
});

test("the next-decision calculation skips the current user pick on a snake turn", () => {
  const currentPicks = Array.from({ length: 6 }, (_, index) =>
    pick(index + 1, String(index + 1), index % 2 ? "WR" : "RB"),
  );
  const cursor = getDraftCursor(draft, currentPicks, 7);
  assert.equal(cursor.currentPick, 7);
  assert.equal(cursor.isUserTurn, true);
  assert.equal(
    nextUserDecisionPick({
      draft,
      picks: currentPicks,
      cursor,
      userRosterId: 7,
      slotMap: draft.slot_to_roster_id,
    }),
    22,
  );
});

test("queued, targeted and sleeper players are detected when drafted and deplete the queue", () => {
  const board = [
    player("a", "RB", 1, 1),
    player("b", "WR", 2, 1),
    player("c", "TE", 3, 1),
  ];
  const drafted = detectDraftedControlledPlayers(
    controls,
    board,
    [pick(1, "b", "WR"), pick(2, "c", "TE")],
  );
  assert.equal(drafted.length, 2);
  assert.deepEqual(drafted[1].kinds, ["queue", "target"]);
  assert.deepEqual(drafted[0].kinds, ["queue", "sleeper"]);
  const warning = buildQueueDepletionWarning(
    controls,
    [board[0]],
    drafted,
    4,
  );
  assert.equal(warning.level, "yellow");
  assert.equal(warning.remaining, 1);
  assert.equal(warning.drafted, 2);
});

test("recommendation changes preserve new, rising and falling rank evidence", () => {
  const recommendation = (
    item: PlayerIntelligence,
    score: number,
  ): DraftRecommendation => ({
    player: item,
    score,
    vor: null,
    scarcity: null,
    adpDelta: null,
    risk: "Low",
    reasons: [],
  });
  const a = player("a", "RB", 1, 1);
  const b = player("b", "WR", 2, 1);
  const c = player("c", "TE", 3, 1);
  const changes = compareRecommendations(
    [recommendation(a, 90), recommendation(b, 80)],
    [recommendation(b, 88), recommendation(c, 76), recommendation(a, 70)],
  );
  assert.equal(changes.get("b")?.kind, "up");
  assert.equal(changes.get("b")?.rankDelta, 1);
  assert.equal(changes.get("c")?.kind, "new");
  assert.equal(changes.get("a")?.kind, "down");
  assert.equal(changes.get("a")?.scoreDelta, -20);
});
