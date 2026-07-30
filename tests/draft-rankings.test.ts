import assert from "node:assert/strict";
import test from "node:test";
import {
  availablePlayers,
  buildDraftedPlayerLookup,
  recommendPlayers,
  type DraftControlState,
  type TeamDraftState,
} from "../src/features/live-draft/engine.ts";
import {
  buildOffBoardEntries,
  completeDraftRankingState,
  filterDraftRankingPlayers,
} from "../src/features/player-intelligence/draftRankings.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type { SleeperDraftPick } from "../src/types.ts";

function player(
  index: number,
  overrides: Partial<PlayerIntelligence> = {},
): PlayerIntelligence {
  return {
    id: `p${index}`,
    name: `Ranked Player ${index}`,
    team: index % 2 ? "DAL" : "KC",
    position: index % 3 ? "RB" : "WR",
    positionRank: `RB${index}`,
    ecr: index,
    tier: Math.ceil(index / 12),
    adp: index + 0.5,
    projectedPoints: 300 - index,
    leagueRank: index,
    leaguePositionRank: index,
    leagueTier: Math.ceil(index / 12),
    replacementValue: 50 - index / 2,
    scoringConfidence: "high",
    scoringCoverage: 100,
    expertBest: index - 1,
    expertWorst: index + 1,
    expertAverage: index,
    injuryStatus: "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 8,
    news: [],
    ...overrides,
  };
}

function pick({
  playerId,
  name,
  pickNumber,
  rosterId,
}: {
  playerId: string;
  name: string;
  pickNumber: number;
  rosterId: number;
}): SleeperDraftPick {
  const [firstName, ...lastName] = name.split(" ");
  return {
    player_id: playerId,
    picked_by: `owner-${rosterId}`,
    roster_id: rosterId,
    round: Math.ceil(pickNumber / 14),
    draft_slot: ((pickNumber - 1) % 14) + 1,
    pick_no: pickNumber,
    is_keeper: false,
    metadata: {
      first_name: firstName,
      last_name: lastName.join(" "),
      team: "DAL",
      position: "RB",
    },
  };
}

const controls: DraftControlState = {
  watchlist: [],
  queue: [],
  target: [],
  sleeper: [],
  avoid: [],
};

const counts: TeamDraftState["counts"] = {
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  DL: 0,
  LB: 0,
  DB: 0,
  IDP: 0,
};

test("the Draft Rankings state keeps the complete list and never caps it at 80", () => {
  const board = Array.from({ length: 120 }, (_, index) => player(index + 1));
  const picks = [
    pick({
      playerId: "p2",
      name: "Ranked Player 2",
      pickNumber: 1,
      rosterId: 1,
    }),
    pick({
      playerId: "sleeper-id-3",
      name: "Ranked Player III 3",
      pickNumber: 2,
      rosterId: 2,
    }),
  ];
  picks[1].metadata.first_name = "Ranked";
  picks[1].metadata.last_name = "Player 3";

  const state = completeDraftRankingState(board, picks);
  assert.equal(state.available.length, 118);
  assert.equal(state.draftedPlayers.length, 2);

  const complete = filterDraftRankingPlayers({
    players: board,
    drafted: state.drafted,
    filters: {
      query: "",
      position: "ALL",
      tier: "ALL",
      team: "ALL",
      status: "ALL",
      availability: "ALL",
    },
  });
  assert.equal(complete.length, 120);
});

test("position, tier, team, status and availability filters compose exactly", () => {
  const board = [
    player(1, {
      position: "WR",
      team: "DAL",
      leagueTier: 1,
      injuryStatus: "Questionable",
    }),
    player(2, {
      position: "WR",
      team: "DAL",
      leagueTier: 1,
      injuryStatus: "Questionable",
    }),
    player(3, {
      position: "RB",
      team: "KC",
      leagueTier: 2,
      injuryStatus: "",
    }),
  ];
  const picks = [
    pick({
      playerId: "p2",
      name: "Ranked Player 2",
      pickNumber: 7,
      rosterId: 2,
    }),
  ];
  const drafted = buildDraftedPlayerLookup(picks);

  const filtered = filterDraftRankingPlayers({
    players: board,
    drafted,
    filters: {
      query: "ranked",
      position: "WR",
      tier: 1,
      team: "DAL",
      status: "Questionable",
      availability: "AVAILABLE",
    },
  });

  assert.deepEqual(filtered.map((item) => item.id), ["p1"]);
});

test("Off the Board preserves every Sleeper pick number and selecting team", () => {
  const board = [player(1), player(2)];
  const picks = [
    pick({
      playerId: "p1",
      name: "Ranked Player 1",
      pickNumber: 1,
      rosterId: 1,
    }),
    pick({
      playerId: "unmatched",
      name: "Sleeper Only Player",
      pickNumber: 2,
      rosterId: 2,
    }),
  ];
  const teams: TeamDraftState[] = [
    {
      rosterId: 1,
      ownerId: "owner-1",
      name: "Team Alpha",
      slot: 1,
      picks: [picks[0]],
      counts,
      needs: [],
    },
    {
      rosterId: 2,
      ownerId: "owner-2",
      name: "Team Beta",
      slot: 2,
      picks: [picks[1]],
      counts,
      needs: [],
    },
  ];

  const entries = buildOffBoardEntries({ picks, players: board, teams });
  assert.deepEqual(
    entries.map((entry) => ({
      pick: entry.pick.pick_no,
      team: entry.teamName,
      player: entry.playerName,
    })),
    [
      { pick: 2, team: "Team Beta", player: "Sleeper Only Player" },
      { pick: 1, team: "Team Alpha", player: "Ranked Player 1" },
    ],
  );
});

test("drafted players cannot remain available or enter next-pick rankings", () => {
  const board = Array.from({ length: 120 }, (_, index) => player(index + 1));
  const picks = [
    pick({
      playerId: "p1",
      name: "Ranked Player 1",
      pickNumber: 1,
      rosterId: 2,
    }),
  ];
  const available = availablePlayers(board, picks);
  const team: TeamDraftState = {
    rosterId: 1,
    ownerId: "owner-1",
    name: "My Team",
    slot: 1,
    picks: [],
    counts,
    needs: [],
  };
  const recommendations = recommendPlayers({
    available,
    allPlayers: board,
    teams: [team],
    userRosterId: 1,
    cursor: {
      currentPick: 2,
      currentRound: 1,
      currentSlot: 2,
      currentRosterId: 2,
      nextUserPick: 14,
      picksUntilUser: 12,
      isUserTurn: false,
      complete: false,
    },
    controls,
    limit: available.length,
  });

  assert.equal(available.length, 119);
  assert.equal(recommendations.length, 119);
  assert.equal(recommendations.some((item) => item.player.id === "p1"), false);
});
