import type { PlayerIntelligence } from "../player-intelligence/model";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../../types";
import {
  addDraftPickToTeamState,
  availablePlayers,
  buildTeamDraftStates,
  cpuPlayerScore,
  createSimulatedPick,
  getDraftCursor,
  getPickNumberForRoundSlot,
  normalizePlayerName,
  pickPlayerName,
  pickPosition,
  recommendPlayers,
  type DraftControlState,
  type DraftPosition,
  type TeamDraftState,
} from "./engine.ts";

export interface OpponentForecast {
  pickNumber: number;
  round: number;
  rosterId: number;
  teamName: string;
  style: string;
  player: PlayerIntelligence;
  alternatives: PlayerIntelligence[];
  confidence: "High" | "Medium" | "Low";
  reason: string;
}

export interface DraftSimulationResult {
  runs: number;
  averageGrade: number;
  bestGrade: number;
  worstGrade: number;
  averageBuild: Record<DraftPosition, number>;
  commonPlayers: Array<{
    player: PlayerIntelligence;
    rate: number;
    averageRound: number;
  }>;
  targetRates: Array<{
    player: PlayerIntelligence;
    rate: number;
  }>;
}

export interface DraftSimulationInput {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  controls: DraftControlState;
  runs: number;
  seed?: number;
}

export interface SlotDraftTarget {
  round: number;
  pickNumber: number;
  primary: PlayerIntelligence;
  alternatives: PlayerIntelligence[];
  availability: number;
}

export interface SlotDraftPlan {
  slot: number;
  opportunityScore: number;
  openingShape: string;
  turnRisk: string;
  advice: string;
  targets: SlotDraftTarget[];
}

export interface ForecastCandidate {
  player: PlayerIntelligence;
  probability: number;
}

export interface ForecastPosition {
  position: DraftPosition;
  probability: number;
}

export interface OpponentPickForecast {
  pickNumber: number;
  round: number;
  slot: number;
  rosterId: number;
  teamName: string;
  archetype: string;
  players: ForecastCandidate[];
  positions: ForecastPosition[];
}

export interface SlotPlanRound {
  round: number;
  pickNumber: number;
  focus: DraftPosition[];
  targets: Array<{
    player: PlayerIntelligence;
    availability: number;
  }>;
  fallback: string;
  instruction: string;
}

export interface DetailedSlotDraftPlan {
  slot: number;
  grade: number;
  confidence: number;
  openingBuild: string;
  firstPick: number;
  secondPick: number | null;
  rounds: SlotPlanRound[];
}

interface OpponentProfile {
  name: string;
  positionBias: Partial<Record<DraftPosition, number>>;
  volatility: number;
}

const ARCHETYPES: OpponentProfile[] = [
  {
    name: "Best value",
    positionBias: {},
    volatility: 9,
  },
  {
    name: "RB pressure",
    positionBias: { RB: 16, WR: -2 },
    volatility: 11,
  },
  {
    name: "WR-first",
    positionBias: { WR: 16, RB: -2 },
    volatility: 10,
  },
  {
    name: "Early QB",
    positionBias: { QB: 15, TE: 4 },
    volatility: 13,
  },
  {
    name: "Scarcity",
    positionBias: { TE: 12, RB: 6, QB: 4 },
    volatility: 8,
  },
];

const DRAFT_POSITIONS: DraftPosition[] = ["QB", "RB", "WR", "TE", "K", "DST"];

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function playerLookup(board: PlayerIntelligence[]) {
  return {
    byId: new Map(board.map((player) => [String(player.id), player])),
    byName: new Map(
      board.map((player) => [normalizePlayerName(player.name), player]),
    ),
  };
}

export function findPlayerForPick(
  pick: SleeperDraftPick,
  board: PlayerIntelligence[],
) {
  const lookup = playerLookup(board);
  return (
    lookup.byId.get(String(pick.player_id)) ??
    lookup.byName.get(normalizePlayerName(pickPlayerName(pick))) ??
    null
  );
}

