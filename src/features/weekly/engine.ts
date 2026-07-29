import type { TeamAnalysis, TeamPlayer } from "../my-team/engine.ts";
import type {
  LeagueSnapshot,
  SleeperMatchup,
  WeeklyOutlook,
} from "../../types.ts";

export interface WeeklyMatchupSummary {
  week: number;
  user: TeamAnalysis;
  opponent: TeamAnalysis;
  userPoints: number;
  opponentPoints: number;
  userWinProbability: number;
  projectionSource: "weekly" | "roster strength";
}

export interface StartSitDecision {
  slot: string;
  start: TeamPlayer;
  sit: TeamPlayer | null;
  projectedGain: number | null;
  confidence: "High" | "Medium" | "Limited";
  reason: string;
}

export interface InjuryAlert {
  player: TeamPlayer;
  severity: "critical" | "warning" | "watch";
  lineupImpact: "Starter" | "Bench";
  title: string;
  detail: string;
  action: string;
}

export interface PlayoffOdd {
  rosterId: number;
  teamName: string;
  probability: number;
  projectedSeed: number;
  currentWins: number;
  strength: number;
}

export interface ScheduleDifficulty {
  rosterId: number;
  teamName: string;
  averageOpponentStrength: number | null;
  rank: number | null;
  label: "Hardest" | "Tough" | "Average" | "Favorable" | "Easiest" | "Pending";
  remainingGames: number;
}

export interface UserScheduleWeek {
  week: number;
  opponentRosterId: number;
  opponentName: string;
  opponentStrength: number;
}

export interface WeeklyDecisionModel {
  week: number;
  matchup: WeeklyMatchupSummary | null;
  startSit: StartSitDecision[];
  injuries: InjuryAlert[];
  playoffOdds: PlayoffOdd[];
  scheduleDifficulty: ScheduleDifficulty[];
  userSchedule: UserScheduleWeek[];
}

interface ScheduleGame {
  week: number;
  matchupId: number;
  first: SleeperMatchup;
  second: SleeperMatchup;
}

const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function logisticProbability(difference: number, scale: number) {
  return Math.round(
    clamp(1 / (1 + Math.exp(-difference / scale)), 0.05, 0.95) * 100,
  );
}

function scheduleGames(outlook: WeeklyOutlook) {
  const games: ScheduleGame[] = [];
  for (const [rawWeek, rows] of Object.entries(outlook.matchupsByWeek)) {
    const week = Number(rawWeek);
    const grouped = new Map<number, SleeperMatchup[]>();
    for (const row of rows) {
      if (row.matchup_id === null) continue;
      const current = grouped.get(row.matchup_id);
      if (current) current.push(row);
      else grouped.set(row.matchup_id, [row]);
    }
    for (const [matchupId, teams] of grouped) {
      if (teams.length !== 2) continue;
      games.push({
        week,
        matchupId,
        first: teams[0],
        second: teams[1],
      });
    }
  }
  return games.sort(
    (left, right) =>
      left.week - right.week || left.matchupId - right.matchupId,
  );
}

function opponentId(game: ScheduleGame, rosterId: number) {
  if (game.first.roster_id === rosterId) return game.second.roster_id;
  if (game.second.roster_id === rosterId) return game.first.roster_id;
  return null;
}

function matchupRow(game: ScheduleGame, rosterId: number) {
  return game.first.roster_id === rosterId
    ? game.first
    : game.second.roster_id === rosterId
      ? game.second
      : null;
}

function projectedGain(start: TeamPlayer, sit: TeamPlayer | null) {
  if (
    start.projectedPoints === null ||
    sit?.projectedPoints === null ||
    sit?.projectedPoints === undefined
  ) {
    return null;
  }
  return Math.round((start.projectedPoints - sit.projectedPoints) * 10) / 10;
}

