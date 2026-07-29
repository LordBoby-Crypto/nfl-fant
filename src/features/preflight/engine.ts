import type { PlayerBoardData } from "../player-intelligence/model";
import type {
  DraftPickTelemetry,
  LeagueSnapshot,
  LeagueSnapshotTelemetry,
} from "../../types";
import type { PlayerMatchCoverage } from "../../services/sleeper";

export type ReadinessLevel = "green" | "yellow" | "red";

export interface ReadinessCheck {
  id: string;
  group: "Sleeper feeds" | "FantasyPros" | "Draft setup" | "Reliability";
  label: string;
  level: ReadinessLevel;
  summary: string;
  detail: string;
  lastSuccessfulAt: number | null;
}

export interface ReadinessReport {
  overall: ReadinessLevel;
  headline: string;
  counts: Record<ReadinessLevel, number>;
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
}

export interface PreflightInput {
  snapshot: LeagueSnapshot;
  snapshotTelemetry: LeagueSnapshotTelemetry | null;
  snapshotError: string | null;
  draftPicks: {
    fetchedAt: number | null;
    error: string | null;
    telemetry: DraftPickTelemetry | null;
    retainedAfterError: boolean;
  };
  board: PlayerBoardData | null;
  boardError: string | null;
  sessionExpiresAt: number | null;
  coverage: PlayerMatchCoverage | null;
  playerFeed: {
    error: string | null;
    durationMs: number | null;
    attempts: number | null;
    lastSuccessfulAt: number | null;
  };
  backend: {
    linked: boolean;
    configured: boolean;
    error: string | null;
    responseTimeMs: number | null;
    lastSuccessfulAt: number | null;
  };
  online: boolean;
  now?: number;
}

const LEVEL_ORDER: Record<ReadinessLevel, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

function ageLevel(
  timestamp: number | null,
  greenMs: number,
  yellowMs: number,
  now = Date.now(),
): ReadinessLevel {
  if (!timestamp) return "red";
  const age = now - timestamp;
  if (age <= greenMs) return "green";
  if (age <= yellowMs) return "yellow";
  return "red";
}

