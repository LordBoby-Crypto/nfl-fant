import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerBoard } from "../src/features/player-intelligence/model.ts";
import {
  buildLeagueScoringBoard,
  type LeagueScoringContext,
  type LeagueScoringPlayer,
} from "../src/features/player-intelligence/scoring.ts";

function context(
  scoring: Record<string, number>,
  overrides: Partial<LeagueScoringContext> = {},
): LeagueScoringContext {
  return {
    teamCount: 2,
    rosterCounts: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
    benchSlots: 0,
    flexSlots: 0,
    superFlexSlots: 0,
    idpSlots: 0,
    scoring: Object.entries(scoring).map(([key, value]) => ({ key, value })),
    ...overrides,
  };
}

function player(
  id: string,
  position: string,
  projectionStats: Record<string, number>,
): LeagueScoringPlayer {
  return {
    id,
    name: id,
    position,
    projectionStats,
    providerProjectedPoints: projectionStats.points_ppr ?? null,
  };
}

test("standard, half-PPR, full-PPR and tight-end premium rebuild from component statistics", () => {
  const rb = player("rb", "RB", {
    rush_yds: 1_000,
    rush_tds: 10,
    rec_rec: 50,
    rec_yds: 500,
    rec_tds: 2,
  });
  const te = player("te", "TE", {
    rush_yds: 0,
    rush_tds: 0,
    rec_rec: 80,
    rec_yds: 900,
    rec_tds: 8,
  });
  const base = { rush_yd: 0.1, rush_td: 6, rec_yd: 0.1, rec_td: 6 };

  const standard = buildLeagueScoringBoard([rb], context(base)).players[0];
  const half = buildLeagueScoringBoard(
    [rb],
    context({ ...base, rec: 0.5 }),
  ).players[0];
  const full = buildLeagueScoringBoard(
    [rb],
    context({ ...base, rec: 1 }),
  ).players[0];
  const premium = buildLeagueScoringBoard(
    [te],
    context({ ...base, rec: 1, bonus_rec_te: 0.5 }),
  ).players[0];

  assert.equal(standard.projectedPoints, 222);
  assert.equal(half.projectedPoints, 247);
  assert.equal(full.projectedPoints, 272);
  assert.equal(premium.projectedPoints, 258);
  assert.equal(full.scoringConfidence, "high");
  assert.equal(
    premium.scoringFormula.some(
      (term) => term.key === "bonus_rec_te" && term.points === 40,
    ),
    true,
  );
});

test("passing attempts, completions, incompletions, turnovers and big-game thresholds use the exact projected fields", () => {
  const result = buildLeagueScoringBoard(
    [
      player("qb", "QB", {
        pass_att: 500,
        pass_cmp: 350,
        pass_yds: 4_000,
        pass_tds: 30,
        pass_ints: 10,
        pass_yds_300: 6,
        rush_yds: 200,
        rush_tds: 2,
      }),
    ],
    context({
      pass_att: -0.1,
      pass_cmp: 0.2,
      pass_inc: -0.05,
      pass_yd: 0.04,
      pass_td: 4,
      pass_int: -2,
      bonus_pass_yd_300: 3,
      rush_yd: 0.1,
      rush_td: 6,
    }),
  ).players[0];

  assert.equal(result.projectedPoints, 322.5);
  assert.equal(
    result.scoringFormula.find((term) => term.key === "pass_inc")?.projectedStat,
    150,
  );
  assert.equal(result.scoringConfidence, "high");
});

test("variable-distance kicking is visibly partial and does not invent a distance distribution", () => {
  const board = buildLeagueScoringBoard(
    [player("k", "K", { fga: 35, fg: 30, xpt: 40 })],
    context({
      fgm_0_19: 3,
      fgm_20_29: 3,
      fgm_30_39: 3,
      fgm_40_49: 4,
      fgm_50p: 5,
      fgmiss: -1,
      xpm: 1,
      xpmiss: -1,
    }),
  );
  const kicker = board.players[0];

  assert.equal(kicker.projectedPoints, 125);
  assert.equal(kicker.scoringConfidence, "medium");
  assert.equal(
    kicker.scoringFormula.some(
      (term) =>
        term.label === "Field-goal distance floor" &&
        term.support === "partial" &&
        term.points === 90,
    ),
    true,
  );
  assert.equal(
    board.categories.find((category) => category.key === "fgm_50p")?.support,
    "partial",
  );
  assert.equal(
    board.categories.find((category) => category.key === "xpmiss")?.support,
    "unsupported",
  );
});

