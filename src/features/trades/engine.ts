import type { PlayerIntelligence } from "../player-intelligence/model";
import {
  analyzeLeagueTeams,
  type TeamAnalysis,
  type TeamPlayer,
  type TeamPosition,
} from "../my-team/engine.ts";
import type {
  LeagueSnapshot,
  Roster,
  SleeperDraftPick,
  SleeperPlayer,
} from "../../types";

export type TradeVerdict =
  | "helps-both"
  | "balanced"
  | "favors-you"
  | "favors-partner"
  | "hurts-both"
  | "needs-work";

export interface TradePositionImpact {
  position: TeamPosition;
  before: number;
  after: number;
  delta: number;
}

export interface TradeTeamImpact {
  rosterId: number;
  teamName: string;
  before: TeamAnalysis;
  after: TeamAnalysis;
  sent: TeamPlayer[];
  received: TeamPlayer[];
  overallDelta: number;
  starterDelta: number;
  depthDelta: number;
  projectedPointsDelta: number | null;
  rankDelta: number;
  needsSolved: TeamPosition[];
  needsCreated: TeamPosition[];
  positionImpacts: TradePositionImpact[];
  impactScore: number;
}

export interface TradeAnalysis {
  valid: true;
  verdict: TradeVerdict;
  verdictLabel: string;
  summary: string;
  fairnessScore: number;
  confidence: "High" | "Medium" | "Limited";
  user: TradeTeamImpact;
  partner: TradeTeamImpact;
  userPackageValue: number;
  partnerPackageValue: number;
  reasons: string[];
  warnings: string[];
}

export interface InvalidTradeAnalysis {
  valid: false;
  error: string;
}

export interface TradeSuggestion {
  id: string;
  partnerRosterId: number;
  partnerName: string;
  userSends: TeamPlayer[];
  partnerSends: TeamPlayer[];
  analysis: TradeAnalysis;
  opportunityScore: number;
  label: "Mutual upgrade" | "Solves a need" | "Fair value" | "Best fit";
  partnerReason: string;
}

interface TradeInputs {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  sleeperPlayers: Record<string, SleeperPlayer>;
  userRosterId: number;
  partnerRosterId: number;
  userSends: string[];
  partnerSends: string[];
}

interface TradeSuggestionInputs
  extends Omit<TradeInputs, "partnerRosterId" | "userSends" | "partnerSends"> {
  limit?: number;
  teams?: TeamAnalysis[];
}

const VERDICT_LABELS: Record<TradeVerdict, string> = {
  "helps-both": "Helps both teams",
  balanced: "Fair, low-impact trade",
  "favors-you": "Favors your team",
  "favors-partner": "Favors the other team",
  "hurts-both": "Both teams get worse",
  "needs-work": "Rework the offer",
};

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneRoster(roster: Roster): Roster {
  return {
    ...roster,
    players: [...(roster.players ?? [])],
    starters: [...(roster.starters ?? [])],
    reserve: [...(roster.reserve ?? [])],
    keepers: [...(roster.keepers ?? [])],
    settings: { ...roster.settings },
  };
}

function uniqueIds(values: string[]) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function tradeAssetValue(player: TeamPlayer) {
  const projection =
    player.projectedPoints === null
      ? null
      : clamp(player.projectedPoints / 4, 0, 100);
  const market =
    player.ecr === null ? null : clamp(102 - player.ecr * 0.48, 0, 100);
  const base =
    projection !== null && market !== null
      ? projection * 0.66 + market * 0.34
      : projection ?? market ?? 35;
  const injury = player.reserve
    ? 30
    : /(out|injured reserve|\bir\b|pup|suspend)/i.test(player.injuryStatus)
      ? 28
      : /doubtful/i.test(player.injuryStatus)
        ? 14
        : /questionable|limited|injur/i.test(player.injuryStatus)
          ? 5
          : 0;
  return round(clamp(base - injury, 0, 100));
}

function packageValue(players: TeamPlayer[]) {
  if (!players.length) return 0;
  const ordered = players
    .map(tradeAssetValue)
    .sort((left, right) => right - left);
  return round(
    ordered.reduce(
      (sum, value, index) => sum + value * Math.max(0.62, 1 - index * 0.11),
      0,
    ),
  );
}

function weaknessPositions(team: TeamAnalysis) {
  return new Set(
    team.depth
      .filter((item) => item.required > 0 && item.grade < 62)
      .map((item) => item.position),
  );
}

