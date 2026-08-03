import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import type { Draft, LeagueUser, Roster, SleeperDraftPick } from "../../types.ts";
import {
  availablePlayers,
  buildTeamDraftStates,
  createSimulatedPick,
  getDraftSlotForPick,
  recommendPlayers,
  type DraftControlState,
  type DraftCursor,
  type DraftPosition,
  type DraftRecommendation,
  type RecommendationFactor,
  type TeamDraftState,
} from "./engine.ts";
import type { NextTurnMarketForecast } from "./strategy.ts";

export interface WhatIfRosterProjection {
  startersFilled: number;
  starterSlots: number;
  openStarterSlots: number;
  benchDepth: number;
  positionCount: number;
  openNeeds: string[];
  depthShape: string[];
}

export interface WhatIfWaitConsequence {
  position: DraftPosition;
  expectedSelections: number;
  risk: "Likely run" | "Watch" | "Stable";
  bestNow: string;
  likelyNext: string;
  rankDrop: number | null;
  tierDrop: number | null;
}

export interface WhatIfScenario {
  player: PlayerIntelligence;
  comparisonRank: number;
  selectionScore: number;
  recommendation: DraftRecommendation | null;
  survivalProbability: number | null;
  waitLabel: "Draft now" | "Lean draft now" | "Likely safe to wait" | "Pending";
  roster: WhatIfRosterProjection;
  excessiveDepth: boolean;
  depthExplanation: string;
  tierConsequence: string;
  replacementConsequence: string;
  nextRecommendation: DraftRecommendation | null;
  nextUserPick: number | null;
  weakerByWaiting: WhatIfWaitConsequence[];
  positiveFactors: RecommendationFactor[];
  negativeFactors: RecommendationFactor[];
  explanation: string;
}

export interface WhatIfComparison {
  scenarios: WhatIfScenario[];
  winnerId: string | null;
  winnerExplanation: string;
  selectionPick: number;
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

function adjustedRank(player: PlayerIntelligence) {
  return player.leagueRank ?? player.ecr;
}

function tier(player: PlayerIntelligence) {
  return player.leagueTier ?? player.tier;
}

function requirements(draft: Draft): Record<DraftPosition, number> {
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
  };
}

function rosterProjection(
  team: TeamDraftState,
  draft: Draft,
  selectedPosition: PlayerIntelligence["position"],
): WhatIfRosterProjection {
  const required = requirements(draft);
  let directFilled = 0;
  let directSlots = 0;
  for (const position of POSITIONS) {
    directFilled += Math.min(team.counts[position], required[position]);
    directSlots += required[position];
  }

  const coreExcess =
    Math.max(0, team.counts.RB - required.RB) +
    Math.max(0, team.counts.WR - required.WR) +
    Math.max(0, team.counts.TE - required.TE);
  const flexFilled = Math.min(draft.settings.slots_flex, coreExcess);
  const superFlexEligible =
    Math.max(0, team.counts.QB - required.QB) +
    Math.max(0, coreExcess - flexFilled);
  const superFlexSlots = draft.settings.slots_super_flex ?? 0;
  const superFlexFilled = Math.min(superFlexSlots, superFlexEligible);
  const idpExcess =
    Math.max(0, team.counts.DL - required.DL) +
    Math.max(0, team.counts.LB - required.LB) +
    Math.max(0, team.counts.DB - required.DB) +
    team.counts.IDP;
  const idpFlexSlots = draft.settings.slots_idp_flex ?? 0;
  const idpFlexFilled = Math.min(idpFlexSlots, idpExcess);
  const starterSlots =
    directSlots + draft.settings.slots_flex + superFlexSlots + idpFlexSlots;
  const startersFilled =
    directFilled + flexFilled + superFlexFilled + idpFlexFilled;
  const totalPlayers = POSITIONS.reduce(
    (total, position) => total + team.counts[position],
    0,
  );
  const openNeeds = team.needs
    .filter((need) => need.missing > 0)
    .map((need) => `${need.position} ${need.missing}`);
  const depthShape = POSITIONS.filter((position) => team.counts[position] > 0)
    .map((position) => `${position} ${team.counts[position]}`);
  return {
    startersFilled,
    starterSlots,
    openStarterSlots: Math.max(0, starterSlots - startersFilled),
    benchDepth: Math.max(0, totalPlayers - startersFilled),
    positionCount:
      selectedPosition === "—" ? 0 : team.counts[selectedPosition],
    openNeeds,
    depthShape,
  };
}

