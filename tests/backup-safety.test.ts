import assert from "node:assert/strict";
import test from "node:test";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";
import type { PlayerBoardData } from "../src/features/player-intelligence/model.ts";
import {
  buildEmergencyCheatSheet,
  createDraftPreferenceBackup,
  getSessionClock,
  groupRankingsByPositionAndTier,
  normalizeDraftControls,
  parseDraftPreferenceBackup,
} from "../src/features/safety/model.ts";
import { selectRecoverablePlayerBoard } from "../src/services/offline.ts";

const controls: DraftControlState = {
  watchlist: ["p1", "p2"],
  queue: ["p2", "p1"],
  target: ["p1"],
  sleeper: ["p3"],
  avoid: ["p4"],
};

function board(): PlayerBoardData {
  return {
    players: [
      {
        id: "p1",
        name: "Alpha Runner",
        team: "DAL",
        position: "RB",
        positionRank: "RB1",
        ecr: 2,
        tier: 1,
        adp: 2.5,
        projectedPoints: 300,
        expertBest: 1,
        expertWorst: 4,
        expertAverage: 2,
        injuryStatus: "",
        injuryDetail: "",
        practiceStatus: "",
        byeWeek: 7,
        news: [],
      },
      {
        id: "p2",
        name: "Beta Receiver",
        team: "PHI",
        position: "WR",
        positionRank: "WR1",
        ecr: 1,
        tier: 1,
        adp: 1.4,
        projectedPoints: 310,
        expertBest: 1,
        expertWorst: 3,
        expertAverage: 1.5,
        injuryStatus: "",
        injuryDetail: "",
        practiceStatus: "",
        byeWeek: 9,
        news: [],
      },
      {
        id: "p3",
        name: "Gamma Runner",
        team: "KC",
        position: "RB",
        positionRank: "RB2",
        ecr: 7,
        tier: 2,
        adp: 8,
        projectedPoints: 255,
        expertBest: 4,
        expertWorst: 12,
        expertAverage: 7,
        injuryStatus: "",
        injuryDetail: "",
        practiceStatus: "",
        byeWeek: 10,
        news: [],
      },
    ],
    fetchedAt: "2026-07-30T16:00:00.000Z",
    datasetFetchedAt: { rankings: "2026-07-30T16:00:00.000Z" },
    attribution: "Data obtained from FantasyPros.",
    totalExperts: 100,
    datasetErrors: {},
  };
}

test("preference backup round-trips every draft-control list in queue order", () => {
  const backup = createDraftPreferenceBackup(
    controls,
    new Date("2026-07-30T16:30:00.000Z"),
  );
  const parsed = parseDraftPreferenceBackup(JSON.stringify(backup));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.exportedAt, "2026-07-30T16:30:00.000Z");
  assert.deepEqual(parsed.controls, controls);
  assert.deepEqual(parsed.controls.queue, ["p2", "p1"]);
});

test("preference import removes duplicate and invalid player identifiers", () => {
  assert.deepEqual(
    normalizeDraftControls({
      watchlist: ["p1", "p1", 7, null],
      queue: "not-an-array",
      target: ["p2"],
    }),
    {
      watchlist: ["p1"],
      queue: [],
      target: ["p2"],
      sleeper: [],
      avoid: [],
    },
  );
});

test("unsupported or unrelated JSON cannot overwrite draft preferences", () => {
  assert.throws(
    () => parseDraftPreferenceBackup('{"version":2,"controls":{}}'),
    /not a supported War Room preference backup/,
  );
});

test("emergency cheat sheet contains saved lists and cached ranked players", () => {
  const html = buildEmergencyCheatSheet(
    controls,
    board(),
    new Date("2026-07-30T16:45:00.000Z"),
  );
  assert.match(html, /Emergency Cheat Sheet/);
  assert.match(html, /Alpha Runner \(RB, DAL\)/);
  assert.match(html, /Beta Receiver/);
  assert.match(html, /Top 200 rankings/);
  assert.match(html, /FantasyPros data fetched/);
});

test("print groups preserve position order, FantasyPros tiers and ECR order", () => {
  const groups = groupRankingsByPositionAndTier(board().players);
  assert.deepEqual(
    groups.map((group) => group.position),
    ["QB", "RB", "WR", "TE", "K", "DST"],
  );
  const runningBacks = groups.find((group) => group.position === "RB");
  assert.deepEqual(
    runningBacks?.tiers.map((tier) => [tier.tier, tier.players.map((player) => player.id)]),
    [[1, ["p1"]], [2, ["p3"]]],
  );
});

test("session clock warns at thirty minutes and reports an expired session", () => {
  const now = Date.parse("2026-07-30T16:00:00.000Z");
  assert.equal(getSessionClock(now + 31 * 60_000, now).warning, false);
  const warning = getSessionClock(now + 30 * 60_000, now);
  assert.equal(warning.warning, true);
  assert.equal(warning.label, "30m");
  const expired = getSessionClock(now - 1, now);
  assert.equal(expired.expired, true);
  assert.equal(expired.label, "Expired");
});

test("a failed rankings refresh cannot overwrite the last-known ranked board", () => {
  const cached = board();
  const partial = {
    ...board(),
    players: board().players.map((player) => ({
      ...player,
      ecr: null,
      tier: null,
    })),
    datasetErrors: { rankings: "FantasyPros rankings are temporarily unavailable." },
  };

  const retained = selectRecoverablePlayerBoard(cached, partial, false);
  assert.equal(retained.usingCachedBoard, true);
  assert.equal(retained.value.players[0].ecr, 2);

  const refreshed = selectRecoverablePlayerBoard(cached, board(), true);
  assert.equal(refreshed.usingCachedBoard, false);
});
