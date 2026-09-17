import type { PlayerIntelligence, PlayerPosition } from "../player-intelligence/model";
import type {
  LeagueSnapshot,
  SleeperDraftPick,
  SleeperPlayer,
  SleeperTransaction,
  SleeperTrendingPlayer,
} from "../../types";
import { normalizePlayerName, pickPlayerName } from "../live-draft/engine.ts";
import {
  analyzeLeagueTeams,
  optimizeLineup,
  type PositionDepth,
  type TeamAnalysis,
  type TeamPlayer,
} from "../my-team/engine.ts";

export type WaiverPosition = Exclude<PlayerPosition, "—">;
export type WaiverPriority = "Priority add" | "Upgrade" | "Watch";
export type WaiverConfidence = "High" | "Medium" | "Limited";
export type WaiverAvailability = "Waivers" | "Free agent" | "Check Sleeper";
export type WaiverActionVerdict = "Claim now" | "Add now" | "Consider" | "Hold";

export interface FaabRecommendation {
  low: number;
  target: number;
  high: number;
  budgetPercent: number;
}

export interface DropSuggestion {
  player: TeamPlayer;
  reason: string;
  protected: boolean;
}

export interface WaiverRosterGuard {
  player: TeamPlayer;
  reason: string;
}

export interface WaiverRecommendation {
  player: PlayerIntelligence;
  position: WaiverPosition;
  priority: WaiverPriority;
  score: number;
  rosterGain: number;
  faab: FaabRecommendation;
  drop: DropSuggestion | null;
  trendingAdds: number;
  need: PositionDepth["label"] | "Open slot";
  confidence: WaiverConfidence;
  reasons: string[];
  warning: string | null;
  availability: WaiverAvailability;
  availabilityNote: string;
  actionVerdict: WaiverActionVerdict;
  actionLabel: string;
  starterGain: number;
  projectionGain: number | null;
  benchGain: number;
  moveType: "add-only" | "swap" | "no-safe-drop";
}

export interface WaiverBidClimate {
  completedBids: number;
  medianWinningBid: number | null;
  highestWinningBid: number | null;
}

export interface WaiverAssistantResult {
  recommendations: WaiverRecommendation[];
  availableCount: number;
  rosterSpotsOpen: number;
  totalBudget: number;
  spentBudget: number;
  remainingBudget: number;
  waiverPosition: number;
  bidClimate: WaiverBidClimate;
  team: TeamAnalysis | null;
  upgradeCount: number;
  claimOrder: WaiverRecommendation[];
  freeAgentAdds: WaiverRecommendation[];
  safeDrops: WaiverRosterGuard[];
  protectedPlayers: WaiverRosterGuard[];
  noUpgradeReason: string | null;
}

const POSITIONS = new Set<WaiverPosition>(["QB", "RB", "WR", "TE", "K", "DST"]);

function normalizedPosition(position: PlayerPosition): WaiverPosition | null {
  return POSITIONS.has(position as WaiverPosition)
    ? (position as WaiverPosition)
    : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

export function summarizeWaiverBids(
  transactions: SleeperTransaction[],
): WaiverBidClimate {
  const bids = transactions.flatMap((transaction) => {
    const bid = transaction.settings?.waiver_bid;
    return transaction.type === "waiver" &&
      transaction.status === "complete" &&
      typeof bid === "number" &&
      bid >= 0
      ? [bid]
      : [];
  });
  return {
    completedBids: bids.length,
    medianWinningBid: median(bids),
    highestWinningBid: bids.length ? Math.max(...bids) : null,
  };
}

function rosteredIdentities(
  snapshot: LeagueSnapshot,
  picks: SleeperDraftPick[],
  sleeperPlayers: Record<string, SleeperPlayer>,
) {
  const ids = new Set(
    snapshot.rosters.flatMap((roster) => roster.players ?? []).map(String),
  );
  for (const pick of picks) ids.add(String(pick.player_id));

  const names = new Set<string>();
  for (const id of ids) {
    const sleeper = sleeperPlayers[id];
    const name =
      sleeper?.full_name ||
      [sleeper?.first_name, sleeper?.last_name].filter(Boolean).join(" ");
    if (name) names.add(normalizePlayerName(name));
  }
  for (const pick of picks) {
    const name = pickPlayerName(pick);
    if (name) names.add(normalizePlayerName(name));
  }
  return { ids, names };
}

function trendingByIdentity(
  trending: SleeperTrendingPlayer[],
  sleeperPlayers: Record<string, SleeperPlayer>,
) {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const item of trending) {
    byId.set(String(item.player_id), item.count);
    const player = sleeperPlayers[String(item.player_id)];
    const name =
      player?.full_name ||
      [player?.first_name, player?.last_name].filter(Boolean).join(" ");
    if (name) byName.set(normalizePlayerName(name), item.count);
  }
  return { byId, byName };
}