export function getRosterSlot(
  slotMap: Record<string, number>,
  rosterId: number,
) {
  const match = Object.entries(slotMap).find(
    ([, mappedRosterId]) => Number(mappedRosterId) === rosterId,
  );
  return match ? Number(match[0]) : null;
}

function getOpponentProfile(team: TeamDraftState) {
  const base = ARCHETYPES[Math.abs(team.rosterId) % ARCHETYPES.length];
  const observedBias: Partial<Record<DraftPosition, number>> = {};
  for (const position of DRAFT_POSITIONS) {
    const count = team.counts[position];
    if (count >= 2) observedBias[position] = Math.min(12, count * 3);
  }
  return {
    ...base,
    positionBias: { ...base.positionBias, ...observedBias },
  };
}

function chooseOpponentPlayer({
  available,
  team,
  round,
  random,
}: {
  available: PlayerIntelligence[];
  team: TeamDraftState;
  round: number;
  random: () => number;
}) {
  const profile = getOpponentProfile(team);
  let best: PlayerIntelligence | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const candidates = available.slice(0, 100);
  for (const player of candidates) {
    if (player.position === "—") continue;
    const score =
      cpuPlayerScore(player, team, round) +
      (profile.positionBias[player.position] ?? 0) +
      (random() - 0.5) * profile.volatility * 2;
    if (score > bestScore) {
      best = player;
      bestScore = score;
    }
  }
  return best;
}

function simulateOpponentSelections({
  draft,
  users,
  rosters,
  picks,
  board,
  userRosterId,
  slotMap,
  seed,
  horizon = draft.settings.teams,
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  seed: number;
  horizon?: number;
}) {
  const random = mulberry32(seed);
  const nextPicks = [...picks];
  const selections: SleeperDraftPick[] = [];
  let guard = 0;
  while (selections.length < horizon && guard < draft.settings.teams * 2) {
    guard += 1;
    const cursor = getDraftCursor(draft, nextPicks, userRosterId, slotMap);
    if (cursor.complete || cursor.isUserTurn || cursor.currentRosterId === null) {
      break;
    }
    const teams = buildTeamDraftStates({
      draft,
      users,
      rosters,
      picks: nextPicks,
      slotMap,
    });
    const team = teams.find((item) => item.rosterId === cursor.currentRosterId);
    const pool = availablePlayers(board, nextPicks);
    if (!team || !pool.length) break;
    const player = chooseOpponentPlayer({
      available: pool,
      team,
      round: cursor.currentRound,
      random,
    });
    if (!player) break;
    const pick = createSimulatedPick({
      draft,
      pickNumber: cursor.currentPick,
      player,
      rosterId: team.rosterId,
      ownerId: team.ownerId,
    });
    nextPicks.push(pick);
    selections.push(pick);
  }
  return selections;
}

export function simulateToUserTurnWithForecast({
  scenario,
  ...input
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  scenario: number;
}) {
  const selections = simulateOpponentSelections({
    ...input,
    seed: scenario * 97_409 + input.picks.length * 1_009 + 17,
    horizon: input.draft.settings.teams * input.draft.settings.rounds,
  });
  return [...input.picks, ...selections].sort(
    (left, right) => left.pick_no - right.pick_no,
  );
}

