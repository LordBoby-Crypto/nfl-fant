import type { Draft, SleeperDraftPick } from "../../types.ts";
import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import {
  normalizePlayerName,
  pickPlayerName,
  pickPosition,
  type DraftPosition,
  type TeamDraftState,
} from "./engine.ts";

export type RosterPlanStatus =
  | "Essential starter"
  | "Optional depth"
  | "Target met"
  | "Overdrafted";

export interface RosterPlanPosition {
  position: DraftPosition;
  drafted: number;
  starterTarget: number;
  depthTarget: number;
  status: RosterPlanStatus;
}

export interface RosterPlanPlayer {
  pick: SleeperDraftPick;
  player: PlayerIntelligence | null;
  position: DraftPosition | null;
  role: "Essential starter" | "Optional depth";
}

export interface RosterPlan {
  startersFilled: number;
  starterTotal: number;
  completionPercent: number;
  essentialNeeds: string[];
  positions: RosterPlanPosition[];
  roster: RosterPlanPlayer[];
  overdraftedWarnings: string[];
  byeWeekSummary: string;
  byeWeekTone: "clear" | "warning";
  riskSummary: string;
  riskTone: "clear" | "warning" | "danger";
  flexPlan: string;
  benchGuidance: string;
}

const POSITIONS: DraftPosition[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DST",
  "DL",
  "LB",
  "DB",
  "IDP",
];

function coreRequirements(draft: Draft) {
  return {
    QB: draft.settings.slots_qb,
    RB: draft.settings.slots_rb,
    WR: draft.settings.slots_wr,
    TE: draft.settings.slots_te,
    K: draft.settings.slots_k,
    DST: draft.settings.slots_def,
    DL: draft.settings.slots_dl ?? 0,
    LB: draft.settings.slots_lb ?? 0,
    DB: draft.settings.slots_db ?? 0,
    IDP: 0,
  } satisfies Record<DraftPosition, number>;
}

function playerForPick(
  pick: SleeperDraftPick,
  playersById: Map<string, PlayerIntelligence>,
  playersByName: Map<string, PlayerIntelligence>,
) {
  return (
    playersById.get(pick.player_id) ??
    playersByName.get(normalizePlayerName(pickPlayerName(pick))) ??
    null
  );
}

function riskLevel(player: PlayerIntelligence) {
  const text = [
    player.injuryStatus,
    player.injuryDetail,
    player.practiceStatus,
  ]
    .join(" ")
    .toLocaleLowerCase();
  if (!text.trim() || /healthy|active|full practice|no injury/.test(text)) return 0;
  if (/out|injured reserve|\bir\b|pup|suspend|doubtful/.test(text)) return 2;
  if (/questionable|limited|did not practice|dnp|probable|injur/.test(text)) return 1;
  return 0;
}

function startingTargets(draft: Draft) {
  const targets = coreRequirements(draft);
  const flex = draft.settings.slots_flex;
  targets.RB += Math.ceil(flex / 2);
  targets.WR += Math.floor(flex / 2);
  targets.QB += draft.settings.slots_super_flex ?? 0;
  targets.LB += draft.settings.slots_idp_flex ?? 0;
  return targets;
}

function depthTargets(draft: Draft) {
  const targets = startingTargets(draft);
  const sequence: DraftPosition[] = (draft.settings.slots_super_flex ?? 0) > 0
    ? ["QB", "RB", "WR", "RB", "WR", "TE"]
    : ["RB", "WR", "RB", "WR", "TE", "QB"];
  for (let index = 0; index < draft.settings.slots_bn; index += 1) {
    targets[sequence[index % sequence.length]] += 1;
  }
  return targets;
}