function injuryPenalty(player: PlayerIntelligence) {
  const context = `${player.injuryStatus} ${player.injuryDetail}`.toLowerCase();
  if (/(injured reserve|\bir\b|out|pup|suspend)/.test(context)) return 45;
  if (/doubtful/.test(context)) return 24;
  if (/(questionable|limited|injur)/.test(context)) return 9;
  return 0;
}

function playerValue(player: Pick<PlayerIntelligence, "ecr" | "projectedPoints">) {
  const market = player.ecr === null ? 28 : Math.max(0, 102 - player.ecr * 0.42);
  const projection = player.projectedPoints === null
    ? market
    : Math.min(100, Math.max(0, player.projectedPoints / 3.5));
  return projection * 0.7 + market * 0.3;
}

function depthFor(team: TeamAnalysis | null, position: WaiverPosition) {
  return team?.depth.find((item) => item.position === position) ?? null;
}

function needBonus(depth: PositionDepth | null) {
  if (!depth) return 0;
  if (depth.label === "Critical") return 19;
  if (depth.label === "Thin") return 11;
  if (depth.label === "Stable") return 4;
  return 0;
}

function dropSafety(player: TeamPlayer, depth: PositionDepth | null) {
  const base = 100 - playerValue(player);
  const injury = /(out|injured reserve|\bir\b|pup|suspend)/i.test(
    player.injuryStatus,
  )
    ? 22
    : 0;
  const surplus = depth && depth.total > Math.max(1, depth.required + 1) ? 12 : 0;
  const coverageRisk =
    depth && depth.total <= Math.max(1, depth.required) ? 45 : 0;
  return base + injury + surplus - coverageRisk;
}

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function automaticProtectionReason(player: TeamPlayer) {
  if (
    !["K", "DST"].includes(player.position) &&
    player.ecr !== null &&
    player.ecr <= 72
  ) {
    return `Top-${player.ecr} rest-of-season player; automatically protected.`;
  }
  return null;
}

function rosterScore(players: TeamPlayer[], rosterPositions: string[]) {
  const optimized = optimizeLineup(players, rosterPositions);
  const starters = optimized.lineup.flatMap((slot) =>
    slot.player ? [slot.player] : [],
  );
  const emptySlots = optimized.lineup.filter((slot) => !slot.player).length;
  const starterValue = starters.reduce(
    (total, player) => total + playerValue(player),
    0,
  );
  const benchValue = optimized.bench
    .map(playerValue)
    .sort((left, right) => right - left)
    .slice(0, 6)
    .reduce(
      (total, value, index) => total + value * Math.max(0.12, 0.34 - index * 0.045),
      0,
    );
  const projections = starters.flatMap((player) =>
    player.projectedPoints === null ? [] : [player.projectedPoints],
  );
  return {
    optimized,
    starterValue,
    benchValue,
    total: starterValue + benchValue - emptySlots * 80,
    projection:
      projections.length === starters.length && projections.length
        ? projections.reduce((total, value) => total + value, 0)
        : null,
    emptySlots,
  };
}

function candidateTeamPlayer(
  player: PlayerIntelligence,
  sleeperId: string,
): TeamPlayer {
  return {
    id: player.id,
    sleeperId,
    name: player.name,
    position: player.position as WaiverPosition,
    team: player.team,
    injuryStatus: player.injuryStatus || player.injuryDetail,
    byeWeek: player.byeWeek,
    projectedPoints: player.projectedPoints,
    ecr: player.ecr,
    positionRank: player.positionRank,
    currentStarter: false,
    reserve: false,
    intelligence: player,
  };
}

function positionCoveredAfterMove(
  team: TeamAnalysis,
  candidate: TeamPlayer,
  drop: TeamPlayer | null,
) {
  if (!drop || drop.position === candidate.position) return true;
  const depth = depthFor(team, drop.position);
  return !depth || depth.total - 1 >= Math.max(1, depth.required);
}

