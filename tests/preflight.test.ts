import assert from "node:assert/strict";
import test from "node:test";
import { buildReadinessReport } from "../src/features/preflight/engine.ts";
import type { PlayerBoardData } from "../src/features/player-intelligence/model.ts";
import {
  calculatePlayerMatchCoverage,
  deduplicateDraftPicks,
  reconcileDraftPicks,
} from "../src/services/sleeper.ts";
import { withAutomaticRetry } from "../src/services/reliability.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  LeagueSnapshot,
  SleeperDraftPick,
  SleeperPlayer,
} from "../src/types.ts";

const NOW = Date.parse("2026-07-29T20:00:00Z");

function snapshot(): LeagueSnapshot {
  return {
    league: {
      league_id: "league",
      name: "THE League",
      season: "2026",
      status: "pre_draft",
      total_rosters: 14,
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
        "BN",
        "BN",
        "BN",
        "BN",
        "BN",
      ],
      settings: {
        num_teams: 14,
        playoff_teams: 6,
        playoff_week_start: 15,
        reserve_slots: 2,
        waiver_budget: 100,
        trade_deadline: 11,
        max_keepers: 0,
      },
      scoring_settings: { rec: 1 },
    },
    draft: {
      draft_id: "draft",
      league_id: "league",
      type: "snake",
      status: "pre_draft",
      start_time: NOW + 7 * 24 * 60 * 60_000,
      draft_order: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => [`u${index + 1}`, index + 1]),
      ),
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
    },
    users: [],
    rosters: [],
    fetchedAt: NOW - 10_000,
  };
}

function board(): PlayerBoardData {
  const fresh = new Date(NOW - 60_000).toISOString();
  return {
    players: [],
    fetchedAt: fresh,
    datasetFetchedAt: {
      rankings: fresh,
      projections: fresh,
    },
    attribution: "Data obtained from FantasyPros.",
    totalExperts: 100,
    datasetErrors: {},
  };
}

function reportInput() {
  return {
    snapshot: snapshot(),
    snapshotTelemetry: {
      league: { attempts: 1, durationMs: 100 },
      draft: { attempts: 1, durationMs: 120 },
      rosters: { attempts: 1, durationMs: 90 },
      users: { attempts: 1, durationMs: 80 },
      totalDurationMs: 220,
    },
    snapshotError: null,
    draftPicks: {
      fetchedAt: NOW - 10_000,
      error: null,
      telemetry: {
        attempts: 1,
        durationMs: 90,
        received: 0,
        unique: 0,
        retained: 0,
      },
      retainedAfterError: false,
    },
    board: board(),
    boardError: null,
    sessionExpiresAt: NOW + 2 * 60 * 60_000,
    coverage: {
      matched: 340,
      total: 345,
      percentage: 98.6,
      unmatched: [],
    },
    playerFeed: {
      error: null,
      durationMs: 300,
      attempts: 1,
      lastSuccessfulAt: NOW - 5_000,
    },
    backend: {
      linked: true,
      configured: true,
      error: null,
      responseTimeMs: 220,
      lastSuccessfulAt: NOW - 5_000,
    },
    online: true,
    now: NOW,
  };
}

test("a fully configured draft produces a green readiness report", () => {
  const report = buildReadinessReport(reportInput());
  assert.equal(report.overall, "green");
  assert.equal(report.counts.red, 0);
  assert.equal(report.checks.length, 14);
  assert.equal(
    report.checks.find((check) => check.id === "player-matching")?.level,
    "green",
  );
});

test("missing draft date and order are blockers while a slow timer is a warning", () => {
  const input = reportInput();
  input.snapshot.draft.start_time = null;
  input.snapshot.draft.draft_order = null;
  input.snapshot.draft.settings.pick_timer = 24 * 60 * 60;
  const report = buildReadinessReport(input);
  assert.equal(report.overall, "red");
  assert.equal(
    report.blockers.some((check) => check.id === "draft-date"),
    true,
  );
  assert.equal(
    report.blockers.some((check) => check.id === "draft-order"),
    true,
  );
  assert.equal(
    report.warnings.some((check) => check.id === "draft-timer"),
    true,
  );
});

