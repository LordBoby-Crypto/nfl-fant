import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import type { DraftRecommendation } from "./engine.ts";
import type {
  NextTurnMarketForecast,
  NextTurnPositionDemand,
  OpponentPickForecast,
} from "./strategy.ts";
import type { TierBreakWarning } from "./liveIntelligence.ts";

export type DraftWaitRecommendation =
  | "Draft now"
  | "Lean draft now"
  | "Likely safe to wait"
  | "No next pick";

export interface ForecastAlternative {
  player: PlayerIntelligence;
  score: number;
  scoreDelta: number;
  samePosition: boolean;
}

export interface NextTurnPlayerForecast {
  player: PlayerIntelligence;
  recommendationScore: number;
  recommendation: DraftWaitRecommendation;
  tone: "danger" | "warning" | "safe" | "neutral";
  survivalProbability: number | null;
  expectedWaitCost: number;
  opponentNeedCount: number;
  positionDemand: NextTurnPositionDemand | null;
  finalValuablePlayerInTier: boolean;
  tierBreak: TierBreakWarning | null;
  alternatives: ForecastAlternative[];
  explanation: string;
}

export interface NextTurnForecast {
  generatedForPick: number;
  nextUserPick: number | null;
  interveningPicks: number;
  simulations: number;
  players: NextTurnPlayerForecast[];
  likelyPicks: OpponentPickForecast[];
  positionDemand: NextTurnPositionDemand[];
}

export interface NextTurnForecastChange {
  headline: string;
  details: string[];
}

function tierValue(player: PlayerIntelligence) {
  return player.leagueTier ?? player.tier;
}

