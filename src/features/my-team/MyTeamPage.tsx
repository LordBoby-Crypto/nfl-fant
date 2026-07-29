import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleAlert,
  Dumbbell,
  Gauge,
  Layers3,
  LockKeyhole,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { useSleeperPlayers } from "../../hooks/useSleeperPlayers";
import { getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot } from "../../types";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import { analyzeLeagueTeams, type TeamAnalysis } from "./engine";

type DraftPickState = ReturnType<typeof useDraftPicks>;
type WarRoomState = ReturnType<typeof useWarRoom>;

function formatNumber(value: number | null, digits = 0) {
  return value === null ? "—" : value.toFixed(digits);
}

function MyTeamUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="team-unlock">
      <LockKeyhole />
      <div>
        <h2>Unlock your team analysis</h2>
        <p>
          Your Sleeper roster is public. FantasyPros projections and rankings
          remain behind your private War Room session.
        </p>
      </div>
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
          <small className="form-error" role="alert">{warRoom.loginError}</small>
        ) : null}
      </form>
    </section>
  );
}

function StrengthSummary({ analysis }: { analysis: TeamAnalysis }) {
  const metrics = [
    { label: "Starting lineup", value: analysis.strength.starterScore },
    { label: "Bench depth", value: analysis.strength.depthScore },
    { label: "Health", value: analysis.strength.healthScore },
  ];
  return (
    <section className="team-strength-summary">
      <div className="team-grade">
        <span>{analysis.strength.overall}</span>
        <small>ROS score</small>
      </div>
      <div className="team-strength-copy">
        <span className="team-tier"><Trophy /> {analysis.strength.tier}</span>
        <h2>{analysis.teamName}</h2>
        <p>
          Ranked <strong>#{analysis.strength.rank}</strong> of{" "}
          {analysis.strength.totalTeams} teams for rest-of-season roster
          strength.
        </p>
      </div>
      <div className="team-strength-metrics">
        {metrics.map((metric) => (
          <span key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            <i>
              <b style={{ width: `${metric.value}%` }} />
            </i>
          </span>
        ))}
      </div>
      <div className="team-strength-facts">
        <span>
          <small>Projected starters</small>
          <strong>{formatNumber(analysis.projectedPoints, 1)}</strong>
        </span>
        <span>
          <small>Lineup changes</small>
          <strong>{analysis.lineupChanges}</strong>
        </span>
        <span>
          <small>Model confidence</small>
          <strong>{analysis.strength.confidence}</strong>
        </span>
      </div>
    </section>
  );
}

