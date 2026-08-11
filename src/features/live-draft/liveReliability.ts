import type { DraftRecommendation } from "./engine.ts";
import { normalizePlayerName, pickPlayerName } from "./engine.ts";
import type { RecommendationProof } from "./recommendationProof.ts";
import type { PlayerBoardData, PlayerIntelligence } from "../player-intelligence/model.ts";
import type { SleeperDraftPick } from "../../types.ts";

export type ManualCorrectionStatus = "active" | "reconciled" | "reversed";

export interface ManualDraftCorrection {
  id: string;
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  status: ManualCorrectionStatus;
  createdAt: number;
  updatedAt: number;
  reconciledPickNumber: number | null;
}

export interface RecommendationSnapshot {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  score: number;
  explanation: string;
  factors: Array<{ key: string; label: string; score: number }>;
}

export interface RecommendationRevision {
  id: string;
  recordedAt: number;
  sourcePickCount: number;
  recommendations: RecommendationSnapshot[];
  changeExplanation: string;
}

export interface RecommendationDecision {
  pickNumber: number;
  round: number;
  slot: number;
  revisions: RecommendationRevision[];
  actualSelection: {
    playerId: string;
    playerName: string;
    position: string;
    team: string;
    recordedAt: number;
  } | null;
}

export interface LiveReliabilityState {
  version: 1;
  draftId: string;
  corrections: ManualDraftCorrection[];
  decisions: RecommendationDecision[];
  updatedAt: number;
}

export type FreshnessStatus = "Fresh" | "Stale" | "Missing";

export interface DataFreshnessItem {
  id: "sleeper" | "rankings" | "projections" | "injuries" | "news";
  label: string;
  fetchedAt: number | null;
  maximumAgeMs: number;
  status: FreshnessStatus;
}

export interface PracticeLesson {
  event: string;
  before: RecommendationSnapshot | null;
  after: RecommendationSnapshot | null;
  explanation: string;
  factorChanges: Array<{ label: string; delta: number }>;
}

const STORAGE_PREFIX = "war-room.live-reliability.m25";
const LATEST_KEY = `${STORAGE_PREFIX}.latest`;

function safeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function correctionIdentity(correction: Pick<ManualDraftCorrection, "playerId" | "playerName">) {
  return correction.playerId
    ? `id:${correction.playerId}`
    : `name:${normalizePlayerName(correction.playerName)}`;
}

function pickIdentity(pick: SleeperDraftPick) {
  const id = String(pick.player_id ?? "").trim();
  return id ? `id:${id}` : `name:${normalizePlayerName(pickPlayerName(pick))}`;
}

function emptyState(draftId: string, now = Date.now()): LiveReliabilityState {
  return {
    version: 1,
    draftId,
    corrections: [],
    decisions: [],
    updatedAt: now,
  };
}

function normalizeCorrection(value: unknown): ManualDraftCorrection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ManualDraftCorrection>;
  if (
    typeof item.id !== "string" ||
    typeof item.playerId !== "string" ||
    typeof item.playerName !== "string" ||
    !["active", "reconciled", "reversed"].includes(item.status ?? "")
  ) return null;
  const createdAt = safeTimestamp(item.createdAt) ?? Date.now();
  return {
    id: item.id.slice(0, 160),
    playerId: item.playerId.slice(0, 100),
    playerName: item.playerName.slice(0, 160),
    position: typeof item.position === "string" ? item.position.slice(0, 20) : "—",
    team: typeof item.team === "string" ? item.team.slice(0, 20) : "—",
    status: item.status as ManualCorrectionStatus,
    createdAt,
    updatedAt: safeTimestamp(item.updatedAt) ?? createdAt,
    reconciledPickNumber:
      typeof item.reconciledPickNumber === "number" &&
      Number.isInteger(item.reconciledPickNumber) &&
      item.reconciledPickNumber > 0
        ? item.reconciledPickNumber
        : null,
  };
}

function normalizeSnapshot(value: unknown): RecommendationSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<RecommendationSnapshot>;
  if (
    typeof item.playerId !== "string" ||
    typeof item.playerName !== "string" ||
    typeof item.score !== "number" ||
    !Number.isFinite(item.score)
  ) return null;
  return {
    playerId: item.playerId.slice(0, 100),
    playerName: item.playerName.slice(0, 160),
    position: typeof item.position === "string" ? item.position.slice(0, 20) : "—",
    team: typeof item.team === "string" ? item.team.slice(0, 20) : "—",
    score: item.score,
    explanation: typeof item.explanation === "string"
      ? item.explanation.slice(0, 1_000)
      : "Recommendation details were not stored.",
    factors: Array.isArray(item.factors)
      ? item.factors.flatMap((factor) => {
          if (!factor || typeof factor !== "object") return [];
          const entry = factor as { key?: unknown; label?: unknown; score?: unknown };
          return typeof entry.key === "string" &&
            typeof entry.label === "string" &&
            typeof entry.score === "number" &&
            Number.isFinite(entry.score)
            ? [{ key: entry.key.slice(0, 100), label: entry.label.slice(0, 160), score: entry.score }]
            : [];
        }).slice(0, 24)
      : [],
  };
}

