import type { PlayerBoardData } from "../features/player-intelligence/model";
import type { LeagueSnapshot, SleeperDraftPick } from "../types";

const RANKINGS_CACHE_KEY = "war-room.rankings-cache.v1";
const LEAGUE_CACHE_KEY = "war-room.league-snapshot.v1";
const DRAFT_PICKS_CACHE_PREFIX = "war-room.draft-picks.v1";

interface StoredValue<T> {
  version: 1;
  savedAt: number;
  value: T;
}

export function selectRecoverablePlayerBoard(
  current: PlayerBoardData | null,
  next: PlayerBoardData,
  hasFreshRankings: boolean,
) {
  if (hasFreshRankings && next.players.length) {
    return { value: next, usingCachedBoard: false };
  }
  if (current?.players.length) {
    return { value: current, usingCachedBoard: true };
  }
  return { value: next, usingCachedBoard: false };
}

function readStoredValue<T>(key: string): StoredValue<T> | null {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as
      | Partial<StoredValue<T>>
      | null;
    if (
      !stored ||
      stored.version !== 1 ||
      typeof stored.savedAt !== "number" ||
      !stored.value
    ) {
      return null;
    }
    return stored as StoredValue<T>;
  } catch {
    return null;
  }
}

function writeStoredValue<T>(key: string, value: T) {
  try {
    const stored: StoredValue<T> = {
      version: 1,
      savedAt: Date.now(),
      value,
    };
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Restricted/private browsing can make local storage unavailable.
  }
}

export function readCachedPlayerBoard() {
  const stored = readStoredValue<PlayerBoardData>(RANKINGS_CACHE_KEY);
  if (!stored || !Array.isArray(stored.value.players)) return null;
  return stored;
}

export function cachePlayerBoard(board: PlayerBoardData) {
  if (!board.players.length) return;
  writeStoredValue(RANKINGS_CACHE_KEY, board);
}

export function readCachedLeagueSnapshot() {
  const stored = readStoredValue<LeagueSnapshot>(LEAGUE_CACHE_KEY);
  if (
    !stored ||
    !stored.value.league?.league_id ||
    !stored.value.draft?.draft_id ||
    !Array.isArray(stored.value.users) ||
    !Array.isArray(stored.value.rosters)
  ) {
    return null;
  }
  return stored;
}

export function cacheLeagueSnapshot(snapshot: LeagueSnapshot) {
  writeStoredValue(LEAGUE_CACHE_KEY, snapshot);
}

function draftPicksKey(draftId: string) {
  return `${DRAFT_PICKS_CACHE_PREFIX}.${draftId}`;
}

export function readCachedDraftPicks(draftId: string) {
  if (!draftId) return null;
  const stored = readStoredValue<SleeperDraftPick[]>(draftPicksKey(draftId));
  if (!stored || !Array.isArray(stored.value)) return null;
  return stored;
}

export function cacheDraftPicks(draftId: string, picks: SleeperDraftPick[]) {
  if (!draftId) return;
  writeStoredValue(draftPicksKey(draftId), picks);
}