function lineupCompletion(draft: Draft, counts: Record<DraftPosition, number>) {
  const requirements = coreRequirements(draft);
  const coreFilled = POSITIONS.reduce(
    (total, position) => total + Math.min(counts[position], requirements[position]),
    0,
  );
  const extra = Object.fromEntries(
    POSITIONS.map((position) => [
      position,
      Math.max(0, counts[position] - requirements[position]),
    ]),
  ) as Record<DraftPosition, number>;
  const superFlexSlots = draft.settings.slots_super_flex ?? 0;
  const superFlexFromQb = Math.min(superFlexSlots, extra.QB);
  const superFlexSkillNeed = superFlexSlots - superFlexFromQb;
  const skillExtras = extra.RB + extra.WR + extra.TE;
  const superFlexFromSkill = Math.min(superFlexSkillNeed, skillExtras);
  const flexFilled = Math.min(
    draft.settings.slots_flex,
    Math.max(0, skillExtras - superFlexFromSkill),
  );
  const superFlexFilled = superFlexFromQb + superFlexFromSkill;
  const idpExtra = extra.DL + extra.LB + extra.DB + counts.IDP;
  const idpFlexFilled = Math.min(draft.settings.slots_idp_flex ?? 0, idpExtra);
  const starterTotal =
    Object.values(requirements).reduce((total, value) => total + value, 0) +
    draft.settings.slots_flex +
    superFlexSlots +
    (draft.settings.slots_idp_flex ?? 0);
  return {
    coreFilled,
    flexFilled,
    superFlexFilled,
    idpFlexFilled,
    startersFilled: coreFilled + flexFilled + superFlexFilled + idpFlexFilled,
    starterTotal,
  };
}

function essentialNeeds(
  draft: Draft,
  counts: Record<DraftPosition, number>,
  completion: ReturnType<typeof lineupCompletion>,
) {
  const requirements = coreRequirements(draft);
  const needs = POSITIONS.flatMap((position) => {
    const missing = Math.max(0, requirements[position] - counts[position]);
    return missing ? [`${position} ${missing}`] : [];
  });
  const flexMissing = Math.max(0, draft.settings.slots_flex - completion.flexFilled);
  const superFlexMissing = Math.max(
    0,
    (draft.settings.slots_super_flex ?? 0) - completion.superFlexFilled,
  );
  const idpFlexMissing = Math.max(
    0,
    (draft.settings.slots_idp_flex ?? 0) - completion.idpFlexFilled,
  );
  if (flexMissing) needs.push(`FLEX ${flexMissing}`);
  if (superFlexMissing) needs.push(`SUPER_FLEX ${superFlexMissing}`);
  if (idpFlexMissing) needs.push(`IDP_FLEX ${idpFlexMissing}`);
  return needs;
}

function flexPlan(
  draft: Draft,
  completion: ReturnType<typeof lineupCompletion>,
) {
  const parts: string[] = [];
  const flexSlots = draft.settings.slots_flex;
  const superFlexSlots = draft.settings.slots_super_flex ?? 0;
  if (flexSlots) {
    const remaining = Math.max(0, flexSlots - completion.flexFilled);
    parts.push(
      remaining
        ? `${remaining} FLEX open: prioritize the best RB/WR tier value${draft.settings.slots_te ? ", with TE eligible" : ""}.`
        : "FLEX is covered; add RB/WR upside only at value.",
    );
  }
  if (superFlexSlots) {
    const remaining = Math.max(0, superFlexSlots - completion.superFlexFilled);
    parts.push(
      remaining
        ? `${remaining} SUPER_FLEX open: prioritize a starting QB before optional depth.`
        : "SUPER_FLEX is covered; keep one viable backup QB target.",
    );
  }
  return parts.length ? parts.join(" ") : "This league has no FLEX or SUPER_FLEX starting slot.";
}