function impactForTeam({
  before,
  after,
  sent,
  received,
}: {
  before: TeamAnalysis;
  after: TeamAnalysis;
  sent: TeamPlayer[];
  received: TeamPlayer[];
}): TradeTeamImpact {
  const beforeNeeds = weaknessPositions(before);
  const afterNeeds = weaknessPositions(after);
  const beforeDepth = new Map(
    before.depth.map((item) => [item.position, item.grade]),
  );
  const afterDepth = new Map(
    after.depth.map((item) => [item.position, item.grade]),
  );
  const newlyEmpty = new Set(
    after.lineup.flatMap((slot) =>
      !slot.player && slot.slot !== "FLEX" ? [slot.slot] : [],
    ),
  );
  const needsSolved = [...beforeNeeds].filter((position) => {
    const gradeGain =
      (afterDepth.get(position) ?? 0) - (beforeDepth.get(position) ?? 0);
    return !afterNeeds.has(position) || gradeGain >= 15;
  });
  const needsCreated = [...afterNeeds].filter((position) => {
    const gradeLoss =
      (beforeDepth.get(position) ?? 0) - (afterDepth.get(position) ?? 0);
    return !beforeNeeds.has(position) || gradeLoss >= 15 || newlyEmpty.has(position);
  });
  const positionImpacts = before.depth
    .map((item): TradePositionImpact => {
      const next = afterDepth.get(item.position) ?? item.grade;
      return {
        position: item.position,
        before: item.grade,
        after: next,
        delta: next - item.grade,
      };
    })
    .filter((item) => Math.abs(item.delta) >= 3)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  const overallDelta = after.strength.overall - before.strength.overall;
  const starterDelta =
    after.strength.starterScore - before.strength.starterScore;
  const depthDelta = after.strength.depthScore - before.strength.depthScore;
  const projectedPointsDelta =
    before.projectedPoints === null || after.projectedPoints === null
      ? null
      : round(after.projectedPoints - before.projectedPoints);
  const rankDelta = before.strength.rank - after.strength.rank;
  const impactScore = round(
    overallDelta * 0.52 +
      starterDelta * 0.23 +
      depthDelta * 0.16 +
      rankDelta * 1.25 +
      needsSolved.length * 2.5 -
      needsCreated.length * 3.5,
  );
  return {
    rosterId: before.rosterId,
    teamName: before.teamName,
    before,
    after,
    sent,
    received,
    overallDelta,
    starterDelta,
    depthDelta,
    projectedPointsDelta,
    rankDelta,
    needsSolved,
    needsCreated,
    positionImpacts,
    impactScore,
  };
}

function confidenceFor(...teams: TeamAnalysis[]) {
  const confidences = teams.map((team) => team.strength.confidence);
  if (confidences.includes("Limited")) return "Limited";
  if (confidences.includes("Medium")) return "Medium";
  return "High";
}

function verdictFor(user: TradeTeamImpact, partner: TradeTeamImpact): TradeVerdict {
  if (user.impactScore >= 1.5 && partner.impactScore >= 1.5) {
    return "helps-both";
  }
  if (user.impactScore < -1.5 && partner.impactScore < -1.5) {
    return "hurts-both";
  }
  const difference = user.impactScore - partner.impactScore;
  if (user.impactScore >= -1 && partner.impactScore >= -1 && Math.abs(difference) <= 3) {
    return "balanced";
  }
  if (difference >= 4 && partner.impactScore < -1.5) return "favors-you";
  if (difference <= -4 && user.impactScore < -1.5) return "favors-partner";
  return "needs-work";
}

function summaryFor(
  verdict: TradeVerdict,
  user: TradeTeamImpact,
  partner: TradeTeamImpact,
) {
  const userName = user.teamName;
  const partnerName = partner.teamName;
  switch (verdict) {
    case "helps-both":
      return `${userName} and ${partnerName} both improve after their best lineups and depth charts are rebuilt.`;
    case "balanced":
      return "The value is close, but neither roster changes enough to make this a priority move.";
    case "favors-you":
      return `${userName} improves while ${partnerName} absorbs the larger lineup or depth loss.`;
    case "favors-partner":
      return `${partnerName} solves more of its roster problems and leaves ${userName} with the larger loss.`;
    case "hurts-both":
      return "Both teams lose more lineup or depth utility than they gain. Reject this version.";
    case "needs-work":
      return "The offer has a real roster-purpose mismatch. Adjust one side before proposing it.";
  }
}

