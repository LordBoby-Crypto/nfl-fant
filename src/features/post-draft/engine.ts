import type { DraftControlState } from "../live-draft/engine.ts";
import {
  availablePlayers,
  normalizePlayerName,
  pickPlayerName,
} from "../live-draft/engine.ts";
import {
  analyzeLeagueTeams,
  type LineupAssignment,
  type TeamAnalysis,
  type TeamPlayer,
  type TeamWeakness,
} from "../my-team/engine.ts";
import type { PlayerIntelligence, PlayerPosition } from "../player-intelligence/model";
import type {
  LeagueSnapshot,
  SleeperDraftPick,
  SleeperPlayer,
} from "../../types";

export type GradeLetter =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D";

export interface ReportGrade {
  label: string;
  score: number;
  letter: GradeLetter;
  explanation: string;
}

export interface DraftSelectionReview {
  pick: SleeperDraftPick;
  player: PlayerIntelligence | null;
  name: string;
  position: string;
  marketPick: number | null;
  valueDelta: number | null;
  verdict: "value" | "fair" | "reach" | "ungraded";
  explanation: string;
}

export interface ReachReview extends DraftSelectionReview {
  justified: boolean;
}

export interface ConcentrationReview {
  level: "clear" | "watch" | "risk";
  title: string;
  detail: string;
  players: string[];
}

export interface WaiverWatchPlayer {
  player: PlayerIntelligence;
  score: number;
  reason: string;
  preferenceMatch: boolean;
}

export interface PostDraftReport {
  team: TeamAnalysis;
  overall: ReportGrade;
  grades: {
    startingLineup: ReportGrade;
    bench: ReportGrade;
    depth: ReportGrade;
    risk: ReportGrade;
  };
  bestSelection: DraftSelectionReview | null;
  worstSelection: DraftSelectionReview | null;
  justifiedReaches: ReachReview[];
  unnecessaryReaches: ReachReview[];
  waitedOn: DraftSelectionReview[];
  byeConcentrations: ConcentrationReview[];
  injuryConcentration: ConcentrationReview;
  bestAvailable: PlayerIntelligence[];
  waiverWatchlist: WaiverWatchPlayer[];
  weekOneLineup: LineupAssignment[];
  weekOneProjectionReady: boolean;
  weaknesses: TeamWeakness[];
  reviewedSelections: number;
  ungradedSelections: number;
}

interface BuildPostDraftReportInput {
  snapshot: LeagueSnapshot;
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  weeklyBoard: PlayerIntelligence[] | null;
  sleeperPlayers: Record<string, SleeperPlayer>;
  userRosterId: number;
  controls: DraftControlState;
}

const SKILL_POSITIONS = new Set<PlayerPosition>(["RB", "WR", "TE"]);

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function gradeLetter(score: number): GradeLetter {
  if (score >= 93) return "A+";
  if (score >= 88) return "A";
  if (score >= 84) return "A-";
  if (score >= 80) return "B+";
  if (score >= 76) return "B";
  if (score >= 72) return "B-";
  if (score >= 68) return "C+";
  if (score >= 64) return "C";
  if (score >= 60) return "C-";
  return "D";
}

function reportGrade(label: string, score: number, explanation: string): ReportGrade {
  const normalized = clamp(score);
  return {
    label,
    score: normalized,
    letter: gradeLetter(normalized),
    explanation,
  };
}

export function isDraftComplete(
  snapshot: Pick<LeagueSnapshot, "draft">,
) {
  return snapshot.draft.status === "complete";
}

export function shouldAutoOpenPostDraft(
  previous: LeagueSnapshot["draft"]["status"] | null,
  current: LeagueSnapshot["draft"]["status"] | null,
) {
  return current === "complete" && previous !== "complete";
}

function playerMarketPick(player: PlayerIntelligence | null) {
  return player?.adp ?? player?.ecr ?? null;
}

function boardIndexes(board: PlayerIntelligence[]) {
  return {
    byId: new Map(board.map((player) => [String(player.id), player])),
    byName: new Map(
      board.map((player) => [normalizePlayerName(player.name), player]),
    ),
  };
}

