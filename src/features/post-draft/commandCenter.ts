import type { PostDraftReport } from "./engine";
import type { DataHealthStatus } from "./dataHealth";

export type PostDraftDestination = "Matchups" | "Waivers" | "Trades" | "Safety";

export interface PostDraftPriority {
  id: "lineup" | "waiver" | "trade" | "health";
  rank: number;
  title: string;
  detail: string;
  destination: PostDraftDestination;
  action: string;
  urgent: boolean;
}

export function buildPostDraftPriorities(
  report: PostDraftReport,
  healthStatus: DataHealthStatus,
): PostDraftPriority[] {
  const lineupChanges = report.weekOneLineup.filter(
    (assignment) => assignment.change !== "keep" || !assignment.player,
  );
  const waiver = report.waiverWatchlist[0] ?? null;
  const weakness = report.weaknesses[0] ?? null;
  return [
    {
      id: "lineup",
      rank: 1,
      title: lineupChanges.length
        ? `Review ${lineupChanges.length} Week 1 lineup move${lineupChanges.length === 1 ? "" : "s"}`
        : "Week 1 lineup is optimized",
      detail: report.weekOneProjectionReady
        ? "Built from current weekly projections and availability."
        : "Weekly projections are not ready, so confirm again before kickoff.",
      destination: "Matchups",
      action: "Open Matchup",
      urgent: lineupChanges.length > 0 || !report.weekOneProjectionReady,
    },
    {
      id: "waiver",
      rank: 2,
      title: waiver ? `Track ${waiver.player.name}` : "Build the first waiver watchlist",
      detail: waiver?.reason ?? "No ranked waiver target is available yet.",
      destination: "Waivers",
      action: "Open Waivers",
      urgent: Boolean(waiver && weakness),
    },
    {
      id: "trade",
      rank: 3,
      title: weakness
        ? `Scan trades for ${weakness.position} help`
        : "Scan for a responsible roster upgrade",
      detail: weakness?.detail ?? "The automatic finder will only surface offers that help both teams.",
      destination: "Trades",
      action: "Open Trades",
      urgent: Boolean(weakness && weakness.severity === "critical"),
    },
    {
      id: "health",
      rank: 4,
      title: healthStatus === "healthy" ? "Decision data is healthy" : "Review data-health warnings",
      detail: healthStatus === "healthy"
        ? "Sleeper and FantasyPros evidence is ready for post-draft decisions."
        : "A missing or stale source can lower confidence in lineups, waivers, and trades.",
      destination: "Safety",
      action: "Review Health",
      urgent: healthStatus !== "healthy",
    },
  ];
}
