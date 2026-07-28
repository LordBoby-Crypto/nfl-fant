import type { PlayerIntelligence, PlayerPosition } from "../player-intelligence/model";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../../types";

export type DraftPosition = Exclude<PlayerPosition, "—">;
export type DraftControlKind =
  | "watchlist"
  | "queue"
  | "target"
  | "sleeper"
  | "avoid";

export interface DraftControlState {
  watchlist: string[];
  queue: string[];
  target: string[];
  sleeper: string[];
  avoid: string[];
}

export interface PositionNeed {
  position: DraftPosition | "FLEX";
  missing: number;
  urgency: "urgent" | "need" | "depth" | "filled";
}

export interface TeamDraftState {
  rosterId: number;
  ownerId: string;
  name: string;
  slot: number | null;
  picks: SleeperDraftPick[];
  counts: Record<DraftPosition, number>;
  needs: PositionNeed[];
}

export interface RecommendationReason {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "warning";
}

export interface DraftRecommendation {
  player: PlayerIntelligence;
  score: number;
  vor: number | null;
  scarcity: number | null;
  adpDelta: number | null;
  risk: "Low" | "Medium" | "High";
  reasons: RecommendationReason[];
}

export interface DraftCursor {
  currentPick: number;
  currentRound: number;
  currentSlot: number;
  currentRosterId: number | null;
  nextUserPick: number | null;
  picksUntilUser: number | null;
  isUserTurn: boolean;
  complete: boolean;
}

const EMPTY_COUNTS: Record<DraftPosition, number> = {
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
};

