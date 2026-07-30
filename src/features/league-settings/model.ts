import type { LeagueSnapshot, Roster } from "../../types";

export type SettingsChangeCategory =
  | "Draft"
  | "Roster"
  | "Scoring"
  | "Team";

export interface SettingsChange {
  category: SettingsChangeCategory;
  label: string;
  before: string;
  after: string;
  recommendationImpact: string;
}

export interface ModelingLimitation {
  id: string;
  level: "warning" | "blocked";
  label: string;
  detail: string;
}

export interface LeagueSettingsModel {
  fingerprint: string;
  teamCount: number;
  rounds: number;
  draftFormat: LeagueSnapshot["draft"]["type"];
  pickTimer: number;
  rosterPositions: string[];
  starterPositions: string[];
  rosterCounts: Record<string, number>;
  benchSlots: number;
  irSlots: number;
  taxiSlots: number;
  keeperLimit: number;
  keeperCount: number;
  flexSlots: number;
  superFlexSlots: number;
  idpSlots: number;
  scoring: Array<{ key: string; value: number }>;
  scoringLabel: string;
  user: {
    userId: string;
    rosterId: number | null;
    displayName: string;
    teamName: string;
    draftPosition: number | null;
  };
  limitations: ModelingLimitation[];
}

const BENCH = new Set(["BN", "BENCH"]);
const RESERVE = new Set(["IR", "RESERVE"]);
const TAXI = new Set(["TAXI"]);
const FLEX = new Set(["FLEX", "WRRB_FLEX", "REC_FLEX", "WRRBTE_FLEX"]);
const SUPER_FLEX = new Set(["SUPER_FLEX", "OP"]);
const IDP = new Set([
  "DL",
  "DE",
  "DT",
  "LB",
  "DB",
  "CB",
  "S",
  "IDP_FLEX",
]);
const MODELED_ROSTER_SLOTS = new Set([
  "QB",
  "RB",
  "FB",
  "WR",
  "TE",
  "K",
  "DEF",
  "DST",
  ...BENCH,
  ...RESERVE,
  ...TAXI,
  ...FLEX,
  ...SUPER_FLEX,
  ...IDP,
]);

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function countPositions(positions: string[]) {
  return positions.reduce<Record<string, number>>((counts, raw) => {
    const position = raw.toUpperCase();
    counts[position] = (counts[position] ?? 0) + 1;
    return counts;
  }, {});
}

function userRoster(snapshot: LeagueSnapshot, userId: string) {
  return snapshot.rosters.find(
    (roster) =>
      roster.owner_id === userId || roster.co_owners?.includes(userId),
  );
}

function keeperIds(rosters: Roster[]) {
  return new Set(
    rosters.flatMap((roster) => roster.keepers ?? []).filter(Boolean),
  );
}

function receptionLabel(scoring: Record<string, number | undefined>) {
  const receptions = finite(scoring.rec);
  const tightEndBonus = finite(scoring.bonus_rec_te);
  if (receptions === 0) return "Standard";
  if (receptions === 0.5) {
    return tightEndBonus ? `Half PPR + ${tightEndBonus} TE premium` : "Half PPR";
  }
  if (receptions === 1) {
    return tightEndBonus ? `Full PPR + ${tightEndBonus} TE premium` : "Full PPR";
  }
  return `${receptions} points per reception`;
}

function stableFingerprint(value: unknown) {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, visit(nested)]),
    );
  };
  return JSON.stringify(visit(value));
}

