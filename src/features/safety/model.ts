import type { PlayerBoardData, PlayerIntelligence } from "../player-intelligence/model";
import type { DraftControlState } from "../live-draft/engine";
import {
  normalizeLiveReliabilityState,
  type LiveReliabilityState,
} from "../live-draft/liveReliability.ts";

export const BACKUP_VERSION = 1 as const;

export interface DraftPreferenceBackup {
  product: "NFL Fantasy War Room";
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  controls: DraftControlState;
  liveReliability?: LiveReliabilityState;
}

export interface SessionClock {
  expired: boolean;
  warning: boolean;
  remainingMs: number;
  label: string;
}

const CONTROL_KEYS: Array<keyof DraftControlState> = [
  "watchlist",
  "queue",
  "target",
  "sleeper",
  "avoid",
];

function uniqueStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && item.length > 0 && item.length <= 80,
      ),
    ),
  ].slice(0, 1_000);
}

export function normalizeDraftControls(value: unknown): DraftControlState {
  const source =
    value && typeof value === "object"
      ? (value as Partial<Record<keyof DraftControlState, unknown>>)
      : {};
  return Object.fromEntries(
    CONTROL_KEYS.map((key) => [key, uniqueStrings(source[key])]),
  ) as unknown as DraftControlState;
}

export function createDraftPreferenceBackup(
  controls: DraftControlState,
  now = new Date(),
  liveReliability?: LiveReliabilityState | null,
): DraftPreferenceBackup {
  return {
    product: "NFL Fantasy War Room",
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    controls: normalizeDraftControls(controls),
    ...(liveReliability
      ? {
          liveReliability: normalizeLiveReliabilityState(
            liveReliability,
            liveReliability.draftId,
          ),
        }
      : {}),
  };
}

export function parseDraftPreferenceBackup(value: string) {
  const parsed = JSON.parse(value) as Partial<DraftPreferenceBackup>;
  if (
    parsed.product !== "NFL Fantasy War Room" ||
    parsed.version !== BACKUP_VERSION ||
    !parsed.controls
  ) {
    throw new Error("This is not a supported War Room preference backup.");
  }
  return {
    ...parsed,
    controls: normalizeDraftControls(parsed.controls),
    ...(parsed.liveReliability?.draftId
      ? {
          liveReliability: normalizeLiveReliabilityState(
            parsed.liveReliability,
            parsed.liveReliability.draftId,
          ),
        }
      : {}),
  } as DraftPreferenceBackup;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function playerName(
  playerId: string,
  playersById: Map<string, PlayerIntelligence>,
) {
  const player = playersById.get(playerId);
  return player
    ? `${player.name} (${player.position}, ${player.team || "FA"})`
    : `Player ID ${playerId}`;
}

export function buildEmergencyCheatSheet(
  controls: DraftControlState,
  board: PlayerBoardData | null,
  generatedAt = new Date(),
) {
  const players = board?.players ?? [];
  const playersById = new Map(players.map((player) => [player.id, player]));
  const controlSections = CONTROL_KEYS.map((key) => {
    const rows = controls[key].length
      ? controls[key]
          .map(
            (playerId, index) =>
              `<li><strong>${index + 1}.</strong> ${escapeHtml(
                playerName(playerId, playersById),
              )}</li>`,
          )
          .join("")
      : "<li>None saved</li>";
    return `<section><h2>${escapeHtml(
      key === "target" ? "Targets" : `${key[0].toUpperCase()}${key.slice(1)}`,
    )}</h2><ol>${rows}</ol></section>`;
  }).join("");

  const rankedRows = players
    .filter((player) => player.ecr !== null)
    .slice()
    .sort((left, right) => (left.ecr ?? 9999) - (right.ecr ?? 9999))
    .slice(0, 200)
    .map(
      (player) =>
        `<tr><td>${player.ecr ?? "—"}</td><td>${escapeHtml(
          player.name,
        )}</td><td>${player.position}</td><td>${escapeHtml(
          player.team || "FA",
        )}</td><td>${player.tier ?? "—"}</td><td>${player.adp ?? "—"}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>War Room Emergency Cheat Sheet</title>
<style>
body{font:14px/1.45 Arial,sans-serif;color:#101820;margin:28px}h1{margin:0 0 4px}p{color:#52606d}
.controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:24px 0}
section{break-inside:avoid;border:1px solid #ccd4dc;padding:12px}h2{font-size:16px;margin:0 0 8px}
ol{margin:0;padding-left:24px}table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:5px 7px;border-bottom:1px solid #dce2e8;text-align:left}th{background:#eef2f5}
@media print{body{margin:12mm}.controls{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<h1>NFL Fantasy War Room — Emergency Cheat Sheet</h1>
<p>Generated ${escapeHtml(generatedAt.toLocaleString())}. Rankings source: ${
    board?.fetchedAt ? `FantasyPros data fetched ${escapeHtml(board.fetchedAt)}` : "not available"
  }.</p>
<div class="controls">${controlSections}</div>
<h2>Top 200 rankings</h2>
<table><thead><tr><th>ECR</th><th>Player</th><th>Pos</th><th>Team</th><th>Tier</th><th>ADP</th></tr></thead>
<tbody>${rankedRows || '<tr><td colspan="6">No cached rankings available.</td></tr>'}</tbody></table>
</body></html>`;
}

export function groupRankingsByPositionAndTier(players: PlayerIntelligence[]) {
  const positions = ["QB", "RB", "WR", "TE", "K", "DST"] as const;
  return positions.map((position) => {
    const positionPlayers = players
      .filter((player) => player.position === position && player.ecr !== null)
      .slice()
      .sort((left, right) => (left.ecr ?? 9999) - (right.ecr ?? 9999));
    const tiers = new Map<number, PlayerIntelligence[]>();
    for (const player of positionPlayers) {
      const tier = player.tier ?? 99;
      const current = tiers.get(tier);
      if (current) current.push(player);
      else tiers.set(tier, [player]);
    }
    return {
      position,
      tiers: [...tiers.entries()].map(([tier, tierPlayers]) => ({
        tier: tier === 99 ? null : tier,
        players: tierPlayers,
      })),
    };
  });
}

export function getSessionClock(expiresAt: number | null, now = Date.now()): SessionClock {
  if (!expiresAt) {
    return {
      expired: false,
      warning: false,
      remainingMs: 0,
      label: "Locked",
    };
  }
  const remainingMs = Math.max(0, expiresAt - now);
  const expired = remainingMs === 0;
  const warning = !expired && remainingMs <= 30 * 60 * 1000;
  if (expired) return { expired, warning: false, remainingMs, label: "Expired" };
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    expired,
    warning,
    remainingMs,
    label: hours ? `${hours}h ${minutes}m` : `${minutes}m`,
  };
}