function resolvePickPlayer(
  pick: SleeperDraftPick,
  indexes: ReturnType<typeof boardIndexes>,
) {
  return (
    indexes.byId.get(String(pick.player_id)) ??
    indexes.byName.get(normalizePlayerName(pickPlayerName(pick))) ??
    null
  );
}

function reviewSelection(
  pick: SleeperDraftPick,
  player: PlayerIntelligence | null,
): DraftSelectionReview {
  const marketPick = playerMarketPick(player);
  const valueDelta =
    marketPick === null ? null : Math.round((pick.pick_no - marketPick) * 10) / 10;
  const name = player?.name ?? pickPlayerName(pick);
  const position = player?.position ?? pick.metadata?.position ?? "—";
  if (valueDelta === null) {
    return {
      pick,
      player,
      name,
      position,
      marketPick,
      valueDelta,
      verdict: "ungraded",
      explanation: "No FantasyPros ADP or ECR was available for a value comparison.",
    };
  }
  if (valueDelta >= 6) {
    return {
      pick,
      player,
      name,
      position,
      marketPick,
      valueDelta,
      verdict: "value",
      explanation: `${Math.round(valueDelta)} picks later than the available market baseline.`,
    };
  }
  if (valueDelta <= -6) {
    return {
      pick,
      player,
      name,
      position,
      marketPick,
      valueDelta,
      verdict: "reach",
      explanation: `${Math.round(Math.abs(valueDelta))} picks earlier than the available market baseline.`,
    };
  }
  return {
    pick,
    player,
    name,
    position,
    marketPick,
    valueDelta,
    verdict: "fair",
    explanation: "Selected within five picks of the available market baseline.",
  };
}

function injurySeverity(player: Pick<TeamPlayer, "injuryStatus" | "reserve">) {
  const context = player.injuryStatus.toLowerCase();
  if (
    player.reserve ||
    /(injured reserve|\bir\b|\bout\b|pup|suspend)/.test(context)
  ) {
    return 3;
  }
  if (/doubtful/.test(context)) return 2;
  if (/(questionable|limited|injur)/.test(context)) return 1;
  return 0;
}

function buildRiskGrade(team: TeamAnalysis) {
  const starters = team.lineup.flatMap((slot) => (slot.player ? [slot.player] : []));
  const starterByeCounts = new Map<number, number>();
  for (const player of starters) {
    if (player.byeWeek) {
      starterByeCounts.set(
        player.byeWeek,
        (starterByeCounts.get(player.byeWeek) ?? 0) + 1,
      );
    }
  }
  const byePenalty = [...starterByeCounts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 2) * 8,
    0,
  );
  const injuryPenalty = team.players.reduce((sum, player) => {
    const severity = injurySeverity(player);
    const starts = starters.some(
      (candidate) => candidate.sleeperId === player.sleeperId,
    );
    return sum + severity * (starts ? 9 : 4);
  }, 0);
  const score = clamp(100 - byePenalty - injuryPenalty);
  const riskiestBye = [...starterByeCounts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  const risks = [
    injuryPenalty
      ? `${injuryPenalty} points deducted for current injury or availability flags`
      : "no material injury flags",
    riskiestBye && riskiestBye[1] >= 3
      ? `${riskiestBye[1]} starters share Week ${riskiestBye[0]}`
      : "no starter bye-week pileup",
  ];
  return reportGrade(
    "Risk safety",
    score,
    `${risks.join("; ")}. Higher is safer.`,
  );
}

function buildBenchGrade(team: TeamAnalysis, benchSlots: number) {
  const expected = Math.max(1, benchSlots);
  const coverage = Math.min(100, (team.bench.length / expected) * 100);
  const usefulPositions = team.depth.filter(
    (depth) => !["K", "DST"].includes(depth.position) && depth.bench > 0,
  );
  const quality = usefulPositions.length
    ? usefulPositions.reduce((sum, depth) => sum + depth.grade, 0) /
      usefulPositions.length
    : 0;
  const score = clamp(quality * 0.72 + coverage * 0.28);
  return reportGrade(
    "Bench",
    score,
    `${team.bench.length} reserves fill ${benchSlots} planned bench slots; ${usefulPositions.length} skill-position groups have backup coverage.`,
  );
}