function teamReasons(team: TradeTeamImpact, perspective: string) {
  const reasons: string[] = [];
  if (team.needsSolved.length) {
    reasons.push(
      `${perspective} solves ${team.needsSolved.join(", ")} depth.`,
    );
  }
  if (team.needsCreated.length) {
    reasons.push(
      `${perspective} creates a new ${team.needsCreated.join(", ")} weakness.`,
    );
  }
  if (team.starterDelta !== 0) {
    reasons.push(
      `${perspective}'s optimized starting-lineup grade moves ${team.starterDelta > 0 ? "+" : ""}${team.starterDelta}.`,
    );
  }
  if (team.depthDelta !== 0) {
    reasons.push(
      `${perspective}'s bench-depth grade moves ${team.depthDelta > 0 ? "+" : ""}${team.depthDelta}.`,
    );
  }
  return reasons;
}

function receivedRisk(team: TradeTeamImpact) {
  return team.received.filter(
    (player) =>
      player.reserve ||
      /(out|injured reserve|\bir\b|pup|suspend|doubtful)/i.test(
        player.injuryStatus,
      ),
  );
}

function analyzeTradeWithLeague({
  snapshot,
  board,
  sleeperPlayers,
  userRosterId,
  partnerRosterId,
  userSends,
  partnerSends,
}: TradeInputs, beforeLeague: TeamAnalysis[]): TradeAnalysis | InvalidTradeAnalysis {
  const outgoing = uniqueIds(userSends);
  const incoming = uniqueIds(partnerSends);
  if (userRosterId === partnerRosterId) {
    return { valid: false, error: "Choose a different team to trade with." };
  }
  if (!outgoing.length || !incoming.length) {
    return {
      valid: false,
      error: "Select at least one player from each team.",
    };
  }
  if (outgoing.some((id) => incoming.includes(id))) {
    return { valid: false, error: "A player cannot appear on both sides." };
  }

  const beforeUser = beforeLeague.find((team) => team.rosterId === userRosterId);
  const beforePartner = beforeLeague.find(
    (team) => team.rosterId === partnerRosterId,
  );
  if (!beforeUser || !beforePartner) {
    return { valid: false, error: "One of the selected rosters was not found." };
  }
  const userPlayers = new Map(
    beforeUser.players.map((player) => [player.sleeperId, player]),
  );
  const partnerPlayers = new Map(
    beforePartner.players.map((player) => [player.sleeperId, player]),
  );
  if (outgoing.some((id) => !userPlayers.has(id))) {
    return {
      valid: false,
      error: "Your side includes a player who is not on your roster.",
    };
  }
  if (incoming.some((id) => !partnerPlayers.has(id))) {
    return {
      valid: false,
      error: "The other side includes a player who is not on that roster.",
    };
  }

  const afterSnapshot: LeagueSnapshot = {
    ...snapshot,
    users: snapshot.users.map((user) => ({
      ...user,
      metadata: user.metadata ? { ...user.metadata } : null,
    })),
    rosters: snapshot.rosters.map((original) => {
      const roster = cloneRoster(original);
      const fallbackPlayers =
        beforeLeague.find((team) => team.rosterId === roster.roster_id)?.players
          .map((player) => player.sleeperId) ?? [];
      const current = roster.players.length ? roster.players : fallbackPlayers;
      if (roster.roster_id === userRosterId) {
        roster.players = uniqueIds([
          ...current.filter((id) => !outgoing.includes(String(id))),
          ...incoming,
        ]);
        roster.starters = roster.starters.filter(
          (id) => !outgoing.includes(String(id)),
        );
        roster.reserve = roster.reserve.filter(
          (id) => !outgoing.includes(String(id)),
        );
      } else if (roster.roster_id === partnerRosterId) {
        roster.players = uniqueIds([
          ...current.filter((id) => !incoming.includes(String(id))),
          ...outgoing,
        ]);
        roster.starters = roster.starters.filter(
          (id) => !incoming.includes(String(id)),
        );
        roster.reserve = roster.reserve.filter(
          (id) => !incoming.includes(String(id)),
        );
      }
      return roster;
    }),
  };
  const afterPair = analyzeLeagueTeams({
    snapshot: {
      ...afterSnapshot,
      rosters: afterSnapshot.rosters.filter((roster) =>
        [userRosterId, partnerRosterId].includes(roster.roster_id),
      ),
    },
    picks: [],
    board,
    sleeperPlayers,
  });
  const rawAfterUser = afterPair.find((team) => team.rosterId === userRosterId);
  const rawAfterPartner = afterPair.find(
    (team) => team.rosterId === partnerRosterId,
  );
  if (!rawAfterUser || !rawAfterPartner) {
    return { valid: false, error: "The proposed rosters could not be analyzed." };
  }
  const updatedTeams = beforeLeague.map((team) =>
    team.rosterId === userRosterId
      ? rawAfterUser
      : team.rosterId === partnerRosterId
        ? rawAfterPartner
        : team,
  );
  const updatedRanks = new Map(
    [...updatedTeams]
      .sort(
        (left, right) =>
          right.strength.overall - left.strength.overall ||
          left.rosterId - right.rosterId,
      )
      .map((team, index) => [team.rosterId, index + 1]),
  );
  const withLeagueRank = (team: TeamAnalysis): TeamAnalysis => ({
    ...team,
    strength: {
      ...team.strength,
      rank: updatedRanks.get(team.rosterId) ?? beforeLeague.length,
      totalTeams: beforeLeague.length,
    },
  });
  const afterUser = withLeagueRank(rawAfterUser);
  const afterPartner = withLeagueRank(rawAfterPartner);

  const userSent = outgoing.flatMap((id) => {
    const player = userPlayers.get(id);
    return player ? [player] : [];
  });
  const partnerSent = incoming.flatMap((id) => {
    const player = partnerPlayers.get(id);
    return player ? [player] : [];
  });
  const user = impactForTeam({
    before: beforeUser,
    after: afterUser,
    sent: userSent,
    received: partnerSent,
  });
  const partner = impactForTeam({
    before: beforePartner,
    after: afterPartner,
    sent: partnerSent,
    received: userSent,
  });
  const verdict = verdictFor(user, partner);
  const fairnessScore = Math.round(
    clamp(
      100 -
        Math.abs(user.impactScore - partner.impactScore) * 4.5 -
        (Math.min(user.impactScore, partner.impactScore) < -4 ? 8 : 0),
      0,
      100,
    ),
  );
  const warnings: string[] = [];
  const rosterLimit = snapshot.league.roster_positions.length;
  for (const [team, label] of [
    [user, "Your team"],
    [partner, partner.teamName],
  ] as const) {
    const risky = receivedRisk(team);
    if (risky.length) {
      warnings.push(
        `${label} receives availability risk: ${risky.map((player) => player.name).join(", ")}.`,
      );
    }
    const empty = team.after.lineup.filter((slot) => !slot.player);
    if (empty.length) {
      warnings.push(
        `${label} would have ${empty.map((slot) => slot.label).join(", ")} uncovered.`,
      );
    }
    const excessPlayers = Math.max(0, team.after.players.length - rosterLimit);
    if (excessPlayers) {
      warnings.push(
        `${label} would be ${excessPlayers} player${excessPlayers === 1 ? "" : "s"} over the ${rosterLimit}-spot roster limit and must make a corresponding drop.`,
      );
    }
  }
  return {
    valid: true,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    summary: summaryFor(verdict, user, partner),
    fairnessScore,
    confidence: confidenceFor(
      beforeUser,
      beforePartner,
      afterUser,
      afterPartner,
    ),
    user,
    partner,
    userPackageValue: packageValue(userSent),
    partnerPackageValue: packageValue(partnerSent),
    reasons: [
      ...teamReasons(user, "Your team"),
      ...teamReasons(partner, partner.teamName),
    ].slice(0, 6),
    warnings,
  };
}

