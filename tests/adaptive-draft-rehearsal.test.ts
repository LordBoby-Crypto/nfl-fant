import assert from "node:assert/strict";
import test from "node:test";
import {
  runFullDraftRehearsal,
  type DraftRehearsalResult,
} from "../src/features/rehearsal/engine.ts";
import {
  buildLeagueScoringBoard,
  type LeagueScoringContext,
} from "../src/features/player-intelligence/scoring.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../src/types.ts";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";

const EMPTY_CONTROLS: DraftControlState = {
  watchlist: [],
  queue: [],
  target: [],
  sleeper: [],
  avoid: [],
};

const BASE_SCORING = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec_yd: 0.1,
  rec_td: 6,
};

const POSITION_CYCLE: PlayerIntelligence["position"][] = [
  "WR", "RB", "QB", "WR", "RB", "TE", "WR", "RB", "QB", "TE",
  "DL", "LB", "DB", "DST", "K", "WR", "RB", "DL", "LB", "DB",
];

function projectionStats(
  position: PlayerIntelligence["position"],
  index: number,
) {
  const decline = Math.floor(index / POSITION_CYCLE.length);
  if (position === "QB") {
    return {
      pass_att: 560 - decline * 3,
      pass_cmp: 370 - decline * 2,
      pass_yds: 4_700 - decline * 70,
      pass_tds: 38 - decline * 0.5,
      pass_ints: 10 + decline * 0.2,
      pass_yds_300: Math.max(0, 9 - decline * 0.3),
      rush_yds: Math.max(20, 500 - decline * 12),
      rush_tds: Math.max(0, 5 - decline * 0.15),
    };
  }
  if (position === "RB") {
    return {
      rush_yds: Math.max(100, 1_450 - decline * 45),
      rush_tds: Math.max(1, 13 - decline * 0.4),
      rush_yds_100: Math.max(0, 6 - decline * 0.25),
      rec_rec: Math.max(8, 68 - decline * 2),
      rec_yds: Math.max(60, 590 - decline * 18),
      rec_tds: Math.max(0, 4 - decline * 0.15),
    };
  }
  if (position === "WR" || position === "TE") {
    const tightEnd = position === "TE";
    return {
      rush_yds: tightEnd ? 0 : Math.max(0, 90 - decline * 3),
      rush_tds: 0,
      rec_rec: Math.max(15, (tightEnd ? 92 : 118) - decline * 3),
      rec_yds: Math.max(180, (tightEnd ? 1_080 : 1_580) - decline * 38),
      rec_tds: Math.max(1, (tightEnd ? 10 : 12) - decline * 0.3),
      rec_yds_100: Math.max(0, (tightEnd ? 3 : 7) - decline * 0.25),
    };
  }
  if (position === "K") return { fga: 35, fg: 30, xpt: 42 };
  if (position === "DST") {
    return {
      def_sack: 42 - decline,
      def_int: 14 - decline * 0.3,
      def_td: 3,
      def_safety: 1,
      def_ff: 16,
      def_fr: 11,
      def_retd: 1,
    };
  }
  return {
    def_sack: Math.max(1, 10 - decline * 0.3),
    def_int: Math.max(0, 4 - decline * 0.15),
    def_td: 1,
    def_tackle: Math.max(25, 125 - decline * 4),
    def_assist: Math.max(10, 48 - decline * 2),
    def_ff: 3,
    def_fr: 2,
    def_pd: Math.max(2, 12 - decline * 0.3),
    def_tlost: Math.max(2, 15 - decline * 0.4),
  };
}

const baseBoard: PlayerIntelligence[] = Array.from({ length: 480 }, (_, index) => {
  const rank = index + 1;
  const position = POSITION_CYCLE[index % POSITION_CYCLE.length];
  return {
    id: `adaptive-${rank}`,
    name: `Adaptive Player ${rank}`,
    position,
    team: `T${(index % 32) + 1}`,
    positionRank: `${position}${Math.ceil(rank / POSITION_CYCLE.length)}`,
    ecr: rank,
    tier: Math.ceil(rank / 16),
    adp: rank + ((index % 7) - 3),
    projectedPoints: null,
    providerProjectedPoints: 200 - index * 0.2,
    projectionStats: projectionStats(position, index),
    expertBest: Math.max(1, rank - 5),
    expertWorst: rank + 8,
    expertAverage: rank,
    injuryStatus: index % 83 === 0 ? "Questionable" : "",
    injuryDetail: "",
    practiceStatus: "",
    byeWeek: 5 + (index % 10),
    news: [],
  };
});