function normalizeDecision(value: unknown): RecommendationDecision | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<RecommendationDecision>;
  if (!Number.isInteger(item.pickNumber) || (item.pickNumber ?? 0) < 1) return null;
  const revisions = Array.isArray(item.revisions)
    ? item.revisions.flatMap((revision) => {
        if (!revision || typeof revision !== "object") return [];
        const entry = revision as Partial<RecommendationRevision>;
        const recommendations = Array.isArray(entry.recommendations)
          ? entry.recommendations.flatMap((snapshot) => {
              const normalized = normalizeSnapshot(snapshot);
              return normalized ? [normalized] : [];
            }).slice(0, 5)
          : [];
        if (
          typeof entry.id !== "string" ||
          !recommendations.length ||
          !safeTimestamp(entry.recordedAt)
        ) return [];
        return [{
          id: entry.id.slice(0, 240),
          recordedAt: entry.recordedAt as number,
          sourcePickCount:
            typeof entry.sourcePickCount === "number" && entry.sourcePickCount >= 0
              ? Math.floor(entry.sourcePickCount)
              : 0,
          recommendations,
          changeExplanation: typeof entry.changeExplanation === "string"
            ? entry.changeExplanation.slice(0, 1_000)
            : "Recommendation snapshot recorded.",
        } satisfies RecommendationRevision];
      }).slice(-30)
    : [];
  const actual = item.actualSelection;
  const actualSelection = actual &&
    typeof actual.playerId === "string" &&
    typeof actual.playerName === "string"
      ? {
          playerId: actual.playerId.slice(0, 100),
          playerName: actual.playerName.slice(0, 160),
          position: typeof actual.position === "string" ? actual.position.slice(0, 20) : "—",
          team: typeof actual.team === "string" ? actual.team.slice(0, 20) : "—",
          recordedAt: safeTimestamp(actual.recordedAt) ?? Date.now(),
        }
      : null;
  return {
    pickNumber: item.pickNumber as number,
    round: Number.isInteger(item.round) ? Math.max(1, item.round as number) : 1,
    slot: Number.isInteger(item.slot) ? Math.max(1, item.slot as number) : 1,
    revisions,
    actualSelection,
  };
}

export function normalizeLiveReliabilityState(
  value: unknown,
  draftId: string,
): LiveReliabilityState {
  if (!value || typeof value !== "object") return emptyState(draftId);
  const item = value as Partial<LiveReliabilityState>;
  if (item.version !== 1 || item.draftId !== draftId) return emptyState(draftId);
  const corrections = Array.isArray(item.corrections)
    ? item.corrections.flatMap((correction) => {
        const normalized = normalizeCorrection(correction);
        return normalized ? [normalized] : [];
      })
    : [];
  const newestCorrection = new Map<string, ManualDraftCorrection>();
  for (const correction of corrections) {
    const identity = correctionIdentity(correction);
    const current = newestCorrection.get(identity);
    if (!current || correction.updatedAt > current.updatedAt) {
      newestCorrection.set(identity, correction);
    }
  }
  const decisions = Array.isArray(item.decisions)
    ? item.decisions.flatMap((decision) => {
        const normalized = normalizeDecision(decision);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    version: 1,
    draftId,
    corrections: [...newestCorrection.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 500),
    decisions: decisions
      .sort((left, right) => left.pickNumber - right.pickNumber)
      .slice(-100),
    updatedAt: safeTimestamp(item.updatedAt) ?? Date.now(),
  };
}

export function readLiveReliabilityState(draftId: string) {
  try {
    return normalizeLiveReliabilityState(
      JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}.${draftId}`) ?? "null"),
      draftId,
    );
  } catch {
    return emptyState(draftId);
  }
}

export function readLatestLiveReliabilityState() {
  try {
    const draftId = localStorage.getItem(LATEST_KEY);
    return draftId ? readLiveReliabilityState(draftId) : null;
  } catch {
    return null;
  }
}

export function writeLiveReliabilityState(state: LiveReliabilityState) {
  const normalized = normalizeLiveReliabilityState(state, state.draftId);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}.${state.draftId}`, JSON.stringify(normalized));
    localStorage.setItem(LATEST_KEY, state.draftId);
    window.dispatchEvent(new CustomEvent("war-room-live-reliability", {
      detail: normalized,
    }));
  } catch {
    // In-memory state remains usable when browser storage is restricted.
  }
  return normalized;
}