function nextUserPickAfter(
  draft: Draft,
  selectionPick: number,
  userRosterId: number,
  slotMap: Record<string, number>,
) {
  const total = draft.settings.teams * draft.settings.rounds;
  for (let pick = selectionPick + 1; pick <= total; pick += 1) {
    const slot = getDraftSlotForPick(pick, draft.settings.teams, draft.type);
    if (Number(slotMap[String(slot)]) === userRosterId) return pick;
  }
  return null;
}

function futureCursor(
  draft: Draft,
  selectionPick: number,
  userRosterId: number,
  slotMap: Record<string, number>,
): DraftCursor {
  const total = draft.settings.teams * draft.settings.rounds;
  const currentPick = Math.min(total + 1, selectionPick + 1);
  const nextUserPick = nextUserPickAfter(
    draft,
    selectionPick,
    userRosterId,
    slotMap,
  );
  const complete = currentPick > total;
  const safePick = Math.min(currentPick, total);
  const currentSlot = getDraftSlotForPick(
    Math.max(1, safePick),
    draft.settings.teams,
    draft.type,
  );
  return {
    currentPick,
    currentRound: Math.floor((Math.max(1, safePick) - 1) / draft.settings.teams) + 1,
    currentSlot,
    currentRosterId: complete
      ? null
      : Number(slotMap[String(currentSlot)] ?? 0) || null,
    nextUserPick,
    picksUntilUser:
      nextUserPick === null ? null : Math.max(0, nextUserPick - currentPick),
    isUserTurn: !complete && Number(slotMap[String(currentSlot)]) === userRosterId,
    complete,
  };
}

function sortByRank(players: PlayerIntelligence[]) {
  return [...players].sort(
    (left, right) =>
      (adjustedRank(left) ?? Number.MAX_SAFE_INTEGER) -
        (adjustedRank(right) ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name),
  );
}

function waitConsequences(
  available: PlayerIntelligence[],
  market: NextTurnMarketForecast | null,
  selectedPosition: PlayerIntelligence["position"],
): WhatIfWaitConsequence[] {
  if (!market) return [];
  const orderedPositions = [
    ...market.positionDemand
      .filter((item) => item.risk !== "Stable")
      .map((item) => item.position),
    ...(selectedPosition === "—" ? [] : [selectedPosition]),
  ];
  return [...new Set(orderedPositions)]
    .slice(0, 3)
    .flatMap((position): WhatIfWaitConsequence[] => {
      const pool = sortByRank(
        available.filter((player) => player.position === position),
      );
      const bestNow = pool[0];
      if (!bestNow) return [];
      const likelyNext =
        pool.find(
          (player) => (market.survivalByPlayer.get(player.id) ?? 50) >= 50,
        ) ?? pool[pool.length - 1];
      const nowRank = adjustedRank(bestNow);
      const nextRank = adjustedRank(likelyNext);
      const nowTier = tier(bestNow);
      const nextTier = tier(likelyNext);
      const demand = market.positionDemand.find(
        (item) => item.position === position,
      );
      return [{
        position,
        expectedSelections: demand?.expectedSelections ?? 0,
        risk: demand?.risk ?? "Stable",
        bestNow: bestNow.name,
        likelyNext: likelyNext.name,
        rankDrop:
          nowRank === null || nextRank === null ? null : Math.max(0, nextRank - nowRank),
        tierDrop:
          nowTier === null || nextTier === null ? null : Math.max(0, nextTier - nowTier),
      }];
    });
}