function OptimizedLineup({ analysis }: { analysis: TeamAnalysis }) {
  return (
    <section className="team-panel optimized-lineup-panel">
      <header>
        <span>
          <Sparkles />
          <span>
            <h2>Optimized lineup</h2>
            <p>Best rest-of-season starters from your current roster.</p>
          </span>
        </span>
        <small>{analysis.lineupChanges} recommended change{analysis.lineupChanges === 1 ? "" : "s"}</small>
      </header>
      <div className="optimized-lineup">
        {analysis.lineup.map((assignment) => (
          <article
            key={assignment.key}
            className={!assignment.player ? "is-empty" : ""}
          >
            <span className={`position-mark position-${assignment.slot.toLowerCase()}`}>
              {assignment.slot}
            </span>
            <span className="lineup-slot">
              <small>{assignment.label}</small>
              <strong>{assignment.player?.name ?? "Empty slot"}</strong>
            </span>
            <span className="lineup-context">
              <strong>{assignment.player?.team ?? "—"}</strong>
              <small>
                {assignment.player?.byeWeek
                  ? `Bye ${assignment.player.byeWeek}`
                  : "Bye —"}
              </small>
            </span>
            <span className="lineup-value">
              <small>ROS proj.</small>
              <strong>{formatNumber(assignment.player?.projectedPoints ?? null, 1)}</strong>
            </span>
            <span className={`lineup-decision ${assignment.change}`}>
              {assignment.change === "keep" ? (
                <><Check /> Keep starting</>
              ) : assignment.change === "start" ? (
                <><ArrowUpRight /> Move into lineup</>
              ) : (
                <><CircleAlert /> Needs player</>
              )}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function DepthChart({ analysis }: { analysis: TeamAnalysis }) {
  return (
    <section className="team-panel depth-panel">
      <header>
        <span>
          <Layers3 />
          <span>
            <h2>Position depth</h2>
            <p>Starter quality, coverage and usable backups.</p>
          </span>
        </span>
      </header>
      <div className="depth-grid">
        {analysis.depth.map((depth) => (
          <article key={depth.position} className={depth.label.toLocaleLowerCase()}>
            <span className={`position-mark position-${depth.position.toLowerCase()}`}>
              {depth.position}
            </span>
            <span>
              <strong>{depth.grade}</strong>
              <small>{depth.label}</small>
            </span>
            <span>
              <small>Rostered</small>
              <strong>{depth.total}</strong>
            </span>
            <span>
              <small>Backups</small>
              <strong>{depth.bench}</strong>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function WeaknessPanel({ analysis }: { analysis: TeamAnalysis }) {
  return (
    <section className="team-panel weakness-panel">
      <header>
        <span>
          <AlertTriangle />
          <span>
            <h2>Weaknesses and priorities</h2>
            <p>What can cost your team points, ranked by urgency.</p>
          </span>
        </span>
      </header>
      <div className="weakness-list">
        {analysis.weaknesses.map((weakness) => (
          <article key={`${weakness.position}-${weakness.title}`} className={weakness.severity}>
            <span>{weakness.position}</span>
            <span>
              <strong>{weakness.title}</strong>
              <small>{weakness.detail}</small>
            </span>
            <p>{weakness.action}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BenchPanel({ analysis }: { analysis: TeamAnalysis }) {
  return (
    <section className="team-panel bench-panel">
      <header>
        <span>
          <Dumbbell />
          <span>
            <h2>Bench order</h2>
            <p>Best reserves first for injury coverage and upside.</p>
          </span>
        </span>
        <small>{analysis.bench.length} players</small>
      </header>
      <div className="bench-list">
        {analysis.bench.length ? (
          analysis.bench.map((player, index) => (
            <article key={player.sleeperId}>
              <b>{index + 1}</b>
              <span className={`position-mark position-${player.position.toLowerCase()}`}>
                {player.position}
              </span>
              <span>
                <strong>{player.name}</strong>
                <small>{player.team} · {player.positionRank || "Unranked"}</small>
              </span>
              <span>
                <small>ROS projection</small>
                <strong>{formatNumber(player.projectedPoints, 1)}</strong>
              </span>
              <em>{player.injuryStatus || "Available"}</em>
            </article>
          ))
        ) : (
          <p className="team-panel-empty">No bench players are available yet.</p>
        )}
      </div>
    </section>
  );
}

export function MyTeamPage({
  snapshot,
  draftPicks,
  warRoom,
  refreshing,
  onRefresh,
}: {
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  warRoom: WarRoomState;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const userRoster = getUserRoster(snapshot);
  const playerIds = useMemo(
    () => [
      ...snapshot.rosters.flatMap((roster) => roster.players ?? []),
      ...draftPicks.picks.map((pick) => String(pick.player_id)),
    ],
    [draftPicks.picks, snapshot.rosters],
  );
  const sleeperPlayers = useSleeperPlayers(playerIds, Boolean(userRoster));
  const analyses = useMemo(
    () =>
      warRoom.board
        ? analyzeLeagueTeams({
            snapshot,
            picks: draftPicks.picks.filter((pick) => pick.is_keeper !== true),
            board: warRoom.board.players,
            sleeperPlayers: sleeperPlayers.players,
          })
        : [],
    [draftPicks.picks, sleeperPlayers.players, snapshot, warRoom.board],
  );
  const analysis = analyses.find(
    (team) => team.rosterId === userRoster?.roster_id,
  );
  const rosterHasPlayers = Boolean(
    userRoster?.players?.length ||
      draftPicks.picks.some(
        (pick) => Number(pick.roster_id) === userRoster?.roster_id,
      ),
  );

  return (
    <main className="workspace-page my-team-page">
      <header className="page-heading team-page-heading">
        <div>
          <h1>My Team</h1>
          <p>{snapshot.league.name} · optimized lineup and rest-of-season outlook.</p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={refreshing || draftPicks.refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={refreshing || draftPicks.refreshing ? "spin" : ""} />
          Refresh team
        </button>
      </header>

      {!warRoom.isUnlocked ? <MyTeamUnlock warRoom={warRoom} /> : null}

      {warRoom.isUnlocked && !rosterHasPlayers ? (
        <section className="team-waiting">
          <Shield />
          <h2>Your team will build itself during the draft</h2>
          <p>
            This is a new redraft league, so there are no carryover players.
            As Sleeper records your picks, this page will optimize your lineup,
            grade every position and compare your roster with all 14 teams.
          </p>
          <span>
            <UsersRound /> {snapshot.league.total_rosters} teams
            <Gauge /> {snapshot.league.roster_positions.length} roster slots
            <BarChart3 /> Full PPR
          </span>
        </section>
      ) : null}

      {warRoom.isUnlocked && rosterHasPlayers && (warRoom.loadingData || sleeperPlayers.loading) ? (
        <section className="team-loading">
          <RefreshCw className="spin" />
          <strong>Building your team model…</strong>
          <small>Resolving Sleeper rosters and FantasyPros rest-of-season data.</small>
        </section>
      ) : null}

      {warRoom.isUnlocked && warRoom.dataError ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Team intelligence needs attention</strong>
            <small>{warRoom.dataError}</small>
          </span>
          <button className="button outline" type="button" onClick={warRoom.refresh}>
            Retry
          </button>
        </div>
      ) : null}

      {sleeperPlayers.error ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Sleeper player details need attention</strong>
            <small>{sleeperPlayers.error}</small>
          </span>
        </div>
      ) : null}

      {analysis && analysis.players.length ? (
        <>
          <StrengthSummary analysis={analysis} />
          {analysis.unresolvedPlayers ? (
            <div className="team-confidence-warning">
              <CircleAlert />
              {analysis.unresolvedPlayers} roster player{analysis.unresolvedPlayers === 1 ? "" : "s"} could not be matched yet. Scores are provisional.
            </div>
          ) : null}
          <div className="team-analysis-grid">
            <OptimizedLineup analysis={analysis} />
            <DepthChart analysis={analysis} />
            <WeaknessPanel analysis={analysis} />
            <BenchPanel analysis={analysis} />
          </div>
        </>
      ) : null}
    </main>
  );
}