interface PairImpact {
  drop: DropSuggestion | null;
  rosterGain: number;
  starterGain: number;
  projectionGain: number | null;
  benchGain: number;
  createsLineupHole: boolean;
}

function testAddDropPair({
  team,
  candidate,
  drop,
  rosterPositions,
  before,
}: {
  team: TeamAnalysis;
  candidate: TeamPlayer;
  drop: TeamPlayer | null;
  rosterPositions: string[];
  before: ReturnType<typeof rosterScore>;
}): PairImpact | null {
  if (drop && automaticProtectionReason(drop)) return null;
  if (drop?.currentStarter && drop.position !== candidate.position) return null;
  if (!positionCoveredAfterMove(team, candidate, drop)) return null;

  const afterPlayers = [
    ...team.players.filter((player) => player.sleeperId !== drop?.sleeperId),
    candidate,
  ];
  const after = rosterScore(afterPlayers, rosterPositions);
  const createsLineupHole = after.emptySlots > before.emptySlots;
  if (createsLineupHole) return null;

  const samePosition = drop?.position === candidate.position;
  const injured = Boolean(drop?.injuryStatus);
  return {
    drop: drop
      ? {
          player: drop,
          reason: injured
            ? `${drop.injuryStatus} lowers the value of this roster spot.`
            : samePosition
              ? `${candidate.name} grades as the stronger ${candidate.position} after the lineup is rebuilt.`
              : "This is the lowest-impact expendable roster spot after positional coverage is checked.",
          protected: false,
        }
      : null,
    rosterGain: round(after.total - before.total),
    starterGain: round(after.starterValue - before.starterValue),
    projectionGain:
      before.projection === null || after.projection === null
        ? null
        : round(after.projection - before.projection),
    benchGain: round(after.benchValue - before.benchValue),
    createsLineupHole,
  };
}

function sleeperName(player: SleeperPlayer) {
  return (
    player.full_name?.trim() ||
    [player.first_name, player.last_name].filter(Boolean).join(" ").trim()
  );
}

function sleeperPosition(player: SleeperPlayer) {
  const value = player.position?.toUpperCase();
  return value === "DEF" ? "DST" : value;
}

interface SleeperPlayerIndex {
  byIdentity: Map<string, [string, SleeperPlayer]>;
  defensesByTeam: Map<string, [string, SleeperPlayer]>;
}

function buildSleeperPlayerIndex(
  sleeperPlayers: Record<string, SleeperPlayer>,
): SleeperPlayerIndex {
  const byIdentity = new Map<string, [string, SleeperPlayer]>();
  const defensesByTeam = new Map<string, [string, SleeperPlayer]>();
  for (const [id, player] of Object.entries(sleeperPlayers)) {
    const position = sleeperPosition(player);
    const name = normalizePlayerName(sleeperName(player));
    if (name && position) byIdentity.set(`${name}:${position}`, [id, player]);
    if (position === "DST" && player.team) {
      defensesByTeam.set(normalizePlayerName(player.team), [id, player]);
    }
  }
  return { byIdentity, defensesByTeam };
}

function sleeperMatches(
  boardPlayer: PlayerIntelligence,
  index: SleeperPlayerIndex,
) {
  const targetName = normalizePlayerName(boardPlayer.name);
  const targetPosition = normalizedPosition(boardPlayer.position);
  if (!targetPosition) return null;
  const direct = index.byIdentity.get(`${targetName}:${targetPosition}`);
  if (direct) return direct;
  if (targetPosition !== "DST") return null;
  return index.defensesByTeam.get(normalizePlayerName(boardPlayer.team)) ?? null;
}

function availabilityFor({
  sleeperId,
  transactions,
  waiverClearDays,
  now,
}: {
  sleeperId: string | null;
  transactions: SleeperTransaction[];
  waiverClearDays: number;
  now: number;
}): Pick<WaiverRecommendation, "availability" | "availabilityNote"> {
  if (!sleeperId) {
    return {
      availability: "Check Sleeper",
      availabilityNote: "The FantasyPros player could not be matched safely to a Sleeper player ID.",
    };
  }
  const lastDrop = transactions
    .filter(
      (transaction) =>
        transaction.status === "complete" &&
        transaction.drops &&
        Object.hasOwn(transaction.drops, sleeperId),
    )
    .sort(
      (left, right) =>
        (right.status_updated || right.created) -
        (left.status_updated || left.created),
    )[0];
  if (lastDrop) {
    const droppedAt = lastDrop.status_updated || lastDrop.created;
    const clearsAt = droppedAt + waiverClearDays * 24 * 60 * 60 * 1000;
    if (clearsAt > now) {
      return {
        availability: "Waivers",
        availabilityNote: `Recently dropped; projected to clear ${new Date(clearsAt).toLocaleString()}. Sleeper remains the final authority.`,
      };
    }
  }
  return {
    availability: "Free agent",
    availabilityNote: "No active recent-drop hold was found. Confirm the green add/claim label in Sleeper before submitting.",
  };
}