function concentrationReviews(team: TeamAnalysis) {
  const starters = new Set(
    team.lineup.flatMap((slot) => (slot.player ? [slot.player.sleeperId] : [])),
  );
  const byBye = new Map<number, TeamPlayer[]>();
  for (const player of team.players) {
    if (!player.byeWeek) continue;
    const current = byBye.get(player.byeWeek);
    if (current) current.push(player);
    else byBye.set(player.byeWeek, [player]);
  }
  const byeConcentrations = [...byBye.entries()]
    .map(([week, players]): ConcentrationReview => {
      const starterCount = players.filter((player) =>
        starters.has(player.sleeperId),
      ).length;
      const level =
        starterCount >= 4 || players.length >= 6
          ? "risk"
          : starterCount >= 3 || players.length >= 4
            ? "watch"
            : "clear";
      return {
        level,
        title: `Week ${week}: ${starterCount} starter${starterCount === 1 ? "" : "s"}, ${players.length} total`,
        detail:
          level === "clear"
            ? "Normal overlap."
            : "Plan replacement coverage before this bye week.",
        players: players.map((player) => player.name),
      };
    })
    .filter((item) => item.level !== "clear")
    .sort((left, right) => {
      const order = { risk: 0, watch: 1, clear: 2 };
      return order[left.level] - order[right.level];
    });

  const risky = team.players.filter((player) => injurySeverity(player) > 0);
  const major = risky.filter((player) => injurySeverity(player) >= 2);
  const injuryConcentration: ConcentrationReview = {
    level: major.length >= 2 ? "risk" : risky.length ? "watch" : "clear",
    title: risky.length
      ? `${risky.length} player${risky.length === 1 ? "" : "s"} carry availability flags`
      : "No current injury concentration",
    detail: major.length
      ? `${major.length} are marked doubtful, out, reserved or suspended.`
      : risky.length
        ? "Current flags are lower severity but should be checked before Week 1."
        : "The roster has no material injury or reserve flags in the current feeds.",
    players: risky.map((player) => player.name),
  };
  return { byeConcentrations, injuryConcentration };
}

function controlPlayerIds(controls: DraftControlState) {
  return new Set([
    ...controls.queue,
    ...controls.watchlist,
    ...controls.target,
    ...controls.sleeper,
  ]);
}

function firstWeakPositions(team: TeamAnalysis) {
  return new Set<string>(
    team.weaknesses.flatMap((weakness) =>
      ["QB", "RB", "WR", "TE", "K", "DST"].includes(weakness.position)
        ? [weakness.position]
        : [],
    ),
  );
}