export function markPlayerDraftedManually(
  state: LiveReliabilityState,
  player: PlayerIntelligence,
  now = Date.now(),
) {
  const identity = player.id
    ? `id:${player.id}`
    : `name:${normalizePlayerName(player.name)}`;
  const existing = state.corrections.find(
    (correction) => correctionIdentity(correction) === identity,
  );
  const correction: ManualDraftCorrection = {
    id: existing?.id ?? `${state.draftId}:${player.id || normalizePlayerName(player.name)}:${now}`,
    playerId: player.id,
    playerName: player.name,
    position: player.position,
    team: player.team,
    status: "active",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    reconciledPickNumber: null,
  };
  return {
    ...state,
    corrections: [
      correction,
      ...state.corrections.filter((item) => correctionIdentity(item) !== identity),
    ],
    updatedAt: now,
  };
}

export function reverseManualCorrection(
  state: LiveReliabilityState,
  correctionId: string,
  now = Date.now(),
) {
  return {
    ...state,
    corrections: state.corrections.map((correction) =>
      correction.id === correctionId
        ? { ...correction, status: "reversed" as const, updatedAt: now }
        : correction,
    ),
    updatedAt: now,
  };
}

export function reconcileManualCorrections(
  state: LiveReliabilityState,
  picks: SleeperDraftPick[],
  now = Date.now(),
) {
  const byId = new Map(
    picks.map((pick) => [String(pick.player_id ?? "").trim(), pick]),
  );
  const byName = new Map(
    picks.map((pick) => [normalizePlayerName(pickPlayerName(pick)), pick]),
  );
  let changed = false;
  const corrections = state.corrections.map((correction) => {
    if (correction.status !== "active") return correction;
    const match = byId.get(correction.playerId) ??
      byName.get(normalizePlayerName(correction.playerName));
    if (!match) return correction;
    changed = true;
    return {
      ...correction,
      status: "reconciled" as const,
      updatedAt: now,
      reconciledPickNumber: match.pick_no,
    };
  });
  return changed ? { ...state, corrections, updatedAt: now } : state;
}

export function manualDraftedPicks(state: LiveReliabilityState) {
  return state.corrections
    .filter((correction) => correction.status === "active")
    .map((correction): SleeperDraftPick => ({
      player_id: correction.playerId,
      picked_by: "manual-correction",
      roster_id: 0,
      round: 0,
      draft_slot: 0,
      pick_no: 0,
      is_keeper: false,
      metadata: {
        first_name: correction.playerName.split(" ")[0] ?? correction.playerName,
        last_name: correction.playerName.split(" ").slice(1).join(" "),
        position: correction.position,
        team: correction.team,
      },
    }));
}

function snapshotRecommendation(
  recommendation: DraftRecommendation,
  proof: RecommendationProof | null,
): RecommendationSnapshot {
  return {
    playerId: recommendation.player.id,
    playerName: recommendation.player.name,
    position: recommendation.player.position,
    team: recommendation.player.team,
    score: recommendation.score,
    explanation:
      proof?.rankingExplanation ??
      recommendation.reasons[0]?.value ??
      "Best available roster-specific value.",
    factors: (recommendation.factors ?? []).map((factor) => ({
      key: factor.key,
      label: factor.label,
      score: factor.score,
    })),
  };
}

function revisionSignature(recommendations: RecommendationSnapshot[]) {
  return recommendations
    .map((recommendation) => `${recommendation.playerId}:${recommendation.score}`)
    .join("|");
}

function strongestFactorChange(
  before: RecommendationSnapshot | null,
  after: RecommendationSnapshot | null,
) {
  if (!before || !after || before.playerId !== after.playerId) return null;
  const beforeByKey = new Map(before.factors.map((factor) => [factor.key, factor]));
  return after.factors
    .map((factor) => ({
      label: factor.label,
      delta: factor.score - (beforeByKey.get(factor.key)?.score ?? 0),
    }))
    .filter((factor) => factor.delta !== 0)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0] ?? null;
}