function rosterGuards(team: TeamAnalysis | null) {
  if (!team) return { safeDrops: [], protectedPlayers: [] };
  const protectedPlayers = team.players
    .flatMap((player): WaiverRosterGuard[] => {
      const reason = automaticProtectionReason(player);
      return reason ? [{ player, reason }] : [];
    })
    .sort((left, right) => (left.player.ecr ?? 9999) - (right.player.ecr ?? 9999));
  const safeDrops = team.bench
    .filter((player) => !player.reserve)
    .filter((player) => !automaticProtectionReason(player))
    .filter((player) => {
      const depth = depthFor(team, player.position);
      return (
        player.position === "K" ||
        player.position === "DST" ||
        !depth ||
        depth.total > Math.max(1, depth.required)
      );
    })
    .sort((left, right) => {
      const leftDepth = depthFor(team, left.position);
      const rightDepth = depthFor(team, right.position);
      return dropSafety(right, rightDepth) - dropSafety(left, leftDepth);
    })
    .slice(0, 5)
    .map((player): WaiverRosterGuard => ({
      player,
      reason: player.injuryStatus
        ? `${player.injuryStatus}; reviewable if a meaningful upgrade is available.`
        : "Bench player with the lowest current combination of role, market value and depth impact.",
    }));
  return { safeDrops, protectedPlayers };
}

function faabFor({
  player,
  score,
  rosterGain,
  need,
  trendingAdds,
  remainingBudget,
  climate,
}: {
  player: PlayerIntelligence;
  score: number;
  rosterGain: number;
  need: PositionDepth | null;
  trendingAdds: number;
  remainingBudget: number;
  climate: WaiverBidClimate;
}): FaabRecommendation {
  if (remainingBudget <= 0) {
    return { low: 0, target: 0, high: 0, budgetPercent: 0 };
  }
  const marketBase =
    player.ecr !== null && player.ecr <= 60
      ? 17
      : player.ecr !== null && player.ecr <= 110
        ? 11
        : player.ecr !== null && player.ecr <= 175
          ? 6
          : 2;
  const needSpend =
    need?.label === "Critical" ? 9 : need?.label === "Thin" ? 5 : 0;
  const upgradeSpend = Math.min(9, Math.max(0, rosterGain / 3));
  const competitionSpend = Math.min(
    7,
    Math.log10(Math.max(1, trendingAdds)) * 2.4,
  );
  const scoreSpend = score >= 82 ? 5 : score >= 70 ? 2 : 0;
  const leagueFloor =
    climate.medianWinningBid === null || remainingBudget <= 0
      ? 0
      : (climate.medianWinningBid / remainingBudget) * 100 * 0.45;
  const percentage = Math.max(
    0,
    Math.min(
      55,
      Math.max(
        leagueFloor,
        marketBase + needSpend + upgradeSpend + competitionSpend + scoreSpend,
      ),
    ),
  );
  const target = Math.min(
    remainingBudget,
    Math.max(score >= 50 ? 1 : 0, Math.round((percentage / 100) * remainingBudget)),
  );
  const low = Math.max(0, Math.min(target, Math.round(target * 0.72)));
  const high = Math.min(
    remainingBudget,
    Math.max(target, Math.round(target * 1.28)),
  );
  return {
    low,
    target,
    high,
    budgetPercent: Math.round(percentage),
  };
}

function confidenceFor(
  player: PlayerIntelligence,
  trendingAdds: number,
): WaiverConfidence {
  if (
    player.ecr !== null &&
    player.projectedPoints !== null &&
    trendingAdds > 0
  ) {
    return "High";
  }
  if (player.ecr !== null || player.projectedPoints !== null) return "Medium";
  return "Limited";
}

