import assert from "node:assert/strict";
import test from "node:test";
import type { PlayerBoardData, PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  DraftRecommendation,
  RecommendationFactor,
} from "../src/features/live-draft/engine.ts";
import type { NextTurnForecast } from "../src/features/live-draft/nextTurnForecast.ts";
import { buildRecommendationProofs } from "../src/features/live-draft/recommendationProof.ts";

const NOW = Date.parse("2026-08-03T20:00:00.000Z");

function player(
  id: string,
  name: string,
  leagueRank: number,
  overrides: Partial<PlayerIntelligence> = {},
): PlayerIntelligence {
  return {
    id,
    name,
    team: "DAL",
    position: "WR",
    positionRank: `WR${leagueRank}`,
    ecr: leagueRank,
    tier: 1,
    adp: leagueRank,
    projectedPoints: 250,
    expertBest: leagueRank - 2,
    expertWorst: leagueRank + 2,
    expertAverage: leagueRank,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 8,
    news: [],
    leagueRank,
    leaguePositionRank: leagueRank,
    leagueTier: 1,
    scoringConfidence: "high",
    scoringWarnings: [],
    ...overrides,
  };
}

const factorMeta: Array<[RecommendationFactor["key"], string, string]> = [
  ["league-value", "League-adjusted projection", "250.0 projected points"],
  ["rank", "Overall + position rank", "#5 overall · #5 WR"],
  ["replacement", "Value over replacement", "+20.0 points"],
  ["tier-scarcity", "Tier drop + scarcity", "Tier 1 · 8.0 drop"],
  ["adp", "ADP value", "5 picks past ADP — strong value"],
  ["outcome-range", "Floor / expected / ceiling", "220 / 250 / 280"],
  ["availability-risk", "Injury / suspension / workload", "Low — no active warning"],
  ["expert-agreement", "Expert disagreement", "4-rank spread — strong agreement"],
  ["offense-role", "Offense + depth-chart competition", "Strong offense"],
  ["roster-fit", "Starting lineup + flex fit", "Fills 1 direct starter slot + FLEX"],
  ["bench-balance", "Bench balance + positional depth", "Stays within depth target"],
  ["concentration", "Bye + injury-risk concentration", "Week 8: 1 conflict"],
  ["stack-correlation", "Stacks + correlated risk", "No same-team concentration"],
  ["draft-market", "Position run + unexpected slide", "2 WRs in the last 6 picks"],
  ["opponent-demand", "Opponents before your next turn", "2 opponent rosters need WR"],
  ["draft-controls", "Queue / Target / Sleeper / Watch", "No saved user control"],
];

function factors(scores: number[]) {
  return factorMeta.map(([key, label, value], index): RecommendationFactor => ({
    key,
    label,
    value,
    score: scores[index] ?? 0,
    tone: (scores[index] ?? 0) > 0 ? "positive" : (scores[index] ?? 0) < 0 ? "warning" : "neutral",
  }));
}

function recommendation(
  item: PlayerIntelligence,
  scores: number[],
): DraftRecommendation {
  const factorList = factors(scores);
  return {
    player: item,
    score: Math.round(50 + factorList.reduce((total, factor) => total + factor.score, 0)),
    vor: 20,
    scarcity: 8,
    adpDelta: 5,
    risk: "Low",
    reasons: factorList,
    factors: factorList,
    outcomeRange: { floor: 220, expected: 250, ceiling: 280 },
    modelConfidence: "High",
  };
}

function board(players: PlayerIntelligence[], fetchedAt: string): PlayerBoardData {
  return {
    players,
    fetchedAt,
    datasetFetchedAt: {
      rankings: fetchedAt,
      projections: fetchedAt,
      injuries: fetchedAt,
      news: fetchedAt,
    },
    attribution: "Data obtained from FantasyPros.",
    totalExperts: 42,
    datasetErrors: {},
    scoringCategories: [],
    supportedScoringCategories: 20,
    partialScoringCategories: 0,
    unsupportedScoringCategories: 0,
  };
}

function forecast(recommendations: DraftRecommendation[]): NextTurnForecast {
  return {
    generatedForPick: 10,
    nextUserPick: 17,
    interveningPicks: 6,
    simulations: 240,
    likelyPicks: [],
    positionDemand: [],
    players: recommendations.map((recommendation, index) => ({
      player: recommendation.player,
      recommendationScore: recommendation.score,
      recommendation: index === 0 ? "Draft now" : "Lean draft now",
      tone: index === 0 ? "danger" : "warning",
      survivalProbability: index === 0 ? 34 : 66,
      expectedWaitCost: index === 0 ? 8 : 3,
      opponentNeedCount: 2,
      positionDemand: null,
      finalValuablePlayerInTier: index === 0,
      tierBreak: null,
      alternatives: [],
      explanation: `${recommendation.player.name} is modeled across 240 draft paths.`,
    })),
  };
}

