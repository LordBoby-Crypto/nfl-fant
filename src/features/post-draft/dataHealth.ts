import type { PlayerBoardData } from "../player-intelligence/model";

export type DataHealthStatus = "healthy" | "warning" | "unavailable";

export interface DataHealthItem {
  id: "sleeper-league" | "sleeper-picks" | "rankings" | "projections" | "week-one";
  label: string;
  status: DataHealthStatus;
  detail: string;
  fetchedAt: number | null;
}

export interface PostDraftDataHealth {
  status: DataHealthStatus;
  headline: string;
  items: DataHealthItem[];
  coverage: {
    supported: number;
    partial: number;
    unsupported: number;
    available: boolean;
  };
}

function timestamp(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sourceStatus(
  fetchedAt: number | null,
  maximumAgeMs: number,
  now: number,
  error?: string | null,
): DataHealthStatus {
  if (!fetchedAt) return "unavailable";
  if (error || now - fetchedAt > maximumAgeMs) return "warning";
  return "healthy";
}

export function buildPostDraftDataHealth({
  snapshotFetchedAt,
  picksFetchedAt,
  picksError,
  board,
  weeklyBoard,
  dataError,
  now = Date.now(),
}: {
  snapshotFetchedAt: number | null;
  picksFetchedAt: number | null;
  picksError: string | null;
  board: PlayerBoardData | null;
  weeklyBoard: PlayerBoardData | null;
  dataError: string | null;
  now?: number;
}): PostDraftDataHealth {
  const rankingsAt = timestamp(board?.datasetFetchedAt.rankings ?? board?.fetchedAt);
  const projectionsAt = timestamp(board?.datasetFetchedAt.projections);
  const weekOneAt = timestamp(weeklyBoard?.datasetFetchedAt.projections);
  const items: DataHealthItem[] = [
    {
      id: "sleeper-league",
      label: "Sleeper league & rosters",
      fetchedAt: snapshotFetchedAt,
      status: sourceStatus(snapshotFetchedAt, 10 * 60_000, now),
      detail: "League settings, roster ownership and lineup slots.",
    },
    {
      id: "sleeper-picks",
      label: "Sleeper draft results",
      fetchedAt: picksFetchedAt,
      status: sourceStatus(picksFetchedAt, 10 * 60_000, now, picksError),
      detail: picksError ?? "Completed selections and draft order.",
    },
    {
      id: "rankings",
      label: "FantasyPros consensus",
      fetchedAt: rankingsAt,
      status: sourceStatus(rankingsAt, 24 * 60 * 60_000, now, dataError),
      detail: board?.datasetErrors.rankings ?? "Rest-of-season rank and market baselines.",
    },
    {
      id: "projections",
      label: "Season projections",
      fetchedAt: projectionsAt,
      status: sourceStatus(
        projectionsAt,
        24 * 60 * 60_000,
        now,
        board?.datasetErrors.projections ?? dataError,
      ),
      detail: board?.datasetErrors.projections ?? "League-adjusted player and roster projections.",
    },
    {
      id: "week-one",
      label: "Week 1 projections",
      fetchedAt: weekOneAt,
      status: sourceStatus(
        weekOneAt,
        12 * 60 * 60_000,
        now,
        weeklyBoard?.datasetErrors.projections,
      ),
      detail: weeklyBoard?.datasetErrors.projections ?? "Start/sit and matchup projection inputs.",
    },
  ];
  const status: DataHealthStatus = items.some((item) => item.status === "unavailable")
    ? "unavailable"
    : items.some((item) => item.status === "warning")
      ? "warning"
      : "healthy";
  return {
    status,
    headline:
      status === "healthy"
        ? "All decision sources are healthy"
        : status === "warning"
          ? "Some sources are stale or using saved data"
          : "At least one decision source is unavailable",
    items,
    coverage: {
      supported: board?.supportedScoringCategories ?? 0,
      partial: board?.partialScoringCategories ?? 0,
      unsupported: board?.unsupportedScoringCategories ?? 0,
      available: Boolean(board?.scoringCoverageAvailable),
    },
  };
}
