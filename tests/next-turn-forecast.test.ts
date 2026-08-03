import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNextTurnForecast,
  compareNextTurnForecast,
} from "../src/features/live-draft/nextTurnForecast.ts";
import { forecastNextTurnMarket } from "../src/features/live-draft/strategy.ts";
import type { DraftRecommendation } from "../src/features/live-draft/engine.ts";
import type { TierBreakWarning } from "../src/features/live-draft/liveIntelligence.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type { Draft, LeagueUser, Roster } from "../src/types.ts";

function player(
  id: string,
  position: PlayerIntelligence["position"],
  rank: number,
  tier: number,
): PlayerIntelligence {
  return {
    id,
    name: `Player ${id}`,
    team: rank % 2 ? "DAL" : "BUF",
    position,
    positionRank: `${position}${rank}`,
    ecr: rank,
    leagueRank: rank,
    tier,
    leagueTier: tier,
    adp: rank,
    projectedPoints: 300 - rank,
    expertBest: rank - 2,
    expertWorst: rank + 2,
    expertAverage: rank,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 7,
    news: [],
  };
}

const positions: PlayerIntelligence["position"][] = [
  "RB", "WR", "RB", "WR", "TE", "QB", "RB", "WR",
  "RB", "WR", "TE", "QB", "RB", "WR", "RB", "WR",
];
const board = positions.map((position, index) =>
  player(String(index + 1), position, index + 1, Math.ceil((index + 1) / 4)),
);

const draft: Draft = {
  draft_id: "draft",
  league_id: "league",
  type: "snake",
  status: "drafting",
  start_time: null,
  draft_order: null,
  slot_to_roster_id: { "1": 1, "2": 2, "3": 3, "4": 4 },
  settings: {
    teams: 4,
    rounds: 4,
    pick_timer: 60,
    slots_qb: 1,
    slots_rb: 1,
    slots_wr: 1,
    slots_te: 1,
    slots_flex: 0,
    slots_k: 0,
    slots_def: 0,
    slots_bn: 0,
  },
};

const users: LeagueUser[] = Array.from({ length: 4 }, (_, index) => ({
  user_id: `u${index + 1}`,
  display_name: `Team ${index + 1}`,
  avatar: null,
  metadata: null,
}));

const rosters: Roster[] = Array.from({ length: 4 }, (_, index) => ({
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

function recommendation(
  item: PlayerIntelligence,
  score: number,
): DraftRecommendation {
  return {
    player: item,
    score,
    vor: score - 70,
    scarcity: 6,
    adpDelta: 0,
    risk: "Low",
    reasons: [],
  };
}

test("next-turn market simulates every intervening team and measures player survival", () => {
  const forecast = forecastNextTurnMarket({
    draft,
    users,
    rosters,
    picks: [],
    board,
    userRosterId: 1,
    slotMap: draft.slot_to_roster_id,
    runs: 120,
  });

  assert.equal(forecast.interveningPicks, 6);
  assert.equal(forecast.picks.length, 6);
  assert.deepEqual(
    forecast.picks.map((pick) => pick.pickNumber),
    [2, 3, 4, 5, 6, 7],
  );
  assert.equal(forecast.picks.every((pick) => pick.needs.length > 0), true);
  assert.equal((forecast.survivalByPlayer.get("1") ?? 100) < 50, true);
  assert.equal((forecast.survivalByPlayer.get("16") ?? 0) > 70, true);
  const expectedSelections = forecast.positionDemand.reduce(
    (total, position) => total + position.expectedSelections,
    0,
  );
  assert.equal(Math.abs(expectedSelections - 6) < 0.05, true);
});

test("draft-now analysis combines survival, final tier value, alternatives and wait cost", () => {
  const recommendations = [
    recommendation(board[0], 100),
    recommendation(board[2], 86),
    recommendation(board[1], 84),
  ];
  const tierBreak: TierBreakWarning = {
    playerId: board[0].id,
    position: "RB",
    tier: 1,
    remainingInTier: 1,
    nextTier: 2,
    ecrDrop: 7,
    urgent: true,
  };
  const forecast = buildNextTurnForecast({
    generatedForPick: 10,
    nextUserPick: 17,
    recommendations,
    tierBreaks: new Map([[board[0].id, tierBreak]]),
    market: {
      runs: 240,
      interveningPicks: 6,
      picks: [
        {
          pickNumber: 11,
          round: 3,
          slot: 3,
          rosterId: 3,
          teamName: "RB-needy team",
          archetype: "RB pressure",
          needs: ["RB 1", "WR 1"],
          players: [{ player: board[0], probability: 0.44 }],
          positions: [{ position: "RB", probability: 0.72 }],
        },
      ],
      survivalByPlayer: new Map([
        [board[0].id, 28],
        [board[2].id, 64],
        [board[1].id, 89],
      ]),
      positionDemand: [
        {
          position: "RB",
          expectedSelections: 3.2,
          share: 0.53,
          risk: "Likely run",
        },
      ],
    },
  });

  assert.equal(forecast.players[0].recommendation, "Draft now");
  assert.equal(forecast.players[0].finalValuablePlayerInTier, true);
  assert.equal(forecast.players[0].opponentNeedCount, 1);
  assert.equal(forecast.players[0].expectedWaitCost, 10.1);
  assert.equal(forecast.players[0].alternatives[0].player.id, board[2].id);
  assert.match(forecast.players[0].explanation, /most modeled drafts/);
  assert.match(forecast.players[0].explanation, /final valuable player/);
});

test("recommendations distinguish lean-now and likely-safe-to-wait outcomes", () => {
  const recommendations = [
    recommendation(board[0], 90),
    recommendation(board[1], 88),
    recommendation(board[2], 86),
  ];
  const forecast = buildNextTurnForecast({
    generatedForPick: 20,
    nextUserPick: 27,
    recommendations,
    tierBreaks: new Map(),
    market: {
      runs: 240,
      interveningPicks: 6,
      picks: [],
      survivalByPlayer: new Map([
        [board[0].id, 61],
        [board[1].id, 91],
        [board[2].id, 95],
      ]),
      positionDemand: [],
    },
  });

  assert.equal(forecast.players[0].recommendation, "Lean draft now");
  assert.equal(forecast.players[1].recommendation, "Likely safe to wait");
  assert.match(forecast.players[1].explanation, /most of the time/);
});

test("forecast comparison explains the recommendation and run changes after a pick", () => {
  const recommendations = [recommendation(board[0], 94), recommendation(board[1], 90)];
  const previous = buildNextTurnForecast({
    generatedForPick: 8,
    nextUserPick: 15,
    recommendations,
    tierBreaks: new Map(),
    market: {
      runs: 240,
      interveningPicks: 6,
      picks: [],
      survivalByPlayer: new Map([[board[0].id, 78], [board[1].id, 88]]),
      positionDemand: [],
    },
  });
  const current = buildNextTurnForecast({
    generatedForPick: 9,
    nextUserPick: 15,
    recommendations,
    tierBreaks: new Map(),
    market: {
      runs: 240,
      interveningPicks: 5,
      picks: [],
      survivalByPlayer: new Map([[board[0].id, 38], [board[1].id, 86]]),
      positionDemand: [
        { position: "RB", expectedSelections: 3, share: 0.6, risk: "Likely run" },
      ],
    },
  });
  const change = compareNextTurnForecast(previous, current);

  assert.match(change.headline, /pick 8/);
  assert.equal(change.details.some((detail) => detail.includes("down 40")), true);
  assert.equal(change.details.some((detail) => detail.includes("Draft now")), true);
  assert.equal(change.details.some((detail) => detail.includes("RB")), true);
});