function forecastOpponentPickProbabilities({
  runs = 160,
  ...input
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  runs?: number;
}) {
  const playerCounts = new Map<number, Map<string, number>>();
  const positionCounts = new Map<number, Map<DraftPosition, number>>();
  const sampleByPlayer = new Map<string, PlayerIntelligence>();
  const baseTeams = buildTeamDraftStates({
    draft: input.draft,
    users: input.users,
    rosters: input.rosters,
    picks: input.picks,
    slotMap: input.slotMap,
  });

  for (let run = 0; run < runs; run += 1) {
    const selections = simulateOpponentSelections({
      ...input,
      seed: 31_337 + run * 7_919 + input.picks.length * 101,
    });
    for (const pick of selections) {
      const player =
        input.board.find((candidate) => candidate.id === pick.player_id) ?? null;
      const position = pickPosition(pick);
      if (!player || !position) continue;
      sampleByPlayer.set(player.id, player);
      const playersAtPick =
        playerCounts.get(pick.pick_no) ?? new Map<string, number>();
      playersAtPick.set(player.id, (playersAtPick.get(player.id) ?? 0) + 1);
      playerCounts.set(pick.pick_no, playersAtPick);
      const positionsAtPick =
        positionCounts.get(pick.pick_no) ?? new Map<DraftPosition, number>();
      positionsAtPick.set(
        position,
        (positionsAtPick.get(position) ?? 0) + 1,
      );
      positionCounts.set(pick.pick_no, positionsAtPick);
    }
  }

  return [...playerCounts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pickNumber, counts]): OpponentPickForecast => {
      const samplePickSlot =
        ((pickNumber - 1) % input.draft.settings.teams) + 1;
      const round =
        Math.floor((pickNumber - 1) / input.draft.settings.teams) + 1;
      const slot =
        input.draft.type === "snake" && round % 2 === 0
          ? input.draft.settings.teams - samplePickSlot + 1
          : samplePickSlot;
      const rosterId = Number(input.slotMap[String(slot)]);
      const team = baseTeams.find((candidate) => candidate.rosterId === rosterId);
      const profile = team ? getOpponentProfile(team) : ARCHETYPES[0];
      const positions = positionCounts.get(pickNumber) ?? new Map();
      return {
        pickNumber,
        round,
        slot,
        rosterId,
        teamName: team?.name ?? `Roster ${rosterId}`,
        archetype: profile.name,
        players: [...counts.entries()]
          .map(([playerId, count]) => ({
            player: sampleByPlayer.get(playerId)!,
            probability: count / runs,
          }))
          .sort((left, right) => right.probability - left.probability)
          .slice(0, 3),
        positions: [...positions.entries()]
          .map(([position, count]) => ({
            position,
            probability: count / runs,
          }))
          .sort((left, right) => right.probability - left.probability)
          .slice(0, 3),
      };
    });
}

export function forecastOpponentPicks({
  draft,
  users,
  rosters,
  picks,
  board,
  userRosterId,
  slotMap,
  assumedUserPick,
  limit = 10,
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  assumedUserPick?: PlayerIntelligence;
  limit?: number;
}) {
  const working = [...picks];
  const cursor = getDraftCursor(draft, working, userRosterId, slotMap);
  if (
    cursor.isUserTurn &&
    assumedUserPick &&
    cursor.currentRosterId !== null
  ) {
    const roster = rosters.find(
      (candidate) => candidate.roster_id === userRosterId,
    );
    if (roster) {
      working.push(
        createSimulatedPick({
          draft,
          pickNumber: cursor.currentPick,
          player: assumedUserPick,
          rosterId: userRosterId,
          ownerId: roster.owner_id,
        }),
      );
    }
  }
  return forecastOpponentPickProbabilities({
    draft,
    users,
    rosters,
    picks: working,
    board,
    userRosterId,
    slotMap,
    runs: 160,
  })
    .slice(0, limit)
    .flatMap((forecast): OpponentForecast[] => {
      const first = forecast.players[0];
      if (!first) return [];
      const leadingPosition = forecast.positions[0];
      return [{
        pickNumber: forecast.pickNumber,
        round: forecast.round,
        rosterId: forecast.rosterId,
        teamName: forecast.teamName,
        style: forecast.archetype,
        player: first.player,
        alternatives: forecast.players
          .slice(1, 3)
          .map((candidate) => candidate.player),
        confidence:
          first.probability >= 0.55
            ? "High"
            : first.probability >= 0.32
              ? "Medium"
              : "Low",
        reason: leadingPosition
          ? `${leadingPosition.position} is ${Math.round(leadingPosition.probability * 100)}% of modeled outcomes`
          : "Best fit for roster need and market value",
      }];
    });
}