export function buildRosterPlan({
  draft,
  team,
  players,
}: {
  draft: Draft;
  team: TeamDraftState;
  players: PlayerIntelligence[];
}): RosterPlan {
  const starterTargets = startingTargets(draft);
  const targets = depthTargets(draft);
  const completion = lineupCompletion(draft, team.counts);
  const needs = essentialNeeds(draft, team.counts, completion);
  const playersById = new Map(players.map((player) => [player.id, player]));
  const playersByName = new Map(
    players.map((player) => [normalizePlayerName(player.name), player]),
  );
  const requirements = coreRequirements(draft);
  const seenByPosition = { ...team.counts };
  for (const position of POSITIONS) seenByPosition[position] = 0;
  let flexOpen = draft.settings.slots_flex;
  let superFlexOpen = draft.settings.slots_super_flex ?? 0;
  let idpFlexOpen = draft.settings.slots_idp_flex ?? 0;
  const roster = team.picks.map((pick): RosterPlanPlayer => {
    const position = pickPosition(pick);
    if (position) seenByPosition[position] += 1;
    let essential = Boolean(
      position && seenByPosition[position] <= requirements[position],
    );
    if (position && !essential) {
      if (["RB", "WR", "TE"].includes(position) && flexOpen > 0) {
        flexOpen -= 1;
        essential = true;
      } else if (["QB", "RB", "WR", "TE"].includes(position) && superFlexOpen > 0) {
        superFlexOpen -= 1;
        essential = true;
      } else if (["DL", "LB", "DB", "IDP"].includes(position) && idpFlexOpen > 0) {
        idpFlexOpen -= 1;
        essential = true;
      }
    }
    return {
      pick,
      player: playerForPick(pick, playersById, playersByName),
      position,
      role: essential ? "Essential starter" : "Optional depth",
    };
  });
  const positions = POSITIONS.filter(
    (position) => targets[position] > 0 || team.counts[position] > 0,
  ).map((position): RosterPlanPosition => {
    const drafted = team.counts[position];
    const starterTarget = starterTargets[position];
    const depthTarget = Math.max(starterTarget, targets[position]);
    return {
      position,
      drafted,
      starterTarget,
      depthTarget,
      status:
        drafted > depthTarget
          ? "Overdrafted"
          : drafted < starterTarget
            ? "Essential starter"
            : drafted < depthTarget
              ? "Optional depth"
              : "Target met",
    };
  });
  const overdraftedWarnings = positions.flatMap((position) =>
    position.status === "Overdrafted"
      ? [
          `${position.position} is ${position.drafted - position.depthTarget} above the planned depth target (${position.drafted}/${position.depthTarget}).`,
        ]
      : [],
  );
  if (!overdraftedWarnings.length && needs.length) {
    const earlyDepth = positions.filter(
      (position) => position.drafted > position.starterTarget,
    );
    if (earlyDepth.length) {
      overdraftedWarnings.push(
        `Optional ${earlyDepth.map((position) => position.position).join("/")} depth is already on the roster while ${needs.join(", ")} remain essential.`,
      );
    }
  }

  const rosterPlayers = roster.flatMap((item) => (item.player ? [item.player] : []));
  const byeCounts = new Map<number, number>();
  for (const player of rosterPlayers) {
    if (player.byeWeek !== null) {
      byeCounts.set(player.byeWeek, (byeCounts.get(player.byeWeek) ?? 0) + 1);
    }
  }
  const strongestBye = [...byeCounts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0];
  const byeWarning = Boolean(
    strongestBye &&
      (strongestBye[1] >= 3 || strongestBye[1] / Math.max(1, rosterPlayers.length) >= 0.4),
  );
  const mediumRisk = rosterPlayers.filter((player) => riskLevel(player) === 1).length;
  const highRisk = rosterPlayers.filter((player) => riskLevel(player) === 2).length;
  const riskWarning = highRisk >= 2 || highRisk + mediumRisk >= 3;
  const riskDanger = highRisk >= 3;
  const depthNeeded = positions.filter(
    (position) => position.status === "Optional depth",
  );

  return {
    startersFilled: completion.startersFilled,
    starterTotal: completion.starterTotal,
    completionPercent:
      completion.starterTotal > 0
        ? Math.round((completion.startersFilled / completion.starterTotal) * 100)
        : 100,
    essentialNeeds: needs,
    positions,
    roster,
    overdraftedWarnings,
    byeWeekSummary: strongestBye
      ? byeWarning
        ? `Week ${strongestBye[0]} has ${strongestBye[1]} rostered players. Avoid adding another matching bye.`
        : `Largest overlap: ${strongestBye[1]} player${strongestBye[1] === 1 ? "" : "s"} in Week ${strongestBye[0]}. No concentration warning.`
      : "Bye-week data is not available for the drafted roster yet.",
    byeWeekTone: byeWarning ? "warning" : "clear",
    riskSummary: riskWarning
      ? `${highRisk} high-risk and ${mediumRisk} medium-risk drafted player${highRisk + mediumRisk === 1 ? "" : "s"}. Favor a stable next selection.`
      : rosterPlayers.length
        ? `${highRisk} high-risk and ${mediumRisk} medium-risk drafted players. Concentration is controlled.`
        : "Risk concentration will appear after your first selection.",
    riskTone: riskDanger ? "danger" : riskWarning ? "warning" : "clear",
    flexPlan: flexPlan(draft, completion),
    benchGuidance: needs.length
      ? `Finish ${needs.join(", ")} before adding optional bench depth.`
      : overdraftedWarnings.length
        ? "Stop adding to overdrafted positions; use remaining bench spots on other positions."
        : depthNeeded.length
          ? `Next depth targets: ${depthNeeded.slice(0, 3).map((position) => `${position.position} ${position.drafted}/${position.depthTarget}`).join(" · ")}.`
          : "Starter and depth targets are balanced. Use the bench for upside and injury insulation.",
  };
}
