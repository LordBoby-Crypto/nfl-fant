import type { PlayerIntelligence } from "../player-intelligence/model";
import type { Draft, SleeperDraftPick } from "../../types";
import {
  getPickNumberForRoundSlot,
  normalizePlayerName,
  pickPlayerName,
  pickPosition,
  type DraftControlState,
  type DraftCursor,
  type DraftPosition,
  type DraftRecommendation,
  type TeamDraftState,
} from "./engine.ts";

export interface DraftBoardCell {
  pickNumber: number;
  round: number;
  slot: number;
  team: TeamDraftState | null;
  pick: SleeperDraftPick | null;
}

export interface DraftBoardRow {
  round: number;
  cells: DraftBoardCell[];
}

export interface PositionRunAlert {
  position: DraftPosition;
  count: number;
  window: number;
  pickNumbers: number[];
}

export interface TierBreakWarning {
  playerId: string;
  position: DraftPosition;
  tier: number;
  remainingInTier: number;
  nextTier: number | null;
  ecrDrop: number | null;
  urgent: boolean;
}

export interface PlayerWaitGuidance {
  playerId: string;
  nextDecisionPick: number | null;
  survivalProbability: number | null;
  guidance: "Draft now" | "Lean draft now" | "Likely safe to wait" | "No next pick";
  tone: "danger" | "warning" | "safe" | "neutral";
  reason: string;
}

export interface ControlledPlayerDrafted {
  player: PlayerIntelligence;
  pick: SleeperDraftPick;
  kinds: Array<"queue" | "target" | "sleeper">;
}

export interface QueueDepletionWarning {
  level: "green" | "yellow" | "red";
  remaining: number;
  drafted: number;
  message: string;
}

export interface RecommendationChange {
  playerId: string;
  kind: "new" | "up" | "down" | "steady";
  rankDelta: number;
  scoreDelta: number;
}

const TRACKED_KINDS = ["queue", "target", "sleeper"] as const;

export function buildDraftBoardRows(
  draft: Draft,
  teams: TeamDraftState[],
  picks: SleeperDraftPick[],
): DraftBoardRow[] {
  const teamsBySlot = new Map(
    teams.flatMap((team) => (team.slot === null ? [] : [[team.slot, team] as const])),
  );
  const picksByNumber = new Map(
    picks.map((pick) => [Number(pick.pick_no), pick] as const),
  );

  return Array.from({ length: draft.settings.rounds }, (_, roundIndex) => {
    const round = roundIndex + 1;
    return {
      round,
      cells: Array.from({ length: draft.settings.teams }, (_, slotIndex) => {
        const slot = slotIndex + 1;
        const pickNumber = getPickNumberForRoundSlot(
          round,
          slot,
          draft.settings.teams,
          draft.type,
        );
        return {
          pickNumber,
          round,
          slot,
          team: teamsBySlot.get(slot) ?? null,
          pick: picksByNumber.get(pickNumber) ?? null,
        };
      }),
    };
  });
}

export function detectPositionRun(
  picks: SleeperDraftPick[],
  window = 6,
  threshold = 4,
): PositionRunAlert | null {
  const recent = [...picks]
    .filter((pick) => pickPosition(pick))
    .sort((left, right) => left.pick_no - right.pick_no)
    .slice(-window);
  const grouped = new Map<DraftPosition, SleeperDraftPick[]>();
  for (const pick of recent) {
    const position = pickPosition(pick);
    if (!position) continue;
    const current = grouped.get(position);
    if (current) current.push(pick);
    else grouped.set(position, [pick]);
  }
  const leader = [...grouped.entries()].sort(
    ([, left], [, right]) => right.length - left.length,
  )[0];
  if (!leader || leader[1].length < threshold) return null;
  return {
    position: leader[0],
    count: leader[1].length,
    window: recent.length,
    pickNumbers: leader[1].map((pick) => pick.pick_no),
  };
}