export function buildLeagueSettingsModel(
  snapshot: LeagueSnapshot,
  userId: string,
): LeagueSettingsModel {
  const rosterPositions = snapshot.league.roster_positions.map((position) =>
    position.toUpperCase()
  );
  const rosterCounts = countPositions(rosterPositions);
  const roster = userRoster(snapshot, userId);
  const user = snapshot.users.find((candidate) => candidate.user_id === userId);
  const teamCount =
    finite(snapshot.draft.settings.teams) ||
    finite(snapshot.league.settings.num_teams) ||
    snapshot.league.total_rosters;
  const benchSlots =
    [...BENCH].reduce((total, slot) => total + (rosterCounts[slot] ?? 0), 0) ||
    finite(snapshot.draft.settings.slots_bn);
  const irSlots = Math.max(
    finite(snapshot.league.settings.reserve_slots),
    [...RESERVE].reduce(
      (total, slot) => total + (rosterCounts[slot] ?? 0),
      0,
    ),
  );
  const taxiSlots = Math.max(
    finite(snapshot.league.settings.taxi_slots),
    [...TAXI].reduce(
      (total, slot) => total + (rosterCounts[slot] ?? 0),
      0,
    ),
  );
  const flexSlots = [...FLEX].reduce(
    (total, slot) => total + (rosterCounts[slot] ?? 0),
    0,
  );
  const superFlexSlots = [...SUPER_FLEX].reduce(
    (total, slot) => total + (rosterCounts[slot] ?? 0),
    0,
  );
  const idpSlots = [...IDP].reduce(
    (total, slot) => total + (rosterCounts[slot] ?? 0),
    0,
  );
  const unknownSlots = Object.keys(rosterCounts).filter(
    (slot) => !MODELED_ROSTER_SLOTS.has(slot),
  );
  const limitations: ModelingLimitation[] = [];
  if (snapshot.draft.type === "auction") {
    limitations.push({
      id: "auction",
      level: "blocked",
      label: "Auction bidding",
      detail:
        "Sleeper auction settings are imported, but the current pick-by-pick recommendation engine cannot model nominations, budgets or winning bids.",
    });
  }
  if (unknownSlots.length) {
    limitations.push({
      id: "unknown-roster-slots",
      level: "warning",
      label: "Unknown roster slot",
      detail: `Sleeper returned ${unknownSlots.join(", ")}. Those slots are displayed but excluded from positional-need calculations.`,
    });
  }
  if (!roster) {
    limitations.push({
      id: "user-roster",
      level: "blocked",
      label: "Your Sleeper team was not found",
      detail:
        "League-wide settings are available, but personalized recommendations require a roster owned or co-owned by the connected Sleeper user.",
    });
  }

  const scoring = Object.entries(snapshot.league.scoring_settings)
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value }));
  const draftPosition =
    finite(snapshot.draft.draft_order?.[userId]) || null;
  const teamName =
    user?.metadata?.team_name?.trim() ||
    user?.display_name ||
    (roster ? `Roster ${roster.roster_id}` : "Not connected");
  const fingerprint = stableFingerprint({
    leagueId: snapshot.league.league_id,
    teamCount,
    rounds: snapshot.draft.settings.rounds,
    draftFormat: snapshot.draft.type,
    pickTimer: snapshot.draft.settings.pick_timer,
    rosterPositions,
    reserveSlots: irSlots,
    taxiSlots,
    keeperLimit: snapshot.league.settings.max_keepers,
    scoring,
    userRosterId: roster?.roster_id ?? null,
    draftPosition,
  });

  return {
    fingerprint,
    teamCount,
    rounds: finite(snapshot.draft.settings.rounds),
    draftFormat: snapshot.draft.type,
    pickTimer: finite(snapshot.draft.settings.pick_timer),
    rosterPositions,
    starterPositions: rosterPositions.filter(
      (position) =>
        !BENCH.has(position) &&
        !RESERVE.has(position) &&
        !TAXI.has(position),
    ),
    rosterCounts,
    benchSlots,
    irSlots,
    taxiSlots,
    keeperLimit: finite(snapshot.league.settings.max_keepers),
    keeperCount: keeperIds(snapshot.rosters).size,
    flexSlots,
    superFlexSlots,
    idpSlots,
    scoring,
    scoringLabel: receptionLabel(snapshot.league.scoring_settings),
    user: {
      userId,
      rosterId: roster?.roster_id ?? null,
      displayName: user?.display_name ?? "Connected Sleeper user",
      teamName,
      draftPosition,
    },
    limitations,
  };
}