function buildWaiverWatchlist(
  available: PlayerIntelligence[],
  team: TeamAnalysis,
  controls: DraftControlState,
) {
  const preferred = controlPlayerIds(controls);
  const avoided = new Set(controls.avoid);
  const weakPositions = firstWeakPositions(team);
  return available
    .filter((player) => !avoided.has(player.id))
    .map((player): WaiverWatchPlayer => {
      const preferenceMatch = preferred.has(player.id);
      const needMatch = weakPositions.has(player.position);
      const market = player.ecr === null ? 20 : Math.max(0, 90 - player.ecr * 0.32);
      const projection =
        player.projectedPoints === null
          ? 0
          : Math.min(25, player.projectedPoints / 12);
      const score = clamp(
        market +
          projection +
          (needMatch ? 18 : 0) +
          (preferenceMatch ? 20 : 0) +
          (SKILL_POSITIONS.has(player.position) ? 4 : 0),
      );
      return {
        player,
        score,
        preferenceMatch,
        reason: preferenceMatch
          ? "Still available from a saved queue, target, sleeper or watchlist."
          : needMatch
            ? `${player.position} directly addresses a graded roster weakness.`
            : "Best remaining market value for an upside bench watch.",
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.player.ecr ?? 999) - (right.player.ecr ?? 999),
    )
    .slice(0, 6);
}

function overallExplanation({
  team,
  grades,
  valueScore,
  unnecessaryReaches,
}: {
  team: TeamAnalysis;
  grades: PostDraftReport["grades"];
  valueScore: number;
  unnecessaryReaches: number;
}) {
  const strongest = Object.values(grades).sort(
    (left, right) => right.score - left.score,
  )[0];
  const weakest = Object.values(grades).sort(
    (left, right) => left.score - right.score,
  )[0];
  const reachCopy = unnecessaryReaches
    ? `${unnecessaryReaches} unnecessary reach${unnecessaryReaches === 1 ? "" : "es"} lowered the result`
    : "no unnecessary reach was identified";
  return `The roster model ranks this team #${team.strength.rank} of ${team.strength.totalTeams}. ${strongest.label} is the strongest area (${strongest.letter}); ${weakest.label.toLowerCase()} is the first concern (${weakest.letter}). Draft-value score: ${valueScore}/100, and ${reachCopy}.`;
}

function snapshotAtDraftCompletion(
  snapshot: LeagueSnapshot,
  picks: SleeperDraftPick[],
) {
  const draftedByRoster = new Map<number, string[]>();
  for (const pick of picks) {
    const rosterId = Number(pick.roster_id);
    if (!Number.isFinite(rosterId)) continue;
    const current = draftedByRoster.get(rosterId);
    if (current) current.push(String(pick.player_id));
    else draftedByRoster.set(rosterId, [String(pick.player_id)]);
  }
  return {
    ...snapshot,
    rosters: snapshot.rosters.map((roster) => {
      const drafted = draftedByRoster.get(roster.roster_id);
      return drafted?.length
        ? { ...roster, players: [...new Set(drafted)] }
        : roster;
    }),
  };
}

export function buildPostDraftReport({
  snapshot,
  picks,
  board,
  weeklyBoard,
  sleeperPlayers,
  userRosterId,
  controls,
}: BuildPostDraftReportInput): PostDraftReport | null {
  const draftPicks = picks
    .sort((left, right) => left.pick_no - right.pick_no);
  const completedSnapshot = snapshotAtDraftCompletion(snapshot, draftPicks);
  const teams = analyzeLeagueTeams({
    snapshot: completedSnapshot,
    picks: draftPicks,
    board,
    sleeperPlayers,
  });
  const team = teams.find((candidate) => candidate.rosterId === userRosterId);
  if (!team) return null;

  const indexes = boardIndexes(board);
  const userPicks = draftPicks.filter(
    (pick) => Number(pick.roster_id) === userRosterId,
  );
  const selections = userPicks.map((pick) =>
    reviewSelection(pick, resolvePickPlayer(pick, indexes)),
  );
  const graded = selections.filter(
    (selection) => selection.valueDelta !== null,
  );
  const lineupIds = new Set(
    team.lineup.flatMap((slot) =>
      slot.player ? [slot.player.intelligence?.id, slot.player.sleeperId] : [],
    ),
  );
  const reachThreshold = 6;
  const reaches = selections
    .filter(
      (selection): selection is ReachReview =>
        selection.valueDelta !== null && selection.valueDelta <= -reachThreshold,
    )
    .map((selection): ReachReview => {
      const reachAmount = Math.abs(selection.valueDelta ?? 0);
      const starter = Boolean(
        selection.player &&
          (lineupIds.has(selection.player.id) ||
            lineupIds.has(String(selection.pick.player_id))),
      );
      const scarceTopTier =
        Boolean(selection.player) &&
        SKILL_POSITIONS.has(selection.player!.position) &&
        (selection.player!.tier ?? 99) <= 3;
      const justified =
        starter &&
        reachAmount <= snapshot.league.total_rosters &&
        (scarceTopTier ||
          reachAmount <= Math.ceil(snapshot.league.total_rosters * 0.7));
      return {
        ...selection,
        justified,
        explanation: justified
          ? `${selection.explanation} The player starts, came from an early scarcity tier, and the premium stayed inside one league round.`
          : `${selection.explanation} The premium exceeded the model's need/scarcity justification.`,
      };
    });
  const justifiedReaches = reaches.filter((reach) => reach.justified);
  const unnecessaryReaches = reaches.filter((reach) => !reach.justified);
  const waitThreshold = Math.max(6, Math.ceil(snapshot.league.total_rosters / 2));
  const waitedOn = selections
    .filter(
      (selection) =>
        selection.valueDelta !== null && selection.valueDelta >= waitThreshold,
    )
    .sort((left, right) => (right.valueDelta ?? 0) - (left.valueDelta ?? 0));
  const bestSelection =
    [...graded].sort(
      (left, right) =>
        (right.valueDelta ?? -999) - (left.valueDelta ?? -999) ||
        (left.player?.ecr ?? 999) - (right.player?.ecr ?? 999),
    )[0] ?? null;
  const worstSelection =
    [...graded].sort(
      (left, right) =>
        (left.valueDelta ?? 999) - (right.valueDelta ?? 999) ||
        (right.player?.ecr ?? 999) - (left.player?.ecr ?? 999),
    )[0] ?? null;

  const averageValue = graded.length
    ? graded.reduce((sum, selection) => sum + (selection.valueDelta ?? 0), 0) /
      graded.length
    : 0;
  const valueScore = clamp(
    72 + averageValue * 1.35 - unnecessaryReaches.length * 4,
  );
  const grades = {
    startingLineup: reportGrade(
      "Starting lineup",
      team.strength.starterScore,
      `Ranked #${team.strength.rank} of ${team.strength.totalTeams} overall with ${team.lineup.filter((slot) => slot.player).length}/${team.lineup.length} starting slots filled.`,
    ),
    bench: buildBenchGrade(team, snapshot.draft.settings.slots_bn),
    depth: reportGrade(
      "Depth",
      team.strength.depthScore,
      `${team.depth.filter((depth) => depth.label === "Strength").length} position groups grade as strengths; ${team.depth.filter((depth) => depth.label === "Thin" || depth.label === "Critical").length} grade thin or critical.`,
    ),
    risk: buildRiskGrade(team),
  };
  const overallScore = clamp(
    grades.startingLineup.score * 0.4 +
      grades.bench.score * 0.16 +
      grades.depth.score * 0.16 +
      grades.risk.score * 0.13 +
      valueScore * 0.15,
  );
  const overall = reportGrade(
    "Overall",
    overallScore,
    overallExplanation({
      team,
      grades,
      valueScore,
      unnecessaryReaches: unnecessaryReaches.length,
    }),
  );

  const available = availablePlayers(board, draftPicks)
    .filter((player) => player.team !== "FA" && player.position !== "—")
    .sort(
      (left, right) =>
        (left.ecr ?? left.adp ?? 999) - (right.ecr ?? right.adp ?? 999),
    );
  const weeklyTeams = analyzeLeagueTeams({
    snapshot: completedSnapshot,
    picks: draftPicks,
    board: weeklyBoard?.length ? weeklyBoard : board,
    sleeperPlayers,
  });
  const weeklyTeam =
    weeklyTeams.find((candidate) => candidate.rosterId === userRosterId) ?? team;
  const weekOneProjectionReady = weeklyTeam.lineup.some(
    (slot) => slot.player?.projectedPoints !== null,
  );
  const { byeConcentrations, injuryConcentration } = concentrationReviews(team);

  return {
    team,
    overall,
    grades,
    bestSelection,
    worstSelection,
    justifiedReaches,
    unnecessaryReaches,
    waitedOn,
    byeConcentrations,
    injuryConcentration,
    bestAvailable: available.slice(0, 10),
    waiverWatchlist: buildWaiverWatchlist(available, team, controls),
    weekOneLineup: weeklyTeam.lineup,
    weekOneProjectionReady,
    weaknesses: team.weaknesses,
    reviewedSelections: selections.length,
    ungradedSelections: selections.length - graded.length,
  };
}