function availabilityAtPick(player: PlayerIntelligence, pickNumber: number) {
  const center = player.adp ?? player.ecr;
  if (center === null) return 0.35;
  const spread = Math.max(4, Math.min(16, center * 0.13));
  return 1 / (1 + Math.exp((pickNumber - center) / spread));
}

function positionPlanScore({
  player,
  counts,
  draft,
  round,
  pickNumber,
}: {
  player: PlayerIntelligence;
  counts: Record<DraftPosition, number>;
  draft: Draft;
  round: number;
  pickNumber: number;
}) {
  if (player.position === "—") return -1_000;
  const position = player.position;
  const requirements: Record<DraftPosition, number> = {
    QB: draft.settings.slots_qb,
    RB: draft.settings.slots_rb,
    WR: draft.settings.slots_wr,
    TE: draft.settings.slots_te,
    K: draft.settings.slots_k,
    DST: draft.settings.slots_def,
  };
  const missing = Math.max(0, requirements[position] - counts[position]);
  const availability = availabilityAtPick(player, pickNumber);
  let score = 150 - (player.ecr ?? player.adp ?? 220);
  score += missing ? 28 + missing * 6 : -4;
  if (
    (player.position === "RB" ||
      player.position === "WR" ||
      player.position === "TE") &&
    counts.RB + counts.WR + counts.TE <
      requirements.RB + requirements.WR + requirements.TE + draft.settings.slots_flex
  ) {
    score += 13;
  }
  if (player.position === "QB" && round <= 3) score -= 24;
  if (player.position === "QB" && counts.QB >= 1 && round <= 10) score -= 42;
  if ((player.position === "K" || player.position === "DST") && round < draft.settings.rounds - 1) {
    score -= 120;
  }
  if (round >= draft.settings.rounds - 1 && (player.position === "K" || player.position === "DST")) {
    score += 60;
  }
  score += availability * 18;
  return score;
}

function roundInstruction(
  round: number,
  draft: Draft,
  focus: DraftPosition[],
  targets: SlotPlanRound["targets"],
) {
  if (round <= 2) return "Secure a weekly cornerstone; do not force a preset position over a fallen tier.";
  if (round <= 5) return `Build the starting core around ${focus.join("/")} value and react to positional runs.`;
  if (round <= 9) return "Fill the last structural weakness, then favor ceiling over a low-upside bench floor.";
  if (round >= draft.settings.rounds - 1) return "Use the final rounds for defense and kicker unless an upside player falls.";
  if (targets[0]?.availability && targets[0].availability < 0.3) {
    return "The lead target is a ceiling outcome; prepare to pivot immediately.";
  }
  return "Attack upside, contingent value and players who can gain a starting role.";
}