function draft({
  id,
  teams,
  rounds,
  type,
  superflex = 0,
  idp = false,
}: {
  id: string;
  teams: number;
  rounds: number;
  type: "snake" | "linear";
  superflex?: number;
  idp?: boolean;
}): Draft {
  return {
    draft_id: id,
    league_id: `league-${id}`,
    type,
    status: "drafting",
    start_time: 1,
    draft_order: Object.fromEntries(
      Array.from({ length: teams }, (_, index) => [`user-${index + 1}`, index + 1]),
    ),
    slot_to_roster_id: Object.fromEntries(
      Array.from({ length: teams }, (_, index) => [String(index + 1), index + 1]),
    ),
    settings: {
      teams,
      rounds,
      pick_timer: 90,
      slots_qb: 1,
      slots_rb: 2,
      slots_wr: 2,
      slots_te: 1,
      slots_flex: 1,
      slots_k: 1,
      slots_def: 1,
      slots_bn: Math.max(0, rounds - (9 + superflex + (idp ? 4 : 0))),
      slots_super_flex: superflex,
      slots_dl: idp ? 1 : 0,
      slots_lb: idp ? 1 : 0,
      slots_db: idp ? 1 : 0,
      slots_idp_flex: idp ? 1 : 0,
    },
  };
}