test("proofs reconcile the complete score and separate positive, negative and neutral effects", () => {
  const lead = recommendation(
    player("lead", "Roster Fit Star", 5),
    [10, 5, 4, 3, 2, 1, -2, 0, 0, 20, 0, -4, 0, 0, 0, 0],
  );
  const fetchedAt = new Date(NOW - 30 * 60_000).toISOString();
  const proof = buildRecommendationProofs({
    recommendations: [lead],
    forecast: forecast([lead]),
    board: board([lead.player], fetchedAt),
    leagueFetchedAt: NOW - 60_000,
    picksFetchedAt: NOW - 5_000,
    draftStatus: "drafting",
    now: NOW,
  }).get(lead.player.id)!;

  assert.equal(proof.positiveTotal, 45);
  assert.equal(proof.negativeTotal, 6);
  assert.equal(proof.exactTotal, 89);
  assert.equal(proof.roundedTotal, 89);
  assert.equal(proof.positiveFactors.length, 7);
  assert.equal(proof.negativeFactors.length, 2);
  assert.equal(proof.neutralFactors.length, 7);
  assert.equal(
    proof.positiveFactors.length + proof.negativeFactors.length + proof.neutralFactors.length,
    16,
  );
  assert.equal(proof.waitProbability, "34% to survive");
  assert.equal(proof.confidence, "High");
  assert.equal(proof.sources.every((source) => source.status === "Fresh"), true);
});

test("a higher overall-ranked player can lose when roster-specific value is worse", () => {
  const rosterFit = recommendation(
    player("fit", "Roster Fit Star", 5),
    [8, 5, 3, 2, 0, 2, 0, 0, 0, 26, 4, 0, 0, 0, 0, 0],
  );
  const overallStar = recommendation(
    player("overall", "Overall Rank Star", 1),
    [12, 10, 5, 4, 2, 3, 0, 0, 0, -24, -8, 0, 0, 0, 0, 0],
  );
  const recommendations = [rosterFit, overallStar];
  const fetchedAt = new Date(NOW - 30 * 60_000).toISOString();
  const proofs = buildRecommendationProofs({
    recommendations,
    forecast: forecast(recommendations),
    board: board(recommendations.map((item) => item.player), fetchedAt),
    leagueFetchedAt: NOW - 60_000,
    picksFetchedAt: NOW - 5_000,
    draftStatus: "drafting",
    now: NOW,
  });
  const leadProof = proofs.get(rosterFit.player.id)!;
  const overallProof = proofs.get(overallStar.player.id)!;

  assert.match(leadProof.rankingExplanation, /ranks first/);
  assert.match(leadProof.overallVsRosterExplanation, /ranked higher overall/);
  assert.match(overallProof.overallVsRosterExplanation, /ranked higher overall/);
  assert.equal(leadProof.rosterSpecificEffect > overallProof.rosterSpecificEffect, true);
  assert.equal(leadProof.alternatives[0].name, "Overall Rank Star");
  assert.match(leadProof.alternatives[0].tradeoff, /gives up|gains/);
});

test("missing, stale and partially modeled inputs visibly reduce confidence", () => {
  const uncertain = recommendation(
    player("uncertain", "Uncertain Player", 20, {
      projectedPoints: null,
      adp: null,
      expertBest: null,
      expertWorst: null,
      scoringConfidence: "low",
      scoringWarnings: ["Long-play bonuses cannot be modeled without projected long plays."],
    }),
    [0, 0, 0, 0, 0, -4, -10, -2, 0, 4, 0, 0, 0, 0, 0, 0],
  );
  uncertain.modelConfidence = "Low";
  const stale = new Date(NOW - 3 * 24 * 60 * 60_000).toISOString();
  const incompleteBoard = board([uncertain.player], stale);
  delete incompleteBoard.datasetFetchedAt.projections;
  incompleteBoard.datasetErrors.projections = "Projection feed unavailable.";
  incompleteBoard.partialScoringCategories = 4;
  incompleteBoard.unsupportedScoringCategories = 2;
  const proof = buildRecommendationProofs({
    recommendations: [uncertain],
    forecast: null,
    board: incompleteBoard,
    leagueFetchedAt: NOW - 20 * 60_000,
    picksFetchedAt: null,
    draftStatus: "drafting",
    now: NOW,
  }).get(uncertain.player.id)!;

  assert.equal(proof.confidence, "Low");
  assert.equal(proof.sources.some((source) => source.status === "Missing"), true);
  assert.equal(proof.sources.some((source) => source.status === "Stale"), true);
  assert.equal(proof.waitProbability, "Pending");
  assert.equal(proof.warnings.some((warning) => warning.includes("Long-play bonuses")), true);
  assert.equal(proof.confidenceReasons.some((reason) => reason.includes("projected points")), true);
});

test("fresh projections are labeled partial when active scoring categories lack exact inputs", () => {
  const partial = recommendation(
    player("partial", "Partially Modeled Player", 12, {
      scoringConfidence: "medium",
      scoringWarnings: ["Field-goal distance bands use a documented estimate."],
    }),
    [8, 4, 3, 2, 0, 2, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0],
  );
  partial.modelConfidence = "Medium";
  const fetchedAt = new Date(NOW - 30 * 60_000).toISOString();
  const partialBoard = board([partial.player], fetchedAt);
  partialBoard.partialScoringCategories = 1;
  const proof = buildRecommendationProofs({
    recommendations: [partial],
    forecast: forecast([partial]),
    board: partialBoard,
    leagueFetchedAt: NOW - 60_000,
    picksFetchedAt: NOW - 5_000,
    draftStatus: "drafting",
    now: NOW,
  }).get(partial.player.id)!;

  const projectionSource = proof.sources.find((source) =>
    source.name.includes("statistical projections"),
  );
  assert.equal(projectionSource?.status, "Partial");
  assert.equal(proof.confidence, "Medium");
  assert.equal(proof.warnings.some((warning) => warning.includes("distance bands")), true);
});