export function buildAllSlotPlans({
  draft,
  board,
}: {
  draft: Draft;
  board: PlayerIntelligence[];
}) {
  const pool = board.filter(
    (player) => player.position !== "—",
  );

  return Array.from({ length: draft.settings.teams }, (_, slotIndex) => {
    const slot = slotIndex + 1;
    const counts: Record<DraftPosition, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };
    const used = new Set<string>();
    const rounds: SlotPlanRound[] = [];
    let confidenceTotal = 0;
    let gradeTotal = 0;

    for (let round = 1; round <= draft.settings.rounds; round += 1) {
      const pickNumber = getPickNumberForRoundSlot(
        round,
        slot,
        draft.settings.teams,
        draft.type,
      );
      const candidates = pool
        .filter((player) => !used.has(player.id))
        .map((player) => ({
          player,
          availability: availabilityAtPick(player, pickNumber),
          score: positionPlanScore({
            player,
            counts,
            draft,
            round,
            pickNumber,
          }),
        }))
        .filter((candidate) => candidate.availability >= 0.08)
        .sort(
          (left, right) =>
            right.score - left.score ||
            (left.player.ecr ?? 9999) - (right.player.ecr ?? 9999),
        );
      const lead = candidates[0];
      if (lead) {
        used.add(lead.player.id);
        if (lead.player.position !== "—") {
          counts[lead.player.position] += 1;
        }
        confidenceTotal += lead.availability;
        gradeTotal +=
          (lead.player.projectedPoints ?? Math.max(0, 250 - (lead.player.ecr ?? 200))) *
          (0.65 + lead.availability * 0.35);
      }
      const focus = [...new Set(
        candidates
          .slice(0, 8)
          .map((item) => item.player.position)
          .filter(
            (position): position is DraftPosition => position !== "—",
          ),
      )]
        .slice(0, 3);
      const targets = candidates
        .filter(
          (candidate) =>
            candidate.player.position !== "—" &&
            focus.includes(candidate.player.position),
        )
        .slice(0, 3)
        .map(({ player, availability }) => ({ player, availability }));
      rounds.push({
        round,
        pickNumber,
        focus,
        targets,
        fallback:
          focus.length > 1
            ? `If the tier empties, pivot to ${focus.slice(1).join(" or ")}.`
            : "Take the strongest remaining value without reaching through a tier.",
        instruction: roundInstruction(round, draft, focus, targets),
      });
    }

    const openingBuild = rounds
      .slice(0, 4)
      .map((round) => round.focus[0] ?? "VALUE")
      .join(" · ");
    const plannedRounds = Math.max(1, rounds.length);
    return {
      slot,
      grade: Math.round(Math.min(99, 55 + gradeTotal / Math.max(70, plannedRounds * 24))),
      confidence: Math.round((confidenceTotal / plannedRounds) * 100),
      openingBuild,
      firstPick: getPickNumberForRoundSlot(1, slot, draft.settings.teams, draft.type),
      secondPick:
        draft.settings.rounds >= 2
          ? getPickNumberForRoundSlot(2, slot, draft.settings.teams, draft.type)
          : null,
      rounds,
    } satisfies DetailedSlotDraftPlan;
  });
}

export function buildSlotDraftPlans({
  draft,
  board,
  controls,
}: {
  draft: Draft;
  board: PlayerIntelligence[];
  controls: DraftControlState;
}) {
  const preferred = new Set([
    ...controls.target,
    ...controls.queue,
    ...controls.sleeper,
  ]);
  return buildAllSlotPlans({
    draft,
    board,
  }).map((plan): SlotDraftPlan => {
    const edgeDistance = Math.min(
      plan.slot - 1,
      draft.settings.teams - plan.slot,
    );
    const turnRisk =
      edgeDistance <= 2
        ? "Long turn"
        : edgeDistance <= 4
          ? "Moderate turn"
          : "Short turn";
    const targets = plan.rounds.flatMap((round): SlotDraftTarget[] => {
        const orderedTargets = [...round.targets].sort((left, right) => {
          const preference =
            Number(preferred.has(right.player.id)) -
            Number(preferred.has(left.player.id));
          return preference || right.availability - left.availability;
        });
        const primary = orderedTargets[0];
        if (!primary) return [];
        return [{
          round: round.round,
          pickNumber: round.pickNumber,
          primary: primary.player,
          alternatives: orderedTargets
            .slice(1, 3)
            .map((target) => target.player),
          availability: Math.round(primary.availability * 100),
        }];
      });
    return {
      slot: plan.slot,
      openingShape: plan.openingBuild,
      opportunityScore: plan.grade,
      turnRisk,
      advice:
        plan.rounds[0]?.instruction ??
        "Stay flexible and take the strongest remaining tier.",
      targets,
    };
  });
}