function explainRecommendationChange(
  previous: RecommendationRevision | null,
  current: RecommendationSnapshot[],
  picks: SleeperDraftPick[],
) {
  if (!previous) return "Initial recommendation set recorded for this turn.";
  const before = previous.recommendations[0] ?? null;
  const after = current[0] ?? null;
  if (!before || !after) return "The available recommendation set changed.";
  const newlyDrafted = picks
    .filter((pick) => pick.pick_no > previous.sourcePickCount)
    .find((pick) => pickIdentity(pick) === `id:${before.playerId}` ||
      normalizePlayerName(pickPlayerName(pick)) === normalizePlayerName(before.playerName));
  if (newlyDrafted) {
    return `${before.playerName} was selected at pick #${newlyDrafted.pick_no}, so ${after.playerName} became the best remaining roster fit.`;
  }
  if (before.playerId !== after.playerId) {
    return `${after.playerName} moved ahead of ${before.playerName} after the live board, roster needs, and wait risk were recalculated.`;
  }
  const factor = strongestFactorChange(before, after);
  return factor
    ? `${after.playerName} stayed first, but ${factor.label.toLowerCase()} changed the roster-value score by ${factor.delta > 0 ? "+" : ""}${factor.delta.toFixed(1)}.`
    : `${after.playerName} stayed first; supporting data changed without altering the leading roster-value score.`;
}

export function recordRecommendationRevision(
  state: LiveReliabilityState,
  input: {
    pickNumber: number;
    round: number;
    slot: number;
    recommendations: DraftRecommendation[];
    proofs: Map<string, RecommendationProof>;
    picks: SleeperDraftPick[];
    now?: number;
  },
) {
  if (!input.recommendations.length || input.pickNumber < 1) return state;
  const now = input.now ?? Date.now();
  const snapshots = input.recommendations
    .slice(0, 5)
    .map((recommendation) => snapshotRecommendation(
      recommendation,
      input.proofs.get(recommendation.player.id) ?? null,
    ));
  const signature = revisionSignature(snapshots);
  const currentDecision = state.decisions.find(
    (decision) => decision.pickNumber === input.pickNumber,
  );
  const previousRevision = currentDecision?.revisions.at(-1) ??
    state.decisions.at(-1)?.revisions.at(-1) ??
    null;
  if (currentDecision?.revisions.some((revision) => revision.id.endsWith(signature))) {
    return state;
  }
  const revision: RecommendationRevision = {
    id: `${input.pickNumber}:${now}:${signature}`,
    recordedAt: now,
    sourcePickCount: input.picks.reduce(
      (latest, pick) => Math.max(latest, Number(pick.pick_no) || 0),
      0,
    ),
    recommendations: snapshots,
    changeExplanation: explainRecommendationChange(previousRevision, snapshots, input.picks),
  };
  const decision: RecommendationDecision = currentDecision
    ? {
        ...currentDecision,
        revisions: [...currentDecision.revisions, revision].slice(-30),
      }
    : {
        pickNumber: input.pickNumber,
        round: input.round,
        slot: input.slot,
        revisions: [revision],
        actualSelection: null,
      };
  return {
    ...state,
    decisions: [
      ...state.decisions.filter((item) => item.pickNumber !== input.pickNumber),
      decision,
    ].sort((left, right) => left.pickNumber - right.pickNumber).slice(-100),
    updatedAt: now,
  };
}

export function attachActualSelections(
  state: LiveReliabilityState,
  picks: SleeperDraftPick[],
  userRosterId: number,
  now = Date.now(),
) {
  const byPick = new Map(
    picks
      .filter((pick) => Number(pick.roster_id) === userRosterId)
      .map((pick) => [pick.pick_no, pick]),
  );
  let changed = false;
  const decisions = state.decisions.map((decision) => {
    const pick = byPick.get(decision.pickNumber);
    if (!pick || decision.actualSelection?.playerId === String(pick.player_id)) {
      return decision;
    }
    changed = true;
    return {
      ...decision,
      actualSelection: {
        playerId: String(pick.player_id),
        playerName: pickPlayerName(pick),
        position: pick.metadata?.position ?? "—",
        team: pick.metadata?.team ?? "—",
        recordedAt: now,
      },
    };
  });
  return changed ? { ...state, decisions, updatedAt: now } : state;
}