export function buildWaiverAssistant({
  snapshot,
  picks,
  board,
  sleeperPlayers,
  trendingAdds,
  transactions,
  userRosterId,
  now = Date.now(),
}: {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  sleeperPlayers: Record<string, SleeperPlayer>;
  trendingAdds: SleeperTrendingPlayer[];
  transactions: SleeperTransaction[];
  userRosterId: number;
  now?: number;
}): WaiverAssistantResult {
  const roster = snapshot.rosters.find(
    (candidate) => candidate.roster_id === userRosterId,
  );
  const totalBudget = Math.max(0, snapshot.league.settings.waiver_budget ?? 0);
  const spentBudget = Math.min(
    totalBudget,
    Math.max(0, roster?.settings.waiver_budget_used ?? 0),
  );
  const remainingBudget = Math.max(0, totalBudget - spentBudget);
  const reserveIds = new Set([
    ...(roster?.reserve ?? []),
    ...(roster?.taxi ?? []),
  ].map(String));
  const activeRosterSize = (roster?.players ?? []).filter(
    (id) => !reserveIds.has(String(id)),
  ).length;
  const regularRosterLimit = snapshot.league.roster_positions.filter(
    (slot) => !["IR", "RESERVE", "TAXI"].includes(slot.toUpperCase()),
  ).length;
  const rosterSpotsOpen = Math.max(
    0,
    regularRosterLimit - activeRosterSize,
  );
  const analyses = analyzeLeagueTeams({
    snapshot,
    picks,
    board,
    sleeperPlayers,
  });
  const team =
    analyses.find((analysis) => analysis.rosterId === userRosterId) ?? null;
  const rostered = rosteredIdentities(snapshot, picks, sleeperPlayers);
  const trends = trendingByIdentity(trendingAdds, sleeperPlayers);
  const climate = summarizeWaiverBids(transactions);
  const sleeperIndex = buildSleeperPlayerIndex(sleeperPlayers);
  const guards = rosterGuards(team);
  const before = team
    ? rosterScore(team.players, snapshot.league.roster_positions)
    : null;
  const available = board.filter((player) => {
    const position = normalizedPosition(player.position);
    if (!position || player.team === "FA") return false;
    return (
      !rostered.names.has(normalizePlayerName(player.name))
    );
  });

  const recommendations = available
    .map((player): WaiverRecommendation | null => {
      const position = normalizedPosition(player.position);
      if (!position || !team || !before) return null;
      const depth = depthFor(team, position);
      const sleeperMatch = sleeperMatches(player, sleeperIndex);
      const sleeperId = sleeperMatch?.[0] ?? `waiver:${player.id}`;
      const trendCount =
        (sleeperMatch ? trends.byId.get(sleeperMatch[0]) : undefined) ??
        trends.byName.get(normalizePlayerName(player.name)) ??
        0;
      const candidate = candidateTeamPlayer(player, sleeperId);
      const dropCandidates: Array<TeamPlayer | null> =
        rosterSpotsOpen > 0
          ? [null]
          : team.players.filter((candidate) => !candidate.reserve);
      const impacts = dropCandidates.flatMap((drop): PairImpact[] => {
        const impact = testAddDropPair({
          team,
          candidate,
          drop,
          rosterPositions: snapshot.league.roster_positions,
          before,
        });
        return impact ? [impact] : [];
      });
      const bestImpact = impacts.sort(
        (left, right) =>
          right.rosterGain - left.rosterGain ||
          right.starterGain - left.starterGain ||
          right.benchGain - left.benchGain,
      )[0] ?? null;
      const drop = bestImpact?.drop ?? null;
      const rosterGain = bestImpact?.rosterGain ?? 0;
      const starterGain = bestImpact?.starterGain ?? 0;
      const projectionGain = bestImpact?.projectionGain ?? null;
      const benchGain = bestImpact?.benchGain ?? 0;
      const scarcity =
        position === "RB" || position === "WR"
          ? 7
          : position === "TE"
            ? 4
            : 0;
      const trendBonus = Math.min(10, Math.log10(Math.max(1, trendCount)) * 3.4);
      const score = Math.round(
        Math.max(
          0,
          Math.min(
            100,
            playerValue(player) * 0.58 +
              needBonus(depth) +
              Math.max(-10, Math.min(18, rosterGain * 0.65)) +
              scarcity +
              trendBonus -
              injuryPenalty(player),
          ),
        ),
      );
      const faab = faabFor({
        player,
        score,
        rosterGain,
        need: depth,
        trendingAdds: trendCount,
        remainingBudget,
        climate,
      });
      const availability = availabilityFor({
        sleeperId: sleeperMatch?.[0] ?? null,
        transactions,
        waiverClearDays: Math.max(
          1,
          snapshot.league.settings.waiver_clear_days ?? 2,
        ),
        now,
      });
      const isClearUpgrade = Boolean(bestImpact) && rosterGain >= 2.5 && score >= 55;
      const isStrongUpgrade = rosterGain >= 5 && score >= 68;
      const actionVerdict: WaiverActionVerdict = !isClearUpgrade
        ? "Hold"
        : availability.availability === "Waivers"
          ? isStrongUpgrade ? "Claim now" : "Consider"
          : availability.availability === "Free agent"
            ? isStrongUpgrade ? "Add now" : "Consider"
            : "Consider";
      const reasons = [
        depth
          ? `${position} depth is ${depth.label.toLowerCase()} (${depth.grade}/100).`
          : `${position} is being evaluated as an upside bench addition.`,
        rosterGain > 0
          ? `Full add/drop simulation improves roster value by +${rosterGain.toFixed(1)}.`
          : `This is a watch-list move; it does not clearly improve the current roster yet.`,
        starterGain > 0
          ? `The rebuilt optimal lineup gains +${starterGain.toFixed(1)} starter-value points.`
          : benchGain > 0
            ? `The move adds +${benchGain.toFixed(1)} in weighted bench value without weakening the lineup.`
            : `The optimized lineup and bench do not gain enough to justify a move.`,
        trendCount > 0
          ? `${trendCount.toLocaleString()} Sleeper adds in the last 24 hours signal competition.`
          : `No meaningful 24-hour Sleeper add surge is available.`,
      ];
      const warning =
        injuryPenalty(player) >= 24
          ? `${player.injuryStatus || player.injuryDetail} materially lowers the bid.`
            : !bestImpact && rosterSpotsOpen === 0
            ? "No safe drop was found. Do not submit this claim without reviewing your roster."
            : !isClearUpgrade
              ? "No meaningful roster improvement was found. Hold your current player."
            : null;
      return {
        player,
        position,
        priority:
          isStrongUpgrade
            ? "Priority add"
            : isClearUpgrade
              ? "Upgrade"
              : "Watch",
        score,
        rosterGain,
        faab,
        drop,
        trendingAdds: trendCount,
        need: rosterSpotsOpen > 0 ? "Open slot" : depth?.label ?? "Stable",
        confidence: confidenceFor(player, trendCount),
        reasons,
        warning,
        ...availability,
        actionVerdict,
        actionLabel:
          actionVerdict === "Claim now"
            ? `Claim ${player.name}${drop ? ` · Drop ${drop.player.name}` : ""}`
            : actionVerdict === "Add now"
              ? `Add ${player.name}${drop ? ` · Drop ${drop.player.name}` : ""}`
              : actionVerdict === "Consider"
                ? `Consider ${player.name}${drop ? ` for ${drop.player.name}` : ""}`
                : `Keep your roster over ${player.name}`,
        starterGain,
        projectionGain,
        benchGain,
        moveType: !bestImpact
          ? "no-safe-drop"
          : drop
            ? "swap"
            : "add-only",
      };
    })
    .filter((item): item is WaiverRecommendation => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.player.ecr ?? 9999) - (right.player.ecr ?? 9999),
    )
    .slice(0, 60);

  const actionable = recommendations.filter((item) => item.priority !== "Watch");
  const claimOrder = actionable
    .filter((item) => item.availability !== "Free agent")
    .slice(0, 5);
  const freeAgentAdds = actionable
    .filter((item) => item.availability === "Free agent")
    .slice(0, 5);

  return {
    recommendations,
    availableCount: available.length,
    rosterSpotsOpen,
    totalBudget,
    spentBudget,
    remainingBudget,
    waiverPosition: roster?.settings.waiver_position ?? 0,
    bidClimate: climate,
    team,
    upgradeCount: actionable.length,
    claimOrder,
    freeAgentAdds,
    ...guards,
    noUpgradeReason: actionable.length
      ? null
      : available.length
        ? "Every available player was tested against every safe roster cut, and none produced a meaningful improvement."
        : "No ranked unrostered players were available to evaluate.",
  };
}
