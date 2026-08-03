import type { IntelligenceDataset } from "../../services/intelligence.ts";
import type { PlayerBoardData } from "../player-intelligence/model.ts";
import type {
  DraftRecommendation,
  RecommendationFactor,
} from "./engine.ts";
import type {
  NextTurnForecast,
  NextTurnPlayerForecast,
} from "./nextTurnForecast.ts";

export type RecommendationConfidence = "High" | "Medium" | "Low";
export type ProofSourceStatus = "Fresh" | "Stale" | "Missing" | "Partial";

export interface RecommendationProofSource {
  name: string;
  usedFor: string;
  fetchedAt: string | null;
  ageLabel: string;
  status: ProofSourceStatus;
  warning: string | null;
}

export interface RecommendationProofAlternative {
  playerId: string;
  name: string;
  position: string;
  score: number;
  scoreDelta: number;
  overallValue: number;
  rosterSpecificEffect: number;
  tradeoff: string;
}

export interface RecommendationProof {
  playerId: string;
  rank: number;
  baseline: number;
  positiveTotal: number;
  negativeTotal: number;
  exactTotal: number;
  roundedTotal: number;
  overallValue: number;
  rosterSpecificEffect: number;
  positiveFactors: RecommendationFactor[];
  negativeFactors: RecommendationFactor[];
  neutralFactors: RecommendationFactor[];
  confidence: RecommendationConfidence;
  confidenceReasons: string[];
  warnings: string[];
  sources: RecommendationProofSource[];
  rosterNeed: string;
  tierScarcity: string;
  adp: string;
  injury: string;
  byeWeek: string;
  waitProbability: string;
  waitExplanation: string;
  rankingExplanation: string;
  overallVsRosterExplanation: string;
  alternatives: RecommendationProofAlternative[];
}

const BASELINE = 50;
const OVERALL_VALUE_KEYS = new Set<RecommendationFactor["key"]>([
  "league-value",
  "rank",
  "replacement",
  "tier-scarcity",
  "adp",
  "outcome-range",
  "availability-risk",
  "expert-agreement",
  "offense-role",
]);

const DATASET_SOURCE_META: Array<{
  dataset: IntelligenceDataset;
  name: string;
  usedFor: string;
  maximumAgeMs: number;
}> = [
  {
    dataset: "rankings",
    name: "FantasyPros consensus rankings",
    usedFor: "overall rank, position rank, tiers, ADP and expert range",
    maximumAgeMs: 24 * 60 * 60 * 1_000,
  },
  {
    dataset: "projections",
    name: "FantasyPros statistical projections",
    usedFor: "league-adjusted points, replacement value and outcome range",
    maximumAgeMs: 24 * 60 * 60 * 1_000,
  },
  {
    dataset: "injuries",
    name: "FantasyPros injury report",
    usedFor: "injury, suspension, practice and availability risk",
    maximumAgeMs: 6 * 60 * 60 * 1_000,
  },
  {
    dataset: "news",
    name: "FantasyPros player news",
    usedFor: "workload, role and depth-chart uncertainty",
    maximumAgeMs: 6 * 60 * 60 * 1_000,
  },
];

function factorFor(
  recommendation: DraftRecommendation,
  key: RecommendationFactor["key"],
) {
  return recommendation.factors?.find((factor) => factor.key === key) ?? null;
}

function sumFactors(
  factors: RecommendationFactor[],
  predicate: (factor: RecommendationFactor) => boolean,
) {
  return factors.reduce(
    (total, factor) => total + (predicate(factor) ? factor.score : 0),
    0,
  );
}