function ageText(timestamp: number | null, now: number) {
  if (!timestamp) return "No successful update recorded";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function datasetTime(board: PlayerBoardData | null, dataset: "rankings" | "projections") {
  const raw = board?.datasetFetchedAt[dataset];
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function expectedDraftRounds(snapshot: LeagueSnapshot) {
  const nonDraftSlots = new Set(["IR", "RESERVE", "TAXI"]);
  return snapshot.league.roster_positions.filter(
    (slot) => !nonDraftSlots.has(slot.toUpperCase()),
  ).length;
}

function settingCheck(snapshot: LeagueSnapshot): ReadinessCheck {
  const expectedRounds = expectedDraftRounds(snapshot);
  const roundsMatch = snapshot.draft.settings.rounds === expectedRounds;
  const teamsMatch =
    snapshot.draft.settings.teams === snapshot.league.total_rosters &&
    snapshot.league.settings.num_teams === snapshot.league.total_rosters;
  const redraft =
    snapshot.league.settings.max_keepers === 0 &&
    snapshot.draft.type === "snake";
  const ppr = snapshot.league.scoring_settings.rec === 1;
  const ready = roundsMatch && teamsMatch && redraft && ppr;
  return {
    id: "roster-settings",
    group: "Draft setup",
    label: "Roster and scoring settings",
    level: ready ? "green" : "red",
    summary: ready
      ? `${snapshot.league.total_rosters} teams · Full PPR · redraft`
      : "Sleeper settings conflict with the War Room model",
    detail: `${snapshot.draft.settings.rounds}/${expectedRounds} draft rounds · ${snapshot.draft.settings.teams}/${snapshot.league.total_rosters} teams · ${snapshot.league.settings.max_keepers} keepers.`,
    lastSuccessfulAt: snapshot.fetchedAt,
  };
}

export function buildReadinessReport(input: PreflightInput): ReadinessReport {
  const now = input.now ?? Date.now();
  const drafting = input.snapshot.draft.status === "drafting";
  const snapshotFreshness = ageLevel(
    input.snapshot.fetchedAt,
    drafting ? 30_000 : 5 * 60_000,
    drafting ? 90_000 : 15 * 60_000,
    now,
  );
  const pickFreshness = ageLevel(
    input.draftPicks.fetchedAt,
    drafting ? 15_000 : 2 * 60_000,
    drafting ? 45_000 : 10 * 60_000,
    now,
  );
  const rankingsAt = datasetTime(input.board, "rankings");
  const projectionsAt = datasetTime(input.board, "projections");
  const sessionRemaining = input.sessionExpiresAt
    ? input.sessionExpiresAt - now
    : 0;
  const timer = input.snapshot.draft.settings.pick_timer;
  const coverage = input.coverage?.percentage ?? 0;

  const checks: ReadinessCheck[] = [
    {
      id: "sleeper-league",
      group: "Sleeper feeds",
      label: "League feed",
      level: input.snapshotError
        ? snapshotFreshness === "red" ? "red" : "yellow"
        : snapshotFreshness,
      summary: input.snapshotError
        ? "Latest request failed; retained the last league snapshot"
        : `${input.snapshot.league.name} is responding`,
      detail: `Last successful update ${ageText(input.snapshot.fetchedAt, now)} · ${input.snapshotTelemetry?.league.durationMs ?? "—"} ms · ${input.snapshotTelemetry?.league.attempts ?? "—"} attempt(s).`,
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    {
      id: "sleeper-draft",
      group: "Sleeper feeds",
      label: "Draft feed",
      level: input.snapshotError ? "yellow" : "green",
      summary: `${input.snapshot.draft.status.replace("_", " ")} · ${input.snapshot.draft.type}`,
      detail: `${input.snapshotTelemetry?.draft.durationMs ?? "—"} ms · ${input.snapshotTelemetry?.draft.attempts ?? "—"} attempt(s) · draft ${input.snapshot.draft.draft_id}.`,
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    {
      id: "sleeper-picks",
      group: "Sleeper feeds",
      label: "Pick feed and recovery",
      level: input.draftPicks.error
        ? input.draftPicks.fetchedAt ? "yellow" : "red"
        : pickFreshness,
      summary: input.draftPicks.retainedAfterError
        ? "Last complete pick board retained during a bad response"
        : "Unique picks reconcile safely by pick number",
      detail: `Last successful update ${ageText(input.draftPicks.fetchedAt, now)} · up to 3 automatic attempts · ${input.draftPicks.telemetry?.retained ?? 0} pick(s) retained.`,
      lastSuccessfulAt: input.draftPicks.fetchedAt,
    },
    {
      id: "sleeper-players",
      group: "Sleeper feeds",
      label: "Player catalog feed",
      level: input.playerFeed.error
        ? input.playerFeed.lastSuccessfulAt ? "yellow" : "red"
        : input.coverage ? "green" : "yellow",
      summary: input.playerFeed.error
        ? "Latest player catalog request failed"
        : input.coverage
          ? `${input.coverage.total} ranked players checked`
          : "Waiting for the unlocked FantasyPros board",
      detail: input.playerFeed.error
        ? input.playerFeed.error
        : `${input.playerFeed.durationMs ?? "—"} ms · ${input.playerFeed.attempts ?? "—"} attempt(s) · last successful update ${ageText(input.playerFeed.lastSuccessfulAt, now)}.`,
      lastSuccessfulAt: input.playerFeed.lastSuccessfulAt,
    },
    {
      id: "fantasypros-rankings",
      group: "FantasyPros",
      label: "Rankings freshness",
      level: input.boardError
        ? rankingsAt ? "yellow" : "red"
        : ageLevel(rankingsAt, 8 * 60 * 60_000, 24 * 60 * 60_000, now),
      summary: rankingsAt
        ? `Last successful provider update ${ageText(rankingsAt, now)}`
        : "Rankings have not loaded",
      detail: input.board?.datasetErrors.rankings ??
        "Green under 8 hours · yellow under 24 hours · red after 24 hours.",
      lastSuccessfulAt: rankingsAt,
    },
    {
      id: "fantasypros-projections",
      group: "FantasyPros",
      label: "Projection freshness",
      level: input.boardError
        ? projectionsAt ? "yellow" : "red"
        : ageLevel(projectionsAt, 8 * 60 * 60_000, 24 * 60 * 60_000, now),
      summary: projectionsAt
        ? `Last successful provider update ${ageText(projectionsAt, now)}`
        : "Projections have not loaded",
      detail: input.board?.datasetErrors.projections ??
        "Rest-of-season PPR projections are checked separately from rankings.",
      lastSuccessfulAt: projectionsAt,
    },
    {
      id: "player-matching",
      group: "FantasyPros",
      label: "FantasyPros → Sleeper matching",
      level: !input.coverage
        ? "red"
        : coverage >= 95
          ? "green"
          : coverage >= 90
            ? "yellow"
            : "red",
      summary: input.coverage
        ? `${coverage.toFixed(1)}% matched (${input.coverage.matched}/${input.coverage.total})`
        : "Match coverage is unavailable",
      detail: input.coverage?.unmatched.length
        ? `Review unmatched: ${input.coverage.unmatched.join(", ")}.`
        : "Top 350 ranked, draft-eligible players are compared by provider ID, normalized name and position.",
      lastSuccessfulAt: input.playerFeed.lastSuccessfulAt,
    },
    {
      id: "draft-date",
      group: "Draft setup",
      label: "Draft date",
      level: input.snapshot.draft.start_time ? "green" : "red",
      summary: input.snapshot.draft.start_time
        ? new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(input.snapshot.draft.start_time)
        : "Not scheduled in Sleeper",
      detail: input.snapshot.draft.start_time
        ? "The start time is published and available to the War Room."
        : "Schedule the draft in Sleeper before draft day.",
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    {
      id: "draft-order",
      group: "Draft setup",
      label: "Draft order",
      level: input.snapshot.draft.draft_order ? "green" : "red",
      summary: input.snapshot.draft.draft_order
        ? `${Object.keys(input.snapshot.draft.draft_order).length} slots assigned`
        : "Not assigned in Sleeper",
      detail: input.snapshot.draft.draft_order
        ? "Every recommendation can calculate the exact next turn."
        : "Assign the order so live turn forecasts can be verified.",
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    {
      id: "draft-rounds",
      group: "Draft setup",
      label: "Rounds",
      level:
        input.snapshot.draft.settings.rounds === expectedDraftRounds(input.snapshot)
          ? "green"
          : "red",
      summary: `${input.snapshot.draft.settings.rounds} configured · ${expectedDraftRounds(input.snapshot)} expected`,
      detail: "Rounds must match all draftable starter and bench roster slots.",
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    {
      id: "draft-timer",
      group: "Draft setup",
      label: "Pick timer",
      level: timer <= 0
        ? "red"
        : timer > 15 * 60
          ? "yellow"
          : "green",
      summary: timer >= 3600
        ? `${Math.round(timer / 3600)} hour${Math.round(timer / 3600) === 1 ? "" : "s"} per pick`
        : `${timer} seconds per pick`,
      detail: timer > 15 * 60
        ? "This looks like a slow draft. Confirm it is intentional in Sleeper."
        : timer > 0
          ? "The timer is suitable for a live draft."
          : "Sleeper does not have an active pick timer.",
      lastSuccessfulAt: input.snapshot.fetchedAt,
    },
    settingCheck(input.snapshot),
    {
      id: "session",
      group: "Reliability",
      label: "War Room session",
      level: sessionRemaining <= 0
        ? "red"
        : sessionRemaining < 30 * 60_000
          ? "yellow"
          : "green",
      summary: sessionRemaining > 0
        ? `${Math.max(1, Math.floor(sessionRemaining / 60_000))} minutes remaining`
        : "Locked or expired",
      detail: sessionRemaining > 0
        ? "Renew before the draft if less than 30 minutes remain."
        : "Unlock the War Room to test FantasyPros and player matching.",
      lastSuccessfulAt: input.sessionExpiresAt ? now : null,
    },
    {
      id: "internet-backend",
      group: "Reliability",
      label: "Internet and backend latency",
      level: !input.online || !input.backend.linked || input.backend.error
        ? "red"
        : !input.backend.configured ||
            (input.backend.responseTimeMs ?? Number.MAX_SAFE_INTEGER) > 4_000
          ? "red"
          : (input.backend.responseTimeMs ?? Number.MAX_SAFE_INTEGER) > 1_500
            ? "yellow"
            : "green",
      summary: !input.online
        ? "Browser is offline"
        : input.backend.error
          ? "Backend request failed"
          : `${input.backend.responseTimeMs ?? "—"} ms response`,
      detail: input.backend.error ??
        `${input.backend.configured ? "FantasyPros configured" : "FantasyPros is not configured"} · last successful update ${ageText(input.backend.lastSuccessfulAt, now)}.`,
      lastSuccessfulAt: input.backend.lastSuccessfulAt,
    },
  ];

  const counts = checks.reduce<Record<ReadinessLevel, number>>(
    (result, check) => {
      result[check.level] += 1;
      return result;
    },
    { green: 0, yellow: 0, red: 0 },
  );
  const overall = checks.reduce<ReadinessLevel>(
    (current, check) =>
      LEVEL_ORDER[check.level] > LEVEL_ORDER[current] ? check.level : current,
    "green",
  );
  const blockers = checks.filter((check) => check.level === "red");
  const warnings = checks.filter((check) => check.level === "yellow");

  return {
    overall,
    headline:
      overall === "green"
        ? "Ready for draft day"
        : overall === "yellow"
          ? "Ready with warnings"
          : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} before draft day`,
    counts,
    checks,
    blockers,
    warnings,
  };
}
