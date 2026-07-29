import type {
  Draft,
  DraftPickTelemetry,
  FeedTelemetry,
  League,
  LeagueSnapshot,
  LeagueSnapshotTelemetry,
  LeagueUser,
  NflState,
  Roster,
  SleeperDraftPick,
  SleeperMatchup,
  SleeperPlayer,
  SleeperTransaction,
  SleeperTrendingPlayer,
  WeeklyOutlook,
} from "../types";
import type { PlayerIntelligence } from "../features/player-intelligence/model";
import { normalizePlayerName } from "../features/live-draft/engine.ts";
import { withAutomaticRetry } from "./reliability.ts";

export const LEAGUE_ID = "1387560115116208128";
export const USER_ID = "1340097308699664384";
export const USERNAME = "kingboby";

const API_ROOT = "https://api.sleeper.app/v1";
const PLAYER_CACHE_KEY = "war-room.sleeper-players.v1";
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000;

interface PlayerCache {
  fetchedAt: number;
  players: Record<string, SleeperPlayer>;
}

interface SleeperResponse<T> extends FeedTelemetry {
  value: T;
}

let catalogMemoryCache: Record<string, SleeperPlayer> | null = null;
let catalogFetchedAt: number | null = null;

async function getJsonWithTelemetry<T>(
  path: string,
  signal?: AbortSignal,
): Promise<SleeperResponse<T>> {
  const result = await withAutomaticRetry(
    async () => {
      const response = await fetch(`${API_ROOT}${path}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        const error = new Error(`Sleeper returned ${response.status}`);
        error.name = response.status >= 500 || response.status === 429
          ? "SleeperRetryable"
          : "SleeperRequest";
        throw error;
      }
      return response.json() as Promise<T>;
    },
    {
      attempts: 3,
      baseDelayMs: 250,
      signal,
      shouldRetry: (error) =>
        error instanceof TypeError ||
        (error instanceof Error && error.name === "SleeperRetryable"),
    },
  );
  return {
    value: result.value,
    attempts: result.attempts,
    durationMs: result.durationMs,
  };
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return (await getJsonWithTelemetry<T>(path, signal)).value;
}

export async function getLeagueSnapshot(
  signal?: AbortSignal,
): Promise<LeagueSnapshot> {
  return (await getLeagueSnapshotWithTelemetry(signal)).snapshot;
}

export async function getLeagueSnapshotWithTelemetry(
  signal?: AbortSignal,
): Promise<{
  snapshot: LeagueSnapshot;
  telemetry: LeagueSnapshotTelemetry;
}> {
  const startedAt = Date.now();
  const leagueResult = await getJsonWithTelemetry<League>(
    `/league/${LEAGUE_ID}`,
    signal,
  );
  const [usersResult, rostersResult, draftResult] = await Promise.all([
    getJsonWithTelemetry<LeagueUser[]>(`/league/${LEAGUE_ID}/users`, signal),
    getJsonWithTelemetry<Roster[]>(`/league/${LEAGUE_ID}/rosters`, signal),
    getJsonWithTelemetry<Draft>(`/draft/${leagueResult.value.draft_id}`, signal),
  ]);

  return {
    snapshot: {
      league: leagueResult.value,
      draft: draftResult.value,
      users: usersResult.value,
      rosters: rostersResult.value,
      fetchedAt: Date.now(),
    },
    telemetry: {
      league: leagueResult,
      draft: draftResult,
      users: usersResult,
      rosters: rostersResult,
      totalDurationMs: Date.now() - startedAt,
    },
  };
}

export async function getDraftPicks(
  draftId: string,
  signal?: AbortSignal,
): Promise<SleeperDraftPick[]> {
  return (await getDraftPicksWithTelemetry(draftId, signal)).picks;
}

export async function getDraftPicksWithTelemetry(
  draftId: string,
  signal?: AbortSignal,
): Promise<{
  picks: SleeperDraftPick[];
  telemetry: DraftPickTelemetry;
}> {
  const result = await getJsonWithTelemetry<SleeperDraftPick[]>(
    `/draft/${draftId}/picks`,
    signal,
  );
  const picks = deduplicateDraftPicks(result.value);
  return {
    picks,
    telemetry: {
      attempts: result.attempts,
      durationMs: result.durationMs,
      received: result.value.length,
      unique: picks.length,
      retained: 0,
    },
  };
}

export function deduplicateDraftPicks(picks: SleeperDraftPick[]) {
  const byPick = new Map<number, SleeperDraftPick>();
  for (const pick of picks) {
    if (!Number.isFinite(pick.pick_no) || pick.pick_no < 1) continue;
    byPick.set(pick.pick_no, pick);
  }
  return [...byPick.values()].sort((left, right) => left.pick_no - right.pick_no);
}

export function reconcileDraftPicks(
  previous: SleeperDraftPick[],
  incoming: SleeperDraftPick[],
) {
  const stablePrevious = deduplicateDraftPicks(previous);
  const stableIncoming = deduplicateDraftPicks(incoming);
  const previousLast = stablePrevious.at(-1)?.pick_no ?? 0;
  const incomingLast = stableIncoming.at(-1)?.pick_no ?? 0;

  if (
    stablePrevious.length &&
    (stableIncoming.length < stablePrevious.length || incomingLast < previousLast)
  ) {
    return {
      picks: stablePrevious,
      retained: stablePrevious.length - stableIncoming.length,
      regressed: true,
    };
  }
  return {
    picks: stableIncoming,
    retained: 0,
    regressed: false,
  };
}

export async function getWaiverActivity(
  leagueId: string,
  signal?: AbortSignal,
) {
  const state = await getJson<NflState>("/state/nfl", signal);
  const currentWeek = Math.max(1, state.week || state.display_week || state.leg || 1);
  const weeks = [...new Set([Math.max(1, currentWeek - 1), currentWeek])];
  const [transactionsByWeek, trendingAdds] = await Promise.all([
    Promise.all(
      weeks.map((week) =>
        getJson<SleeperTransaction[]>(
          `/league/${leagueId}/transactions/${week}`,
          signal,
        ),
      ),
    ),
    getJson<SleeperTrendingPlayer[]>(
      "/players/nfl/trending/add?lookback_hours=24&limit=100",
      signal,
    ),
  ]);

  return {
    state,
    transactions: transactionsByWeek.flat(),
    trendingAdds,
    fetchedAt: Date.now(),
  };
}

export async function getWeeklyOutlook(
  leagueId: string,
  playoffWeekStart: number,
  signal?: AbortSignal,
): Promise<WeeklyOutlook> {
  const regularSeasonWeeks = Math.max(1, playoffWeekStart - 1);
  const statePromise = getJson<NflState>("/state/nfl", signal);
  const weeks = Array.from(
    { length: regularSeasonWeeks },
    (_, index) => index + 1,
  );
  const [state, matchups] = await Promise.all([
    statePromise,
    Promise.all(
      weeks.map((week) =>
        getJson<SleeperMatchup[]>(
          `/league/${leagueId}/matchups/${week}`,
          signal,
        ),
      ),
    ),
  ]);
  const currentWeek = Math.min(
    regularSeasonWeeks,
    Math.max(1, state.week || state.display_week || state.leg || 1),
  );

  return {
    state,
    currentWeek,
    regularSeasonWeeks,
    matchupsByWeek: Object.fromEntries(
      weeks.map((week, index) => [week, matchups[index]]),
    ),
    fetchedAt: Date.now(),
  };
}

function readPlayerCache(): PlayerCache | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(PLAYER_CACHE_KEY) ?? "null",
    ) as PlayerCache | null;
    return value &&
      typeof value.fetchedAt === "number" &&
      value.players &&
      typeof value.players === "object"
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function getSleeperPlayerCatalog(signal?: AbortSignal) {
  if (catalogMemoryCache) {
    return {
      players: catalogMemoryCache,
      telemetry: { attempts: 1, durationMs: 0 },
      cached: true,
      fetchedAt: catalogFetchedAt ?? Date.now(),
    };
  }
  const result = await getJsonWithTelemetry<Record<string, SleeperPlayer>>(
    "/players/nfl",
    signal,
  );
  catalogMemoryCache = result.value;
  catalogFetchedAt = Date.now();
  return {
    players: result.value,
    telemetry: {
      attempts: result.attempts,
      durationMs: result.durationMs,
    },
    cached: false,
    fetchedAt: catalogFetchedAt,
  };
}

export interface PlayerMatchCoverage {
  matched: number;
  total: number;
  percentage: number;
  unmatched: string[];
}

export function calculatePlayerMatchCoverage(
  fantasyProsPlayers: PlayerIntelligence[],
  sleeperPlayers: Record<string, SleeperPlayer>,
): PlayerMatchCoverage {
  const eligible = fantasyProsPlayers
    .filter((player) => player.position !== "—" && player.ecr !== null)
    .sort(
      (left, right) =>
        (left.ecr ?? Number.MAX_SAFE_INTEGER) -
        (right.ecr ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 350);
  const sleeperByName = new Map<string, SleeperPlayer[]>();
  for (const sleeper of Object.values(sleeperPlayers)) {
    const name =
      sleeper.full_name?.trim() ||
      [sleeper.first_name, sleeper.last_name].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const key = normalizePlayerName(name);
    const existing = sleeperByName.get(key);
    if (existing) existing.push(sleeper);
    else sleeperByName.set(key, [sleeper]);
  }
  const unmatched: string[] = [];
  let matched = 0;
  for (const player of eligible) {
    const direct = sleeperPlayers[String(player.id)];
    const candidates = sleeperByName.get(normalizePlayerName(player.name)) ?? [];
    const samePosition = candidates.some((candidate) => {
      const position = candidate.position === "DEF" ? "DST" : candidate.position;
      return position === player.position;
    });
    if (direct || samePosition) matched += 1;
    else if (unmatched.length < 8) unmatched.push(player.name);
  }
  return {
    matched,
    total: eligible.length,
    percentage: eligible.length
      ? Math.round((matched / eligible.length) * 1000) / 10
      : 0,
    unmatched,
  };
}

export async function getSleeperPlayersByIds(
  playerIds: string[],
  signal?: AbortSignal,
) {
  const ids = [...new Set(playerIds.map(String).filter(Boolean))];
  if (!ids.length) return {};

  const cached = readPlayerCache();
  const cacheIsFresh =
    cached && Date.now() - cached.fetchedAt < PLAYER_CACHE_TTL;
  if (cacheIsFresh && ids.every((id) => cached.players[id])) {
    return Object.fromEntries(
      ids.flatMap((id) => cached.players[id] ? [[id, cached.players[id]]] : []),
    );
  }

  const catalog = (await getSleeperPlayerCatalog(signal)).players;
  const selected = Object.fromEntries(
    ids.flatMap((id) => catalog[id] ? [[id, catalog[id]]] : []),
  );
  try {
    localStorage.setItem(
      PLAYER_CACHE_KEY,
      JSON.stringify({
        fetchedAt: Date.now(),
        players: {
          ...(cached?.players ?? {}),
          ...selected,
        },
      } satisfies PlayerCache),
    );
  } catch {
    // The analysis still works when browser storage is unavailable or full.
  }
  return selected;
}

export function getUserRoster(snapshot: LeagueSnapshot): Roster | undefined {
  return snapshot.rosters.find((roster) => roster.owner_id === USER_ID);
}

export function getDraftPosition(
  snapshot: LeagueSnapshot,
): number | undefined {
  return snapshot.draft.draft_order?.[USER_ID];
}
