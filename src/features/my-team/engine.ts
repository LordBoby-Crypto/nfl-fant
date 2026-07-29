import type { PlayerIntelligence, PlayerPosition } from "../player-intelligence/model";
import { normalizePlayerName, pickPlayerName } from "../live-draft/engine.ts";
import type {
  LeagueSnapshot,
  Roster,
  SleeperDraftPick,
  SleeperPlayer,
} from "../../types";

export type TeamPosition = Exclude<PlayerPosition, "—">;
export type StartingSlot = TeamPosition | "FLEX";

export interface TeamPlayer {
  id: string;
  sleeperId: string;
  name: string;
  position: TeamPosition;
  team: string;
  injuryStatus: string;
  byeWeek: number | null;
  projectedPoints: number | null;
  ecr: number | null;
  positionRank: string;
  currentStarter: boolean;
  reserve: boolean;
  intelligence: PlayerIntelligence | null;
}

export interface LineupAssignment {
  key: string;
  slot: StartingSlot;
  label: string;
  player: TeamPlayer | null;
  change: "keep" | "start" | "empty";
}

export interface PositionDepth {
  position: TeamPosition;
  required: number;
  total: number;
  starters: number;
  bench: number;
  grade: number;
  label: "Strength" | "Stable" | "Thin" | "Critical";
}

export interface TeamWeakness {
  position: StartingSlot | "BENCH" | "HEALTH";
  severity: "critical" | "warning" | "watch";
  title: string;
  detail: string;
  action: string;
}

export interface TeamStrength {
  overall: number;
  rank: number;
  totalTeams: number;
  starterScore: number;
  depthScore: number;
  healthScore: number;
  tier: "Contender" | "Playoff caliber" | "Middle tier" | "Rebuild needed";
  confidence: "High" | "Medium" | "Limited";
}

export interface TeamAnalysis {
  rosterId: number;
  teamName: string;
  players: TeamPlayer[];
  lineup: LineupAssignment[];
  bench: TeamPlayer[];
  depth: PositionDepth[];
  weaknesses: TeamWeakness[];
  strength: TeamStrength;
  projectedPoints: number | null;
  lineupChanges: number;
  unresolvedPlayers: number;
}

interface ResolvedRoster {
  roster: Roster;
  teamName: string;
  players: TeamPlayer[];
  unresolvedPlayers: number;
}

const POSITIONS: TeamPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];
const SKILL_POSITIONS = new Set<TeamPosition>(["RB", "WR", "TE"]);

function normalizePosition(value: string | null | undefined): TeamPosition | null {
  const position = value?.toUpperCase();
  if (position === "DEF" || position === "D") return "DST";
  return POSITIONS.includes(position as TeamPosition)
    ? (position as TeamPosition)
    : null;
}

function healthPenalty(player: TeamPlayer) {
  if (player.reserve) return 80;
  const context = player.injuryStatus.toLocaleLowerCase();
  if (/(out|injured reserve|\bir\b|pup|suspend)/.test(context)) return 80;
  if (/(doubtful)/.test(context)) return 35;
  if (/(questionable|limited|injur)/.test(context)) return 10;
  return 0;
}

function playerLineupValue(player: TeamPlayer) {
  const projection = player.projectedPoints;
  const market = player.ecr === null ? 0 : Math.max(0, 260 - player.ecr);
  return (projection ?? market) - healthPenalty(player) * 4;
}

function percentile(value: number, values: number[], descending = false) {
  if (!values.length) return 50;
  const ordered = [...values].sort((left, right) => left - right);
  const index = ordered.findIndex((candidate) =>
    descending ? candidate >= value : candidate >= value,
  );
  const resolvedIndex = index === -1 ? ordered.length - 1 : index;
  const raw = (resolvedIndex / Math.max(1, ordered.length - 1)) * 100;
  return descending ? 100 - raw : raw;
}

function playerStrength(
  player: TeamPlayer,
  board: PlayerIntelligence[],
) {
  const peers = board.filter((candidate) => candidate.position === player.position);
  const projectionValues = peers.flatMap((candidate) =>
    candidate.projectedPoints === null ? [] : [candidate.projectedPoints],
  );
  const ecrValues = peers.flatMap((candidate) =>
    candidate.ecr === null ? [] : [candidate.ecr],
  );
  const projectionScore =
    player.projectedPoints === null
      ? null
      : percentile(player.projectedPoints, projectionValues);
  const ecrScore =
    player.ecr === null ? null : percentile(player.ecr, ecrValues, true);
  const base =
    projectionScore !== null && ecrScore !== null
      ? projectionScore * 0.68 + ecrScore * 0.32
      : projectionScore ?? ecrScore ?? 35;
  return Math.round(Math.max(0, Math.min(100, base - healthPenalty(player))));
}

