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
  type PositionDepth,
  type TeamAnalysis,
  type TeamPlayer,
} from "../my-team/engine.ts";

export type WaiverPosition = Exclude<PlayerPosition, "—">;
export type WaiverPriority = "Priority add" | "Upgrade" | "Watch";
export type WaiverConfidence = "High" | "Medium" | "Limited";

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

function chooseDrop(
  team: TeamAnalysis | null,
  position: WaiverPosition,
  rosterSpotsOpen: number,
) {
  if (!team || rosterSpotsOpen > 0) return null;
  const candidates = team.bench
    .map((player) => ({
      player,
      depth: depthFor(team, player.position),
    }))
    .filter(({ player, depth }) => {
      if (!depth) return true;
      if (player.position === "K" || player.position === "DST") return true;
      return depth.total > Math.max(1, depth.required);
    })
    .sort((left, right) => {
      const leftSamePosition = left.player.position === position ? 8 : 0;
      const rightSamePosition = right.player.position === position ? 8 : 0;
      return (
        dropSafety(right.player, right.depth) + rightSamePosition -
        (dropSafety(left.player, left.depth) + leftSamePosition)
      );
    });

  const selected = candidates[0];
  if (!selected) return null;
  const samePosition = selected.player.position === position;
  const injured = Boolean(selected.player.injuryStatus);
  return {
    player: selected.player,
    reason: injured
      ? `${selected.player.injuryStatus} lowers the value of this bench spot.`
      : samePosition
        ? `This is the lowest-value ${position} on your bench after the upgrade.`
        : `This is your safest expendable bench spot without opening a starting-lineup hole.`,
    protected: false,
  } satisfies DropSuggestion;
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
}: {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  sleeperPlayers: Record<string, SleeperPlayer>;
  trendingAdds: SleeperTrendingPlayer[];
  transactions: SleeperTransaction[];
  userRosterId: number;
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
  const rosterSize = roster?.players?.length ?? 0;
  const rosterSpotsOpen = Math.max(
    0,
    snapshot.league.roster_positions.length - rosterSize,
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
  const available = board.filter((player) => {
    const position = normalizedPosition(player.position);
    if (!position || player.team === "FA") return false;
    return (
      !rostered.ids.has(String(player.id)) &&
      !rostered.names.has(normalizePlayerName(player.name))
    );
  });

  const recommendations = available
    .map((player): WaiverRecommendation | null => {
      const position = normalizedPosition(player.position);
      if (!position) return null;
      const depth = depthFor(team, position);
      const trendCount =
        trends.byId.get(String(player.id)) ??
        trends.byName.get(normalizePlayerName(player.name)) ??
        0;
      const drop = chooseDrop(team, position, rosterSpotsOpen);
      const replacementValue = drop ? playerValue(drop.player) : 0;
      const rosterGain = Math.round(
        (playerValue(player) - replacementValue) * 10,
      ) / 10;
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
      const reasons = [
        depth
          ? `${position} depth is ${depth.label.toLowerCase()} (${depth.grade}/100).`
          : `${position} is being evaluated as an upside bench addition.`,
        rosterGain > 0
          ? `Estimated roster-value gain: +${rosterGain.toFixed(1)} over the suggested drop.`
          : `This is a watch-list move; it does not clearly improve the current roster yet.`,
        trendCount > 0
          ? `${trendCount.toLocaleString()} Sleeper adds in the last 24 hours signal competition.`
          : `No meaningful 24-hour Sleeper add surge is available.`,
      ];
      const warning =
        injuryPenalty(player) >= 24
          ? `${player.injuryStatus || player.injuryDetail} materially lowers the bid.`
          : !drop && rosterSpotsOpen === 0
            ? "No safe drop was found. Do not submit this claim without reviewing your roster."
            : null;
      return {
        player,
        position,
        priority:
          score >= 75 && rosterGain > 0
            ? "Priority add"
            : score >= 58 && rosterGain > 0
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
      };
    })
    .filter((item): item is WaiverRecommendation => Boolean(item))
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.player.ecr ?? 9999) - (right.player.ecr ?? 9999),
    )
    .slice(0, 60);

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
  };
}