function draftGrade(
  team: TeamDraftState,
  board: PlayerIntelligence[],
) {
  const values: number[] = [];
  let earlySpecialists = 0;
  for (const pick of team.picks) {
    const player = findPlayerForPick(pick, board);
    if (!player) continue;
    const market = player.adp ?? player.ecr;
    if (market !== null) values.push(pick.pick_no - market);
    if (
      (player.position === "K" || player.position === "DST") &&
      pick.round < 10
    ) {
      earlySpecialists += 1;
    }
  }
  const averageValue = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
  const missing = team.needs.reduce((sum, need) => sum + need.missing, 0);
  return Math.round(
    Math.max(
      0,
      Math.min(
        100,
        78 + averageValue * 0.7 - missing * 7 - earlySpecialists * 5,
      ),
    ),
  );
}

export function runDraftSimulations({
  draft,
  users,
  rosters,
  picks,
  board,
  userRosterId,
  slotMap,
  controls,
  runs,
  seed = 2026,
}: DraftSimulationInput): DraftSimulationResult {
  const playerTotals = new Map<
    string,
    { player: PlayerIntelligence; count: number; rounds: number }
  >();
  const targets = new Set([
    ...controls.target,
    ...controls.queue.slice(0, 8),
  ]);
  const targetTotals = new Map<string, number>();
  const positionTotals: Record<DraftPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const grades: number[] = [];

  for (let run = 0; run < runs; run += 1) {
    const random = mulberry32(seed + run * 7_919);
    const working = [...picks];
    const teams = buildTeamDraftStates({
      draft,
      users,
      rosters,
      picks: working,
      slotMap,
    });
    let pool = availablePlayers(board, working);
    let guard = 0;
    while (guard < draft.settings.teams * draft.settings.rounds) {
      const cursor = getDraftCursor(draft, working, userRosterId, slotMap);
      if (cursor.complete || cursor.currentRosterId === null) break;
      const team = teams.find(
        (candidate) => candidate.rosterId === cursor.currentRosterId,
      );
      if (!team || !pool.length) break;
      let player: PlayerIntelligence | null | undefined;
      if (cursor.isUserTurn) {
        const recommendations = recommendPlayers({
          available: pool,
          allPlayers: board,
          teams,
          userRosterId,
          cursor,
          controls,
        });
        const ceiling = Math.min(3, recommendations.length);
        player =
          recommendations[
            Math.min(ceiling - 1, Math.floor(random() * ceiling))
          ]?.player;
      } else {
        player = chooseOpponentPlayer({
          available: pool,
          team,
          round: cursor.currentRound,
          random,
        });
      }
      if (!player) break;
      const simulatedPick = createSimulatedPick({
        draft,
        pickNumber: cursor.currentPick,
        player,
        rosterId: team.rosterId,
        ownerId: team.ownerId,
      });
      working.push(simulatedPick);
      pool = pool.filter((candidate) => candidate.id !== player.id);
      const teamIndex = teams.findIndex(
        (candidate) => candidate.rosterId === team.rosterId,
      );
      teams[teamIndex] = addDraftPickToTeamState(draft, team, simulatedPick);
      guard += 1;
    }

    const finalTeam = teams.find((team) => team.rosterId === userRosterId);
    if (!finalTeam) continue;
    grades.push(draftGrade(finalTeam, board));
    const hitTargets = new Set<string>();
    for (const pick of finalTeam.picks) {
      const player = findPlayerForPick(pick, board);
      if (!player) continue;
      const current = playerTotals.get(player.id);
      if (current) {
        current.count += 1;
        current.rounds += pick.round;
      } else {
        playerTotals.set(player.id, {
          player,
          count: 1,
          rounds: pick.round,
        });
      }
      if (player.position !== "—") positionTotals[player.position] += 1;
      if (targets.has(player.id)) hitTargets.add(player.id);
    }
    for (const playerId of hitTargets) {
      targetTotals.set(playerId, (targetTotals.get(playerId) ?? 0) + 1);
    }
  }

  const completed = Math.max(1, grades.length);
  const lookup = playerLookup(board);
  return {
    runs: grades.length,
    averageGrade: Math.round(
      grades.reduce((sum, grade) => sum + grade, 0) / completed,
    ),
    bestGrade: grades.length ? Math.max(...grades) : 0,
    worstGrade: grades.length ? Math.min(...grades) : 0,
    averageBuild: Object.fromEntries(
      DRAFT_POSITIONS.map((position) => [
        position,
        Number((positionTotals[position] / completed).toFixed(1)),
      ]),
    ) as Record<DraftPosition, number>,
    commonPlayers: [...playerTotals.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 10)
      .map(({ player, count, rounds }) => ({
        player,
        rate: Math.round((count / completed) * 100),
        averageRound: Number((rounds / count).toFixed(1)),
      })),
    targetRates: [...targets]
      .flatMap((playerId) => {
        const player = lookup.byId.get(playerId);
        return player
          ? [{
              player,
              rate: Math.round(
                ((targetTotals.get(playerId) ?? 0) / completed) * 100,
              ),
            }]
          : [];
      })
      .sort((left, right) => right.rate - left.rate),
  };
}