function recommendationValues(recommendation: DraftRecommendation) {
  const factors = recommendation.factors ?? [];
  const positiveTotal = sumFactors(factors, (factor) => factor.score > 0);
  const negativeTotal = Math.abs(
    sumFactors(factors, (factor) => factor.score < 0),
  );
  const overallFactorValue = sumFactors(
    factors,
    (factor) => OVERALL_VALUE_KEYS.has(factor.key),
  );
  const rosterSpecificEffect = sumFactors(
    factors,
    (factor) => !OVERALL_VALUE_KEYS.has(factor.key),
  );
  return {
    factors,
    positiveTotal,
    negativeTotal,
    overallValue: BASELINE + overallFactorValue,
    rosterSpecificEffect,
    exactTotal: BASELINE + positiveTotal - negativeTotal,
  };
}

function ageLabel(fetchedAt: string | null, now: number) {
  if (!fetchedAt) return "not available";
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return "invalid timestamp";
  const ageMs = Math.max(0, now - timestamp);
  if (ageMs < 60_000) return "less than 1 minute old";
  if (ageMs < 60 * 60 * 1_000) {
    const minutes = Math.floor(ageMs / 60_000);
    return `${minutes} minute${minutes === 1 ? "" : "s"} old`;
  }
  if (ageMs < 24 * 60 * 60 * 1_000) {
    const hours = Math.floor(ageMs / (60 * 60 * 1_000));
    return `${hours} hour${hours === 1 ? "" : "s"} old`;
  }
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1_000));
  return `${days} day${days === 1 ? "" : "s"} old`;
}

function sourceStatus(
  fetchedAt: string | null,
  maximumAgeMs: number,
  now: number,
  partial = false,
): ProofSourceStatus {
  if (!fetchedAt) return "Missing";
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return "Missing";
  if (now - timestamp > maximumAgeMs) return "Stale";
  return partial ? "Partial" : "Fresh";
}

