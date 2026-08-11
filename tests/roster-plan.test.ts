import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";
import type {
  DraftPosition,
  TeamDraftState,
} from "../src/features/live-draft/engine.ts";
import { buildRosterPlan } from "../src/features/live-draft/rosterPlan.ts";
import type { Draft, SleeperDraftPick } from "../src/types.ts";

const draft: Draft = {
  draft_id: "draft-23",
  league_id: "league-23",
  type: "snake",
  status: "drafting",
  start_time: null,
  draft_order: { user: 1 },
  slot_to_roster_id: { "1": 1 },
  settings: {
    teams: 12,
    rounds: 16,
    pick_timer: 90,
    slots_qb: 1,
    slots_rb: 2,
    slots_wr: 2,
    slots_te: 1,
    slots_flex: 1,
    slots_super_flex: 1,
    slots_k: 1,
    slots_def: 1,
    slots_bn: 6,
  },
};

const emptyCounts: Record<DraftPosition, number> = {
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

function pick(
  pickNo: number,
  id: string,
  name: string,
  position: DraftPosition,
): SleeperDraftPick {
  const [first_name = name, ...last] = name.split(" ");
  return {
    player_id: id,
    picked_by: "user",
    roster_id: 1,
    round: Math.ceil(pickNo / 12),
    draft_slot: 1,
    pick_no: pickNo,
    is_keeper: null,
    metadata: {
      first_name,
      last_name: last.join(" "),
      position,
      team: "TST",
    },
  };
}

function player(
  id: string,
  name: string,
  position: PlayerIntelligence["position"],
  byeWeek: number,
  injuryStatus = "",
): PlayerIntelligence {
  return {
    id,
    name,
    team: "TST",
    position,
    positionRank: `${position}1`,
    ecr: 1,
    tier: 1,
    adp: 1,
    projectedPoints: 250,
    expertBest: 1,
    expertWorst: 3,
    expertAverage: 2,
    injuryStatus,
    injuryDetail: injuryStatus,
    practiceStatus: "",
    byeWeek,
    news: [],
  };
}

function team(
  picks: SleeperDraftPick[],
  counts: Partial<Record<DraftPosition, number>>,
): TeamDraftState {
  return {
    rosterId: 1,
    ownerId: "user",
    name: "KingBoby",
    slot: 1,
    picks,
    counts: { ...emptyCounts, ...counts },
    needs: [],
  };
}

test("roster plan completes core, FLEX and SUPER_FLEX starters without double counting", () => {
  const selections = [
    pick(1, "qb1", "Quarter Back", "QB"),
    pick(24, "qb2", "Second Quarter", "QB"),
    pick(25, "rb1", "Running One", "RB"),
    pick(48, "rb2", "Running Two", "RB"),
    pick(49, "rb3", "Running Three", "RB"),
    pick(72, "wr1", "Wide One", "WR"),
    pick(73, "wr2", "Wide Two", "WR"),
    pick(96, "te1", "Tight End", "TE"),
    pick(97, "k1", "Kicker One", "K"),
    pick(120, "d1", "Defense One", "DST"),
  ];
  const players = selections.map((selection) =>
    player(
      selection.player_id,
      `${selection.metadata.first_name} ${selection.metadata.last_name}`.trim(),
      selection.metadata.position as PlayerIntelligence["position"],
      5,
    ),
  );
  const plan = buildRosterPlan({
    draft,
    team: team(selections, { QB: 2, RB: 3, WR: 2, TE: 1, K: 1, DST: 1 }),
    players,
  });

  assert.equal(plan.starterTotal, 10);
  assert.equal(plan.startersFilled, 10);
  assert.equal(plan.completionPercent, 100);
  assert.deepEqual(plan.essentialNeeds, []);
  assert.match(plan.flexPlan, /FLEX is covered/);
  assert.match(plan.flexPlan, /SUPER_FLEX is covered/);
});

test("depth targets stay fixed and flag a position drafted above its plan", () => {
  const selections = Array.from({ length: 7 }, (_, index) =>
    pick(index + 1, `rb${index + 1}`, `Runner ${index + 1}`, "RB"),
  );
  const plan = buildRosterPlan({
    draft,
    team: team(selections, { RB: 7 }),
    players: selections.map((selection) =>
      player(selection.player_id, pickName(selection), "RB", 6),
    ),
  });
  const rb = plan.positions.find((position) => position.position === "RB");

  assert.equal(rb?.starterTarget, 3);
  assert.equal(rb?.depthTarget, 5);
  assert.equal(rb?.status, "Overdrafted");
  assert.match(plan.overdraftedWarnings[0] ?? "", /2 above the planned depth target/);
  assert.match(plan.benchGuidance, /Finish QB 1/);
});

test("optional depth is distinguished from essential starters while lineup needs remain", () => {
  const selections = [
    pick(1, "rb1", "Runner One", "RB"),
    pick(2, "rb2", "Runner Two", "RB"),
    pick(3, "rb3", "Runner Three", "RB"),
    pick(4, "rb4", "Runner Four", "RB"),
    pick(5, "rb5", "Runner Five", "RB"),
  ];
  const plan = buildRosterPlan({
    draft,
    team: team(selections, { RB: 5 }),
    players: selections.map((selection) =>
      player(selection.player_id, pickName(selection), "RB", 7),
    ),
  });

  assert.deepEqual(
    plan.roster.map((item) => item.role),
    [
      "Essential starter",
      "Essential starter",
      "Essential starter",
      "Essential starter",
      "Optional depth",
    ],
  );
  assert.match(plan.overdraftedWarnings[0] ?? "", /Optional RB depth/);
  assert.match(plan.benchGuidance, /Finish QB 1/);
});

test("bye-week and injury-risk concentrations produce actionable warnings", () => {
  const selections = [
    pick(1, "rb1", "Runner One", "RB"),
    pick(2, "wr1", "Wide One", "WR"),
    pick(3, "te1", "Tight One", "TE"),
  ];
  const players = [
    player("rb1", "Runner One", "RB", 9, "Out"),
    player("wr1", "Wide One", "WR", 9, "Questionable"),
    player("te1", "Tight One", "TE", 9, "Injured reserve"),
  ];
  const plan = buildRosterPlan({
    draft,
    team: team(selections, { RB: 1, WR: 1, TE: 1 }),
    players,
  });

  assert.equal(plan.byeWeekTone, "warning");
  assert.match(plan.byeWeekSummary, /Week 9 has 3/);
  assert.equal(plan.riskTone, "warning");
  assert.match(plan.riskSummary, /2 high-risk and 1 medium-risk/);
});

function pickName(selection: SleeperDraftPick) {
  return `${selection.metadata.first_name} ${selection.metadata.last_name}`.trim();
}

test("live drafts take the exclusive Simple Draft Mode path with every required surface", () => {
  const roomSource = readFileSync(
    new URL("../src/features/live-draft/LiveDraftRoom.tsx", import.meta.url),
    "utf8",
  );
  const simpleSource = readFileSync(
    new URL("../src/features/live-draft/SimpleDraftMode.tsx", import.meta.url),
    "utf8",
  );
  const simpleBranch = roomSource.indexOf("if (focusedModeActive && rosterPlan)");
  const denseRoom = roomSource.indexOf(
    '<main className="workspace-page live-draft-page">',
    simpleBranch,
  );

  assert.ok(simpleBranch >= 0, "live-draft Simple Mode branch must exist");
  assert.ok(
    denseRoom > simpleBranch,
    "Simple Mode must return before the dense Draft Room can render",
  );
  for (const label of [
    "Simple Draft Mode",
    "Current pick",
    "Next pick",
    "Best five recommendations",
    "Why this recommendation is best",
    "Complete available-player ranking",
    "draft-now/wait advice",
    "Your current roster",
    "Starting positions still needed",
    "Starting-lineup completion",
    "Position depth targets",
    "Overdrafted-position warning",
    "Bye-week concentration",
    "Risk concentration",
    "FLEX / SUPER_FLEX plan",
    "Bench-balance guidance",
    "Essential starter",
    "Optional depth",
    "Recent selections",
    "Opponent needs before your next turn",
    "Data freshness &amp; connection",
  ]) {
    assert.match(simpleSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
