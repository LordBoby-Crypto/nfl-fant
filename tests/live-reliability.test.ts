import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDraftPicks,
  reconcileDraftPicks,
} from "../src/services/sleeper.ts";
import type { SleeperDraftPick } from "../src/types.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type { DraftRecommendation } from "../src/features/live-draft/engine.ts";
import {
  attachActualSelections,
  buildDataFreshness,
  buildPracticeLesson,
  manualDraftedPicks,
  markPlayerDraftedManually,
  mergeLiveReliabilityStates,
  normalizeLiveReliabilityState,
  reconcileManualCorrections,
  recordRecommendationRevision,
  reverseManualCorrection,
} from "../src/features/live-draft/liveReliability.ts";

function pick(
  pickNumber: number,
  playerId = `p${pickNumber}`,
  rosterId = 2,
): SleeperDraftPick {
  return {
    player_id: playerId,
    picked_by: `u${rosterId}`,
    roster_id: rosterId,
    round: 1,
    draft_slot: rosterId,
    pick_no: pickNumber,
    is_keeper: false,
    metadata: {
      first_name: `Player`,
      last_name: playerId,
      position: "RB",
      team: "DAL",
    },
  };
}

function player(id: string, name = `Player ${id}`): PlayerIntelligence {
  return {
    id,
    name,
    team: "DAL",
    position: "RB",
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
  };
}

function recommendation(
  item: PlayerIntelligence,
  score: number,
): DraftRecommendation {
  return {
    player: item,
    score,
    risk: "Low",
    reasons: [{ label: "League value", value: `${item.name} is strong value.` }],
    factors: [
      {
        key: "league-value",
        label: "League value",
        score,
        detail: "League-adjusted value",
      },
    ],
  };
}

test("Sleeper analysis detects reordered, missing, duplicate-number and duplicate-player picks", () => {
  const analysis = analyzeDraftPicks([
    pick(2, "p2"),
    pick(1, "p1"),
    pick(2, "replacement"),
    pick(4, "p1"),
  ], Date.parse("2026-08-11T12:00:00Z"));

  assert.equal(analysis.reordered, true);
  assert.equal(analysis.duplicatePickNumbers, 1);
  assert.equal(analysis.duplicatePlayers, 1);
  assert.equal(analysis.missingPickNumbers, 1);
  assert.deepEqual(
    analysis.picks.map((item) => [item.pick_no, item.player_id]),
    [[1, "p1"], [2, "replacement"]],
  );
  assert.deepEqual(
    new Set(analysis.diagnostics.map((item) => item.kind)),
    new Set(["reordered-picks", "duplicate-pick", "duplicate-player", "missing-pick"]),
  );
});

test("reconciliation never restores a player's old slot after Sleeper moves that player", () => {
  const result = reconcileDraftPicks(
    [pick(1, "p1"), pick(2, "p2"), pick(3, "p3")],
    [pick(1, "p1"), pick(2, "p3"), pick(3, "p2")],
  );
  assert.equal(result.regressed, false);
  assert.deepEqual(result.picks.map((item) => item.player_id), ["p1", "p3", "p2"]);
  assert.equal(new Set(result.picks.map((item) => item.player_id)).size, result.picks.length);
});

test("manual corrections are unique, reversible, and reconcile when Sleeper catches up", () => {
  const base = normalizeLiveReliabilityState(null, "draft-1");
  const marked = markPlayerDraftedManually(base, player("p1"), 100);
  const remarked = markPlayerDraftedManually(marked, player("p1"), 200);
  assert.equal(remarked.corrections.length, 1);
  assert.equal(manualDraftedPicks(remarked).length, 1);

  const reversed = reverseManualCorrection(remarked, remarked.corrections[0].id, 300);
  assert.equal(manualDraftedPicks(reversed).length, 0);

  const activeAgain = markPlayerDraftedManually(reversed, player("p1"), 400);
  const sleeperMatch = pick(7, "sleeper-provider-id");
  sleeperMatch.metadata.first_name = "Player";
  sleeperMatch.metadata.last_name = "p1";
  const reconciled = reconcileManualCorrections(activeAgain, [sleeperMatch], 500);
  assert.equal(reconciled.corrections[0].status, "reconciled");
  assert.equal(reconciled.corrections[0].reconciledPickNumber, 7);
  assert.equal(manualDraftedPicks(reconciled).length, 0);
});

