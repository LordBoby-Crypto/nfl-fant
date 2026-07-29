import type {
  Draft,
  League,
  LeagueSnapshot,
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

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Sleeper returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getLeagueSnapshot(
  signal?: AbortSignal,
): Promise<LeagueSnapshot> {
  const [league, users, rosters] = await Promise.all([
    getJson<League>(`/league/${LEAGUE_ID}`, signal),
    getJson<LeagueUser[]>(`/league/${LEAGUE_ID}/users`, signal),
    getJson<Roster[]>(`/league/${LEAGUE_ID}/rosters`, signal),
  ]);

  const draft = await getJson<Draft>(`/draft/${league.draft_id}`, signal);

  return {
    league,
    draft,
    users,
    rosters,
    fetchedAt: Date.now(),
  };
}

export async function getDraftPicks(
  draftId: string,
  signal?: AbortSignal,
): Promise<SleeperDraftPick[]> {
  return getJson<SleeperDraftPick[]>(`/draft/${draftId}/picks`, signal);
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

  const catalog = await getJson<Record<string, SleeperPlayer>>(
    "/players/nfl",
    signal,
  );
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