function buildStartSit(user: TeamAnalysis) {
  const optimizedIds = new Set(
    user.lineup.flatMap((slot) =>
      slot.player ? [slot.player.sleeperId] : [],
    ),
  );
  const sitPool = user.players.filter(
    (player) => player.currentStarter && !optimizedIds.has(player.sleeperId),
  );
  const usedSits = new Set<string>();

  return user.lineup.flatMap((assignment): StartSitDecision[] => {
    if (!assignment.player || assignment.change !== "start") return [];
    const start = assignment.player;
    const sit =
      sitPool.find(
        (candidate) =>
          !usedSits.has(candidate.sleeperId) &&
          candidate.position === start.position,
      ) ??
      sitPool.find(
        (candidate) =>
          !usedSits.has(candidate.sleeperId) &&
          assignment.slot === "FLEX" &&
          FLEX_POSITIONS.has(candidate.position),
      ) ??
      null;
    if (sit) usedSits.add(sit.sleeperId);
    const gain = projectedGain(start, sit);
    const riskySit = sit?.injuryStatus.trim();
    const reason = sit
      ? gain !== null
        ? `${start.name} projects ${Math.abs(gain).toFixed(1)} point${Math.abs(gain) === 1 ? "" : "s"} ${gain >= 0 ? "above" : "below"} ${sit.name} this week${riskySit ? `, while ${sit.name} carries a ${riskySit} tag` : ""}.`
        : `${start.name} has the stronger weekly lineup profile${riskySit ? ` and ${sit.name} carries a ${riskySit} tag` : ""}.`
      : `${start.name} is the best eligible option for ${assignment.label}.`;
    return [{
      slot: assignment.label,
      start,
      sit,
      projectedGain: gain,
      confidence:
        gain === null
          ? "Limited"
          : Math.abs(gain) >= 3
            ? "High"
            : "Medium",
      reason,
    }];
  });
}

function injurySeverity(player: TeamPlayer): InjuryAlert["severity"] | null {
  const context = [
    player.injuryStatus,
    player.intelligence?.injuryDetail,
    player.intelligence?.practiceStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  if (!context) return null;
  if (/(out|injured reserve|\bir\b|pup|suspend)/.test(context)) {
    return "critical";
  }
  if (/(doubtful|questionable|did not practice|dnp)/.test(context)) {
    return "warning";
  }
  return "watch";
}

function buildInjuries(user: TeamAnalysis) {
  const starterIds = new Set(
    user.lineup.flatMap((slot) =>
      slot.player ? [slot.player.sleeperId] : [],
    ),
  );
  const alerts = user.players.flatMap((player): InjuryAlert[] => {
    const severity = injurySeverity(player);
    if (!severity) return [];
    const lineupImpact = starterIds.has(player.sleeperId) ? "Starter" : "Bench";
    const detail =
      [
        player.injuryStatus,
        player.intelligence?.injuryDetail,
        player.intelligence?.practiceStatus,
      ]
        .filter(Boolean)
        .join(" · ") || "FantasyPros reports an availability concern.";
    return [{
      player,
      severity,
      lineupImpact,
      title:
        severity === "critical"
          ? `${player.name} is not currently startable`
          : severity === "warning"
            ? `${player.name} needs a pre-lock decision`
            : `${player.name} has an injury or practice note`,
      detail,
      action:
        lineupImpact === "Starter"
          ? severity === "critical"
            ? "Move the healthiest eligible bench option into this lineup slot."
            : "Recheck the final inactive list before this player's game locks."
          : "Monitor the update; no starting-lineup change is required yet.",
    }];
  });
  const severityOrder = { critical: 0, warning: 1, watch: 2 };
  return alerts.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      (left.lineupImpact === "Starter" ? -1 : 1),
  );
}