test("defense, returns and IDP scoring rebuild from their own projection fields", () => {
  const board = buildLeagueScoringBoard(
    [
      player("dst", "DST", {
        def_sack: 40,
        def_int: 12,
        def_td: 3,
        def_safety: 1,
        def_ff: 15,
        def_fr: 10,
        def_retd: 2,
        def_pa_a: 1,
        def_pa_b: 2,
      }),
      player("lb", "LB", {
        def_sack: 5,
        def_int: 2,
        def_td: 1,
        def_safety: 0,
        def_tackle: 100,
        def_assist: 40,
        def_ff: 3,
        def_fr: 2,
        def_pd: 8,
        def_tlost: 10,
      }),
      player("returner", "WR", {
        rec_rec: 20,
        rec_yds: 300,
        rec_tds: 2,
        rush_yds: 0,
        rush_tds: 0,
        ret_tds: 1,
      }),
    ],
    context(
      {
        sack: 1,
        int: 2,
        def_td: 6,
        safe: 2,
        ff: 1,
        fum_rec: 2,
        def_st_td: 6,
        pts_allow_0: 10,
        pts_allow_1_6: 7,
        tackle_solo: 1,
        tackle_ast: 0.5,
        tackle_loss: 1,
        pass_defended: 1,
        st_td: 6,
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rush_yd: 0.1,
        rush_td: 6,
      },
      {
        rosterCounts: {
          WR: 1,
          DST: 1,
          LB: 1,
          IDP_FLEX: 1,
        },
        idpSlots: 2,
      },
    ),
  );

  const dst = board.players.find((item) => item.id === "dst");
  const lb = board.players.find((item) => item.id === "lb");
  const returner = board.players.find((item) => item.id === "returner");
  assert.equal(dst?.projectedPoints, 155);
  assert.equal(lb?.projectedPoints, 160);
  assert.equal(returner?.projectedPoints, 68);
  assert.equal(lb?.scoringConfidence, "high");
});

test("first downs, long-play bonuses and missing return yardage are warned and never silently scored", () => {
  const board = buildLeagueScoringBoard(
    [
      player("wr", "WR", {
        rec_rec: 70,
        rec_yds: 1_000,
        rec_tds: 8,
        rush_yds: 20,
        rush_tds: 0,
      }),
    ],
    context({
      rec: 1,
      rec_yd: 0.1,
      rec_td: 6,
      rec_fd: 0.5,
      bonus_rec_td_40p: 2,
      ret_yd: 0.1,
      rush_yd: 0.1,
      rush_td: 6,
    }),
  );
  const wr = board.players[0];

  assert.equal(wr.projectedPoints, 220);
  assert.equal(wr.scoringConfidence, "medium");
  assert.equal(wr.scoringWarnings.length, 3);
  assert.deepEqual(
    board.categories
      .filter((category) => category.support === "unsupported")
      .map((category) => category.key)
      .sort(),
    ["bonus_rec_td_40p", "rec_fd", "ret_yd"],
  );
});

test("roster requirements and superflex scarcity change replacement value and overall rank", () => {
  const qbs = Array.from({ length: 8 }, (_, index) =>
    player(`qb-${index + 1}`, "QB", {
      pass_yds: 4_500 - index * 250,
      pass_tds: 35 - index * 2,
      pass_ints: 10,
      rush_yds: 200,
      rush_tds: 2,
    })
  );
  const wrs = Array.from({ length: 8 }, (_, index) =>
    player(`wr-${index + 1}`, "WR", {
      rec_rec: 100 - index * 5,
      rec_yds: 1_400 - index * 100,
      rec_tds: 10 - index * 0.5,
      rush_yds: 0,
      rush_tds: 0,
    })
  );
  const scoring = {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rush_yd: 0.1,
    rush_td: 6,
    rec: 1,
    rec_yd: 0.1,
    rec_td: 6,
  };
  const standard = buildLeagueScoringBoard(
    [...qbs, ...wrs],
    context(scoring, { rosterCounts: { QB: 1, WR: 2 } }),
  );
  const superflex = buildLeagueScoringBoard(
    [...qbs, ...wrs],
    context(scoring, {
      rosterCounts: { QB: 1, WR: 2, SUPER_FLEX: 1 },
      superFlexSlots: 1,
    }),
  );
  const standardQb = standard.players.find((item) => item.id === "qb-1");
  const superflexQb = superflex.players.find((item) => item.id === "qb-1");

  assert.ok(
    (superflexQb?.replacementValue ?? 0) >
      (standardQb?.replacementValue ?? 0),
  );
  assert.ok((superflexQb?.leagueRank ?? 999) <= (standardQb?.leagueRank ?? 999));
  assert.ok((superflexQb?.leagueTier ?? 0) >= 1);
});

test("FantasyPros nested stats arrays are matched by fpid and become the league projection", () => {
  const board = buildPlayerBoard(
    [
      {
        dataset: "rankings",
        fetchedAt: "2026-07-30T20:00:00Z",
        attribution: "Data obtained from FantasyPros.",
        data: {
          players: [
            {
              player_id: "101",
              player_name: "Nested Runner",
              player_position_id: "RB",
              player_team_id: "DAL",
              rank_ecr: 10,
              tier: 2,
            },
          ],
        },
      },
      {
        dataset: "projections",
        fetchedAt: "2026-07-30T20:00:00Z",
        attribution: "Data obtained from FantasyPros.",
        data: {
          players: [
            {
              fpid: "101",
              name: "Nested Runner",
              position_id: "RB",
              stats: [
                {
                  points_ppr: 999,
                  rush_yds: 1_000,
                  rush_tds: 10,
                  rec_rec: 50,
                  rec_yds: 500,
                  rec_tds: 2,
                },
              ],
            },
          ],
        },
      },
    ],
    {},
    {
      ...context({
        rush_yd: 0.1,
        rush_td: 6,
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
      }),
      fingerprint: "league-scoring-test",
    },
  );

  assert.equal(board.players[0].providerProjectedPoints, 999);
  assert.equal(board.players[0].projectedPoints, 272);
  assert.equal(board.players[0].leagueRank, 1);
  assert.equal(board.scoringFingerprint, "league-scoring-test");
});