test("stale provider data and an expiring session cannot report green", () => {
  const input = reportInput();
  const stale = new Date(NOW - 30 * 60 * 60_000).toISOString();
  input.board.datasetFetchedAt.rankings = stale;
  input.board.datasetFetchedAt.projections = stale;
  input.sessionExpiresAt = NOW + 10 * 60_000;
  const report = buildReadinessReport(input);
  assert.equal(
    report.checks.find((check) => check.id === "fantasypros-rankings")?.level,
    "red",
  );
  assert.equal(
    report.checks.find((check) => check.id === "session")?.level,
    "yellow",
  );
});

function pick(pickNo: number, playerId = String(pickNo)) {
  return {
    player_id: playerId,
    picked_by: "u1",
    roster_id: 1,
    round: 1,
    draft_slot: pickNo,
    pick_no: pickNo,
    is_keeper: null,
    metadata: {},
  } satisfies SleeperDraftPick;
}

test("pick reconciliation removes duplicates and retains a complete board on regression", () => {
  assert.deepEqual(
    deduplicateDraftPicks([pick(2), pick(1), pick(2, "replacement")]).map(
      (item) => [item.pick_no, item.player_id],
    ),
    [[1, "1"], [2, "replacement"]],
  );
  const previous = [pick(1), pick(2), pick(3)];
  const reconciled = reconcileDraftPicks(previous, [pick(1), pick(2)]);
  assert.equal(reconciled.regressed, true);
  assert.equal(reconciled.retained, 1);
  assert.deepEqual(reconciled.picks, previous);
});

test("FantasyPros match coverage resolves Sleeper IDs by normalized name and position", () => {
  const fantasyPros = [
    {
      id: "fantasypros-1",
      name: "Zach Runner Jr.",
      position: "RB",
      team: "DAL",
      positionRank: "RB1",
      ecr: 1,
      tier: 1,
      adp: 1,
      projectedPoints: 300,
      expertBest: 1,
      expertWorst: 2,
      expertAverage: 1,
      injuryStatus: "",
      injuryDetail: "",
      practiceStatus: "",
      byeWeek: 7,
      news: [],
    },
    {
      id: "fantasypros-2",
      name: "Missing Receiver",
      position: "WR",
      team: "FA",
      positionRank: "WR2",
      ecr: 2,
      tier: 1,
      adp: 2,
      projectedPoints: 280,
      expertBest: 1,
      expertWorst: 3,
      expertAverage: 2,
      injuryStatus: "",
      injuryDetail: "",
      practiceStatus: "",
      byeWeek: 8,
      news: [],
    },
  ] satisfies PlayerIntelligence[];
  const sleeper = {
    "sleeper-1": {
      player_id: "sleeper-1",
      first_name: "Zach",
      last_name: "Runner",
      full_name: "Zach Runner",
      position: "RB",
      fantasy_positions: ["RB"],
      team: "DAL",
      injury_status: null,
      status: "Active",
      age: 25,
      years_exp: 3,
    },
  } satisfies Record<string, SleeperPlayer>;
  const coverage = calculatePlayerMatchCoverage(fantasyPros, sleeper);
  assert.equal(coverage.matched, 1);
  assert.equal(coverage.total, 2);
  assert.equal(coverage.percentage, 50);
  assert.deepEqual(coverage.unmatched, ["Missing Receiver"]);
});

test("automatic retry succeeds without running the operation more than needed", async () => {
  let attempts = 0;
  const result = await withAutomaticRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("temporary network failure");
      return "ready";
    },
    { attempts: 3, baseDelayMs: 0 },
  );
  assert.equal(result.value, "ready");
  assert.equal(result.attempts, 3);
  assert.equal(attempts, 3);
});