function rosterPlayerIds(roster: Roster, picks: SleeperDraftPick[]) {
  if (roster.players?.length) return roster.players.map(String).filter(Boolean);
  return picks
    .filter((pick) => Number(pick.roster_id) === roster.roster_id)
    .map((pick) => String(pick.player_id));
}

function teamName(snapshot: LeagueSnapshot, roster: Roster) {
  const user = snapshot.users.find((candidate) => candidate.user_id === roster.owner_id);
  return (
    user?.metadata?.team_name?.trim() ||
    user?.display_name ||
    `Roster ${roster.roster_id}`
  );
}

export function resolveLeagueRosters({
  snapshot,
  picks,
  board,
  sleeperPlayers,
}: {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  sleeperPlayers: Record<string, SleeperPlayer>;
}): ResolvedRoster[] {
  const boardById = new Map(board.map((player) => [String(player.id), player]));
  const boardByName = new Map(
    board.map((player) => [normalizePlayerName(player.name), player]),
  );
  const picksById = new Map(picks.map((pick) => [String(pick.player_id), pick]));

  return snapshot.rosters.map((roster) => {
    let unresolvedPlayers = 0;
    const players = rosterPlayerIds(roster, picks).flatMap((sleeperId): TeamPlayer[] => {
      const sleeper = sleeperPlayers[sleeperId];
      const pick = picksById.get(sleeperId);
      const name =
        sleeper?.full_name?.trim() ||
        [sleeper?.first_name, sleeper?.last_name].filter(Boolean).join(" ").trim() ||
        (pick ? pickPlayerName(pick) : "");
      const intelligence =
        boardById.get(sleeperId) ??
        (name ? boardByName.get(normalizePlayerName(name)) : undefined) ??
        null;
      const position =
        normalizePosition(sleeper?.position) ??
        normalizePosition(pick?.metadata?.position) ??
        normalizePosition(intelligence?.position);
      if (!name || !position) {
        unresolvedPlayers += 1;
        return [];
      }
      return [{
        id: intelligence?.id ?? sleeperId,
        sleeperId,
        name: intelligence?.name ?? name,
        position,
        team: intelligence?.team || sleeper?.team || pick?.metadata?.team || "FA",
        injuryStatus:
          intelligence?.injuryStatus ||
          sleeper?.injury_status ||
          pick?.metadata?.injury_status ||
          "",
        byeWeek: intelligence?.byeWeek ?? null,
        projectedPoints: intelligence?.projectedPoints ?? null,
        ecr: intelligence?.ecr ?? null,
        positionRank: intelligence?.positionRank ?? "",
        currentStarter: roster.starters?.includes(sleeperId) ?? false,
        reserve: roster.reserve?.includes(sleeperId) ?? false,
        intelligence,
      }];
    });
    return {
      roster,
      teamName: teamName(snapshot, roster),
      players,
      unresolvedPlayers,
    };
  });
}

function lineupSlots(rosterPositions: string[]) {
  const counts = new Map<StartingSlot, number>();
  return rosterPositions.flatMap((raw): Array<{ slot: StartingSlot; label: string }> => {
    const upper = raw.toUpperCase();
    if (["BN", "IR", "RESERVE", "TAXI", "SUPER_FLEX", "REC_FLEX"].includes(upper)) {
      return [];
    }
    const slot = upper === "FLEX" ? "FLEX" : normalizePosition(upper);
    if (!slot) return [];
    const count = (counts.get(slot) ?? 0) + 1;
    counts.set(slot, count);
    const total = rosterPositions.filter((value) => {
      const candidate = value.toUpperCase();
      return slot === "DST" ? candidate === "DEF" || candidate === "DST" : candidate === slot;
    }).length;
    return [{ slot, label: total > 1 ? `${slot} ${count}` : slot }];
  });
}

