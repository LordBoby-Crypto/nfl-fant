import assert from "node:assert/strict";
import test from "node:test";
import {
  runFullDraftRehearsal,
  type DraftRehearsalResult,
} from "../src/features/rehearsal/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../src/types.ts";
import { reconcileDraftPicks } from "../src/services/sleeper.ts";
import { withAutomaticRetry } from "../src/services/reliability.ts";
import { selectRecoverablePlayerBoard } from "../src/services/offline.ts";
import { validateWarRoomSession } from "../src/services/sessionState.ts";
import {
  createDraftPreferenceBackup,
  parseDraftPreferenceBackup,
} from "../src/features/safety/model.ts";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";

const teams = 14;
const rounds = 17;

const draft: Draft = {
  draft_id: "milestone-15-rehearsal",
  league_id: "league",
  type: "snake",
  status: "drafting",
  start_time: 1,
  draft_order: Object.fromEntries(
    Array.from({ length: teams }, (_, index) => [`u${index + 1}`, index + 1]),
  ),
  slot_to_roster_id: Object.fromEntries(
    Array.from({ length: teams }, (_, index) => [String(index + 1), index + 1]),
  ),
  settings: {
    teams,
    rounds,
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

const users: LeagueUser[] = Array.from({ length: teams }, (_, index) => ({
  user_id: `u${index + 1}`,
  display_name: `Team ${index + 1}`,
  avatar: null,
  metadata: null,
}));

const rosters: Roster[] = users.map((user, index) => ({
  roster_id: index + 1,
  owner_id: user.user_id,
  players: [],
  keepers: [],
  reserve: [],
  starters: [],
  settings: {
    wins: 0,
    losses: 0,
    ties: 0,
    waiver_position: index + 1,
    waiver_budget_used: 0,
  },
}));

const positionCycle: PlayerIntelligence["position"][] = [
  "RB",
  "WR",
  "WR",
  "RB",
  "QB",
  "TE",
  "RB",
  "WR",
  "TE",
  "QB",
  "DST",
  "K",
];

const board: PlayerIntelligence[] = Array.from({ length: 280 }, (_, index) => {
  const ecr = index + 1;
  const position = positionCycle[index % positionCycle.length];
  return {
    id: `player-${ecr}`,
    name: `Rehearsal Player ${ecr}`,
    position,
    team: `T${(index % 32) + 1}`,
    positionRank: `${position}${Math.ceil(ecr / positionCycle.length)}`,
    ecr,
    tier: Math.ceil(ecr / 14),
    adp: ecr + ((index % 5) - 2),
    projectedPoints: Math.max(60, 340 - ecr * 0.72),
    expertBest: Math.max(1, ecr - 5),
    expertWorst: ecr + 7,
    expertAverage: ecr,
    injuryStatus: index % 61 === 0 ? "Questionable" : "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 5 + (index % 10),
    news: [],
  };
});

const controls: DraftControlState = {
  watchlist: ["player-19", "player-63"],
  queue: ["player-8", "player-22", "player-44"],
  target: ["player-11", "player-37"],
  sleeper: ["player-91"],
  avoid: ["player-2", "player-279"],
};

const results: DraftRehearsalResult[] = [1, 7, 14].map((slot) =>
  runFullDraftRehearsal({
    draft,
    users,
    rosters,
    board,
    userRosterId: 7,
    slot,
    controls,
  }),
);

test("complete 238-pick rehearsals pass from early, middle and late slots", () => {
  for (const result of results) {
    assert.equal(result.completed, true, `slot ${result.slot} did not complete`);
    assert.equal(result.completedPicks, 238);
    assert.equal(result.uniquePlayers, 238);
    assert.equal(result.userSelections.length, 17);
    assert.deepEqual(result.violations, []);
  }
});

test("every selected player disappears from availability and recommendations", () => {
  assert.equal(results.every((result) => result.violations.length === 0), true);
  assert.equal(
    results.every((result) => result.uniquePlayers === result.completedPicks),
    true,
  );
});

test("recommendations recalculate within the draft-day performance budget", (context) => {
  for (const result of results) {
    assert.equal(result.recommendationRecalculations, 237);
    assert.ok(
      result.recommendationTimingMs.p95 < 50,
      `slot ${result.slot} p95 was ${result.recommendationTimingMs.p95}ms`,
    );
    assert.ok(
      result.recommendationTimingMs.max < 250,
      `slot ${result.slot} max was ${result.recommendationTimingMs.max}ms`,
    );
    context.diagnostic(
      `slot ${result.slot}: p50 ${result.recommendationTimingMs.p50}ms, ` +
        `p95 ${result.recommendationTimingMs.p95}ms, ` +
        `max ${result.recommendationTimingMs.max}ms`,
    );
  }
});

test("internet loss retains the last board and reconnect merges missing picks", async () => {
  const previous = Array.from({ length: 100 }, (_, index) => ({
    player_id: `player-${index + 1}`,
    pick_no: index + 1,
  })) as SleeperDraftPick[];
  const reconnectPayload = [
    ...previous.filter((pick) => pick.pick_no !== 51),
    { player_id: "player-101", pick_no: 101 } as SleeperDraftPick,
  ];
  let attempts = 0;
  const recovered = await withAutomaticRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("Failed to fetch");
      return reconnectPayload;
    },
    { attempts: 3, baseDelayMs: 0 },
  );
  const reconciled = reconcileDraftPicks(previous, recovered.value);
  assert.equal(recovered.attempts, 3);
  assert.equal(reconciled.regressed, true);
  assert.equal(reconciled.retained, 1);
  assert.equal(reconciled.picks.length, 101);
  assert.equal(reconciled.picks[50]?.pick_no, 51);
});

test("FantasyPros downtime retains the last complete ranked board", () => {
  const cached = {
    players: board,
    fetchedAt: "2026-07-30T18:00:00.000Z",
    datasetFetchedAt: { rankings: "2026-07-30T18:00:00.000Z" },
    attribution: "Data obtained from FantasyPros.",
    totalExperts: 100,
    datasetErrors: {},
  };
  const partial = {
    ...cached,
    players: board.map((player) => ({ ...player, ecr: null, tier: null })),
    datasetErrors: { rankings: "FantasyPros temporarily unavailable." },
  };
  const result = selectRecoverablePlayerBoard(cached, partial, false);
  assert.equal(result.usingCachedBoard, true);
  assert.equal(result.value.players.length, 280);
  assert.equal(result.value.players[0]?.ecr, 1);
});

test("expired War Room sessions are rejected while renewed sessions validate", () => {
  const now = Date.parse("2026-07-30T18:00:00.000Z");
  assert.equal(
    validateWarRoomSession({ token: "expired", expiresAt: now - 1 }, now),
    null,
  );
  assert.deepEqual(
    validateWarRoomSession(
      { token: "renewed-token", expiresAt: now + 60 * 60_000 },
      now,
    ),
    { token: "renewed-token", expiresAt: now + 60 * 60_000 },
  );
});

test("desktop preferences import safely on a phone-sized second device", () => {
  const desktopExport = createDraftPreferenceBackup(
    controls,
    new Date("2026-07-30T18:00:00.000Z"),
  );
  const phoneImport = parseDraftPreferenceBackup(
    JSON.stringify(desktopExport),
  );
  assert.deepEqual(phoneImport.controls, controls);
  assert.deepEqual(phoneImport.controls.queue, controls.queue);
});