export function tierBreakForPlayer(
  player: PlayerIntelligence,
  available: PlayerIntelligence[],
): TierBreakWarning | null {
  if (player.position === "—" || player.tier === null) return null;
  const positionPool = available
    .filter(
      (candidate) =>
        candidate.position === player.position && candidate.tier !== null,
    )
    .sort(
      (left, right) =>
        (left.tier ?? 999) - (right.tier ?? 999) ||
        (left.leagueRank ?? left.ecr ?? 9999) -
          (right.leagueRank ?? right.ecr ?? 9999),
    );
  const currentTier = positionPool.filter(
    (candidate) => candidate.tier === player.tier,
  );
  const next = positionPool.find(
    (candidate) => (candidate.tier ?? player.tier!) > player.tier!,
  );
  const playerRank = player.leagueRank ?? player.ecr;
  const nextRank = next?.leagueRank ?? next?.ecr;
  const ecrDrop =
    playerRank !== null && nextRank !== null && nextRank !== undefined
      ? Math.max(0, nextRank - playerRank)
      : null;
  return {
    playerId: player.id,
    position: player.position,
    tier: player.tier,
    remainingInTier: currentTier.length,
    nextTier: next?.tier ?? null,
    ecrDrop,
    urgent:
      currentTier.length <= 2 &&
      (next === undefined || ecrDrop === null || ecrDrop >= 4),
  };
}

export function nextUserDecisionPick({
  draft,
  picks,
  cursor,
  userRosterId,
  slotMap,
}: {
  draft: Draft;
  picks: SleeperDraftPick[];
  cursor: DraftCursor;
  userRosterId: number;
  slotMap: Record<string, number>;
}) {
  const occupied = new Set(picks.map((pick) => Number(pick.pick_no)));
  const firstCandidate = cursor.currentPick + (cursor.isUserTurn ? 1 : 0);
  const total = draft.settings.teams * draft.settings.rounds;
  for (let pickNumber = firstCandidate; pickNumber <= total; pickNumber += 1) {
    if (occupied.has(pickNumber)) continue;
    const round = Math.floor((pickNumber - 1) / draft.settings.teams) + 1;
    const offset = (pickNumber - 1) % draft.settings.teams;
    const slot =
      draft.type === "snake" && round % 2 === 0
        ? draft.settings.teams - offset
        : offset + 1;
    if (Number(slotMap[String(slot)]) === userRosterId) return pickNumber;
  }
  return null;
}

function modeledAvailability(player: PlayerIntelligence, pickNumber: number) {
  const center = player.adp ?? player.ecr;
  if (center === null) return 0.5;
  const spread = Math.max(4, Math.min(16, center * 0.13));
  return 1 / (1 + Math.exp((pickNumber - center) / spread));
}

export function buildWaitGuidance({
  player,
  nextDecisionPick,
  tierBreak,
  positionRun,
}: {
  player: PlayerIntelligence;
  nextDecisionPick: number | null;
  tierBreak: TierBreakWarning | null;
  positionRun: PositionRunAlert | null;
}): PlayerWaitGuidance {
  if (nextDecisionPick === null) {
    return {
      playerId: player.id,
      nextDecisionPick,
      survivalProbability: null,
      guidance: "No next pick",
      tone: "neutral",
      reason: "No later selection remains on your draft path.",
    };
  }
  let probability = modeledAvailability(player, nextDecisionPick) * 100;
  if (positionRun?.position === player.position) probability -= 12;
  if (tierBreak?.urgent) probability -= 10;
  probability = Math.max(2, Math.min(98, Math.round(probability)));

  if (probability <= 45 || (tierBreak?.urgent && probability <= 58)) {
    return {
      playerId: player.id,
      nextDecisionPick,
      survivalProbability: probability,
      guidance: "Draft now",
      tone: "danger",
      reason: tierBreak?.urgent
        ? `Only ${tierBreak.remainingInTier} player${tierBreak.remainingInTier === 1 ? "" : "s"} remain in this ${player.position} tier.`
        : `${player.position} market value makes a return to pick ${nextDecisionPick} unlikely.`,
    };
  }
  if (probability <= 72) {
    return {
      playerId: player.id,
      nextDecisionPick,
      survivalProbability: probability,
      guidance: "Lean draft now",
      tone: "warning",
      reason:
        positionRun?.position === player.position
          ? `${positionRun.count} ${player.position}s were taken in the last ${positionRun.window} picks.`
          : `The player is near the modeled cutoff for pick ${nextDecisionPick}.`,
    };
  }
  return {
    playerId: player.id,
    nextDecisionPick,
    survivalProbability: probability,
    guidance: "Likely safe to wait",
    tone: "safe",
    reason: `Modeled market value leaves a strong chance of reaching pick ${nextDecisionPick}.`,
  };
}