export function optimizeLineup(
  players: TeamPlayer[],
  rosterPositions: string[],
) {
  const slots = lineupSlots(rosterPositions);
  const used = new Set<string>();
  const ordered = [...players].sort(
    (left, right) => playerLineupValue(right) - playerLineupValue(left),
  );
  const fixed = slots.filter((slot) => slot.slot !== "FLEX");
  const flex = slots.filter((slot) => slot.slot === "FLEX");

  function assign(
    slot: { slot: StartingSlot; label: string },
    eligible: (player: TeamPlayer) => boolean,
  ): LineupAssignment {
    const player = ordered.find(
      (candidate) => !used.has(candidate.sleeperId) && eligible(candidate),
    ) ?? null;
    if (player) used.add(player.sleeperId);
    return {
      key: `${slot.label}-${slot.slot}`,
      slot: slot.slot,
      label: slot.label,
      player,
      change: !player
        ? "empty"
        : player.currentStarter
          ? "keep"
          : "start",
    };
  }

  const lineup = [
    ...fixed.map((slot) =>
      assign(slot, (player) => player.position === slot.slot),
    ),
    ...flex.map((slot) =>
      assign(slot, (player) => SKILL_POSITIONS.has(player.position)),
    ),
  ];
  const bench = ordered.filter((player) => !used.has(player.sleeperId));
  return { lineup, bench };
}

function buildDepth(
  players: TeamPlayer[],
  lineup: LineupAssignment[],
  rosterPositions: string[],
  board: PlayerIntelligence[],
) {
  return POSITIONS.map((position): PositionDepth => {
    const atPosition = players
      .filter((player) => player.position === position)
      .sort((left, right) => playerStrength(right, board) - playerStrength(left, board));
    const starters = lineup.filter(
      (slot) => slot.player?.position === position,
    ).length;
    const required = Math.max(
      0,
      rosterPositions.filter((slot) =>
        position === "DST"
          ? ["DEF", "DST"].includes(slot.toUpperCase())
          : slot.toUpperCase() === position,
      ).length,
    );
    const starterQuality = atPosition
      .slice(0, Math.max(1, starters))
      .map((player) => playerStrength(player, board));
    const benchQuality = atPosition
      .slice(starters, starters + 2)
      .map((player) => playerStrength(player, board));
    const starterAverage = starterQuality.length
      ? starterQuality.reduce((sum, value) => sum + value, 0) / starterQuality.length
      : 0;
    const benchAverage = benchQuality.length
      ? benchQuality.reduce((sum, value) => sum + value, 0) / benchQuality.length
      : 0;
    const coverage = required
      ? Math.min(100, (atPosition.length / required) * 72)
      : atPosition.length ? 70 : 50;
    const grade = Math.round(
      Math.max(0, Math.min(100, starterAverage * 0.58 + benchAverage * 0.22 + coverage * 0.2)),
    );
    return {
      position,
      required,
      total: atPosition.length,
      starters,
      bench: Math.max(0, atPosition.length - starters),
      grade,
      label:
        grade >= 78
          ? "Strength"
          : grade >= 62
            ? "Stable"
            : grade >= 42
              ? "Thin"
              : "Critical",
    };
  });
}

function buildWeaknesses(
  lineup: LineupAssignment[],
  depth: PositionDepth[],
  players: TeamPlayer[],
) {
  const weaknesses: TeamWeakness[] = [];
  const emptySlots = lineup.filter((slot) => !slot.player);
  for (const slot of emptySlots) {
    weaknesses.push({
      position: slot.slot,
      severity: "critical",
      title: `${slot.label} is empty`,
      detail: "The optimized lineup does not have an eligible player for this slot.",
      action: `Prioritize an available ${slot.slot === "FLEX" ? "RB, WR or TE" : slot.slot}.`,
    });
  }
  for (const item of depth) {
    if (item.required > 0 && item.grade < 55) {
      weaknesses.push({
        position: item.position,
        severity: item.total < item.required ? "critical" : "warning",
        title: `${item.position} depth is ${item.label.toLocaleLowerCase()}`,
        detail: `${item.total} rostered · ${item.starters} optimized starter${item.starters === 1 ? "" : "s"} · ${item.bench} backup${item.bench === 1 ? "" : "s"}.`,
        action: item.total <= item.required
          ? `Add a playable ${item.position} backup.`
          : `Target a higher-upside ${item.position} option.`,
      });
    }
  }
  const risky = players.filter((player) => healthPenalty(player) >= 35);
  if (risky.length) {
    weaknesses.push({
      position: "HEALTH",
      severity: risky.some((player) => healthPenalty(player) >= 80)
        ? "critical"
        : "warning",
      title: `${risky.length} major availability risk${risky.length === 1 ? "" : "s"}`,
      detail: risky.slice(0, 3).map((player) => player.name).join(", "),
      action: "Keep a healthy replacement ready before lineups lock.",
    });
  }
  if (!weaknesses.length) {
    weaknesses.push({
      position: "BENCH",
      severity: "watch",
      title: "No structural weakness detected",
      detail: "Every required starting slot is covered with usable depth.",
      action: "Use bench spots on upside and injury contingency.",
    });
  }
  const order = { critical: 0, warning: 1, watch: 2 };
  return weaknesses
    .sort((left, right) => order[left.severity] - order[right.severity])
    .slice(0, 5);
}