const CORE_POSITIONS: DraftPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export function normalizePlayerName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function pickPlayerName(pick: SleeperDraftPick) {
  return [pick.metadata?.first_name, pick.metadata?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim() || `Player ${pick.player_id}`;
}

export function pickPosition(pick: SleeperDraftPick): DraftPosition | null {
  const value = pick.metadata?.position?.toUpperCase();
  if (value === "DEF" || value === "D") return "DST";
  return CORE_POSITIONS.includes(value as DraftPosition)
    ? (value as DraftPosition)
    : null;
}

export function getDraftSlotForPick(
  pickNumber: number,
  teams: number,
  type: Draft["type"] = "snake",
) {
  if (pickNumber < 1 || teams < 1) return 1;
  const round = Math.floor((pickNumber - 1) / teams) + 1;
  const offset = (pickNumber - 1) % teams;
  if (type === "snake" && round % 2 === 0) return teams - offset;
  return offset + 1;
}

export function getUserDraftSlot(
  draft: Draft,
  userId: string,
  userRosterId: number,
) {
  const assigned = draft.draft_order?.[userId];
  if (assigned) return assigned;
  const entry = Object.entries(draft.slot_to_roster_id).find(
    ([, rosterId]) => Number(rosterId) === userRosterId,
  );
  return entry ? Number(entry[0]) : null;
}

export function createSimulationSlotMap(
  draft: Draft,
  userRosterId: number,
  selectedSlot: number,
) {
  const result = Object.fromEntries(
    Object.entries(draft.slot_to_roster_id).map(([slot, rosterId]) => [
      slot,
      Number(rosterId),
    ]),
  );
  const currentUserEntry = Object.entries(result).find(
    ([, rosterId]) => rosterId === userRosterId,
  );
  const displacedRoster = result[String(selectedSlot)];
  result[String(selectedSlot)] = userRosterId;
  if (currentUserEntry && Number(currentUserEntry[0]) !== selectedSlot) {
    result[currentUserEntry[0]] = displacedRoster;
  }
  return result;
}

export function getDraftCursor(
  draft: Draft,
  picks: SleeperDraftPick[],
  userRosterId: number,
  slotMap: Record<string, number> = draft.slot_to_roster_id,
): DraftCursor {
  const totalPicks = draft.settings.teams * draft.settings.rounds;
  const currentPick = Math.min(picks.length + 1, totalPicks + 1);
  const complete = currentPick > totalPicks;
  const safePick = Math.min(currentPick, totalPicks);
  const currentSlot = getDraftSlotForPick(
    safePick,
    draft.settings.teams,
    draft.type,
  );
  const currentRosterId = complete ? null : Number(slotMap[String(currentSlot)] ?? 0) || null;
  let nextUserPick: number | null = null;
  for (let pick = currentPick; pick <= totalPicks; pick += 1) {
    const slot = getDraftSlotForPick(pick, draft.settings.teams, draft.type);
    if (Number(slotMap[String(slot)]) === userRosterId) {
      nextUserPick = pick;
      break;
    }
  }

  return {
    currentPick,
    currentRound: Math.floor((safePick - 1) / draft.settings.teams) + 1,
    currentSlot,
    currentRosterId,
    nextUserPick,
    picksUntilUser:
      nextUserPick === null ? null : Math.max(0, nextUserPick - currentPick),
    isUserTurn: currentRosterId === userRosterId,
    complete,
  };
}

function rosterRequirements(draft: Draft) {
  return {
    QB: draft.settings.slots_qb,
    RB: draft.settings.slots_rb,
    WR: draft.settings.slots_wr,
    TE: draft.settings.slots_te,
    K: draft.settings.slots_k,
    DST: draft.settings.slots_def,
  } satisfies Record<DraftPosition, number>;
}

function calculateNeeds(
  draft: Draft,
  counts: Record<DraftPosition, number>,
): PositionNeed[] {
  const requirements = rosterRequirements(draft);
  const needs: PositionNeed[] = CORE_POSITIONS.map((position) => {
    const missing = Math.max(0, requirements[position] - counts[position]);
    return {
      position,
      missing,
      urgency:
        missing === 0
          ? counts[position] > requirements[position]
            ? "depth"
            : "filled"
          : missing >= requirements[position]
            ? "urgent"
            : "need",
    };
  });
  const coreFlexFilled =
    Math.max(0, counts.RB - requirements.RB) +
    Math.max(0, counts.WR - requirements.WR) +
    Math.max(0, counts.TE - requirements.TE);
  const flexMissing = Math.max(0, draft.settings.slots_flex - coreFlexFilled);
  needs.push({
    position: "FLEX",
    missing: flexMissing,
    urgency: flexMissing ? "need" : "filled",
  });
  return needs;
}

export function buildTeamDraftStates({
  draft,
  users,
  rosters,
  picks,
  slotMap = draft.slot_to_roster_id,
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  slotMap?: Record<string, number>;
}) {
  const usersById = new Map(users.map((user) => [user.user_id, user]));
  const picksByRoster = new Map<number, SleeperDraftPick[]>();
  for (const pick of picks) {
    const rosterId = Number(pick.roster_id);
    const current = picksByRoster.get(rosterId);
    if (current) current.push(pick);
    else picksByRoster.set(rosterId, [pick]);
  }
  const slotByRoster = new Map(
    Object.entries(slotMap).map(([slot, rosterId]) => [Number(rosterId), Number(slot)]),
  );

  return rosters
    .map((roster): TeamDraftState => {
      const user = usersById.get(roster.owner_id);
      const teamPicks = [...(picksByRoster.get(roster.roster_id) ?? [])].sort(
        (left, right) => left.pick_no - right.pick_no,
      );
      const counts = { ...EMPTY_COUNTS };
      for (const pick of teamPicks) {
        const position = pickPosition(pick);
        if (position) counts[position] += 1;
      }
      return {
        rosterId: roster.roster_id,
        ownerId: roster.owner_id,
        name:
          user?.metadata?.team_name?.trim() ||
          user?.display_name ||
          `Roster ${roster.roster_id}`,
        slot: slotByRoster.get(roster.roster_id) ?? null,
        picks: teamPicks,
        counts,
        needs: calculateNeeds(draft, counts),
      };
    })
    .sort((left, right) => {
      if (left.slot === null) return 1;
      if (right.slot === null) return -1;
      return left.slot - right.slot;
    });
}

export function availablePlayers(
  board: PlayerIntelligence[],
  picks: SleeperDraftPick[],
) {
  const draftedIds = new Set(picks.map((pick) => String(pick.player_id)));
  const draftedNames = new Set(
    picks.map((pick) => normalizePlayerName(pickPlayerName(pick))),
  );
  return board.filter(
    (player) =>
      !draftedIds.has(String(player.id)) &&
      !draftedNames.has(normalizePlayerName(player.name)),
  );
}

function injuryRisk(player: PlayerIntelligence): DraftRecommendation["risk"] {
  const context = [
    player.injuryStatus,
    player.injuryDetail,
    player.practiceStatus,
  ]
    .join(" ")
    .toLocaleLowerCase();
  if (/(out|injured reserve|\bir\b|pup|suspend|season)/.test(context)) return "High";
  if (/(questionable|doubtful|limited|injur|recover|rehab)/.test(context)) {
    return "Medium";
  }
  return "Low";
}

function replacementValue(
  player: PlayerIntelligence,
  available: PlayerIntelligence[],
  teams: TeamDraftState[],
) {
  const samePosition = available
    .filter((candidate) => candidate.position === player.position)
    .sort((left, right) => {
      if (left.projectedPoints !== null && right.projectedPoints !== null) {
        return right.projectedPoints - left.projectedPoints;
      }
      return (left.ecr ?? 9999) - (right.ecr ?? 9999);
    });
  const remainingDemand = teams.reduce((total, team) => {
    const need = team.needs.find((item) => item.position === player.position);
    return total + (need?.missing ?? 0);
  }, 0);
  const replacement =
    samePosition[
      Math.min(
        samePosition.length - 1,
        Math.max(1, remainingDemand) - 1,
      )
    ];
  if (!replacement) return null;
  if (
    player.projectedPoints !== null &&
    replacement.projectedPoints !== null
  ) {
    return player.projectedPoints - replacement.projectedPoints;
  }
  if (player.ecr !== null && replacement.ecr !== null) {
    return (replacement.ecr - player.ecr) * 0.45;
  }
  return null;
}

function scarcityValue(
  player: PlayerIntelligence,
  available: PlayerIntelligence[],
  picksUntilUser: number | null,
) {
  const pool = available
    .filter((candidate) => candidate.position === player.position)
    .sort((left, right) => (left.ecr ?? 9999) - (right.ecr ?? 9999));
  const index = pool.findIndex((candidate) => candidate.id === player.id);
  if (index < 0) return null;
  const lookahead = Math.max(2, Math.min(14, (picksUntilUser ?? 7) + 1));
  const later = pool[Math.min(pool.length - 1, index + lookahead)];
  if (!later || later.id === player.id) return null;
  if (player.projectedPoints !== null && later.projectedPoints !== null) {
    return player.projectedPoints - later.projectedPoints;
  }
  if (player.ecr !== null && later.ecr !== null) {
    return later.ecr - player.ecr;
  }
  return null;
}

function needWeight(
  player: PlayerIntelligence,
  userTeam: TeamDraftState,
  round: number,
) {
  const exact = userTeam.needs.find((need) => need.position === player.position);
  const flex = userTeam.needs.find((need) => need.position === "FLEX");
  let score = exact?.missing ? 24 + exact.missing * 8 : -5;
  if (
    flex?.missing &&
    (player.position === "RB" ||
      player.position === "WR" ||
      player.position === "TE")
  ) {
    score += 8;
  }
  if ((player.position === "K" || player.position === "DST") && round < 10) {
    score -= 32;
  }
  if (player.position === "QB" && userTeam.counts.QB >= 1 && round < 9) {
    score -= 24;
  }
  return score;
}

function adpDescription(adpDelta: number | null, nextPick: number) {
  if (adpDelta === null) {
    return { value: "No ADP available", tone: "neutral" as const };
  }
  if (adpDelta >= 8) {
    return {
      value: `${Math.round(adpDelta)} picks past ADP — strong value`,
      tone: "positive" as const,
    };
  }
  if (adpDelta <= -8) {
    return {
      value: `${Math.round(Math.abs(adpDelta))} picks early — intentional reach`,
      tone: "warning" as const,
    };
  }
  return {
    value: `Fair near pick ${nextPick}`,
    tone: "neutral" as const,
  };
}

export function recommendPlayers({
  available,
  allPlayers,
  teams,
  userRosterId,
  cursor,
  controls,
}: {
  available: PlayerIntelligence[];
  allPlayers: PlayerIntelligence[];
  teams: TeamDraftState[];
  userRosterId: number;
  cursor: DraftCursor;
  controls: DraftControlState;
}) {
  const userTeam = teams.find((team) => team.rosterId === userRosterId);
  if (!userTeam) return [];
  const nextPick = cursor.nextUserPick ?? cursor.currentPick;
  const draftedByeCounts = new Map<number, number>();
  const allPlayersById = new Map(allPlayers.map((player) => [player.id, player]));
  const allPlayersByName = new Map(
    allPlayers.map((player) => [normalizePlayerName(player.name), player]),
  );
  for (const pick of userTeam.picks) {
    const matched =
      allPlayersById.get(pick.player_id) ??
      allPlayersByName.get(normalizePlayerName(pickPlayerName(pick)));
    if (matched?.byeWeek) {
      draftedByeCounts.set(
        matched.byeWeek,
        (draftedByeCounts.get(matched.byeWeek) ?? 0) + 1,
      );
    }
  }

  return available
    .filter((player) => player.position !== "—")
    .map((player): DraftRecommendation => {
      const vor = replacementValue(player, available, teams);
      const scarcity = scarcityValue(player, available, cursor.picksUntilUser);
      const adpDelta = player.adp === null ? null : nextPick - player.adp;
      const risk = injuryRisk(player);
      const byeConflicts = player.byeWeek
        ? draftedByeCounts.get(player.byeWeek) ?? 0
        : 0;
      const rankValue =
        player.ecr === null ? 0 : Math.max(-15, 58 - player.ecr * 0.42);
      let score =
        50 +
        rankValue +
        (vor ?? 0) * 0.7 +
        (scarcity ?? 0) * 0.45 +
        needWeight(player, userTeam, cursor.currentRound) +
        Math.max(-15, Math.min(18, (adpDelta ?? 0) * 0.55)) -
        (risk === "High" ? 34 : risk === "Medium" ? 12 : 0) -
        byeConflicts * 6;

      if (controls.watchlist.includes(player.id)) score += 5;
      if (controls.target.includes(player.id)) score += 18;
      if (controls.sleeper.includes(player.id)) score += 9;
      const queueIndex = controls.queue.indexOf(player.id);
      if (queueIndex >= 0) score += Math.max(8, 24 - queueIndex * 3);
      if (controls.avoid.includes(player.id)) score -= 1_000;

      const exactNeed = userTeam.needs.find(
        (need) => need.position === player.position,
      );
      const adp = adpDescription(adpDelta, nextPick);
      const bye = player.byeWeek
        ? byeConflicts
          ? `Week ${player.byeWeek}; conflicts with ${byeConflicts} rostered player${byeConflicts === 1 ? "" : "s"}`
          : `Week ${player.byeWeek}; no current conflict`
        : "Bye week not available";

      return {
        player,
        score: Math.round(score),
        vor,
        scarcity,
        adpDelta,
        risk,
        reasons: [
          {
            label: "Value over replacement",
            value:
              vor === null
                ? "Projection baseline unavailable"
                : `${vor >= 0 ? "+" : ""}${vor.toFixed(1)} points`,
            tone: vor !== null && vor > 8 ? "positive" : "neutral",
          },
          {
            label: "Positional scarcity",
            value:
              scarcity === null
                ? "Stable tier"
                : `${scarcity.toFixed(1)} drop before your next turn`,
            tone: scarcity !== null && scarcity > 8 ? "positive" : "neutral",
          },
          {
            label: "Your roster need",
            value: exactNeed?.missing
              ? `${exactNeed.missing} ${player.position} starter slot${exactNeed.missing === 1 ? "" : "s"} open`
              : `${player.position} depth`,
            tone: exactNeed?.missing ? "positive" : "neutral",
          },
          {
            label: "ADP value",
            value: adp.value,
            tone: adp.tone,
          },
          {
            label: "Injury / risk",
            value:
              risk === "Low"
                ? "Low — no active concern"
                : `${risk} — ${player.injuryStatus || player.injuryDetail || "monitor status"}`,
            tone: risk === "High" ? "warning" : "neutral",
          },
          {
            label: "Bye-week conflict",
            value: bye,
            tone: byeConflicts ? "warning" : "neutral",
          },
        ],
      };
    })
    .sort((left, right) => right.score - left.score || (left.player.ecr ?? 9999) - (right.player.ecr ?? 9999))
    .slice(0, 5);
}

function cpuPlayerScore(
  player: PlayerIntelligence,
  team: TeamDraftState,
  round: number,
) {
  const need = team.needs.find((item) => item.position === player.position);
  let score = 200 - (player.ecr ?? player.adp ?? 190);
  score += need?.missing ? 24 + need.missing * 5 : -4;
  if ((player.position === "K" || player.position === "DST") && round < 11) {
    score -= 80;
  }
  if (player.position === "QB" && team.counts.QB >= 1 && round < 10) score -= 45;
  return score;
}

export function createSimulatedPick({
  draft,
  pickNumber,
  player,
  rosterId,
  ownerId,
}: {
  draft: Draft;
  pickNumber: number;
  player: PlayerIntelligence;
  rosterId: number;
  ownerId: string;
}): SleeperDraftPick {
  return {
    player_id: player.id,
    picked_by: ownerId,
    roster_id: rosterId,
    round: Math.floor((pickNumber - 1) / draft.settings.teams) + 1,
    draft_slot: getDraftSlotForPick(
      pickNumber,
      draft.settings.teams,
      draft.type,
    ),
    pick_no: pickNumber,
    is_keeper: null,
    metadata: {
      first_name: player.name.split(" ")[0],
      last_name: player.name.split(" ").slice(1).join(" "),
      team: player.team,
      position: player.position === "DST" ? "DEF" : player.position,
    },
  };
}

export function simulateToUserTurn({
  draft,
  users,
  rosters,
  picks,
  board,
  userRosterId,
  slotMap,
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
}) {
  const nextPicks = [...picks];
  const totalPicks = draft.settings.teams * draft.settings.rounds;
  while (nextPicks.length < totalPicks) {
    const cursor = getDraftCursor(draft, nextPicks, userRosterId, slotMap);
    if (cursor.isUserTurn || cursor.complete || cursor.currentRosterId === null) {
      break;
    }
    const available = availablePlayers(board, nextPicks);
    const teams = buildTeamDraftStates({
      draft,
      users,
      rosters,
      picks: nextPicks,
      slotMap,
    });
    const team = teams.find((item) => item.rosterId === cursor.currentRosterId);
    if (!team || !available.length) break;
    const player = [...available]
      .slice(0, 80)
      .sort(
        (left, right) =>
          cpuPlayerScore(right, team, cursor.currentRound) -
          cpuPlayerScore(left, team, cursor.currentRound),
      )[0];
    nextPicks.push(
      createSimulatedPick({
        draft,
        pickNumber: cursor.currentPick,
        player,
        rosterId: team.rosterId,
        ownerId: team.ownerId,
      }),
    );
  }
  return nextPicks;
}