export function detectDraftedControlledPlayers(
  controls: DraftControlState,
  board: PlayerIntelligence[],
  picks: SleeperDraftPick[],
): ControlledPlayerDrafted[] {
  const byId = new Map(board.map((player) => [String(player.id), player]));
  const byName = new Map(
    board.map((player) => [normalizePlayerName(player.name), player]),
  );
  const controlsByPlayer = new Map<
    string,
    Array<(typeof TRACKED_KINDS)[number]>
  >();
  for (const kind of TRACKED_KINDS) {
    for (const playerId of controls[kind]) {
      const current = controlsByPlayer.get(playerId);
      if (current) current.push(kind);
      else controlsByPlayer.set(playerId, [kind]);
    }
  }

  return picks
    .flatMap((pick): ControlledPlayerDrafted[] => {
      const player =
        byId.get(String(pick.player_id)) ??
        byName.get(normalizePlayerName(pickPlayerName(pick)));
      if (!player) return [];
      const kinds = controlsByPlayer.get(player.id);
      return kinds?.length ? [{ player, pick, kinds }] : [];
    })
    .sort((left, right) => right.pick.pick_no - left.pick.pick_no);
}

export function buildQueueDepletionWarning(
  controls: DraftControlState,
  available: PlayerIntelligence[],
  draftedControlled: ControlledPlayerDrafted[],
  picksUntilUser: number | null,
): QueueDepletionWarning {
  const availableIds = new Set(available.map((player) => player.id));
  const remaining = controls.queue.filter((id) => availableIds.has(id)).length;
  const drafted = draftedControlled.filter((event) =>
    event.kinds.includes("queue"),
  ).length;
  if (!controls.queue.length) {
    return {
      level: "yellow",
      remaining: 0,
      drafted,
      message: "Your queue is empty. Add at least three fallback options.",
    };
  }
  if (remaining === 0) {
    return {
      level: "red",
      remaining,
      drafted,
      message: "No queued players remain available. Rebuild the queue now.",
    };
  }
  if (remaining <= 1 || (picksUntilUser !== null && remaining <= picksUntilUser)) {
    return {
      level: "yellow",
      remaining,
      drafted,
      message: `${remaining} queued player${remaining === 1 ? "" : "s"} remain${remaining === 1 ? "s" : ""}; add fallback options before your turn.`,
    };
  }
  return {
    level: "green",
    remaining,
    drafted,
    message: `${remaining} queued players remain available.`,
  };
}

export function compareRecommendations(
  previous: DraftRecommendation[],
  current: DraftRecommendation[],
): Map<string, RecommendationChange> {
  const previousById = new Map(
    previous.map((item, index) => [
      item.player.id,
      { rank: index + 1, score: item.score },
    ]),
  );
  return new Map(
    current.map((item, index) => {
      const rank = index + 1;
      const before = previousById.get(item.player.id);
      const rankDelta = before ? before.rank - rank : 0;
      const scoreDelta = before ? item.score - before.score : 0;
      return [
        item.player.id,
        {
          playerId: item.player.id,
          kind: !before
            ? "new"
            : rankDelta > 0
              ? "up"
              : rankDelta < 0
                ? "down"
                : "steady",
          rankDelta,
          scoreDelta,
        },
      ];
    }),
  );
}
