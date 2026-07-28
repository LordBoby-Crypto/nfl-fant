import type {
  Draft,
  League,
  LeagueSnapshot,
  LeagueUser,
  Roster,
} from "../types";

export const LEAGUE_ID = "1387560115116208128";
export const USER_ID = "1340097308699664384";
export const USERNAME = "kingboby";

const API_ROOT = "https://api.sleeper.app/v1";

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

export function getUserRoster(snapshot: LeagueSnapshot): Roster | undefined {
  return snapshot.rosters.find((roster) => roster.owner_id === USER_ID);
}

export function getDraftPosition(
  snapshot: LeagueSnapshot,
): number | undefined {
  return snapshot.draft.draft_order?.[USER_ID];
}
