import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Wifi,
  XCircle,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import type { useIntelligenceStatus } from "../../hooks/useIntelligenceStatus";
import type { useLeagueSnapshot } from "../../hooks/useLeagueSnapshot";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import {
  buildReadinessReport,
  type ReadinessCheck,
  type ReadinessLevel,
} from "./engine";
import { useOnlineState, usePreflightPlayerMatch } from "./usePreflight";

type LeagueState = ReturnType<typeof useLeagueSnapshot>;
type PickState = ReturnType<typeof useDraftPicks>;
type IntelligenceState = ReturnType<typeof useIntelligenceStatus>;
type WarRoomState = ReturnType<typeof useWarRoom>;

const GROUPS: ReadinessCheck["group"][] = [
  "Sleeper feeds",
  "FantasyPros",
  "Draft setup",
  "Reliability",
];

const LEVEL_COPY: Record<
  ReadinessLevel,
  { label: string; icon: typeof CheckCircle2 }
> = {
  green: { label: "Passed", icon: CheckCircle2 },
  yellow: { label: "Warning", icon: AlertTriangle },
  red: { label: "Blocked", icon: XCircle },
};

function formatLastSuccess(timestamp: number | null) {
  if (!timestamp) return "No successful update";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const config = LEVEL_COPY[check.level];
  const Icon = config.icon;
  return (
    <article className={`preflight-check is-${check.level}`}>
      <span className="preflight-check-icon"><Icon /></span>
      <span className="preflight-check-copy">
        <small>{check.label}</small>
        <strong>{check.summary}</strong>
        <p>{check.detail}</p>
      </span>
      <span className="preflight-check-meta">
        <b>{config.label}</b>
        <small>
          <Clock3 />
          {formatLastSuccess(check.lastSuccessfulAt)}
        </small>
      </span>
    </article>
  );
}

function SessionUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    if (await warRoom.login(password)) setPassword("");
  }

  return (
    <section className="preflight-unlock">
      <LockKeyhole />
      <span>
        <strong>Unlock to complete the FantasyPros tests</strong>
        <small>
          The preflight must load real rankings and projections, measure their
          freshness, and match the board against Sleeper.
        </small>
      </span>
      <form onSubmit={submit}>
        <input
          aria-label="War Room password"
          type="password"
          autoComplete="current-password"
          placeholder="War Room password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          className="button primary"
          type="submit"
          disabled={!password || warRoom.loggingIn}
        >
          {warRoom.loggingIn ? <RefreshCw className="spin" /> : <LockKeyhole />}
          {warRoom.loggingIn ? "Unlocking…" : "Unlock"}
        </button>
        {warRoom.loginError ? (
          <small className="form-error" role="alert">
            {warRoom.loginError}
          </small>
        ) : null}
      </form>
    </section>
  );
}

export function PreflightReport({
  league,
  draftPicks,
  intelligence,
  warRoom,
  running,
  refreshKey,
  onRun,
}: {
  league: LeagueState;
  draftPicks: PickState;
  intelligence: IntelligenceState;
  warRoom: WarRoomState;
  running: boolean;
  refreshKey: number;
  onRun: () => void;
}) {
  const online = useOnlineState();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const playerMatch = usePreflightPlayerMatch(
    warRoom.board?.players ?? [],
    Boolean(league.data && warRoom.isUnlocked),
    refreshKey,
  );
  const report = useMemo(
    () =>
      league.data
        ? buildReadinessReport({
            snapshot: league.data,
            snapshotTelemetry: league.telemetry,
            snapshotError: league.error,
            draftPicks,
            board: warRoom.board,
            boardError: warRoom.dataError,
            sessionExpiresAt: warRoom.sessionExpiresAt,
            coverage: playerMatch.coverage,
            playerFeed: {
              error: playerMatch.error,
              durationMs: playerMatch.durationMs,
              attempts: playerMatch.attempts,
              lastSuccessfulAt: playerMatch.lastSuccessfulAt,
            },
            backend: {
              linked: intelligence.linked,
              configured: Boolean(intelligence.data?.configured),
              error: intelligence.error,
              responseTimeMs: intelligence.responseTimeMs,
              lastSuccessfulAt: intelligence.lastSuccessfulAt,
            },
            online,
            now,
          })
        : null,
    [
      draftPicks,
      intelligence.data?.configured,
      intelligence.error,
      intelligence.lastSuccessfulAt,
      intelligence.linked,
      intelligence.responseTimeMs,
      league.data,
      league.error,
      league.telemetry,
      now,
      online,
      playerMatch.attempts,
      playerMatch.coverage,
      playerMatch.durationMs,
      playerMatch.error,
      playerMatch.lastSuccessfulAt,
      warRoom.board,
      warRoom.dataError,
      warRoom.sessionExpiresAt,
    ],
  );

  if (!report) return null;
  const OverallIcon =
    report.overall === "green"
      ? ShieldCheck
      : report.overall === "yellow"
        ? AlertTriangle
        : XCircle;

  return (
    <section className="preflight-report" aria-labelledby="preflight-title">
      <header className={`preflight-summary is-${report.overall}`}>
        <span className="preflight-overall-icon"><OverallIcon /></span>
        <span>
          <small>Milestone 10 · Draft-day preflight</small>
          <h2 id="preflight-title">{report.headline}</h2>
          <p>
            Live evidence from Sleeper, FantasyPros, your private session and
            this browser. Sleeper settings are rechecked automatically when the
            app opens, refreshes, reconnects and throughout a live draft.
          </p>
        </span>
        <div className="preflight-counts" aria-label="Readiness totals">
          <span className="is-green"><strong>{report.counts.green}</strong><small>green</small></span>
          <span className="is-yellow"><strong>{report.counts.yellow}</strong><small>yellow</small></span>
          <span className="is-red"><strong>{report.counts.red}</strong><small>red</small></span>
        </div>
        <button
          className="button primary"
          type="button"
          disabled={running || playerMatch.loading}
          onClick={onRun}
        >
          <RefreshCw className={running || playerMatch.loading ? "spin" : ""} />
          {running || playerMatch.loading ? "Running checks…" : "Run full preflight"}
        </button>
      </header>

      {!warRoom.isUnlocked ? <SessionUnlock warRoom={warRoom} /> : null}

      {report.blockers.length || report.warnings.length ? (
        <section className="preflight-actions">
          <header>
            <AlertTriangle />
            <span>
              <h3>Fix before draft day</h3>
              <p>Red items block a clean release. Yellow items need confirmation.</p>
            </span>
          </header>
          <div>
            {[...report.blockers, ...report.warnings].map((check) => (
              <span className={`is-${check.level}`} key={check.id}>
                <b>{check.label}</b>
                <small>{check.summary}</small>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="preflight-groups">
        {GROUPS.map((group) => (
          <section className="preflight-group" key={group}>
            <header>
              {group === "Reliability" ? <Wifi /> : <CheckCircle2 />}
              <h3>{group}</h3>
              <small>
                {report.checks.filter((check) => check.group === group).length} checks
              </small>
            </header>
            <div>
              {report.checks
                .filter((check) => check.group === group)
                .map((check) => <CheckRow check={check} key={check.id} />)}
            </div>
          </section>
        ))}
      </div>

      <footer className="preflight-recovery-note">
        <ShieldCheck />
        <span>
          <strong>Pick recovery is fail-safe</strong>
          <small>
            Sleeper requests retry automatically up to three times. Picks are
            deduplicated by pick number, and a shorter or failed response keeps
            the last complete board instead of erasing selections.
          </small>
        </span>
      </footer>
    </section>
  );
}