export function mergeLiveReliabilityStates(
  local: LiveReliabilityState,
  remote: LiveReliabilityState,
) {
  if (local.draftId !== remote.draftId) {
    return local.updatedAt >= remote.updatedAt ? local : remote;
  }
  const corrections = new Map<string, ManualDraftCorrection>();
  for (const correction of [...local.corrections, ...remote.corrections]) {
    const identity = correctionIdentity(correction);
    const current = corrections.get(identity);
    if (!current || correction.updatedAt > current.updatedAt) corrections.set(identity, correction);
  }
  const decisions = new Map<number, RecommendationDecision>();
  for (const decision of [...local.decisions, ...remote.decisions]) {
    const current = decisions.get(decision.pickNumber);
    if (!current) {
      decisions.set(decision.pickNumber, decision);
      continue;
    }
    const revisions = new Map(
      [...current.revisions, ...decision.revisions].map((revision) => [revision.id, revision]),
    );
    decisions.set(decision.pickNumber, {
      ...current,
      revisions: [...revisions.values()]
        .sort((left, right) => left.recordedAt - right.recordedAt)
        .slice(-30),
      actualSelection:
        (decision.actualSelection?.recordedAt ?? 0) >
        (current.actualSelection?.recordedAt ?? 0)
          ? decision.actualSelection
          : current.actualSelection,
    });
  }
  return normalizeLiveReliabilityState({
    version: 1,
    draftId: local.draftId,
    corrections: [...corrections.values()],
    decisions: [...decisions.values()],
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }, local.draftId);
}

function timestamp(value: string | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildDataFreshness(
  board: PlayerBoardData | null,
  picksFetchedAt: number | null,
  draftStatus: "pre_draft" | "drafting" | "complete",
  now = Date.now(),
): DataFreshnessItem[] {
  const definitions: Array<Omit<DataFreshnessItem, "status">> = [
    {
      id: "sleeper",
      label: "Sleeper picks",
      fetchedAt: picksFetchedAt,
      maximumAgeMs: draftStatus === "drafting" ? 15_000 : 5 * 60_000,
    },
    {
      id: "rankings",
      label: "Rankings",
      fetchedAt: timestamp(board?.datasetFetchedAt.rankings),
      maximumAgeMs: 6 * 60 * 60_000,
    },
    {
      id: "projections",
      label: "Projections",
      fetchedAt: timestamp(board?.datasetFetchedAt.projections),
      maximumAgeMs: 6 * 60 * 60_000,
    },
    {
      id: "injuries",
      label: "Injuries",
      fetchedAt: timestamp(board?.datasetFetchedAt.injuries),
      maximumAgeMs: 15 * 60_000,
    },
    {
      id: "news",
      label: "News",
      fetchedAt: timestamp(board?.datasetFetchedAt.news),
      maximumAgeMs: 15 * 60_000,
    },
  ];
  return definitions.map((item) => ({
    ...item,
    status: item.fetchedAt === null
      ? "Missing"
      : now - item.fetchedAt > item.maximumAgeMs
        ? "Stale"
        : "Fresh",
  }));
}

export function buildPracticeLesson(
  beforeRecommendations: DraftRecommendation[],
  afterRecommendations: DraftRecommendation[],
  draftedPlayer: PlayerIntelligence,
  pickNumber: number,
): PracticeLesson {
  const before = beforeRecommendations[0]
    ? snapshotRecommendation(beforeRecommendations[0], null)
    : null;
  const after = afterRecommendations[0]
    ? snapshotRecommendation(afterRecommendations[0], null)
    : null;
  const beforeAfterPlayer = before && afterRecommendations.find(
    (recommendation) => recommendation.player.id === before.playerId,
  );
  const afterBeforePlayer = after && beforeRecommendations.find(
    (recommendation) => recommendation.player.id === after.playerId,
  );
  const comparableBefore = afterBeforePlayer
    ? snapshotRecommendation(afterBeforePlayer, null)
    : null;
  const comparableAfter = beforeAfterPlayer
    ? snapshotRecommendation(beforeAfterPlayer, null)
    : null;
  const factorBase = after?.playerId === before?.playerId
    ? strongestFactorChange(before, after)
    : strongestFactorChange(comparableBefore, after) ??
      strongestFactorChange(before, comparableAfter);
  const factorChanges = factorBase ? [factorBase] : [];
  return {
    event: `${draftedPlayer.name} is hypothetically selected at pick #${pickNumber}.`,
    before,
    after,
    explanation: !after
      ? "No recommendation remains after this practice event."
      : before?.playerId === draftedPlayer.id
        ? `${draftedPlayer.name} leaves the available pool, so ${after.playerName} becomes the best remaining roster-specific value.`
        : before?.playerId !== after.playerId
          ? `${after.playerName} moves ahead because the remaining tiers, opponent demand, roster fit, and wait risk are recalculated after the simulated pick.`
          : factorBase
            ? `${after.playerName} remains first, while ${factorBase.label.toLowerCase()} changes its score by ${factorBase.delta > 0 ? "+" : ""}${factorBase.delta.toFixed(1)}.`
            : `${after.playerName} remains first because the simulated pick does not materially change its roster-specific advantage.`,
    factorChanges,
  };
}
