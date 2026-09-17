import assert from "node:assert/strict";
import test from "node:test";
import { buildPostDraftPriorities } from "../src/features/post-draft/commandCenter.ts";
import { buildPostDraftDataHealth } from "../src/features/post-draft/dataHealth.ts";
import type { PostDraftReport } from "../src/features/post-draft/engine.ts";
import type { PlayerBoardData } from "../src/features/player-intelligence/model.ts";

const NOW = Date.parse("2026-09-17T12:00:00Z");

function board(overrides: Partial<PlayerBoardData> = {}): PlayerBoardData {
  return {
    players: [],
    fetchedAt: "2026-09-17T11:55:00Z",
    datasetFetchedAt: {
      rankings: "2026-09-17T11:55:00Z",
      projections: "2026-09-17T11:55:00Z",
    },
    attribution: "FantasyPros",
    totalExperts: 100,
    datasetErrors: {},
    scoringCoverageAvailable: true,
    supportedScoringCategories: 8,
    partialScoringCategories: 1,
    unsupportedScoringCategories: 0,
    ...overrides,
  };
}

test("post-draft data health reports every live decision source", () => {
  const health = buildPostDraftDataHealth({
    snapshotFetchedAt: NOW - 60_000,
    picksFetchedAt: NOW - 60_000,
    picksError: null,
    board: board(),
    weeklyBoard: board(),
    dataError: null,
    now: NOW,
  });
  assert.equal(health.status, "healthy");
  assert.equal(health.items.length, 5);
  assert.deepEqual(health.coverage, {
    supported: 8,
    partial: 1,
    unsupported: 0,
    available: true,
  });
});

test("missing projections cannot masquerade as healthy data", () => {
  const missingProjectionBoard = board({
    datasetFetchedAt: { rankings: "2026-09-17T11:55:00Z" },
    datasetErrors: { projections: "FantasyPros projections did not load." },
    scoringCoverageAvailable: false,
  });
  const health = buildPostDraftDataHealth({
    snapshotFetchedAt: NOW - 60_000,
    picksFetchedAt: NOW - 60_000,
    picksError: null,
    board: missingProjectionBoard,
    weeklyBoard: null,
    dataError: null,
    now: NOW,
  });
  assert.equal(health.status, "unavailable");
  assert.equal(
    health.items.find((item) => item.id === "projections")?.status,
    "unavailable",
  );
  assert.equal(health.coverage.available, false);
});

test("post-draft command center creates one direct action per management area", () => {
  const report = {
    weekOneLineup: [
      { key: "wr-1", change: "start", player: { name: "Receiver" } },
      { key: "rb-1", change: "keep", player: { name: "Runner" } },
    ],
    weekOneProjectionReady: true,
    waiverWatchlist: [
      { player: { name: "Waiver Target" }, reason: "Addresses WR depth." },
    ],
    weaknesses: [
      { position: "WR", severity: "critical", detail: "Starting WR is uncovered." },
    ],
  } as unknown as PostDraftReport;
  const priorities = buildPostDraftPriorities(report, "warning");
  assert.deepEqual(
    priorities.map((priority) => priority.destination),
    ["Matchups", "Waivers", "Trades", "Safety"],
  );
  assert.equal(priorities[0].title, "Review 1 Week 1 lineup move");
  assert.equal(priorities[2].urgent, true);
  assert.equal(priorities[3].urgent, true);
});
