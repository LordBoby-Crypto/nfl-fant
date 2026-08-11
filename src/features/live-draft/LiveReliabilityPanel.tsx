import { useDeferredValue, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  Cloud,
  Database,
  FlaskConical,
  History,
  RotateCcw,
  Search,
  UserMinus,
  Wifi,
} from "lucide-react";
import type { DraftPickDiagnostic } from "../../types.ts";
import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import type {
  DataFreshnessItem,
  LiveReliabilityState,
  PracticeLesson,
} from "./liveReliability.ts";
import type { ReliabilitySyncStatus } from "./useLiveReliability.ts";

interface LiveReliabilityPanelProps {
  available: PlayerIntelligence[];
  state: LiveReliabilityState;
  freshness: DataFreshnessItem[];
  diagnostics: DraftPickDiagnostic[];
  syncStatus: ReliabilitySyncStatus;
  syncMessage: string | null;
  practiceOptions: PlayerIntelligence[];
  practiceLesson: PracticeLesson | null;
  onMarkDrafted: (player: PlayerIntelligence) => void;
  onReverseCorrection: (correctionId: string) => void;
  onPractice: (playerId: string) => void;
}

function exactTime(timestamp: number | null) {
  if (!timestamp) return "No successful update";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function relativeAge(timestamp: number | null) {
  if (!timestamp) return "missing";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return `${Math.max(1, Math.round(elapsed / 1_000))} sec ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  return `${Math.floor(elapsed / 3_600_000)} hr ago`;
}

function ManualCorrectionSearch({
  available,
  onMarkDrafted,
}: {
  available: PlayerIntelligence[];
  onMarkDrafted: (player: PlayerIntelligence) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase();
    if (search.length < 2) return [];
    return available
      .filter((player) =>
        player.name.toLocaleLowerCase().includes(search) ||
        player.team.toLocaleLowerCase().includes(search) ||
        player.position.toLocaleLowerCase().includes(search),
      )
      .slice(0, 8);
  }, [available, deferredQuery]);

  return (
    <div className="reliability-player-search">
      <label>
        <Search />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find an available player"
        />
      </label>
      {results.length ? (
        <div role="listbox" aria-label="Players available for manual correction">
          {results.map((player) => (
            <button
              type="button"
              key={player.id}
              onClick={() => {
                onMarkDrafted(player);
                setQuery("");
              }}
            >
              <b className={`position-${player.position.toLowerCase()}`}>{player.position}</b>
              <span><strong>{player.name}</strong><small>{player.team} · rank {player.leagueRank ?? player.ecr ?? "—"}</small></span>
              <em>Mark drafted</em>
            </button>
          ))}
        </div>
      ) : query.trim().length >= 2 ? <small>No available player matches that search.</small> : null}
    </div>
  );
}

export function LiveReliabilityPanel({
  available,
  state,
  freshness,
  diagnostics,
  syncStatus,
  syncMessage,
  practiceOptions,
  practiceLesson,
  onMarkDrafted,
  onReverseCorrection,
  onPractice,
}: LiveReliabilityPanelProps) {
  const activeCorrections = state.corrections.filter(
    (correction) => correction.status === "active",
  );
  const correctionLog = state.corrections.slice(0, 12);
  const decisions = [...state.decisions].reverse();

  return (
    <section className="live-reliability" aria-labelledby="live-reliability-title">
      <header className="live-reliability-heading">
        <Database />
        <span>
          <h2 id="live-reliability-title">Live corrections, history &amp; reliability</h2>
          <p>Recover from delayed feeds without changing Sleeper or losing the decision record.</p>
        </span>
        <strong className={`reliability-sync is-${syncStatus}`}>
          {syncStatus === "synced" ? <Cloud /> : <Wifi />}
          {syncStatus === "synced"
            ? "Device vault synced"
            : syncStatus === "connecting"
              ? "Syncing"
              : syncStatus === "offline"
                ? "Local fallback"
                : "Saved on this device"}
        </strong>
      </header>

      {syncMessage ? <p className="reliability-sync-message">{syncMessage}</p> : null}

      <div className="reliability-freshness-grid" aria-label="Source timestamps">
        {freshness.map((item) => (
          <article key={item.id} className={`is-${item.status.toLowerCase()}`}>
            <span><small>{item.label}</small><strong>{item.status}</strong></span>
            <time dateTime={item.fetchedAt ? new Date(item.fetchedAt).toISOString() : undefined}>
              {exactTime(item.fetchedAt)}
            </time>
            <em>{relativeAge(item.fetchedAt)}</em>
          </article>
        ))}
      </div>

      {diagnostics.length ? (
        <section className="reliability-diagnostics" aria-label="Sleeper reconciliation alerts">
          <header><AlertTriangle /><h3>Sleeper feed corrections detected</h3></header>
          {diagnostics.map((diagnostic) => (
            <p key={diagnostic.id}>{diagnostic.message}</p>
          ))}
        </section>
      ) : (
        <div className="reliability-feed-clear">
          <Check /><span><strong>Pick feed is internally consistent</strong><small>No missing, reordered, or duplicate selections detected.</small></span>
        </div>
      )}

      <div className="reliability-work-grid">
        <section className="manual-corrections">
          <header><UserMinus /><span><h3>Manual drafted-player correction</h3><small>{activeCorrections.length} active</small></span></header>
          <p>Use this only when Sleeper is late. The player leaves every availability list immediately, but the draft clock and team rosters do not move.</p>
          <ManualCorrectionSearch available={available} onMarkDrafted={onMarkDrafted} />
          <div className="correction-log">
            {correctionLog.map((correction) => (
              <article key={correction.id} className={`is-${correction.status}`}>
                <b className={`position-${correction.position.toLowerCase()}`}>{correction.position}</b>
                <span>
                  <strong>{correction.playerName}</strong>
                  <small>
                    {correction.status === "active"
                      ? `Manually unavailable · ${exactTime(correction.updatedAt)}`
                      : correction.status === "reconciled"
                        ? `Sleeper confirmed at pick #${correction.reconciledPickNumber}`
                        : `Correction reversed · ${exactTime(correction.updatedAt)}`}
                  </small>
                </span>
                {correction.status === "active" ? (
                  <button type="button" onClick={() => onReverseCorrection(correction.id)}>
                    <RotateCcw /> Reverse
                  </button>
                ) : <em>{correction.status}</em>}
              </article>
            ))}
            {!correctionLog.length ? <small>No manual corrections have been made.</small> : null}
          </div>
        </section>

        <section className="recommendation-history">
          <header><History /><span><h3>Your recommendation history</h3><small>{state.decisions.length} user turns recorded</small></span></header>
          <p>Every distinct recommendation set is timestamped while you are on the clock, then matched to the player Sleeper says you selected.</p>
          <div>
            {decisions.map((decision) => {
              const latest = decision.revisions.at(-1) ?? null;
              return (
                <details key={decision.pickNumber}>
                  <summary>
                    <span><strong>Pick #{decision.pickNumber}</strong><small>Round {decision.round} · {decision.revisions.length} recommendation revision{decision.revisions.length === 1 ? "" : "s"}</small></span>
                    <em>{decision.actualSelection?.playerName ?? "Awaiting your Sleeper pick"}</em>
                  </summary>
                  {decision.revisions.map((revision) => (
                    <article key={revision.id}>
                      <time>{exactTime(revision.recordedAt)}</time>
                      <strong>{revision.recommendations[0]?.playerName ?? "No lead"}</strong>
                      <p>{revision.changeExplanation}</p>
                      <ol>
                        {revision.recommendations.map((recommendation) => (
                          <li key={recommendation.playerId}>
                            <span>{recommendation.playerName}</span><b>{recommendation.score}</b>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                  {decision.actualSelection ? (
                    <div className="actual-selection">
                      <BookOpenCheck /><span><small>Actually selected</small><strong>{decision.actualSelection.playerName} · {decision.actualSelection.position}</strong></span>
                    </div>
                  ) : latest ? <small>Waiting for Sleeper to confirm your selection.</small> : null}
                </details>
              );
            })}
            {!decisions.length ? <small>History begins automatically at your first on-clock recommendation.</small> : null}
          </div>
        </section>
      </div>

      <section className="recommendation-practice">
        <header><FlaskConical /><span><h3>Practice: why recommendations change</h3><small>Safe simulation · never writes to Sleeper</small></span></header>
        <p>Choose a likely selection and see how availability, tiers, roster fit, opponent demand, and wait risk rebuild the next recommendation.</p>
        <div className="practice-options">
          {practiceOptions.map((player) => (
            <button type="button" key={player.id} onClick={() => onPractice(player.id)}>
              If {player.name} is drafted
            </button>
          ))}
        </div>
        {practiceLesson ? (
          <article className="practice-lesson" role="status">
            <span><small>Simulated event</small><strong>{practiceLesson.event}</strong></span>
            <div>
              <span><small>Before</small><strong>{practiceLesson.before?.playerName ?? "No recommendation"}</strong><em>{practiceLesson.before?.score ?? "—"}</em></span>
              <span><small>After</small><strong>{practiceLesson.after?.playerName ?? "No recommendation"}</strong><em>{practiceLesson.after?.score ?? "—"}</em></span>
            </div>
            <p>{practiceLesson.explanation}</p>
            {practiceLesson.factorChanges.map((factor) => (
              <small key={factor.label}>{factor.label}: {factor.delta > 0 ? "+" : ""}{factor.delta.toFixed(1)} roster value</small>
            ))}
          </article>
        ) : null}
      </section>
    </section>
  );
}