function simulationGrade(
  players: PlayerIntelligence[],
  draft: Draft,
) {
  const quality = players.reduce(
    (total, player) =>
      total +
      Math.max(
        0,
        180 - (player.ecr ?? player.adp ?? 180),
      ),
    0,
  );
  const expectedPicks = Math.max(1, draft.settings.rounds);
  return Math.round(Math.min(99, 52 + quality / expectedPicks / 2.7));
}

export function runDraftSimulationsDetailed({
  runs,
  controls,
  ...input
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  picks: SleeperDraftPick[];
  board: PlayerIntelligence[];
  userRosterId: number;
  slotMap: Record<string, number>;
  controls: DraftControlState;
  runs: number;
}): DraftSimulationResult {
  const playerOutcomes = new Map<
    string,
    { player: PlayerIntelligence; count: number; rounds: number }
  >();
  const grades: number[] = [];
  const buildTotals: Record<DraftPosition, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0,
  };
  const targetIds = new Set([...controls.target, ...controls.queue]);
  const targetHits = new Map<string, number>();
  const baseLookup = playerLookup(input.board);

  for (let run = 0; run < runs; run += 1) {
    const picks = [...input.picks];
    let guard = 0;
    while (guard < input.draft.settings.teams * input.draft.settings.rounds * 2) {
      guard += 1;
      const cursor = getDraftCursor(
        input.draft,
        picks,
        input.userRosterId,
        input.slotMap,
      );
      if (cursor.complete) break;
      if (cursor.isUserTurn) {
        const teams = buildTeamDraftStates({
          draft: input.draft,
          users: input.users,
          rosters: input.rosters,
          picks,
          slotMap: input.slotMap,
        });
        const pool = availablePlayers(input.board, picks);
        const recommendation = recommendPlayers({
          available: pool,
          allPlayers: input.board,
          teams,
          userRosterId: input.userRosterId,
          cursor,
          controls,
        })[Math.floor(mulberry32(run * 17_171 + cursor.currentPick)() * 2)] ??
          recommendPlayers({
            available: pool,
            allPlayers: input.board,
            teams,
            userRosterId: input.userRosterId,
            cursor,
            controls,
          })[0];
        if (!recommendation) break;
        const roster = input.rosters.find(
          (candidate) => candidate.roster_id === input.userRosterId,
        );
        picks.push(
          createSimulatedPick({
            draft: input.draft,
            pickNumber: cursor.currentPick,
            player: recommendation.player,
            rosterId: input.userRosterId,
            ownerId: roster?.owner_id ?? "",
          }),
        );
      } else {
        const selections = simulateOpponentSelections({
          ...input,
          picks,
          seed: 91_919 + run * 10_007 + cursor.currentPick * 97,
          horizon: 1,
        });
        if (!selections.length) break;
        picks.push(selections[0]);
      }
    }

    const userPlayers = picks
      .filter((pick) => Number(pick.roster_id) === input.userRosterId)
      .flatMap((pick) => {
        const player =
          baseLookup.byId.get(String(pick.player_id)) ??
          baseLookup.byName.get(normalizePlayerName(pickPlayerName(pick)));
        return player ? [{ player, round: pick.round }] : [];
      });
    grades.push(
      simulationGrade(
        userPlayers.map((outcome) => outcome.player),
        input.draft,
      ),
    );
    const seenTargets = new Set<string>();
    for (const { player, round } of userPlayers) {
      const current = playerOutcomes.get(player.id) ?? {
        player,
        count: 0,
        rounds: 0,
      };
      current.count += 1;
      current.rounds += round;
      playerOutcomes.set(player.id, current);
      if (player.position !== "—") buildTotals[player.position] += 1;
      if (targetIds.has(player.id)) seenTargets.add(player.id);
    }
    for (const playerId of seenTargets) {
      targetHits.set(playerId, (targetHits.get(playerId) ?? 0) + 1);
    }
  }

  const safeRuns = Math.max(1, runs);
  const commonPlayers = [...playerOutcomes.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 10)
    .map((outcome) => ({
      player: outcome.player,
      rate: Math.round((outcome.count / safeRuns) * 100),
      averageRound:
        Math.round((outcome.rounds / outcome.count) * 10) / 10,
    }));
  const targets = input.board.filter((player) => targetIds.has(player.id));
  return {
    runs,
    averageGrade:
      Math.round(grades.reduce((total, grade) => total + grade, 0) / safeRuns),
    bestGrade: grades.length ? Math.max(...grades) : 0,
    worstGrade: grades.length ? Math.min(...grades) : 0,
    averageBuild: Object.fromEntries(
      DRAFT_POSITIONS.map((position) => [
        position,
        Math.round((buildTotals[position] / safeRuns) * 10) / 10,
      ]),
    ) as Record<DraftPosition, number>,
    commonPlayers,
    targetRates: targets.map((player) => ({
      player,
      rate: Math.round(((targetHits.get(player.id) ?? 0) / safeRuns) * 100),
    })),
  };
}