function waitLabel(survival: number | null, depthPenalty: boolean) {
  if (survival === null) return "Pending" as const;
  if (survival <= 40) return "Draft now" as const;
  if (survival <= 72 && !depthPenalty) return "Lean draft now" as const;
  return "Likely safe to wait" as const;
}

function factor(
  recommendation: DraftRecommendation | null,
  key: RecommendationFactor["key"],
) {
  return recommendation?.factors?.find((item) => item.key === key) ?? null;
}

function scenarioExplanation(
  player: PlayerIntelligence,
  score: number,
  positive: RecommendationFactor[],
  negative: RecommendationFactor[],
  nextRecommendation: DraftRecommendation | null,
) {
  const strength = positive[0]
    ? `${positive[0].label.toLowerCase()} adds ${positive[0].score.toFixed(1)}`
    : "no factor provides a material bonus";
  const cost = negative[0]
    ? `${negative[0].label.toLowerCase()} subtracts ${Math.abs(negative[0].score).toFixed(1)}`
    : "no factor creates a material penalty";
  return `${player.name} produces ${score} roster-value points: ${strength}, while ${cost}. ${
    nextRecommendation
      ? `${nextRecommendation.player.name} becomes the projected next recommendation.`
      : "No later eligible recommendation is available."
  }`;
}