export function analyzeTrade(
  inputs: TradeInputs,
): TradeAnalysis | InvalidTradeAnalysis {
  const beforeLeague = analyzeLeagueTeams({
    snapshot: inputs.snapshot,
    picks: inputs.picks,
    board: inputs.board,
    sleeperPlayers: inputs.sleeperPlayers,
  });
  return analyzeTradeWithLeague(inputs, beforeLeague);
}

function isAutomaticTradeAsset(player: TeamPlayer) {
  if (player.position === "K" || player.position === "DST") return false;
  if (player.reserve) return false;
  return !/(out|injured reserve|\bir\b|pup|suspend)/i.test(
    player.injuryStatus,
  );
}

function automaticAssetPool(team: TeamAnalysis) {
  return team.players
    .filter(isAutomaticTradeAsset)
    .sort((left, right) => tradeAssetValue(right) - tradeAssetValue(left))
    .slice(0, 7);
}

function suggestionLabel(analysis: TradeAnalysis): TradeSuggestion["label"] {
  if (analysis.user.impactScore >= 1.5 && analysis.partner.impactScore >= 1.5) {
    return "Mutual upgrade";
  }
  if (analysis.user.needsSolved.length) return "Solves a need";
  if (analysis.fairnessScore >= 85) return "Fair value";
  return "Best fit";
}