export function buildSlotDraftPlansWithPreferences({
  draft,
  board,
  controls,
}: {
  draft: Draft;
  board: PlayerIntelligence[];
  controls: DraftControlState;
}): SlotDraftPlan[] {
  const detailed = buildAllSlotPlans({
    draft,
    board,
  });
  const preferred = new Set([
    ...controls.target,
    ...controls.queue,
    ...controls.sleeper,
  ]);

  return detailed.map((plan) => {
    const targets = plan.rounds.slice(0, 6).flatMap((round): SlotDraftTarget[] => {
      const orderedTargets = [...round.targets].sort((left, right) => {
        const preference =
          Number(preferred.has(right.player.id)) -
          Number(preferred.has(left.player.id));
        return preference || right.availability - left.availability;
      });
      const primary = orderedTargets[0]?.player;
      if (!primary) return [];
      return [{
        round: round.round,
        pickNumber: round.pickNumber,
        primary,
        alternatives: orderedTargets
          .map((target) => target.player)
          .filter((player) => player.id !== primary.id)
          .slice(0, 2),
        availability: Math.round((orderedTargets[0]?.availability ?? 0) * 100),
      }];
    });
    const confidence = plan.confidence;
    return {
      slot: plan.slot,
      opportunityScore: plan.grade,
      openingShape: plan.openingBuild,
      turnRisk:
        confidence >= 65 ? "Low turn risk" : confidence >= 42 ? "Balanced" : "Volatile",
      advice:
        plan.slot <= Math.ceil(draft.settings.teams / 3)
          ? "Use the early anchor, then prepare two-player pivots for the long turn."
          : plan.slot >= Math.ceil((draft.settings.teams * 2) / 3)
            ? "Exploit paired selections near the turn; pre-plan both picks together."
            : "Stay flexible in the middle and let positional runs pass when value falls.",
      targets,
    };
  });
}