function flexMatches(position: PlayerIntelligence["position"], need: string) {
  const code = need.split(" ")[0];
  if (code === position) return true;
  if (code === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (code === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
  if (code === "IDP_FLEX") return ["DL", "LB", "DB", "IDP"].includes(position);
  return false;
}

function opponentNeedCount(
  player: PlayerIntelligence,
  likelyPicks: OpponentPickForecast[],
) {
  return new Set(
    likelyPicks
      .filter((pick) => pick.needs.some((need) => flexMatches(player.position, need)))
      .map((pick) => pick.rosterId),
  ).size;
}

function realisticAlternatives(
  recommendation: DraftRecommendation,
  recommendations: DraftRecommendation[],
) {
  const currentIndex = recommendations.findIndex(
    (candidate) => candidate.player.id === recommendation.player.id,
  );
  const lower = recommendations.slice(Math.max(0, currentIndex + 1));
  const samePosition = lower.find(
    (candidate) => candidate.player.position === recommendation.player.position,
  );
  const bestOverall = lower.find(
    (candidate) => candidate.player.id !== samePosition?.player.id,
  );
  return [samePosition, bestOverall]
    .filter((candidate): candidate is DraftRecommendation => Boolean(candidate))
    .map((candidate): ForecastAlternative => ({
      player: candidate.player,
      score: candidate.score,
      scoreDelta: candidate.score - recommendation.score,
      samePosition: candidate.player.position === recommendation.player.position,
    }));
}

function fallbackScore(
  recommendation: DraftRecommendation,
  alternatives: ForecastAlternative[],
) {
  const samePosition = alternatives.find((candidate) => candidate.samePosition);
  return samePosition?.score ?? alternatives[0]?.score ?? recommendation.score - 8;
}

function plainEnglishExplanation({
  survival,
  nextUserPick,
  interveningPicks,
  opponentNeeds,
  player,
  finalTier,
  positionDemand,
  cost,
}: {
  survival: number;
  nextUserPick: number;
  interveningPicks: number;
  opponentNeeds: number;
  player: PlayerIntelligence;
  finalTier: boolean;
  positionDemand: NextTurnPositionDemand | null;
  cost: number;
}) {
  const market =
    survival >= 73
      ? `The model expects ${player.name} to get through the ${interveningPicks} intervening pick${interveningPicks === 1 ? "" : "s"} most of the time.`
      : survival >= 46
        ? `${player.name} is close to the market cutoff before pick ${nextUserPick}, so waiting is a real gamble.`
        : `${player.name} is selected before pick ${nextUserPick} in most modeled drafts.`;
  const pressure = opponentNeeds
    ? ` ${opponentNeeds} team${opponentNeeds === 1 ? "" : "s"} picking first still need${opponentNeeds === 1 ? "s" : ""} ${player.position} or a compatible flex.`
    : ` No team picking first shows an obvious open ${player.position} or compatible flex need.`;
  const tier = finalTier
    ? " This is the final valuable player before a meaningful tier drop."
    : positionDemand?.risk === "Likely run"
      ? ` A ${player.position} run is likely before the turn returns.`
      : "";
  const waitCost = cost > 0
    ? ` The expected cost of waiting is ${cost.toFixed(1)} recommendation points versus the next realistic fallback.`
    : " Waiting has little modeled fallback cost.";
  return `${market}${pressure}${tier}${waitCost}`;
}

export function buildNextTurnForecast({
  generatedForPick,
  nextUserPick,
  recommendations,
  tierBreaks,
  market,
}: {
  generatedForPick: number;
  nextUserPick: number | null;
  recommendations: DraftRecommendation[];
  tierBreaks: Map<string, TierBreakWarning | null>;
  market: NextTurnMarketForecast | null;
}): NextTurnForecast {
  const likelyPicks = market?.picks ?? [];
  const positionDemand = market?.positionDemand ?? [];
  const players = recommendations.map((recommendation): NextTurnPlayerForecast => {
    const player = recommendation.player;
    const tierBreak = tierBreaks.get(player.id) ?? null;
    const alternatives = realisticAlternatives(recommendation, recommendations);
    if (nextUserPick === null || !market) {
      return {
        player,
        recommendationScore: recommendation.score,
        recommendation: "No next pick",
        tone: "neutral",
        survivalProbability: null,
        expectedWaitCost: 0,
        opponentNeedCount: 0,
        positionDemand: null,
        finalValuablePlayerInTier: false,
        tierBreak,
        alternatives,
        explanation: "The draft order does not currently expose a later user selection to model.",
      };
    }
    const survival = market.survivalByPlayer.get(player.id) ?? 50;
    const opponentNeeds = opponentNeedCount(player, likelyPicks);
    const demand =
      positionDemand.find((candidate) => candidate.position === player.position) ?? null;
    const finalTier = Boolean(
      tierBreak &&
        tierBreak.remainingInTier === 1 &&
        (tierBreak.nextTier === null || (tierBreak.ecrDrop ?? 0) >= 4),
    );
    const cost = Math.max(
      0,
      (recommendation.score - fallbackScore(recommendation, alternatives)) *
        (1 - survival / 100),
    );
    const recommendationLabel: DraftWaitRecommendation =
      survival <= 40 ||
      (finalTier && survival <= 62) ||
      cost >= 6 ||
      (demand?.risk === "Likely run" && survival <= 58)
        ? "Draft now"
        : survival <= 72 || cost >= 3 || tierBreak?.urgent
          ? "Lean draft now"
          : "Likely safe to wait";
    return {
      player,
      recommendationScore: recommendation.score,
      recommendation: recommendationLabel,
      tone:
        recommendationLabel === "Draft now"
          ? "danger"
          : recommendationLabel === "Lean draft now"
            ? "warning"
            : "safe",
      survivalProbability: survival,
      expectedWaitCost: Number(cost.toFixed(1)),
      opponentNeedCount: opponentNeeds,
      positionDemand: demand,
      finalValuablePlayerInTier: finalTier,
      tierBreak,
      alternatives,
      explanation: plainEnglishExplanation({
        survival,
        nextUserPick,
        interveningPicks: market.interveningPicks,
        opponentNeeds,
        player,
        finalTier,
        positionDemand: demand,
        cost,
      }),
    };
  });
  return {
    generatedForPick,
    nextUserPick,
    interveningPicks: market?.interveningPicks ?? 0,
    simulations: market?.runs ?? 0,
    players,
    likelyPicks,
    positionDemand,
  };
}

export function compareNextTurnForecast(
  previous: NextTurnForecast,
  current: NextTurnForecast,
): NextTurnForecastChange {
  const previousLead = previous.players[0];
  const currentLead = current.players[0];
  if (!currentLead) {
    return {
      headline: "Forecast cleared",
      details: ["No eligible recommendation remains after the latest pick."],
    };
  }
  const details: string[] = [];
  if (!previousLead || previousLead.player.id !== currentLead.player.id) {
    details.push(
      `${currentLead.player.name} is now the top next-turn decision${previousLead ? `, replacing ${previousLead.player.name}` : ""}.`,
    );
  } else if (
    previousLead.survivalProbability !== null &&
    currentLead.survivalProbability !== null
  ) {
    const delta = currentLead.survivalProbability - previousLead.survivalProbability;
    if (delta !== 0) {
      details.push(
        `${currentLead.player.name}'s survival estimate moved ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points to ${currentLead.survivalProbability}%.`,
      );
    }
  }
  if (previousLead?.recommendation !== currentLead.recommendation) {
    details.push(
      `The call changed from ${previousLead?.recommendation ?? "unavailable"} to ${currentLead.recommendation}.`,
    );
  }
  const previousRun = previous.positionDemand.find(
    (position) => position.risk === "Likely run",
  );
  const currentRun = current.positionDemand.find(
    (position) => position.risk === "Likely run",
  );
  if (previousRun?.position !== currentRun?.position) {
    details.push(
      currentRun
        ? `${currentRun.position} is now the strongest projected position run.`
        : "No position currently meets the likely-run threshold.",
    );
  }
  if (!details.length) {
    details.push("The latest pick did not materially change the lead recommendation or run risk.");
  }
  return {
    headline: `Updated after pick ${Math.max(1, current.generatedForPick - 1)}`,
    details,
  };
}

export function describeTier(player: PlayerIntelligence) {
  return tierValue(player) === null ? "Tier —" : `Tier ${tierValue(player)}`;
}