function partnerReason(analysis: TradeAnalysis) {
  const partner = analysis.partner;
  if (partner.needsSolved.length) {
    return `They address ${partner.needsSolved.join(", ")} depth.`;
  }
  if (partner.starterDelta > 0) {
    return `Their optimized lineup improves by ${signedNumber(partner.starterDelta)}.`;
  }
  if (partner.depthDelta > 0) {
    return `Their bench depth improves by ${signedNumber(partner.depthDelta)}.`;
  }
  return `Their roster stays essentially even in a ${analysis.fairnessScore}% fair offer.`;
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${round(value)}`;
}

/**
 * Searches every opponent for responsible one-for-one offers. The finder only
 * recommends healthy skill-position players, requires a positive user impact,
 * and rejects offers that leave either lineup uncovered. Multi-player ideas
 * remain available through the custom analyzer because roster-cut requirements
 * need human context.
 */
export function findTradeSuggestions({
  snapshot,
  picks,
  board,
  sleeperPlayers,
  userRosterId,
  limit = 8,
  teams,
}: TradeSuggestionInputs): TradeSuggestion[] {
  const beforeLeague = teams ??
    analyzeLeagueTeams({
      snapshot,
      picks,
      board,
      sleeperPlayers,
    });
  const user = beforeLeague.find((team) => team.rosterId === userRosterId);
  if (!user) return [];
  const userAssets = automaticAssetPool(user);
  const candidates: TradeSuggestion[] = [];

  for (const partner of beforeLeague) {
    if (partner.rosterId === userRosterId || !partner.players.length) continue;
    const partnerAssets = automaticAssetPool(partner);
    for (const outgoing of userAssets) {
      const outgoingValue = tradeAssetValue(outgoing);
      const matchedPartnerAssets = partnerAssets
        .filter(
          (incoming) =>
            incoming.position !== outgoing.position &&
            Math.abs(outgoingValue - tradeAssetValue(incoming)) <= 22,
        )
        .sort(
          (left, right) =>
            Math.abs(outgoingValue - tradeAssetValue(left)) -
            Math.abs(outgoingValue - tradeAssetValue(right)),
        )
        .slice(0, 2);
      for (const incoming of matchedPartnerAssets) {
        const result = analyzeTradeWithLeague(
          {
            snapshot,
            picks,
            board,
            sleeperPlayers,
            userRosterId,
            partnerRosterId: partner.rosterId,
            userSends: [outgoing.sleeperId],
            partnerSends: [incoming.sleeperId],
          },
          beforeLeague,
        );
        if (!result.valid) continue;
        const uncovered = result.warnings.some((warning) =>
          warning.includes("uncovered"),
        );
        if (
          uncovered ||
          result.user.impactScore < 0.3 ||
          result.partner.impactScore < -1.5 ||
          result.fairnessScore < 55
        ) {
          continue;
        }
        const opportunityScore = round(
          result.user.impactScore * 3.2 +
            result.partner.impactScore * 1.6 +
            result.fairnessScore * 0.18 +
            result.user.needsSolved.length * 5 +
            result.partner.needsSolved.length * 3 -
            result.warnings.length * 4,
        );
        candidates.push({
          id: `${userRosterId}:${partner.rosterId}:${outgoing.sleeperId}:${incoming.sleeperId}`,
          partnerRosterId: partner.rosterId,
          partnerName: partner.teamName,
          userSends: [outgoing],
          partnerSends: [incoming],
          analysis: result,
          opportunityScore,
          label: suggestionLabel(result),
          partnerReason: partnerReason(result),
        });
      }
    }
  }

  candidates.sort((left, right) => {
    if (right.opportunityScore !== left.opportunityScore) {
      return right.opportunityScore - left.opportunityScore;
    }
    return right.analysis.fairnessScore - left.analysis.fairnessScore;
  });

  const selected: TradeSuggestion[] = [];
  const perPartner = new Map<number, number>();
  for (const candidate of candidates) {
    if ((perPartner.get(candidate.partnerRosterId) ?? 0) >= 2) continue;
    if (
      selected.some(
        (item) =>
          item.userSends[0]?.sleeperId === candidate.userSends[0]?.sleeperId &&
          item.partnerSends[0]?.position === candidate.partnerSends[0]?.position,
      )
    ) {
      continue;
    }
    selected.push(candidate);
    perPartner.set(
      candidate.partnerRosterId,
      (perPartner.get(candidate.partnerRosterId) ?? 0) + 1,
    );
    if (selected.length >= limit) break;
  }
  return selected;
}
