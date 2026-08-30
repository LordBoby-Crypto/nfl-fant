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
  position: DraftPosition | "FLEX" | "SUPER_FLEX" | "IDP_FLEX";
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

export interface RecommendationFactor extends RecommendationReason {
  key:
    | "league-value"
    | "rank"
    | "replacement"
    | "tier-scarcity"
    | "adp"
    | "outcome-range"
    | "availability-risk"
    | "expert-agreement"
    | "offense-role"
    | "roster-fit"
    | "bench-balance"
    | "concentration"
    | "stack-correlation"
    | "draft-market"
    | "opponent-demand"
    | "draft-controls";
  score: number;
}

export interface DraftRecommendation {
  player: PlayerIntelligence;
  score: number;
  vor: number | null;
  scarcity: number | null;
  adpDelta: number | null;
  risk: "Low" | "Medium" | "High";
  reasons: RecommendationReason[];
  factors?: RecommendationFactor[];
  outcomeRange?: {
    floor: number | null;
    expected: number | null;
    ceiling: number | null;
  };
  modelConfidence?: "High" | "Medium" | "Low";
}

export interface PreDraftSimulatorSetup {
  available: boolean;
  defaultSlot: number;
}

export function getPreDraftSimulatorSetup({
  draftStatus,
  teams,
  hasUserRoster,
  assignedPosition,
}: {
  draftStatus: Draft["status"];
  teams: number;
  hasUserRoster: boolean;
  assignedPosition: number | null | undefined;
}): PreDraftSimulatorSetup {
  const fallbackSlot = Math.max(1, Math.ceil(teams / 2));
  const assignedSlotIsValid =
    assignedPosition != null &&
    Number.isInteger(assignedPosition) &&
    assignedPosition >= 1 &&
    assignedPosition <= teams;

  return {
    available: draftStatus === "pre_draft" && hasUserRoster,
    defaultSlot: assignedSlotIsValid ? assignedPosition : fallbackSlot,
  };
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
  DL: 0,
  LB: 0,
  DB: 0,
  IDP: 0,
};