test("every distinct on-clock recommendation is recorded and matched to the actual selection", () => {
  const alpha = player("alpha", "Alpha Runner");
  const beta = player("beta", "Beta Runner");
  const base = normalizeLiveReliabilityState(null, "draft-1");
  const first = recordRecommendationRevision(base, {
    pickNumber: 5,
    round: 2,
    slot: 1,
    recommendations: [recommendation(alpha, 90), recommendation(beta, 85)],
    proofs: new Map(),
    picks: [pick(1)],
    now: 1_000,
  });
  const changed = recordRecommendationRevision(first, {
    pickNumber: 5,
    round: 2,
    slot: 1,
    recommendations: [recommendation(beta, 92)],
    proofs: new Map(),
    picks: [pick(1), pick(2, "alpha")],
    now: 2_000,
  });
  const duplicate = recordRecommendationRevision(changed, {
    pickNumber: 5,
    round: 2,
    slot: 1,
    recommendations: [recommendation(beta, 92)],
    proofs: new Map(),
    picks: [pick(1), pick(2, "alpha")],
    now: 3_000,
  });
  assert.equal(duplicate.decisions[0].revisions.length, 2);
  assert.match(
    duplicate.decisions[0].revisions[1].changeExplanation,
    /Alpha Runner was selected at pick #2/,
  );

  const selectedPick = pick(5, "beta", 9);
  selectedPick.metadata.first_name = "Beta";
  selectedPick.metadata.last_name = "Runner";
  const withActual = attachActualSelections(duplicate, [selectedPick], 9, 4_000);
  assert.equal(withActual.decisions[0].actualSelection?.playerName, "Beta Runner");
});

test("desktop and phone ledgers merge revisions without resurrecting an older correction", () => {
  const base = normalizeLiveReliabilityState(null, "draft-1");
  const desktop = markPlayerDraftedManually(base, player("p1"), 1_000);
  const phone = reverseManualCorrection(desktop, desktop.corrections[0].id, 2_000);
  const desktopHistory = recordRecommendationRevision(desktop, {
    pickNumber: 3,
    round: 1,
    slot: 3,
    recommendations: [recommendation(player("a", "Desktop Choice"), 80)],
    proofs: new Map(),
    picks: [],
    now: 1_500,
  });
  const phoneHistory = recordRecommendationRevision(phone, {
    pickNumber: 3,
    round: 1,
    slot: 3,
    recommendations: [recommendation(player("b", "Phone Choice"), 82)],
    proofs: new Map(),
    picks: [],
    now: 2_500,
  });
  const merged = mergeLiveReliabilityStates(desktopHistory, phoneHistory);
  assert.equal(merged.corrections[0].status, "reversed");
  assert.equal(merged.decisions[0].revisions.length, 2);
});

test("freshness labels all five sources and uses live-draft Sleeper limits", () => {
  const now = Date.parse("2026-08-11T12:00:00Z");
  const items = buildDataFreshness({
    players: [],
    fetchedAt: new Date(now).toISOString(),
    datasetFetchedAt: {
      rankings: new Date(now - 7 * 60 * 60_000).toISOString(),
      projections: new Date(now - 60_000).toISOString(),
      injuries: new Date(now - 16 * 60_000).toISOString(),
      news: new Date(now - 60_000).toISOString(),
    },
    attribution: "FantasyPros",
    totalExperts: 1,
    datasetErrors: {},
  }, now - 16_000, "drafting", now);
  assert.deepEqual(items.map((item) => item.id), [
    "sleeper",
    "rankings",
    "projections",
    "injuries",
    "news",
  ]);
  assert.deepEqual(items.map((item) => item.status), [
    "Stale",
    "Stale",
    "Fresh",
    "Stale",
    "Fresh",
  ]);
});

test("practice lessons remove the simulated player and explain the new leader", () => {
  const alpha = player("alpha", "Alpha Runner");
  const beta = player("beta", "Beta Runner");
  const lesson = buildPracticeLesson(
    [recommendation(alpha, 90), recommendation(beta, 85)],
    [recommendation(beta, 88)],
    alpha,
    10,
  );
  assert.equal(lesson.before?.playerName, "Alpha Runner");
  assert.equal(lesson.after?.playerName, "Beta Runner");
  assert.match(lesson.explanation, /leaves the available pool/);
});