function summarizeRoster(model: LeagueSettingsModel) {
  return `${model.starterPositions.join(" · ")} | ${model.benchSlots} bench | ${model.irSlots} IR | ${model.taxiSlots} taxi`;
}

function summarizeScoring(model: LeagueSettingsModel) {
  return `${model.scoringLabel} · ${model.scoring.length} scoring rules`;
}

function scoringChanges(
  previous: LeagueSettingsModel,
  next: LeagueSettingsModel,
) {
  const before = new Map(previous.scoring.map((item) => [item.key, item.value]));
  const after = new Map(next.scoring.map((item) => [item.key, item.value]));
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((key) => before.get(key) !== after.get(key))
    .map((key) => ({
      key,
      before: before.get(key),
      after: after.get(key),
    }));
}

export function diffLeagueSettings(
  previous: LeagueSettingsModel,
  next: LeagueSettingsModel,
): SettingsChange[] {
  const changes: SettingsChange[] = [];
  const add = (
    category: SettingsChangeCategory,
    label: string,
    before: string | number,
    after: string | number,
    recommendationImpact: string,
  ) => {
    if (String(before) === String(after)) return;
    changes.push({
      category,
      label,
      before: String(before),
      after: String(after),
      recommendationImpact,
    });
  };

  add(
    "Draft",
    "Team count",
    previous.teamCount,
    next.teamCount,
    "Turn spacing, positional demand and replacement levels were rebuilt.",
  );
  add(
    "Draft",
    "Rounds",
    previous.rounds,
    next.rounds,
    "The draft board length, late-round timing and roster plan were rebuilt.",
  );
  add(
    "Draft",
    "Draft format",
    previous.draftFormat,
    next.draftFormat,
    "Pick order and every future-turn calculation were rebuilt.",
  );
  add(
    "Draft",
    "Pick timer",
    previous.pickTimer,
    next.pickTimer,
    "Refresh urgency changed; player ordering was not otherwise changed.",
  );
  add(
    "Roster",
    "Roster positions",
    summarizeRoster(previous),
    summarizeRoster(next),
    "Starter needs, FLEX/SUPER_FLEX eligibility, bench balance and scarcity were rebuilt.",
  );
  add(
    "Roster",
    "Keeper limit",
    previous.keeperLimit,
    next.keeperLimit,
    "Keeper players are counted on rosters and removed from the available pool.",
  );
  const scoringDiff = scoringChanges(previous, next);
  if (scoringDiff.length) {
    changes.push({
      category: "Scoring",
      label: "Scoring configuration",
      before: `${summarizeScoring(previous)} · ${scoringDiff
        .map((item) => `${item.key} ${item.before ?? "unset"}`)
        .join(", ")}`,
      after: `${summarizeScoring(next)} · ${scoringDiff
        .map((item) => `${item.key} ${item.after ?? "unset"}`)
        .join(", ")}`,
      recommendationImpact:
        "Projected points, positional ranks, replacement values and tiers were rebuilt from the new scoring rules.",
    });
  }
  add(
    "Team",
    "Your team",
    `${previous.user.teamName} · slot ${previous.user.draftPosition ?? "pending"}`,
    `${next.user.teamName} · slot ${next.user.draftPosition ?? "pending"}`,
    "Your turn forecast and personalized roster needs were rebuilt.",
  );
  return changes;
}

export function settingsFingerprint(
  snapshot: LeagueSnapshot,
  userId: string,
) {
  return buildLeagueSettingsModel(snapshot, userId).fingerprint;
}

export function humanizeSleeperSetting(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace("Td", "TD")
    .replace("Yd", "Yards")
    .replace("Int", "Interception")
    .replace("Fgm", "Field Goal")
    .replace("Xpm", "Extra Point");
}