function analyzeResolvedRoster(
  resolved: ResolvedRoster,
  rosterPositions: string[],
  board: PlayerIntelligence[],
) {
  const { lineup, bench } = optimizeLineup(resolved.players, rosterPositions);
  const depth = buildDepth(resolved.players, lineup, rosterPositions, board);
  const starterPlayers = lineup.flatMap((slot) => slot.player ? [slot.player] : []);
  const starterScore = starterPlayers.length
    ? Math.round(
        starterPlayers.reduce(
          (sum, player) => sum + playerStrength(player, board),
          0,
        ) / starterPlayers.length,
      )
    : 0;
  const depthPositions = depth.filter((item) => !["K", "DST"].includes(item.position));
  const depthScore = depthPositions.length
    ? Math.round(
        depthPositions.reduce((sum, item) => sum + item.grade, 0) /
          depthPositions.length,
      )
    : 0;
  const healthScore = Math.max(
    0,
    100 - starterPlayers.reduce((sum, player) => sum + healthPenalty(player), 0),
  );
  const overall = Math.round(
    starterScore * 0.68 + depthScore * 0.22 + healthScore * 0.1,
  );
  const projected = starterPlayers.flatMap((player) =>
    player.projectedPoints === null ? [] : [player.projectedPoints],
  );
  const intelligenceCount = resolved.players.filter(
    (player) => player.intelligence,
  ).length;
  return {
    ...resolved,
    lineup,
    bench,
    depth,
    weaknesses: buildWeaknesses(lineup, depth, resolved.players),
    starterScore,
    depthScore,
    healthScore,
    overall,
    projectedPoints:
      projected.length === starterPlayers.length && projected.length
        ? Math.round(projected.reduce((sum, value) => sum + value, 0) * 10) / 10
        : null,
    lineupChanges: lineup.filter((slot) => slot.change === "start").length,
    confidence:
      resolved.unresolvedPlayers
        ? "Limited"
        : intelligenceCount === resolved.players.length && intelligenceCount
          ? "High"
          : "Medium",
  } as const;
}

export function analyzeLeagueTeams({
  snapshot,
  picks,
  board,
  sleeperPlayers,
}: {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  sleeperPlayers: Record<string, SleeperPlayer>;
}) {
  const resolved = resolveLeagueRosters({
    snapshot,
    picks,
    board,
    sleeperPlayers,
  });
  const raw = resolved.map((roster) =>
    analyzeResolvedRoster(roster, snapshot.league.roster_positions, board),
  );
  const ranked = [...raw].sort(
    (left, right) => right.overall - left.overall || left.roster.roster_id - right.roster.roster_id,
  );
  const rankByRoster = new Map(
    ranked.map((team, index) => [team.roster.roster_id, index + 1]),
  );
  return raw.map((team): TeamAnalysis => {
    const tier: TeamStrength["tier"] =
      team.overall >= 78
        ? "Contender"
        : team.overall >= 66
          ? "Playoff caliber"
          : team.overall >= 52
            ? "Middle tier"
            : "Rebuild needed";
    return {
      rosterId: team.roster.roster_id,
      teamName: team.teamName,
      players: team.players,
      lineup: team.lineup,
      bench: team.bench,
      depth: team.depth,
      weaknesses: team.weaknesses,
      strength: {
        overall: team.overall,
        rank: rankByRoster.get(team.roster.roster_id) ?? raw.length,
        totalTeams: raw.length,
        starterScore: team.starterScore,
        depthScore: team.depthScore,
        healthScore: team.healthScore,
        tier,
        confidence: team.confidence,
      },
      projectedPoints: team.projectedPoints,
      lineupChanges: team.lineupChanges,
      unresolvedPlayers: team.unresolvedPlayers,
    };
  });
}
