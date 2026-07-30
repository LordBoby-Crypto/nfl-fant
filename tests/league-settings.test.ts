import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeagueSettingsModel,
  diffLeagueSettings,
} from "../src/features/league-settings/model.ts";
import {
  normalizeLeagueSnapshot,
  USER_ID,
} from "../src/services/sleeper.ts";
import type { LeagueSnapshot, SleeperDraftPick } from "../src/types.ts";
import {
  availablePlayers,
  buildTeamDraftStates,
} from "../src/features/live-draft/engine.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";

function snapshot(): LeagueSnapshot {
  return {
    league: {
      league_id: "league",
      name: "Adaptive League",
      season: "2026",
      status: "pre_draft",
      total_rosters: 10,
      draft_id: "draft",
      previous_league_id: null,
      roster_positions: [
        "QB",
        "RB",
        "WR",
        "TE",
        "FLEX",
        "SUPER_FLEX",
        "DL",
        "LB",
        "DB",
        "IDP_FLEX",
        "BN",
        "BN",
      ],
      settings: {
        num_teams: 10,
        playoff_teams: 6,
        playoff_week_start: 15,
        reserve_slots: 3,
        taxi_slots: 4,
        waiver_budget: 100,
        trade_deadline: 11,
        max_keepers: 2,
      },
      scoring_settings: {
        rec: 0.5,
        bonus_rec_te: 0.5,
        pass_td: 6,
        pass_int: -2,
        idp_tkl_solo: 1.5,
      },
    },
    draft: {
      draft_id: "draft",
      league_id: "league",
      type: "linear",
      status: "pre_draft",
      start_time: null,
      draft_order: { [USER_ID]: 4 },
      slot_to_roster_id: { "4": 7 },
      settings: {
        teams: 10,
        rounds: 12,
        pick_timer: 90,
        slots_qb: 0,
        slots_rb: 0,
        slots_wr: 0,
        slots_te: 0,
        slots_flex: 0,
        slots_k: 0,
        slots_def: 0,
        slots_bn: 0,
      },
    },
    users: [
      {
        user_id: USER_ID,
        display_name: "KingBoby",
        avatar: null,
        metadata: { team_name: "Source of Truth" },
      },
    ],
    rosters: [
      {
        roster_id: 7,
        owner_id: USER_ID,
        players: ["keeper"],
        keepers: ["keeper"],
        reserve: [],
        taxi: [],
        starters: [],
        settings: {
          wins: 0,
          losses: 0,
          ties: 0,
          waiver_position: 1,
          waiver_budget_used: 0,
        },
      },
    ],
    fetchedAt: Date.parse("2026-07-30T20:00:00Z"),
  };
}

test("Sleeper league, roster, scoring, team and draft-slot values are imported intact", () => {
  const normalized = normalizeLeagueSnapshot(snapshot());
  const model = buildLeagueSettingsModel(normalized, USER_ID);
  assert.equal(model.teamCount, 10);
  assert.equal(model.rounds, 12);
  assert.equal(model.draftFormat, "linear");
  assert.equal(model.benchSlots, 2);
  assert.equal(model.irSlots, 3);
  assert.equal(model.taxiSlots, 4);
  assert.equal(model.keeperLimit, 2);
  assert.equal(model.keeperCount, 1);
  assert.equal(model.flexSlots, 1);
  assert.equal(model.superFlexSlots, 1);
  assert.equal(model.idpSlots, 4);
  assert.equal(model.scoring.length, 5);
  assert.equal(model.scoringLabel, "Half PPR + 0.5 TE premium");
  assert.equal(model.user.rosterId, 7);
  assert.equal(model.user.teamName, "Source of Truth");
  assert.equal(model.user.draftPosition, 4);
  assert.equal(normalized.draft.settings.slots_super_flex, 1);
  assert.equal(normalized.draft.settings.slots_idp_flex, 4);
});

test("commissioner changes identify their exact recommendation effects", () => {
  const before = buildLeagueSettingsModel(
    normalizeLeagueSnapshot(snapshot()),
    USER_ID,
  );
  const changed = snapshot();
  changed.draft.type = "snake";
  changed.draft.settings.teams = 12;
  changed.draft.settings.rounds = 15;
  changed.league.total_rosters = 12;
  changed.league.settings.num_teams = 12;
  changed.league.roster_positions.push("WR", "BN");
  changed.league.scoring_settings.rec = 1;
  changed.draft.draft_order = { [USER_ID]: 9 };
  const after = buildLeagueSettingsModel(
    normalizeLeagueSnapshot(changed),
    USER_ID,
  );
  const changes = diffLeagueSettings(before, after);
  assert.deepEqual(
    new Set(changes.map((change) => change.category)),
    new Set(["Draft", "Roster", "Scoring", "Team"]),
  );
  assert.equal(
    changes.some((change) =>
      change.recommendationImpact.includes("replacement levels")
    ),
    true,
  );
  assert.equal(
    changes.some((change) =>
      change.recommendationImpact.includes("FLEX/SUPER_FLEX")
    ),
    true,
  );
});

test("only genuinely unmodeled structures produce modeling limitations", () => {
  const standard = snapshot();
  standard.league.roster_positions = ["QB", "RB", "WR", "TE", "FLEX", "BN"];
  standard.league.settings.taxi_slots = 0;
  standard.draft.type = "snake";
  assert.deepEqual(
    buildLeagueSettingsModel(
      normalizeLeagueSnapshot(standard),
      USER_ID,
    ).limitations,
    [],
  );

  const unsupported = snapshot();
  unsupported.draft.type = "auction";
  unsupported.league.roster_positions.push("MYSTERY_SLOT");
  const limitations = buildLeagueSettingsModel(
    normalizeLeagueSnapshot(unsupported),
    USER_ID,
  ).limitations;
  assert.equal(limitations.some((item) => item.id === "auction"), true);
  assert.equal(
    limitations.some((item) => item.id === "unknown-roster-slots"),
    true,
  );
  assert.equal(limitations.some((item) => item.id === "idp-projections"), true);
});

test("keeper selections remain drafted, count toward needs and leave the player pool", () => {
  const normalized = normalizeLeagueSnapshot(snapshot());
  const keeperPick = {
    player_id: "keeper",
    picked_by: USER_ID,
    roster_id: 7,
    round: 1,
    draft_slot: 4,
    pick_no: 4,
    is_keeper: true,
    metadata: {
      first_name: "Kept",
      last_name: "Quarterback",
      position: "QB",
    },
  } satisfies SleeperDraftPick;
  const board = [
    {
      id: "keeper",
      name: "Kept Quarterback",
      team: "DAL",
      position: "QB",
      positionRank: "QB1",
      ecr: 1,
      tier: 1,
      adp: 1,
      projectedPoints: 300,
      expertBest: 1,
      expertWorst: 1,
      expertAverage: 1,
      injuryStatus: "",
      injuryDetail: "",
      practiceStatus: "",
      byeWeek: 7,
      news: [],
    },
  ] satisfies PlayerIntelligence[];
  const teams = buildTeamDraftStates({
    draft: normalized.draft,
    users: normalized.users,
    rosters: normalized.rosters,
    picks: [keeperPick],
  });
  assert.equal(teams[0].counts.QB, 1);
  assert.deepEqual(availablePlayers(board, [keeperPick]), []);
});