function rosterPoints(snapshot: LeagueSnapshot, rosterId: number) {
  const settings = snapshot.rosters.find(
    (roster) => roster.roster_id === rosterId,
  )?.settings;
  if (!settings) return 0;
  return (
    (settings.fpts ?? 0) +
    (settings.fpts_decimal ?? 0) / 100
  );
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function simulatePlayoffOdds({
  snapshot,
  teams,
  games,
  currentWeek,
  iterations,
  seed,
}: {
  snapshot: LeagueSnapshot;
  teams: TeamAnalysis[];
  games: ScheduleGame[];
  currentWeek: number;
  iterations: number;
  seed: number;
}) {
  const remainingGames = games.filter((game) => game.week >= currentWeek);
  if (!remainingGames.length || teams.length < 2) return [];
  const teamById = new Map(teams.map((team) => [team.rosterId, team]));
  const playoffCounts = new Map(teams.map((team) => [team.rosterId, 0]));
  const seedTotals = new Map(teams.map((team) => [team.rosterId, 0]));
  const random = createRandom(seed);
  const playoffTeams = clamp(
    snapshot.league.settings.playoff_teams,
    1,
    teams.length,
  );

  for (let simulation = 0; simulation < iterations; simulation += 1) {
    const wins = new Map(
      snapshot.rosters.map((roster) => [
        roster.roster_id,
        (roster.settings.wins ?? 0) + (roster.settings.ties ?? 0) * 0.5,
      ]),
    );
    const tiebreakers = new Map(
      teams.map((team) => [
        team.rosterId,
        rosterPoints(snapshot, team.rosterId),
      ]),
    );

    for (const game of remainingGames) {
      const first = teamById.get(game.first.roster_id);
      const second = teamById.get(game.second.roster_id);
      if (!first || !second) continue;
      const firstProbability =
        1 /
        (1 +
          Math.exp(
            -(first.strength.overall - second.strength.overall) / 12,
          ));
      const firstWins = random() < firstProbability;
      const winnerId = firstWins ? first.rosterId : second.rosterId;
      wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
      tiebreakers.set(
        first.rosterId,
        (tiebreakers.get(first.rosterId) ?? 0) +
          first.strength.overall * 0.72 +
          random() * 24,
      );
      tiebreakers.set(
        second.rosterId,
        (tiebreakers.get(second.rosterId) ?? 0) +
          second.strength.overall * 0.72 +
          random() * 24,
      );
    }

    const standings = [...teams].sort(
      (left, right) =>
        (wins.get(right.rosterId) ?? 0) -
          (wins.get(left.rosterId) ?? 0) ||
        (tiebreakers.get(right.rosterId) ?? 0) -
          (tiebreakers.get(left.rosterId) ?? 0),
    );
    standings.forEach((team, index) => {
      seedTotals.set(
        team.rosterId,
        (seedTotals.get(team.rosterId) ?? 0) + index + 1,
      );
      if (index < playoffTeams) {
        playoffCounts.set(
          team.rosterId,
          (playoffCounts.get(team.rosterId) ?? 0) + 1,
        );
      }
    });
  }

  return teams
    .map((team): PlayoffOdd => {
      const roster = snapshot.rosters.find(
        (candidate) => candidate.roster_id === team.rosterId,
      );
      return {
        rosterId: team.rosterId,
        teamName: team.teamName,
        probability: Math.round(
          ((playoffCounts.get(team.rosterId) ?? 0) / iterations) * 100,
        ),
        projectedSeed: Math.round(
          ((seedTotals.get(team.rosterId) ?? iterations * teams.length) /
            iterations) *
            10,
        ) / 10,
        currentWins:
          (roster?.settings.wins ?? 0) + (roster?.settings.ties ?? 0) * 0.5,
        strength: team.strength.overall,
      };
    })
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.projectedSeed - right.projectedSeed,
    );
}

function buildScheduleDifficulty(
  teams: TeamAnalysis[],
  games: ScheduleGame[],
  currentWeek: number,
) {
  const teamById = new Map(teams.map((team) => [team.rosterId, team]));
  const raw = teams.map((team) => {
    const opponents = games
      .filter((game) => game.week >= currentWeek)
      .flatMap((game) => {
        const id = opponentId(game, team.rosterId);
        const opponent = id === null ? null : teamById.get(id);
        return opponent ? [opponent] : [];
      });
    return {
      team,
      remainingGames: opponents.length,
      averageOpponentStrength: opponents.length
        ? Math.round(
            (opponents.reduce(
              (sum, opponent) => sum + opponent.strength.overall,
              0,
            ) /
              opponents.length) *
              10,
          ) / 10
        : null,
    };
  });
  const ranked = raw
    .filter(
      (entry): entry is typeof entry & { averageOpponentStrength: number } =>
        entry.averageOpponentStrength !== null,
    )
    .sort(
      (left, right) =>
        right.averageOpponentStrength - left.averageOpponentStrength ||
        left.team.rosterId - right.team.rosterId,
    );
  const rankById = new Map(
    ranked.map((entry, index) => [entry.team.rosterId, index + 1]),
  );

  return raw.map((entry): ScheduleDifficulty => {
    const rank = rankById.get(entry.team.rosterId) ?? null;
    const percentile =
      rank === null || ranked.length <= 1
        ? 0.5
        : (rank - 1) / (ranked.length - 1);
    return {
      rosterId: entry.team.rosterId,
      teamName: entry.team.teamName,
      averageOpponentStrength: entry.averageOpponentStrength,
      rank,
      label:
        rank === null
          ? "Pending"
          : percentile <= 0.12
            ? "Hardest"
            : percentile <= 0.35
              ? "Tough"
              : percentile >= 0.88
                ? "Easiest"
                : percentile >= 0.65
                  ? "Favorable"
                  : "Average",
      remainingGames: entry.remainingGames,
    };
  });
}