function timestampFromNumber(value: number | null) {
  return value && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function buildSources({
  recommendation,
  board,
  leagueFetchedAt,
  picksFetchedAt,
  draftStatus,
  now,
}: {
  recommendation: DraftRecommendation;
  board: PlayerBoardData | null;
  leagueFetchedAt: number | null;
  picksFetchedAt: number | null;
  draftStatus: "pre_draft" | "drafting" | "complete";
  now: number;
}) {
  const fantasyPros = DATASET_SOURCE_META.map((meta) => {
    const fetchedAt = board?.datasetFetchedAt[meta.dataset] ?? null;
    const datasetError = board?.datasetErrors[meta.dataset] ?? null;
    const projectionPartial =
      meta.dataset === "projections" &&
      Boolean(
        recommendation.player.scoringWarnings?.length ||
          board?.partialScoringCategories ||
          board?.unsupportedScoringCategories,
      );
    const status = datasetError
      ? "Missing"
      : sourceStatus(fetchedAt, meta.maximumAgeMs, now, projectionPartial);
    return {
      name: meta.name,
      usedFor: meta.usedFor,
      fetchedAt,
      ageLabel: ageLabel(fetchedAt, now),
      status,
      warning:
        datasetError ??
        (status === "Stale"
          ? `${meta.name} is older than its ${meta.maximumAgeMs / (60 * 60 * 1_000)}-hour freshness window.`
          : status === "Partial"
            ? "Some league scoring categories lack exact underlying projections."
            : status === "Missing"
              ? `${meta.name} was not returned.`
              : null),
    } satisfies RecommendationProofSource;
  });
  const sleeperSettingsAt = timestampFromNumber(leagueFetchedAt);
  const sleeperPicksAt = timestampFromNumber(picksFetchedAt);
  const picksMaximumAge =
    draftStatus === "drafting" ? 15_000 : 5 * 60 * 1_000;
  const sleeperSources: RecommendationProofSource[] = [
    {
      name: "Sleeper league and roster snapshot",
      usedFor: "roster need, lineup slots, scoring rules and every team roster",
      fetchedAt: sleeperSettingsAt,
      ageLabel: ageLabel(sleeperSettingsAt, now),
      status: sourceStatus(sleeperSettingsAt, 5 * 60 * 1_000, now),
      warning: null,
    },
    {
      name: "Sleeper draft picks",
      usedFor: "availability, positional runs, opponent rosters and next-turn forecast",
      fetchedAt: sleeperPicksAt,
      ageLabel: ageLabel(sleeperPicksAt, now),
      status: sourceStatus(sleeperPicksAt, picksMaximumAge, now),
      warning: null,
    },
  ];
  return [...fantasyPros, ...sleeperSources].map((source) => ({
    ...source,
    warning:
      source.warning ??
      (source.status === "Stale"
        ? `${source.name} is outside its freshness window.`
        : source.status === "Missing"
          ? `${source.name} is unavailable.`
          : null),
  }));
}

function confidenceFor(
  recommendation: DraftRecommendation,
  sources: RecommendationProofSource[],
  forecast: NextTurnPlayerForecast | null,
) {
  let level: RecommendationConfidence = recommendation.modelConfidence ?? "Medium";
  const reasons: string[] = [];
  const reduceTo = (next: RecommendationConfidence, reason: string) => {
    const order: Record<RecommendationConfidence, number> = {
      High: 2,
      Medium: 1,
      Low: 0,
    };
    if (order[next] < order[level]) level = next;
    reasons.push(reason);
  };

  if (recommendation.player.projectedPoints === null) {
    reduceTo("Low", "League-adjusted projected points are unavailable.");
  }
  if (recommendation.player.scoringConfidence === "low") {
    reduceTo("Low", "The scoring projection has low category coverage.");
  } else if (recommendation.player.scoringConfidence === "medium") {
    reduceTo("Medium", "Some active scoring rules are only partially modeled.");
  }
  if (recommendation.player.adp === null) {
    reduceTo("Medium", "ADP is unavailable, so reach and slide value are neutral.");
  }
  if (recommendation.player.expertBest === null || recommendation.player.expertWorst === null) {
    reduceTo("Medium", "The expert-ranking range is incomplete.");
  }
  if (recommendation.risk === "High") {
    reduceTo("Medium", "A high injury, suspension, workload or role risk adds uncertainty.");
  }
  for (const source of sources) {
    if (source.status === "Missing" && /rankings|projections|league|draft picks/i.test(source.name)) {
      reduceTo("Low", `${source.name} is missing.`);
    } else if (source.status === "Stale") {
      reduceTo("Medium", `${source.name} is stale.`);
    } else if (source.status === "Partial") {
      reduceTo("Medium", `${source.name} is only partially modeled.`);
    }
  }
  if (!forecast || forecast.survivalProbability === null) {
    reduceTo(
      "Medium",
      "Wait probability is unavailable until a later user pick and draft order are known.",
    );
  }
  if (!reasons.length) {
    reasons.push(
      "Current rankings, projections, league settings, draft picks and player context support this recommendation.",
    );
  }
  return { level, reasons: [...new Set(reasons)] };
}

function strongestAdvantage(
  left: DraftRecommendation,
  right: DraftRecommendation,
) {
  const rightByKey = new Map(
    (right.factors ?? []).map((factor) => [factor.key, factor]),
  );
  return (left.factors ?? [])
    .map((factor) => ({
      label: factor.label,
      delta: factor.score - (rightByKey.get(factor.key)?.score ?? 0),
    }))
    .filter((difference) => difference.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0] ?? null;
}

function alternativeTradeoff(
  recommendation: DraftRecommendation,
  alternative: DraftRecommendation,
) {
  const alternativeAdvantage = strongestAdvantage(alternative, recommendation);
  const recommendationAdvantage = strongestAdvantage(recommendation, alternative);
  const difference = alternative.score - recommendation.score;
  const scoreCopy =
    difference === 0
      ? "has the same roster-specific value"
      : difference > 0
        ? `is ${difference} roster-value point${difference === 1 ? "" : "s"} higher`
        : `is ${Math.abs(difference)} roster-value point${difference === -1 ? "" : "s"} lower`;
  const gains =
    alternativeAdvantage && alternativeAdvantage.delta > 0
      ? ` It gains ${alternativeAdvantage.delta.toFixed(1)} through ${alternativeAdvantage.label.toLowerCase()}.`
      : "";
  const givesUp =
    recommendationAdvantage && recommendationAdvantage.delta > 0
      ? ` It gives up ${recommendationAdvantage.delta.toFixed(1)} through ${recommendationAdvantage.label.toLowerCase()}.`
      : "";
  return `${alternative.player.name} ${scoreCopy}.${gains}${givesUp}`;
}

function rankingExplanation(
  recommendation: DraftRecommendation,
  recommendations: DraftRecommendation[],
  rank: number,
) {
  const leader = recommendations[0];
  if (!leader) return "No recommendation comparison is available.";
  if (rank === 1) {
    const runnerUp = recommendations[1];
    if (!runnerUp) {
      return `${recommendation.player.name} is the only eligible recommendation.`;
    }
    const difference = recommendation.score - runnerUp.score;
    const advantage = strongestAdvantage(recommendation, runnerUp);
    return `${recommendation.player.name} ranks first by ${difference} roster-value point${difference === 1 ? "" : "s"} over ${runnerUp.player.name}${
      advantage && advantage.delta > 0
        ? `, led by a ${advantage.delta.toFixed(1)}-point advantage in ${advantage.label.toLowerCase()}`
        : ""
    }.`;
  }
  const difference = leader.score - recommendation.score;
  const advantage = strongestAdvantage(leader, recommendation);
  return `${leader.player.name} ranks ahead by ${difference} roster-value point${difference === 1 ? "" : "s"}${
    advantage && advantage.delta > 0
      ? `, with the largest edge coming from ${advantage.label.toLowerCase()} (+${advantage.delta.toFixed(1)})`
      : ""
  }.`;
}

function overallVsRosterExplanation(
  recommendation: DraftRecommendation,
  recommendations: DraftRecommendation[],
  rank: number,
) {
  const values = recommendationValues(recommendation);
  const leader = recommendations[0];
  if (!leader) return "Overall and roster-specific values are unavailable.";
  if (rank > 1) {
    const leaderValues = recommendationValues(leader);
    const playerRank = recommendation.player.leagueRank ?? recommendation.player.ecr;
    const leaderRank = leader.player.leagueRank ?? leader.player.ecr;
    if (playerRank !== null && leaderRank !== null && playerRank < leaderRank) {
      return `${recommendation.player.name} is ranked higher overall (#${playerRank} vs. #${leaderRank}), but ${leader.player.name} is the better roster choice because roster-specific effects are ${leaderValues.rosterSpecificEffect.toFixed(1)} vs. ${values.rosterSpecificEffect.toFixed(1)}.`;
    }
  }
  const higherOverall = recommendations.slice(1).find((candidate) => {
    const candidateRank = candidate.player.leagueRank ?? candidate.player.ecr;
    const leaderRank = leader.player.leagueRank ?? leader.player.ecr;
    return candidateRank !== null && leaderRank !== null && candidateRank < leaderRank;
  });
  if (rank === 1 && higherOverall) {
    const otherValues = recommendationValues(higherOverall);
    return `${higherOverall.player.name} is ranked higher overall, but ${leader.player.name} wins for this roster: roster-specific effects are ${values.rosterSpecificEffect.toFixed(1)} vs. ${otherValues.rosterSpecificEffect.toFixed(1)}.`;
  }
  return `Overall value (${values.overallValue.toFixed(1)}) measures the player independent of your team; roster-specific effects (${values.rosterSpecificEffect >= 0 ? "+" : ""}${values.rosterSpecificEffect.toFixed(1)}) add your open slots, depth, bye/risk concentrations, stacks, opponent demand and saved controls.`;
}

export function buildRecommendationProofs({
  recommendations,
  forecast,
  board,
  leagueFetchedAt,
  picksFetchedAt,
  draftStatus,
  now = Date.now(),
}: {
  recommendations: DraftRecommendation[];
  forecast: NextTurnForecast | null;
  board: PlayerBoardData | null;
  leagueFetchedAt: number | null;
  picksFetchedAt: number | null;
  draftStatus: "pre_draft" | "drafting" | "complete";
  now?: number;
}) {
  const forecastById = new Map(
    (forecast?.players ?? []).map((item) => [item.player.id, item]),
  );
  return new Map(
    recommendations.map((recommendation, index) => {
      const rank = index + 1;
      const values = recommendationValues(recommendation);
      const playerForecast = forecastById.get(recommendation.player.id) ?? null;
      const sources = buildSources({
        recommendation,
        board,
        leagueFetchedAt,
        picksFetchedAt,
        draftStatus,
        now,
      });
      const confidence = confidenceFor(recommendation, sources, playerForecast);
      const warnings = [
        ...sources.flatMap((source) => (source.warning ? [source.warning] : [])),
        ...(recommendation.player.scoringWarnings ?? []),
        ...Object.values(board?.datasetErrors ?? {}).filter(
          (warning): warning is string => Boolean(warning),
        ),
        ...(playerForecast?.survivalProbability === null || !playerForecast
          ? ["Wait probability is pending because the next user turn is not known."]
          : []),
      ];
      const proof: RecommendationProof = {
        playerId: recommendation.player.id,
        rank,
        baseline: BASELINE,
        positiveTotal: values.positiveTotal,
        negativeTotal: values.negativeTotal,
        exactTotal: values.exactTotal,
        roundedTotal: recommendation.score,
        overallValue: values.overallValue,
        rosterSpecificEffect: values.rosterSpecificEffect,
        positiveFactors: values.factors.filter((factor) => factor.score > 0),
        negativeFactors: values.factors.filter((factor) => factor.score < 0),
        neutralFactors: values.factors.filter((factor) => factor.score === 0),
        confidence: confidence.level,
        confidenceReasons: confidence.reasons,
        warnings: [...new Set(warnings)],
        sources,
        rosterNeed:
          factorFor(recommendation, "roster-fit")?.value ?? "Roster need unavailable",
        tierScarcity:
          factorFor(recommendation, "tier-scarcity")?.value ?? "Tier scarcity unavailable",
        adp: factorFor(recommendation, "adp")?.value ?? "ADP unavailable",
        injury:
          factorFor(recommendation, "availability-risk")?.value ?? "Injury status unavailable",
        byeWeek:
          factorFor(recommendation, "concentration")?.value ?? "Bye week unavailable",
        waitProbability:
          playerForecast?.survivalProbability === null || !playerForecast
            ? "Pending"
            : `${playerForecast.survivalProbability}% to survive`,
        waitExplanation:
          playerForecast?.explanation ??
          "A wait forecast requires a known draft order and later user pick.",
        rankingExplanation: rankingExplanation(
          recommendation,
          recommendations,
          rank,
        ),
        overallVsRosterExplanation: overallVsRosterExplanation(
          recommendation,
          recommendations,
          rank,
        ),
        alternatives: recommendations
          .filter((candidate) => candidate.player.id !== recommendation.player.id)
          .slice(0, 3)
          .map((alternative) => {
            const alternativeValues = recommendationValues(alternative);
            return {
              playerId: alternative.player.id,
              name: alternative.player.name,
              position: alternative.player.position,
              score: alternative.score,
              scoreDelta: alternative.score - recommendation.score,
              overallValue: alternativeValues.overallValue,
              rosterSpecificEffect: alternativeValues.rosterSpecificEffect,
              tradeoff: alternativeTradeoff(recommendation, alternative),
            };
          }),
      };
      return [recommendation.player.id, proof] as const;
    }),
  );
}
