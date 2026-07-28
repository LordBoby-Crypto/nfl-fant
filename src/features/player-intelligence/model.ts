import type {
  IntelligenceDataset,
  IntelligenceResponse,
} from "../../services/intelligence";

export type PlayerPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DST" | "—";

export interface PlayerNewsItem {
  id: string;
  title: string;
  summary: string;
  impact: string;
  publishedAt: string | null;
  sourceUrl: string | null;
}

export interface PlayerIntelligence {
  id: string;
  name: string;
  team: string;
  position: PlayerPosition;
  positionRank: string;
  ecr: number | null;
  tier: number | null;
  adp: number | null;
  projectedPoints: number | null;
  expertBest: number | null;
  expertWorst: number | null;
  expertAverage: number | null;
  injuryStatus: string;
  injuryDetail: string;
  practiceStatus: string;
  byeWeek: number | null;
  news: PlayerNewsItem[];
}

export interface PlayerBoardData {
  players: PlayerIntelligence[];
  fetchedAt: string | null;
  attribution: string;
  totalExperts: number | null;
  datasetErrors: Partial<Record<IntelligenceDataset, string>>;
}

type JsonRecord = Record<string, unknown>;

const POSITION_ALIASES: Record<string, PlayerPosition> = {
  D: "DST",
  DEF: "DST",
  DST: "DST",
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueAt(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function asString(record: JsonRecord, keys: string[], fallback = "") {
  const value = valueAt(record, keys);
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : fallback;
}

function asNumber(record: JsonRecord, keys: string[]) {
  const value = valueAt(record, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!/[0-9]/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNestedNumber(value: unknown, keys: string[], depth = 0): number | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedNumber(item, keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const direct = asNumber(value, keys);
  if (direct !== null) return direct;

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || isRecord(nested)) {
      const found = firstNestedNumber(nested, keys, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function collectRecords(value: unknown, preferredKeys: string[]) {
  const records: JsonRecord[] = [];
  const seen = new Set<unknown>();

  function walk(current: unknown, depth: number) {
    if (depth > 5 || current === null || current === undefined || seen.has(current)) {
      return;
    }
    if (typeof current === "object") seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        if (isRecord(item)) records.push(item);
      }
      return;
    }

    if (!isRecord(current)) return;

    let matchedPreferredKey = false;
    for (const key of preferredKeys) {
      if (current[key] !== undefined) {
        matchedPreferredKey = true;
        walk(current[key], depth + 1);
      }
    }

    if (!matchedPreferredKey) {
      for (const nested of Object.values(current)) {
        if (Array.isArray(nested) || isRecord(nested)) walk(nested, depth + 1);
      }
    }
  }

  walk(value, 0);
  return records;
}

function playerId(record: JsonRecord) {
  const direct = asString(record, [
    "player_id",
    "playerId",
    "fantasypros_id",
    "fantasyProsId",
    "id",
  ]);
  if (direct) return direct;
  return isRecord(record.player)
    ? asString(record.player, ["player_id", "playerId", "id"])
    : "";
}

function playerName(record: JsonRecord): string {
  const direct = asString(record, [
    "player_name",
    "playerName",
    "name",
    "full_name",
    "fullName",
  ]);
  if (direct) return direct;
  if (isRecord(record.player)) {
    const nested: string = playerName(record.player);
    if (nested) return nested;
  }
  const first = asString(record, ["first_name", "firstName"]);
  const last = asString(record, ["last_name", "lastName"]);
  return `${first} ${last}`.trim();
}

function sourceUrl(record: JsonRecord) {
  const value = asString(record, ["url", "link", "source_url", "sourceUrl"]);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function recordIdentity(record: JsonRecord) {
  const id = playerId(record);
  if (id) return `id:${id}`;
  const name = playerName(record);
  return name ? `name:${normalizedKey(name)}` : "";
}

function position(record: JsonRecord): PlayerPosition {
  const raw = asString(record, [
    "player_position_id",
    "player_position",
    "position_id",
    "position",
    "pos",
    "eligibility",
  ])
    .split(/[ ,/]/)[0]
    ?.toUpperCase();
  return POSITION_ALIASES[raw] ?? "—";
}

function findByIdentity(
  recordsByIdentity: Map<string, JsonRecord[]>,
  base: JsonRecord,
) {
  const id = playerId(base);
  if (id) {
    const match = recordsByIdentity.get(`id:${id}`);
    if (match?.length) return match;
  }
  const name = playerName(base);
  return name ? recordsByIdentity.get(`name:${normalizedKey(name)}`) ?? [] : [];
}

function indexRecords(records: JsonRecord[]) {
  const result = new Map<string, JsonRecord[]>();
  for (const record of records) {
    const keys = new Set<string>();
    const id = playerId(record);
    const name = playerName(record);
    if (id) keys.add(`id:${id}`);
    if (name) keys.add(`name:${normalizedKey(name)}`);

    for (const key of keys) {
      const current = result.get(key);
      if (current) current.push(record);
      else result.set(key, [record]);
    }
  }
  return result;
}

function newsItem(record: JsonRecord, index: number): PlayerNewsItem {
  return {
    id:
      asString(record, ["news_id", "id", "article_id"]) ||
      `${normalizedKey(playerName(record))}-${index}`,
    title:
      asString(record, ["title", "headline", "news_title"]) ||
      "Player update",
    summary: asString(record, [
      "summary",
      "description",
      "content",
      "details",
      "news",
    ]),
    impact: asString(record, [
      "impact",
      "analysis",
      "fantasy_impact",
      "fantasyImpact",
    ]),
    publishedAt:
      asString(record, [
        "published_at",
        "publishedAt",
        "created_at",
        "date",
        "timestamp",
      ]) || null,
    sourceUrl: sourceUrl(record),
  };
}

function newestTimestamp(responses: IntelligenceResponse[]) {
  let newest = 0;
  for (const response of responses) {
    const value = Date.parse(response.fetchedAt);
    if (Number.isFinite(value)) newest = Math.max(newest, value);
  }
  return newest ? new Date(newest).toISOString() : null;
}

export function buildPlayerBoard(
  responses: IntelligenceResponse[],
  failures: Partial<Record<IntelligenceDataset, string>> = {},
): PlayerBoardData {
  const byDataset = new Map(
    responses.map((response) => [response.dataset, response] as const),
  );
  const rankingResponse = byDataset.get("rankings");
  const rankingRecords = collectRecords(rankingResponse?.data, ["players", "rankings"]);
  const metadataRecords = collectRecords(byDataset.get("players")?.data, [
    "players",
    "results",
  ]);
  const projectionRecords = collectRecords(byDataset.get("projections")?.data, [
    "players",
    "projections",
    "positions",
  ]);
  const injuryRecords = collectRecords(byDataset.get("injuries")?.data, [
    "players",
    "injuries",
    "results",
  ]);
  const newsRecords = collectRecords(byDataset.get("news")?.data, [
    "news",
    "items",
    "players",
    "results",
  ]);
  const datasetErrors = { ...failures };
  for (const response of responses) {
    if (!isRecord(response.data) || !Array.isArray(response.data.unavailable)) {
      continue;
    }
    const unavailable = response.data.unavailable.filter(
      (value): value is string => typeof value === "string",
    );
    if (unavailable.length) {
      datasetErrors[response.dataset] =
        `${response.dataset} unavailable for ${unavailable.join(", ")}.`;
    }
  }

  const metadataIndex = indexRecords(metadataRecords);
  const projectionIndex = indexRecords(projectionRecords);
  const injuryIndex = indexRecords(injuryRecords);
  const newsIndex = indexRecords(newsRecords);

  // The metadata endpoint is a historical catalog containing thousands of
  // retired and non-fantasy players. It must never masquerade as a rankings
  // board when the consensus feed is unavailable.
  const bases = rankingRecords;
  const uniqueBases = new Map<string, JsonRecord>();
  for (const base of bases) {
    const identity = recordIdentity(base);
    if (identity && !uniqueBases.has(identity)) uniqueBases.set(identity, base);
  }

  const players = Array.from(uniqueBases.values(), (base) => {
    const metadata = findByIdentity(metadataIndex, base)[0] ?? {};
    const projection = findByIdentity(projectionIndex, base)[0] ?? {};
    const injury = findByIdentity(injuryIndex, base)[0] ?? {};
    const news = findByIdentity(newsIndex, base)
      .slice(0, 8)
      .map(newsItem);
    const name = playerName(base) || playerName(metadata) || "Unknown player";
    const id = playerId(base) || playerId(metadata) || normalizedKey(name);

    return {
      id,
      name,
      team:
        asString(base, ["player_team_id", "team_id", "team"]) ||
        asString(metadata, ["player_team_id", "team_id", "team"]) ||
        "FA",
      position:
        position(base) !== "—" ? position(base) : position(metadata),
      positionRank: asString(base, ["pos_rank", "position_rank", "posRank"], "—"),
      ecr: asNumber(base, ["rank_ecr", "ecr", "consensus_rank", "rank"]),
      tier: asNumber(base, ["tier", "rank_tier"]),
      adp: asNumber(base, [
        "rank_adp",
        "adp",
        "player_adp",
        "average_draft_position",
        "avg_pick",
      ]),
      projectedPoints: asNumber(projection, [
        "fpts",
        "FPTS",
        "fantasy_points",
        "fantasy_points_ppr",
        "projected_points",
        "points",
        "pts",
      ]),
      expertBest: asNumber(base, ["rank_min", "best_rank", "rank_best"]),
      expertWorst: asNumber(base, ["rank_max", "worst_rank", "rank_worst"]),
      expertAverage: asNumber(base, ["rank_ave", "average_rank", "rank_avg"]),
      injuryStatus: asString(injury, [
        "status",
        "injury_status",
        "game_status",
        "designation",
      ]),
      injuryDetail: asString(injury, [
        "injury",
        "injury_type",
        "body_part",
        "description",
        "details",
      ]),
      practiceStatus: asString(injury, [
        "practice_status",
        "practice",
        "practice_participation",
      ]),
      byeWeek:
        asNumber(base, ["bye_week", "bye", "player_bye_week"]) ??
        asNumber(metadata, ["bye_week", "bye", "player_bye_week"]),
      news,
    } satisfies PlayerIntelligence;
  }).sort((left, right) => {
    const leftRank = left.ecr ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.ecr ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });

  const totalExperts = firstNestedNumber(rankingResponse?.data, [
    "total_experts",
    "totalExperts",
    "expert_count",
    "expertCount",
  ]);

  return {
    players,
    fetchedAt: newestTimestamp(responses),
    attribution:
      responses.find((response) => response.attribution)?.attribution ??
      "Data obtained from FantasyPros.",
    totalExperts,
    datasetErrors,
  };
}