export function buildWhatIfComparison({
  candidates,
  available,
  allPlayers,
  currentRecommendations,
  market,
  draft,
  users,
  rosters,
  picks,
  userRosterId,
  cursor,
  controls,
  slotMap,
}: {
  candidates: PlayerIntelligence[];
  available: PlayerIntelligence[];
  allPlayers: PlayerIntelligence[];
  currentRecommendations: DraftRecommendation[];
  market: NextTurnMarketForecast | null;
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  userRosterId: number;
  cursor: DraftCursor;
  controls: DraftControlState;
  slotMap: Record<string, number>;
}): WhatIfComparison {
  const selectionPick = cursor.nextUserPick ?? cursor.currentPick;
  const recommendationById = new Map(
    currentRecommendations.map((item) => [item.player.id, item]),
  );
  const baseTeams = buildTeamDraftStates({
    draft,
    users,
    rosters,
    picks,
    slotMap,
  });
  const ownerId =
    rosters.find((roster) => roster.roster_id === userRosterId)?.owner_id ??
    "what-if-user";

  const baseScenarios = candidates.map((player) => {
    const recommendation =
      recommendationById.get(player.id) ??
      recommendPlayers({
        available,
        allPlayers,
        teams: baseTeams,
        userRosterId,
        cursor,
        controls: {
          ...controls,
          avoid: controls.avoid.filter((id) => id !== player.id),
        },
        draft,
        slotMap,
        limit: available.length,
      }).find((item) => item.player.id === player.id) ??
      null;
    const hypotheticalPick = createSimulatedPick({
      draft,
      pickNumber: Math.max(1, selectionPick),
      player,
      rosterId: userRosterId,
      ownerId,
    });
    const hypotheticalPicks = [...picks, hypotheticalPick];
    const teamsAfter = buildTeamDraftStates({
      draft,
      users,
      rosters,
      picks: hypotheticalPicks,
      slotMap,
    });
    const userTeamAfter = teamsAfter.find(
      (team) => team.rosterId === userRosterId,
    );
    const remaining = availablePlayers(allPlayers, hypotheticalPicks);
    const afterCursor = futureCursor(
      draft,
      Math.max(1, selectionPick),
      userRosterId,
      slotMap,
    );
    const nextRecommendation = recommendPlayers({
      available: remaining,
      allPlayers,
      teams: teamsAfter,
      userRosterId,
      cursor: afterCursor,
      controls,
      draft,
      slotMap,
      limit: 1,
    })[0] ?? null;
    const survivalProbability = market?.survivalByPlayer.get(player.id) ?? null;
    const balance = factor(recommendation, "bench-balance");
    const excessiveDepth = Boolean(balance && balance.score <= -8);
    const positiveFactors = [...(recommendation?.factors ?? [])]
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);
    const negativeFactors = [...(recommendation?.factors ?? [])]
      .filter((item) => item.score < 0)
      .sort((left, right) => left.score - right.score);
    const samePosition = sortByRank(
      remaining.filter((item) => item.position === player.position),
    );
    const likelyReplacement =
      samePosition.find(
        (item) => (market?.survivalByPlayer.get(item.id) ?? 50) >= 50,
      ) ?? samePosition[0] ?? null;
    const currentTier = tier(player);
    const replacementTier = likelyReplacement ? tier(likelyReplacement) : null;
    const playerReplacement = recommendation?.vor ?? player.replacementValue ?? null;
    const replacementRecommendation = likelyReplacement
      ? recommendationById.get(likelyReplacement.id) ?? null
      : null;
    const laterReplacement =
      replacementRecommendation?.vor ?? likelyReplacement?.replacementValue ?? null;
    const selectionScore = recommendation?.score ?? 0;
    return {
      player,
      comparisonRank: 0,
      selectionScore,
      recommendation,
      survivalProbability,
      waitLabel: waitLabel(survivalProbability, excessiveDepth),
      roster: userTeamAfter
        ? rosterProjection(userTeamAfter, draft, player.position)
        : {
            startersFilled: 0,
            starterSlots: 0,
            openStarterSlots: 0,
            benchDepth: 0,
            positionCount: 0,
            openNeeds: [],
            depthShape: [],
          },
      excessiveDepth,
      depthExplanation:
        balance?.value ?? "Positional depth could not be evaluated.",
      tierConsequence:
        likelyReplacement && currentTier !== null && replacementTier !== null
          ? `${likelyReplacement.name} is the likely ${player.position} fallback at Tier ${replacementTier} (${Math.max(0, replacementTier - currentTier)} tier${Math.max(0, replacementTier - currentTier) === 1 ? "" : "s"} lower).`
          : "No reliable same-position tier fallback is available.",
      replacementConsequence:
        playerReplacement !== null && laterReplacement !== null
          ? `Waiting risks ${Math.max(0, playerReplacement - laterReplacement).toFixed(1)} value-over-replacement points versus ${likelyReplacement?.name}.`
          : "The replacement-value cost cannot be calculated from the available projections.",
      nextRecommendation,
      nextUserPick: afterCursor.nextUserPick,
      weakerByWaiting: waitConsequences(available, market, player.position),
      positiveFactors,
      negativeFactors,
      explanation: scenarioExplanation(
        player,
        selectionScore,
        positiveFactors,
        negativeFactors,
        nextRecommendation,
      ),
    } satisfies WhatIfScenario;
  });

  const ranked = [...baseScenarios].sort(
    (left, right) =>
      right.selectionScore - left.selectionScore ||
      (adjustedRank(left.player) ?? Number.MAX_SAFE_INTEGER) -
        (adjustedRank(right.player) ?? Number.MAX_SAFE_INTEGER),
  );
  const ranks = new Map(ranked.map((scenario, index) => [scenario.player.id, index + 1]));
  const scenarios = baseScenarios.map((scenario) => ({
    ...scenario,
    comparisonRank: ranks.get(scenario.player.id) ?? 0,
  }));
  const winner = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const winnerExplanation = winner
    ? runnerUp
      ? `${winner.player.name} is the what-if recommendation by ${winner.selectionScore - runnerUp.selectionScore} roster-value point${winner.selectionScore - runnerUp.selectionScore === 1 ? "" : "s"} over ${runnerUp.player.name}. ${winner.explanation}`
      : `${winner.player.name} is the only modeled choice.`
    : "Choose at least two available players to compare their roster consequences.";
  return {
    scenarios,
    winnerId: winner?.player.id ?? null,
    winnerExplanation,
    selectionPick,
  };
}