export function buildWeeklyDecisionModel({
  snapshot,
  outlook,
  weeklyTeams,
  rosTeams,
  userRosterId,
  playoffIterations = 3000,
  seed = 202609,
}: {
  snapshot: LeagueSnapshot;
  outlook: WeeklyOutlook;
  weeklyTeams: TeamAnalysis[];
  rosTeams: TeamAnalysis[];
  userRosterId: number;
  playoffIterations?: number;
  seed?: number;
}): WeeklyDecisionModel {
  const games = scheduleGames(outlook);
  const weeklyById = new Map(
    weeklyTeams.map((team) => [team.rosterId, team]),
  );
  const rosById = new Map(rosTeams.map((team) => [team.rosterId, team]));
  const weeklyUser = weeklyById.get(userRosterId) ?? null;
  const rosUser = rosById.get(userRosterId) ?? null;
  const currentGame =
    games.find(
      (game) =>
        game.week === outlook.currentWeek &&
        opponentId(game, userRosterId) !== null,
    ) ?? null;
  const currentOpponentId = currentGame
    ? opponentId(currentGame, userRosterId)
    : null;
  const weeklyOpponent =
    currentOpponentId === null
      ? null
      : weeklyById.get(currentOpponentId) ?? null;
  const rosOpponent =
    currentOpponentId === null ? null : rosById.get(currentOpponentId) ?? null;
  const userRow = currentGame ? matchupRow(currentGame, userRosterId) : null;
  const opponentRow =
    currentGame && currentOpponentId !== null
      ? matchupRow(currentGame, currentOpponentId)
      : null;
  const hasWeeklyProjection =
    weeklyUser?.projectedPoints !== null &&
    weeklyOpponent?.projectedPoints !== null;
  const userProjection = weeklyUser?.projectedPoints ?? null;
  const opponentProjection = weeklyOpponent?.projectedPoints ?? null;
  const matchup =
    currentGame && weeklyUser && weeklyOpponent && rosUser && rosOpponent
      ? {
          week: outlook.currentWeek,
          user: weeklyUser,
          opponent: weeklyOpponent,
          userPoints: userRow?.points ?? 0,
          opponentPoints: opponentRow?.points ?? 0,
          userWinProbability: hasWeeklyProjection
            ? logisticProbability(
                (userProjection ?? 0) - (opponentProjection ?? 0),
                12,
              )
            : logisticProbability(
                rosUser.strength.overall - rosOpponent.strength.overall,
                12,
              ),
          projectionSource: hasWeeklyProjection
            ? "weekly"
            : "roster strength",
        } satisfies WeeklyMatchupSummary
      : null;
  const scheduleDifficulty = buildScheduleDifficulty(
    rosTeams,
    games,
    outlook.currentWeek,
  ).sort(
    (left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
      (right.rank ?? Number.MAX_SAFE_INTEGER),
  );
  const userSchedule = games
    .filter((game) => game.week >= outlook.currentWeek)
    .flatMap((game): UserScheduleWeek[] => {
      const id = opponentId(game, userRosterId);
      const opponent = id === null ? null : rosById.get(id);
      return opponent
        ? [{
            week: game.week,
            opponentRosterId: opponent.rosterId,
            opponentName: opponent.teamName,
            opponentStrength: opponent.strength.overall,
          }]
        : [];
    });

  return {
    week: outlook.currentWeek,
    matchup,
    startSit: weeklyUser ? buildStartSit(weeklyUser) : [],
    injuries: weeklyUser ? buildInjuries(weeklyUser) : [],
    playoffOdds: simulatePlayoffOdds({
      snapshot,
      teams: rosTeams,
      games,
      currentWeek: outlook.currentWeek,
      iterations: playoffIterations,
      seed,
    }),
    scheduleDifficulty,
    userSchedule,
  };
}