function leagueActors(teams: number) {
  const users: LeagueUser[] = Array.from({ length: teams }, (_, index) => ({
    user_id: `user-${index + 1}`,
    display_name: `Adaptive Team ${index + 1}`,
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
  return { users, rosters };
}

function scoringContext(
  item: Draft,
  scoring: Record<string, number>,
): LeagueScoringContext {
  return {
    teamCount: item.settings.teams,
    rosterCounts: {
      QB: item.settings.slots_qb,
      RB: item.settings.slots_rb,
      WR: item.settings.slots_wr,
      TE: item.settings.slots_te,
      K: item.settings.slots_k,
      DST: item.settings.slots_def,
      FLEX: item.settings.slots_flex,
      SUPER_FLEX: item.settings.slots_super_flex ?? 0,
      DL: item.settings.slots_dl ?? 0,
      LB: item.settings.slots_lb ?? 0,
      DB: item.settings.slots_db ?? 0,
      IDP_FLEX: item.settings.slots_idp_flex ?? 0,
    },
    benchSlots: item.settings.slots_bn,
    flexSlots: item.settings.slots_flex,
    superFlexSlots: item.settings.slots_super_flex ?? 0,
    idpSlots:
      (item.settings.slots_dl ?? 0) +
      (item.settings.slots_lb ?? 0) +
      (item.settings.slots_db ?? 0) +
      (item.settings.slots_idp_flex ?? 0),
    scoring: Object.entries(scoring).map(([key, value]) => ({ key, value })),
  };
}

function scoreBoard(item: Draft, scoring: Record<string, number>) {
  const adjusted = buildLeagueScoringBoard(
    baseBoard.map((player) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      projectionStats: player.projectionStats ?? {},
      providerProjectedPoints: player.providerProjectedPoints ?? null,
    })),
    scoringContext(item, scoring),
  );
  const byId = new Map(adjusted.players.map((player) => [player.id, player]));
  const players = baseBoard
    .map((player) => ({
      ...player,
      ...(byId.get(player.id) ?? {}),
      tier: byId.get(player.id)?.leagueTier ?? player.tier,
    }))
    .sort(
      (left, right) =>
        (left.leagueRank ?? Number.MAX_SAFE_INTEGER) -
          (right.leagueRank ?? Number.MAX_SAFE_INTEGER) ||
        (left.ecr ?? Number.MAX_SAFE_INTEGER) -
          (right.ecr ?? Number.MAX_SAFE_INTEGER),
    );
  return { players, coverage: adjusted };
}

interface Scenario {
  name: string;
  draft: Draft;
  slot: number;
  scoring: Record<string, number>;
  initialPicks?: SleeperDraftPick[];
}

const scenarios: Scenario[] = [
  {
    name: "standard-8-team-snake-slot-1",
    draft: draft({ id: "standard", teams: 8, rounds: 10, type: "snake" }),
    slot: 1,
    scoring: BASE_SCORING,
  },
  {
    name: "half-ppr-10-team-linear-slot-5",
    draft: draft({ id: "half-ppr", teams: 10, rounds: 12, type: "linear" }),
    slot: 5,
    scoring: { ...BASE_SCORING, rec: 0.5 },
  },
  {
    name: "ppr-12-team-snake-slot-12",
    draft: draft({ id: "ppr", teams: 12, rounds: 14, type: "snake" }),
    slot: 12,
    scoring: { ...BASE_SCORING, rec: 1 },
  },
  {
    name: "superflex-12-team-snake-slot-2",
    draft: draft({
      id: "superflex",
      teams: 12,
      rounds: 15,
      type: "snake",
      superflex: 1,
    }),
    slot: 2,
    scoring: { ...BASE_SCORING, rec: 0.5 },
  },
  {
    name: "tight-end-premium-keeper-14-team-linear-slot-7",
    draft: draft({ id: "keeper-tep", teams: 14, rounds: 15, type: "linear" }),
    slot: 7,
    scoring: { ...BASE_SCORING, rec: 1, bonus_rec_te: 0.75 },
    initialPicks: [
      {
        player_id: baseBoard[0].id,
        picked_by: "user-2",
        roster_id: 2,
        round: 1,
        draft_slot: 1,
        pick_no: 1,
        is_keeper: true,
        metadata: {
          first_name: "Adaptive",
          last_name: "Player 1",
          position: baseBoard[0].position,
          team: baseBoard[0].team,
        },
      },
    ],
  },
  {
    name: "idp-custom-bonus-16-team-snake-slot-16",
    draft: draft({
      id: "idp-custom",
      teams: 16,
      rounds: 16,
      type: "snake",
      idp: true,
    }),
    slot: 16,
    scoring: {
      ...BASE_SCORING,
      rec: 1,
      bonus_pass_yd_300: 3,
      bonus_rush_yd_100: 2,
      bonus_rec_yd_100: 2,
      rec_fd: 0.5,
      bonus_rec_td_40p: 2,
      ret_yd: 0.1,
      sack: 1,
      int: 2,
      def_td: 6,
      tackle_solo: 1,
      tackle_ast: 0.5,
      tackle_loss: 1,
      pass_defended: 1,
      ff: 1,
      fum_rec: 2,
      fgm_0_19: 3,
      fgm_20_29: 3,
      fgm_30_39: 3,
      fgm_40_49: 4,
      fgm_50p: 5,
    },
  },
];

const scoredScenarios = scenarios.map((scenario) => ({
  ...scenario,
  scored: scoreBoard(scenario.draft, scenario.scoring),
}));

const fullDraftResults: Array<{
  scenario: (typeof scoredScenarios)[number];
  result: DraftRehearsalResult;
}> = scoredScenarios.map((scenario) => {
  const actors = leagueActors(scenario.draft.settings.teams);
  return {
    scenario,
    result: runFullDraftRehearsal({
      draft: scenario.draft,
      ...actors,
      board: scenario.scored.players,
      userRosterId: 1,
      slot: scenario.slot,
      controls: EMPTY_CONTROLS,
      initialPicks: scenario.initialPicks,
      forecastRuns: 4,
      settingsFingerprint: scenario.name,
    }),
  };
});

test("adaptive matrix completes standard, PPR, half-PPR, Superflex, TEP, keeper, IDP, snake and linear drafts", () => {
  assert.equal(fullDraftResults.length, 6);
  for (const { scenario, result } of fullDraftResults) {
    const total = scenario.draft.settings.teams * scenario.draft.settings.rounds;
    assert.equal(result.completed, true, scenario.name);
    assert.equal(result.completedPicks, total, scenario.name);
    assert.equal(result.uniquePlayers, total, scenario.name);
    assert.equal(result.violations.length, 0, `${scenario.name}: ${result.violations.join(" | ")}`);
    assert.equal(result.settingsFingerprints[0], scenario.name);
  }
});

test("every pick rebuilds availability, recommendations and forecasts without resurrecting a selected player", () => {
  for (const { scenario, result } of fullDraftResults) {
    const newlySelected = result.totalPicks - (scenario.initialPicks?.length ?? 0);
    assert.equal(result.rankingRecalculations, newlySelected, scenario.name);
    assert.equal(result.selectedPlayerRemovalChecks, newlySelected, scenario.name);
    assert.equal(result.recommendationRecalculations, newlySelected - 1, scenario.name);
    assert.equal(result.forecastRecalculations, newlySelected - 1, scenario.name);
    result.cycles.forEach((cycle, index) => {
      assert.equal(
        cycle.availablePlayers,
        baseBoard.length - (scenario.initialPicks?.length ?? 0) - index - 1,
        `${scenario.name} pick ${cycle.completedPick}`,
      );
      if (index < result.cycles.length - 1) {
        assert.equal(cycle.forecastForPick, cycle.completedPick + 1);
      }
    });
  }
});

test("current league settings materially rebuild ranks and expose partial custom scoring", () => {
  const superflex = scoredScenarios.find((scenario) => scenario.name.startsWith("superflex"))!;
  const premium = scoredScenarios.find((scenario) => scenario.name.startsWith("tight-end"))!;
  const idp = scoredScenarios.find((scenario) => scenario.name.startsWith("idp-custom"))!;
  const teId = baseBoard.find((player) => player.position === "TE")!.id;
  const oneQbDraft: Draft = {
    ...superflex.draft,
    settings: {
      ...superflex.draft.settings,
      slots_super_flex: 0,
      slots_bn: superflex.draft.settings.slots_bn + 1,
    },
  };
  const oneQb = scoreBoard(oneQbDraft, superflex.scoring);
  const qbIds = baseBoard
    .filter((player) => player.position === "QB")
    .map((player) => player.id);
  const superflexImprovesQb = qbIds.some((id) => {
    const normal = oneQb.players.find((player) => player.id === id)!;
    const adjusted = superflex.scored.players.find((player) => player.id === id)!;
    return (
      (adjusted.leagueRank ?? 999) < (normal.leagueRank ?? 999) &&
      (adjusted.replacementValue ?? 0) >= (normal.replacementValue ?? 0)
    );
  });
  const pprWithoutPremium = scoreBoard(
    premium.draft,
    { ...BASE_SCORING, rec: 1 },
  );
  const standardTe = pprWithoutPremium.players.find((player) => player.id === teId)!;
  const premiumTe = premium.scored.players.find((player) => player.id === teId)!;
  assert.equal(superflexImprovesQb, true);
  assert.ok((premiumTe.projectedPoints ?? 0) > (standardTe.projectedPoints ?? 0));
  assert.ok(idp.scored.coverage.partialCategories > 0);
  assert.ok(idp.scored.coverage.unsupportedCategories > 0);
  assert.equal(
    idp.scored.coverage.categories.some(
      (category) => category.key === "bonus_pass_yd_300" && category.support === "supported",
    ),
    true,
  );
});

test("commissioner changes during a rehearsal switch every later recommendation cycle to the new settings", () => {
  const initialDraft = draft({ id: "commissioner", teams: 10, rounds: 12, type: "snake" });
  const changedDraft: Draft = {
    ...initialDraft,
    settings: {
      ...initialDraft.settings,
      slots_super_flex: 1,
      slots_bn: initialDraft.settings.slots_bn - 1,
    },
  };
  const initial = scoreBoard(initialDraft, BASE_SCORING);
  const changed = scoreBoard(changedDraft, { ...BASE_SCORING, rec: 1, bonus_rec_te: 0.5 });
  const result = runFullDraftRehearsal({
    draft: initialDraft,
    ...leagueActors(10),
    board: initial.players,
    userRosterId: 1,
    slot: 4,
    controls: EMPTY_CONTROLS,
    forecastRuns: 4,
    settingsFingerprint: "commissioner-v1-standard",
    settingsChanges: [
      {
        atPick: 41,
        draft: changedDraft,
        board: changed.players,
        fingerprint: "commissioner-v2-ppr-superflex-tep",
      },
    ],
  });
  assert.equal(result.completed, true);
  assert.deepEqual(result.settingsFingerprints, [
    "commissioner-v1-standard",
    "commissioner-v2-ppr-superflex-tep",
  ]);
  assert.equal(
    result.cycles.filter((cycle) => cycle.completedPick < 41)
      .every((cycle) => cycle.settingsFingerprint === "commissioner-v1-standard"),
    true,
  );
  assert.equal(
    result.cycles.filter((cycle) => cycle.completedPick >= 41)
      .every((cycle) => cycle.settingsFingerprint === "commissioner-v2-ppr-superflex-tep"),
    true,
  );
  assert.deepEqual(result.violations, []);
});

test("recalculation and complete response latency stay inside the draft-day budget", (context) => {
  for (const { scenario, result } of fullDraftResults) {
    assert.ok(result.rankingTimingMs.p95 < 10, `${scenario.name} ranking p95 ${result.rankingTimingMs.p95}ms`);
    assert.ok(result.recommendationTimingMs.p95 < 50, `${scenario.name} recommendation p95 ${result.recommendationTimingMs.p95}ms`);
    assert.ok(result.forecastTimingMs.p95 < 350, `${scenario.name} forecast p95 ${result.forecastTimingMs.p95}ms`);
    assert.ok(result.responseTimingMs.p95 < 450, `${scenario.name} response p95 ${result.responseTimingMs.p95}ms`);
    assert.ok(result.responseTimingMs.max < 2_000, `${scenario.name} response max ${result.responseTimingMs.max}ms`);
    context.diagnostic(
      `${scenario.name}: ranking p95 ${result.rankingTimingMs.p95}ms; ` +
        `recommendation p95 ${result.recommendationTimingMs.p95}ms; ` +
        `forecast p95 ${result.forecastTimingMs.p95}ms; ` +
        `response p95 ${result.responseTimingMs.p95}ms`,
    );
  }
});