const CORE_POSITIONS: DraftPosition[] = [
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

function adjustedRank(player: PlayerIntelligence) {
  return player.leagueRank ?? player.ecr;
}

export function pickPosition(pick: SleeperDraftPick): DraftPosition | null {
  const value = pick.metadata?.position?.toUpperCase();
  if (value === "DEF" || value === "D") return "DST";
  if (value === "DE" || value === "DT") return "DL";
  if (value === "CB" || value === "S") return "DB";
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

export function getPickNumberForRoundSlot(
  round: number,
  slot: number,
  teams: number,
  type: Draft["type"] = "snake",
) {
  const safeRound = Math.max(1, Math.floor(round));
  const safeSlot = Math.min(teams, Math.max(1, Math.floor(slot)));
  const offset =
    type === "snake" && safeRound % 2 === 0
      ? teams - safeSlot
      : safeSlot - 1;
  return (safeRound - 1) * teams + offset + 1;
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
  const occupiedPicks = new Set(
    picks
      .map((pick) => Number(pick.pick_no))
      .filter((pick) => pick >= 1 && pick <= totalPicks),
  );
  let currentPick = 1;
  while (currentPick <= totalPicks && occupiedPicks.has(currentPick)) {
    currentPick += 1;
  }
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
    if (occupiedPicks.has(pick)) continue;
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
    DL: draft.settings.slots_dl ?? 0,
    LB: draft.settings.slots_lb ?? 0,
    DB: draft.settings.slots_db ?? 0,
    IDP: 0,
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
  const superFlexEligibleFilled =
    Math.max(0, counts.QB - requirements.QB) +
    Math.max(0, counts.RB - requirements.RB) +
    Math.max(0, counts.WR - requirements.WR) +
    Math.max(0, counts.TE - requirements.TE) -
    Math.min(draft.settings.slots_flex, coreFlexFilled);
  const superFlexMissing = Math.max(
    0,
    (draft.settings.slots_super_flex ?? 0) - superFlexEligibleFilled,
  );
  needs.push({
    position: "SUPER_FLEX",
    missing: superFlexMissing,
    urgency: superFlexMissing ? "urgent" : "filled",
  });
  const idpFlexEligibleFilled =
    Math.max(0, counts.DL - requirements.DL) +
    Math.max(0, counts.LB - requirements.LB) +
    Math.max(0, counts.DB - requirements.DB) +
    counts.IDP;
  const idpFlexMissing = Math.max(
    0,
    (draft.settings.slots_idp_flex ?? 0) - idpFlexEligibleFilled,
  );
  needs.push({
    position: "IDP_FLEX",
    missing: idpFlexMissing,
    urgency: idpFlexMissing ? "need" : "filled",
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

export function addDraftPickToTeamState(
  draft: Draft,
  team: TeamDraftState,
  pick: SleeperDraftPick,
) {
  const counts = { ...team.counts };
  const position = pickPosition(pick);
  if (position) counts[position] += 1;
  return {
    ...team,
    picks: [...team.picks, pick].sort(
      (left, right) => left.pick_no - right.pick_no,
    ),
    counts,
    needs: calculateNeeds(draft, counts),
  };
}

export function availablePlayers(
  board: PlayerIntelligence[],
  picks: SleeperDraftPick[],
) {
  const drafted = buildDraftedPlayerLookup(picks);
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  return board.filter((player) => {
    if (draftPickForPlayer(player, drafted)) return false;
    const id = String(player.id);
    const name = normalizePlayerName(player.name);
    if (seenIds.has(id) || (name && seenNames.has(name))) return false;
    seenIds.add(id);
    if (name) seenNames.add(name);
    return true;
  });
}

export interface DraftedPlayerLookup {
  byId: Map<string, SleeperDraftPick>;
  byName: Map<string, SleeperDraftPick>;
}

export function buildDraftedPlayerLookup(
  picks: SleeperDraftPick[],
): DraftedPlayerLookup {
  return {
    byId: new Map(
      picks.map((pick) => [String(pick.player_id), pick]),
    ),
    byName: new Map(
      picks.map((pick) => [
        normalizePlayerName(pickPlayerName(pick)),
        pick,
      ]),
    ),
  };
}

export function draftPickForPlayer(
  player: PlayerIntelligence,
  lookup: DraftedPlayerLookup,
) {
  return (
    lookup.byId.get(String(player.id)) ??
    lookup.byName.get(normalizePlayerName(player.name)) ??
    null
  );
}

function bounded(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function playerRiskProfile(player: PlayerIntelligence) {
  const context = [
    player.injuryStatus,
    player.injuryDetail,
    player.practiceStatus,
    ...player.news.flatMap((item) => [item.title, item.summary, item.impact]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  const availabilityConcern =
    /(out|injured reserve|\bir\b|pup|suspend|banned|holdout|season-ending)/.test(
      context,
    );
  const healthConcern =
    /(questionable|doubtful|limited|injur|recover|rehab|surgery|hamstring|concussion)/.test(
      context,
    );
  const roleConcern =
    /(committee|timeshare|backup|competition|competing|uncertain role|workload limit|snap count|reduced role|could lose|split carries)/.test(
      context,
    );
  const risk: DraftRecommendation["risk"] = availabilityConcern
    ? "High"
    : healthConcern || roleConcern
      ? "Medium"
      : "Low";
  const penalty =
    (availabilityConcern ? 28 : healthConcern ? 10 : 0) +
    (roleConcern ? 7 : 0);
  const labels = [
    availabilityConcern ? "availability" : "",
    healthConcern ? "health/workload" : "",
    roleConcern ? "role competition" : "",
  ].filter(Boolean);
  return {
    risk,
    penalty,
    roleConcern,
    detail:
      labels.length > 0
        ? `${risk} — ${labels.join(" + ")} uncertainty`
        : "Low — no active availability, workload or role warning",
  };
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
      return (adjustedRank(left) ?? 9999) - (adjustedRank(right) ?? 9999);
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
  const playerRank = adjustedRank(player);
  const replacementRank = adjustedRank(replacement);
  if (playerRank !== null && replacementRank !== null) {
    return (replacementRank - playerRank) * 0.45;
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
    .sort(
      (left, right) =>
        (adjustedRank(left) ?? 9999) - (adjustedRank(right) ?? 9999),
    );
  const index = pool.findIndex((candidate) => candidate.id === player.id);
  if (index < 0) return null;
  const lookahead = Math.max(2, Math.min(14, (picksUntilUser ?? 7) + 1));
  const later = pool[Math.min(pool.length - 1, index + lookahead)];
  if (!later || later.id === player.id) return null;
  if (player.projectedPoints !== null && later.projectedPoints !== null) {
    return player.projectedPoints - later.projectedPoints;
  }
  const playerRank = adjustedRank(player);
  const laterRank = adjustedRank(later);
  if (playerRank !== null && laterRank !== null) {
    return laterRank - playerRank;
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
  const superFlex = userTeam.needs.find(
    (need) => need.position === "SUPER_FLEX",
  );
  let score = exact?.missing ? 24 + exact.missing * 8 : -5;
  if (
    flex?.missing &&
    (player.position === "RB" ||
      player.position === "WR" ||
      player.position === "TE")
  ) {
    score += 8;
  }
  if (
    superFlex?.missing &&
    (player.position === "QB" ||
      player.position === "RB" ||
      player.position === "WR" ||
      player.position === "TE")
  ) {
    score += player.position === "QB" ? 26 : 8;
  }
  if ((player.position === "K" || player.position === "DST") && round < 10) {
    score -= 32;
  }
  if (
    player.position === "QB" &&
    userTeam.counts.QB >= 1 &&
    !(superFlex?.missing) &&
    round < 9
  ) {
    score -= 24;
  }
  return score;
}

function flexEligible(position: PlayerPosition) {
  return position === "RB" || position === "WR" || position === "TE";
}

function superFlexEligible(position: PlayerPosition) {
  return position === "QB" || flexEligible(position);
}

function idpFlexEligible(position: PlayerPosition) {
  return position === "DL" || position === "LB" || position === "DB" || position === "IDP";
}

function playerForPick(
  pick: SleeperDraftPick,
  playersById: Map<string, PlayerIntelligence>,
  playersByName: Map<string, PlayerIntelligence>,
) {
  return (
    playersById.get(String(pick.player_id)) ??
    playersByName.get(normalizePlayerName(pickPlayerName(pick))) ??
    null
  );
}

function starterAndFlexFit(
  player: PlayerIntelligence,
  team: TeamDraftState,
  round: number,
) {
  const exact = team.needs.find((need) => need.position === player.position);
  const flex = team.needs.find((need) => need.position === "FLEX");
  const superFlex = team.needs.find((need) => need.position === "SUPER_FLEX");
  const idpFlex = team.needs.find((need) => need.position === "IDP_FLEX");
  let score = needWeight(player, team, round);
  const fits: string[] = [];
  if (exact?.missing) fits.push(`${exact.missing} direct starter slot${exact.missing === 1 ? "" : "s"}`);
  if (flex?.missing && flexEligible(player.position)) fits.push("FLEX");
  if (superFlex?.missing && superFlexEligible(player.position)) fits.push("SUPER_FLEX");
  if (idpFlex?.missing && idpFlexEligible(player.position)) fits.push("IDP_FLEX");
  if (!fits.length) {
    score = Math.min(score, -3);
  }
  return {
    score: bounded(score, -32, 42),
    detail: fits.length
      ? `Fills ${fits.join(" + ")}`
      : `${player.position} is currently a depth selection`,
  };
}

function benchBalance(
  player: PlayerIntelligence,
  team: TeamDraftState,
  draft?: Draft,
) {
  if (player.position === "—") {
    return { score: -30, detail: "Unknown position cannot fill a roster slot" };
  }
  const position = player.position;
  const directRequirement = draft
    ? rosterRequirements(draft)[position]
    : team.counts[position] +
      (team.needs.find((item) => item.position === position)?.missing ?? 0);
  const count = team.counts[position];
  const flexCapacity =
    flexEligible(player.position)
      ? team.needs.find((need) => need.position === "FLEX")?.missing ?? 0
      : 0;
  const superFlexCapacity =
    superFlexEligible(player.position)
      ? team.needs.find((need) => need.position === "SUPER_FLEX")?.missing ?? 0
      : 0;
  const idpFlexCapacity =
    idpFlexEligible(player.position)
      ? team.needs.find((need) => need.position === "IDP_FLEX")?.missing ?? 0
      : 0;
  const usefulCapacity =
    directRequirement + flexCapacity + superFlexCapacity + idpFlexCapacity;
  const positionTarget =
    player.position === "RB" || player.position === "WR"
      ? usefulCapacity + 2
      : player.position === "QB" && superFlexCapacity
        ? usefulCapacity + 1
        : usefulCapacity;
  const afterPick = count + 1;
  const excess = Math.max(0, afterPick - Math.max(1, positionTarget));
  const otherOpenStarters = team.needs
    .filter(
      (need) =>
        need.missing > 0 &&
        need.position !== player.position &&
        need.position !== "FLEX" &&
        need.position !== "SUPER_FLEX" &&
        need.position !== "IDP_FLEX",
    )
    .reduce((total, need) => total + need.missing, 0);
  const score = excess
    ? -bounded(8 + excess * 7 + otherOpenStarters * 2, 8, 30)
    : otherOpenStarters === 0 && afterPick <= positionTarget
      ? 4
      : 0;
  return {
    score,
    detail: excess
      ? `${afterPick} ${player.position}s would exceed the useful depth target while ${otherOpenStarters} other starter slot${otherOpenStarters === 1 ? "" : "s"} remain`
      : `${afterPick} ${player.position}${afterPick === 1 ? "" : "s"} stays within the roster depth target`,
  };
}

function outcomeRange(
  player: PlayerIntelligence,
  risk: ReturnType<typeof playerRiskProfile>,
) {
  const expected = player.projectedPoints;
  if (expected === null) {
    return {
      floor: null,
      expected: null,
      ceiling: null,
      spread: null,
    };
  }
  const expertSpread =
    player.expertBest !== null && player.expertWorst !== null
      ? Math.max(0, player.expertWorst - player.expertBest)
      : null;
  const volatility =
    0.09 +
    bounded((expertSpread ?? 8) / 180, 0.02, 0.16) +
    (risk.risk === "High" ? 0.14 : risk.risk === "Medium" ? 0.07 : 0);
  return {
    floor: Math.max(0, expected * (1 - volatility)),
    expected,
    ceiling: expected * (1 + volatility * 0.82),
    spread: volatility,
  };
}

function expertAgreement(player: PlayerIntelligence) {
  const spread =
    player.expertBest !== null && player.expertWorst !== null
      ? Math.max(0, player.expertWorst - player.expertBest)
      : null;
  if (spread === null) {
    return { score: 0, detail: "Expert range unavailable — confidence only" };
  }
  if (spread <= 8) {
    return {
      score: 0,
      detail: `${spread}-rank expert spread — strong confidence`,
    };
  }
  if (spread <= 18) {
    return {
      score: 0,
      detail: `${spread}-rank expert spread — normal confidence`,
    };
  }
  return {
    score: 0,
    detail: `${spread}-rank expert spread — low confidence`,
  };
}

function offenseAndRoleContext(
  player: PlayerIntelligence,
  allPlayers: PlayerIntelligence[],
) {
  if (!player.team || player.team === "FA") {
    return { score: 0, detail: "NFL team context unavailable" };
  }
  const teammates = allPlayers.filter(
    (candidate) =>
      candidate.id !== player.id &&
      candidate.team === player.team &&
      candidate.position !== "—",
  );
  const supportingSkillPlayers = teammates.filter(
    (candidate) =>
      (candidate.position === "QB" ||
        candidate.position === "RB" ||
        candidate.position === "WR" ||
        candidate.position === "TE") &&
      (adjustedRank(candidate) ?? 9999) <= 120,
  );
  const samePositionCompetition = teammates.filter(
    (candidate) =>
      candidate.position === player.position &&
      (adjustedRank(candidate) ?? 9999) <=
        (adjustedRank(player) ?? 180) + 40,
  );
  const environmentBonus = Math.min(5, supportingSkillPlayers.length * 1.2);
  const competitionPenalty = Math.min(8, samePositionCompetition.length * 2.5);
  return {
    score: environmentBonus - competitionPenalty,
    detail: `${supportingSkillPlayers.length} fantasy-relevant teammate${supportingSkillPlayers.length === 1 ? "" : "s"}; ${samePositionCompetition.length} nearby ${player.position} competitor${samePositionCompetition.length === 1 ? "" : "s"}`,
  };
}

function rosterConcentrations(
  player: PlayerIntelligence,
  rosterPlayers: PlayerIntelligence[],
  risk: ReturnType<typeof playerRiskProfile>,
) {
  const byeConflicts = player.byeWeek
    ? rosterPlayers.filter((candidate) => candidate.byeWeek === player.byeWeek).length
    : 0;
  const riskyPlayers = rosterPlayers.filter(
    (candidate) => playerRiskProfile(candidate).risk !== "Low",
  ).length;
  const riskConcentration =
    risk.risk !== "Low" && riskyPlayers >= 2 ? riskyPlayers + 1 : riskyPlayers;
  const score =
    -byeConflicts * 4 -
    (risk.risk !== "Low" ? Math.max(0, riskConcentration - 2) * 3 : 0);
  return {
    score: bounded(score, -24, 0),
    byeConflicts,
    detail: `${player.byeWeek ? `Week ${player.byeWeek}: ${byeConflicts} conflict${byeConflicts === 1 ? "" : "s"}` : "Bye unknown"}; ${riskyPlayers} current injury/role risk${riskyPlayers === 1 ? "" : "s"}`,
  };
}

function stackAndCorrelation(
  player: PlayerIntelligence,
  rosterPlayers: PlayerIntelligence[],
) {
  const sameTeam = rosterPlayers.filter(
    (candidate) => player.team && candidate.team === player.team,
  );
  const stackPartner = sameTeam.find(
    (candidate) =>
      (player.position === "QB" &&
        (candidate.position === "WR" || candidate.position === "TE")) ||
      ((player.position === "WR" || player.position === "TE") &&
        candidate.position === "QB"),
  );
  const usefulSecondary =
    sameTeam.some(
      (candidate) =>
        (player.position === "RB" && candidate.position === "DST") ||
        (player.position === "DST" && candidate.position === "RB"),
    );
  const stackBonus = stackPartner ? 6 : usefulSecondary ? 2 : 0;
  const correlationPenalty = Math.max(0, sameTeam.length - (stackPartner ? 1 : 0)) * 2;
  return {
    score: bounded(stackBonus - correlationPenalty, -10, 6),
    detail: stackPartner
      ? `Useful ${player.position} stack with ${stackPartner.name}; ${sameTeam.length} existing ${player.team} player${sameTeam.length === 1 ? "" : "s"}`
      : sameTeam.length
        ? `${sameTeam.length} existing ${player.team} player${sameTeam.length === 1 ? "" : "s"} adds correlated risk`
        : "No stack bonus or same-team concentration",
  };
}

function recentMarketPressure(
  player: PlayerIntelligence,
  teams: TeamDraftState[],
  adpDelta: number | null,
) {
  const picks = teams
    .flatMap((team) => team.picks)
    .sort((left, right) => left.pick_no - right.pick_no);
  const recent = picks.slice(-6);
  const runCount = recent.filter(
    (pick) => pickPosition(pick) === player.position,
  ).length;
  const runBonus = runCount >= 4 ? 10 : runCount === 3 ? 5 : 0;
  const slideBonus =
    adpDelta === null ? 0 : bounded(adpDelta * 0.45, -10, 14);
  return {
    score: runBonus + slideBonus,
    detail: `${runCount} ${player.position}${runCount === 1 ? "" : "s"} in the last ${recent.length} picks; ${
      adpDelta === null
        ? "ADP unavailable"
        : adpDelta >= 0
          ? `${Math.round(adpDelta)}-pick slide`
          : `${Math.round(Math.abs(adpDelta))} picks ahead of ADP`
    }`,
  };
}

function upcomingOpponentDemand(
  player: PlayerIntelligence,
  teams: TeamDraftState[],
  cursor: DraftCursor,
  userRosterId: number,
  draft?: Draft,
  slotMap?: Record<string, number>,
) {
  if (!draft) {
    return { score: 0, teams: 0, detail: "No opponents pick before the next user turn" };
  }
  let nextUserPick =
    cursor.nextUserPick !== null && cursor.nextUserPick > cursor.currentPick
      ? cursor.nextUserPick
      : null;
  if (nextUserPick === null) {
    const totalPicks = draft.settings.teams * draft.settings.rounds;
    for (
      let pickNumber = cursor.currentPick + 1;
      pickNumber <= totalPicks;
      pickNumber += 1
    ) {
      const slot = getDraftSlotForPick(
        pickNumber,
        draft.settings.teams,
        draft.type,
      );
      if (
        Number((slotMap ?? draft.slot_to_roster_id)[String(slot)]) ===
        userRosterId
      ) {
        nextUserPick = pickNumber;
        break;
      }
    }
  }
  if (nextUserPick === null) {
    return { score: 0, teams: 0, detail: "No opponents pick before the next user turn" };
  }
  const teamsByRoster = new Map(teams.map((team) => [team.rosterId, team]));
  const upcoming = new Map<number, TeamDraftState>();
  for (
    let pickNumber = cursor.currentPick;
    pickNumber < nextUserPick;
    pickNumber += 1
  ) {
    const slot = getDraftSlotForPick(
      pickNumber,
      draft.settings.teams,
      draft.type,
    );
    const rosterId = Number(
      (slotMap ?? draft.slot_to_roster_id)[String(slot)],
    );
    const team = teamsByRoster.get(rosterId);
    if (team) upcoming.set(rosterId, team);
  }
  const demand = [...upcoming.values()].filter((team) => {
    const exact = team.needs.find((need) => need.position === player.position);
    const flex = team.needs.find((need) => need.position === "FLEX");
    const superFlex = team.needs.find((need) => need.position === "SUPER_FLEX");
    const idpFlex = team.needs.find((need) => need.position === "IDP_FLEX");
    return Boolean(
      exact?.missing ||
        (flex?.missing && flexEligible(player.position)) ||
        (superFlex?.missing && superFlexEligible(player.position)) ||
        (idpFlex?.missing && idpFlexEligible(player.position)),
    );
  });
  return {
    score: bounded(demand.length * 2.25, 0, 14),
    teams: demand.length,
    detail: `${demand.length} of ${upcoming.size} opponent roster${upcoming.size === 1 ? "" : "s"} before your next turn need ${player.position} or an eligible flex`,
  };
}

function draftControlInfluence(
  player: PlayerIntelligence,
  controls: DraftControlState,
) {
  const labels: string[] = [];
  let score = 0;
  if (controls.watchlist.includes(player.id)) {
    score += 3;
    labels.push("Watch");
  }
  if (controls.target.includes(player.id)) {
    score += 10;
    labels.push("Target");
  }
  if (controls.sleeper.includes(player.id)) {
    score += 6;
    labels.push("Sleeper");
  }
  const queueIndex = controls.queue.indexOf(player.id);
  if (queueIndex >= 0) {
    score += Math.max(4, 14 - queueIndex * 2);
    labels.push(`Queue #${queueIndex + 1}`);
  }
  return {
    score,
    detail: labels.length ? labels.join(" + ") : "No saved user control",
  };
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
  draft,
  slotMap,
  limit = 5,
}: {
  available: PlayerIntelligence[];
  allPlayers: PlayerIntelligence[];
  teams: TeamDraftState[];
  userRosterId: number;
  cursor: DraftCursor;
  controls: DraftControlState;
  draft?: Draft;
  slotMap?: Record<string, number>;
  limit?: number;
}) {
  const userTeam = teams.find((team) => team.rosterId === userRosterId);
  if (!userTeam) return [];
  const nextPick = cursor.nextUserPick ?? cursor.currentPick;
  const allPlayersById = new Map(allPlayers.map((player) => [player.id, player]));
  const allPlayersByName = new Map(
    allPlayers.map((player) => [normalizePlayerName(player.name), player]),
  );
  const rosterPlayers = userTeam.picks
    .map((pick) => playerForPick(pick, allPlayersById, allPlayersByName))
    .filter((player): player is PlayerIntelligence => Boolean(player));

  return available
    .filter(
      (player) =>
        player.position !== "—" && !controls.avoid.includes(player.id),
    )
    .map((player): DraftRecommendation => {
      const vor = replacementValue(player, available, teams);
      const scarcity = scarcityValue(player, available, cursor.picksUntilUser);
      const adpDelta = player.adp === null ? null : nextPick - player.adp;
      const riskProfile = playerRiskProfile(player);
      const risk = riskProfile.risk;
      const range = outcomeRange(player, riskProfile);
      const agreement = expertAgreement(player);
      const offenseRole = offenseAndRoleContext(player, allPlayers);
      const rosterFit = starterAndFlexFit(player, userTeam, cursor.currentRound);
      const balance = benchBalance(player, userTeam, draft);
      const concentration = rosterConcentrations(
        player,
        rosterPlayers,
        riskProfile,
      );
      const stack = stackAndCorrelation(player, rosterPlayers);
      const market = recentMarketPressure(player, teams, adpDelta);
      const opponentDemand = upcomingOpponentDemand(
        player,
        teams,
        cursor,
        userRosterId,
        draft,
        slotMap,
      );
      const control = draftControlInfluence(player, controls);
      const leagueRank = adjustedRank(player);
      const leagueValueScore =
        player.scarcityAdjustedValue !== null &&
        player.scarcityAdjustedValue !== undefined
          ? bounded(player.scarcityAdjustedValue * 0.08, -8, 18)
          : player.projectedPoints !== null
            ? bounded(player.projectedPoints * 0.025, 0, 12)
            : 0;
      const rankScore =
        leagueRank === null
          ? 0
          : bounded(20 - leagueRank * 0.12, -8, 20) +
            (player.leaguePositionRank !== null &&
            player.leaguePositionRank !== undefined
              ? bounded(8 - player.leaguePositionRank * 0.35, -4, 8)
              : 0);
      const replacementScore = bounded((vor ?? 0) * 0.45, -10, 18);
      const tierScore = bounded((scarcity ?? 0) * 0.35, -6, 16);
      const adpScore = bounded((adpDelta ?? 0) * 0.3, -9, 10);
      const expectedScore =
        range.expected === null
          ? -4
          : bounded(
              range.expected * 0.018 -
                (range.spread ?? 0) * 8,
              -4,
              10,
            );
      const factors: RecommendationFactor[] = [
        {
          key: "league-value",
          label: "League-adjusted projection",
          score: leagueValueScore,
          value:
            player.projectedPoints === null
              ? "Projection unavailable"
              : `${player.projectedPoints.toFixed(1)} projected points`,
          tone: leagueValueScore > 7 ? "positive" : "neutral",
        },
        {
          key: "rank",
          label: "Overall + position rank",
          score: rankScore,
          value: `#${leagueRank ?? "—"} overall · #${
            player.leaguePositionRank ??
            (player.positionRank || "—")
          } ${player.position}`,
          tone: rankScore > 10 ? "positive" : "neutral",
        },
        {
          key: "replacement",
          label: "Value over replacement",
          score: replacementScore,
          value:
            vor === null
              ? "Projection baseline unavailable"
              : `${vor >= 0 ? "+" : ""}${vor.toFixed(1)} points`,
          tone: replacementScore > 5 ? "positive" : replacementScore < 0 ? "warning" : "neutral",
        },
        {
          key: "tier-scarcity",
          label: "Tier drop + scarcity",
          score: tierScore,
          value:
            scarcity === null
              ? `Tier ${player.leagueTier ?? player.tier ?? "—"} · stable`
              : `Tier ${player.leagueTier ?? player.tier ?? "—"} · ${scarcity.toFixed(1)} drop`,
          tone: tierScore > 5 ? "positive" : "neutral",
        },
        {
          key: "adp",
          label: "ADP value",
          score: adpScore,
          ...adpDescription(adpDelta, nextPick),
        },
        {
          key: "outcome-range",
          label: "Floor / expected / ceiling",
          score: expectedScore,
          value:
            range.expected === null
              ? "Projection range unavailable"
              : `${range.floor!.toFixed(1)} / ${range.expected.toFixed(1)} / ${range.ceiling!.toFixed(1)}`,
          tone: expectedScore > 5 ? "positive" : "neutral",
        },
        {
          key: "availability-risk",
          label: "Injury / suspension / workload",
          score: -riskProfile.penalty,
          value: riskProfile.detail,
          tone: risk === "Low" ? "neutral" : "warning",
        },
        {
          key: "expert-agreement",
          label: "Expert range (confidence only)",
          score: agreement.score,
          value: agreement.detail,
          tone:
            player.expertBest === null || player.expertWorst === null
              ? "warning"
              : (player.expertWorst - player.expertBest) > 18
                ? "warning"
                : "neutral",
        },
        {
          key: "offense-role",
          label: "Offense + depth-chart competition",
          score: offenseRole.score,
          value: offenseRole.detail,
          tone: offenseRole.score > 2 ? "positive" : offenseRole.score < -2 ? "warning" : "neutral",
        },
        {
          key: "roster-fit",
          label: "Starting lineup + flex fit",
          score: rosterFit.score,
          value: rosterFit.detail,
          tone: rosterFit.score > 5 ? "positive" : rosterFit.score < 0 ? "warning" : "neutral",
        },
        {
          key: "bench-balance",
          label: "Bench balance + positional depth",
          score: balance.score,
          value: balance.detail,
          tone: balance.score > 0 ? "positive" : balance.score < 0 ? "warning" : "neutral",
        },
        {
          key: "concentration",
          label: "Bye + injury-risk concentration",
          score: concentration.score,
          value: concentration.detail,
          tone: concentration.score < 0 ? "warning" : "neutral",
        },
        {
          key: "stack-correlation",
          label: "Stacks + correlated risk",
          score: stack.score,
          value: stack.detail,
          tone: stack.score > 0 ? "positive" : stack.score < 0 ? "warning" : "neutral",
        },
        {
          key: "draft-market",
          label: "Position run + unexpected slide",
          score: market.score,
          value: market.detail,
          tone: market.score > 5 ? "positive" : market.score < 0 ? "warning" : "neutral",
        },
        {
          key: "opponent-demand",
          label: "Opponents before your next turn",
          score: opponentDemand.score,
          value: opponentDemand.detail,
          tone: opponentDemand.score > 5 ? "positive" : "neutral",
        },
        {
          key: "draft-controls",
          label: "Queue / Target / Sleeper / Watch",
          score: control.score,
          value: control.detail,
          tone: control.score > 0 ? "positive" : "neutral",
        },
      ];
      const score =
        50 +
        factors.reduce((total, factor) => total + factor.score, 0);
      return {
        player,
        score: Math.round(score),
        vor,
        scarcity,
        adpDelta,
        risk,
        reasons: factors,
        factors,
        outcomeRange: {
          floor: range.floor,
          expected: range.expected,
          ceiling: range.ceiling,
        },
        modelConfidence:
          player.projectedPoints === null || player.scoringConfidence === "low"
            ? "Low"
            : player.scoringConfidence === "medium" ||
                player.expertBest === null ||
                player.expertWorst === null ||
                risk === "High"
              ? "Medium"
              : "High",
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (adjustedRank(left.player) ?? 9999) -
          (adjustedRank(right.player) ?? 9999),
    )
    .slice(0, Math.max(0, limit));
}

export function cpuPlayerScore(
  player: PlayerIntelligence,
  team: TeamDraftState,
  round: number,
) {
  const need = team.needs.find((item) => item.position === player.position);
  let score = 200 - (adjustedRank(player) ?? player.adp ?? 190);
  score += need?.missing ? 24 + need.missing * 5 : -4;
  if ((player.position === "K" || player.position === "DST") && round < 11) {
    score -= 80;
  }
  const superFlex = team.needs.find((item) => item.position === "SUPER_FLEX");
  if (
    player.position === "QB" &&
    team.counts.QB >= 1 &&
    !superFlex?.missing &&
    round < 10
  ) {
    score -= 45;
  }
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
    is_keeper: false,
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
  let guard = 0;
  while (guard < totalPicks) {
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
    guard += 1;
  }
  return nextPicks;
}
