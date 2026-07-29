import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  CircleAlert,
  Gauge,
  HeartPulse,
  LockKeyhole,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { useSleeperPlayers } from "../../hooks/useSleeperPlayers";
import type { useWeeklyOutlook } from "../../hooks/useWeeklyOutlook";
import { getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot } from "../../types";
import { analyzeLeagueTeams } from "../my-team/engine";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import {
  buildWeeklyDecisionModel,
  type InjuryAlert,
  type WeeklyDecisionModel,
} from "./engine";

type DraftPickState = ReturnType<typeof useDraftPicks>;
type WarRoomState = ReturnType<typeof useWarRoom>;
type WeeklyState = ReturnType<typeof useWeeklyOutlook>;

function MatchupUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="weekly-unlock">
      <LockKeyhole />
      <div>
        <h2>Unlock weekly decisions</h2>
        <p>
          Weekly projections, injury intelligence and playoff simulations stay
          behind your private War Room session.
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
          <small className="form-error" role="alert">
            {warRoom.loginError}
          </small>
        ) : null}
      </form>
    </section>
  );
}

function MatchupCommand({
  model,
  userRosterId,
}: {
  model: WeeklyDecisionModel;
  userRosterId: number;
}) {
  if (!model.matchup) {
    return (
      <section className="weekly-panel weekly-matchup-pending">
        <CalendarDays />
        <div>
          <h2>Week {model.week} opponent is not published yet</h2>
          <p>
            Sleeper has not paired this roster for the week. Start/sit and
            injury guidance can still update after lineups exist.
          </p>
        </div>
      </section>
    );
  }

  const matchup = model.matchup;
  const userIsLeft = matchup.user.rosterId === userRosterId;
  const user = userIsLeft ? matchup.user : matchup.opponent;
  const opponent = userIsLeft ? matchup.opponent : matchup.user;
  const userPoints = userIsLeft ? matchup.userPoints : matchup.opponentPoints;
  const opponentPoints = userIsLeft
    ? matchup.opponentPoints
    : matchup.userPoints;
  const winProbability = userIsLeft
    ? matchup.userWinProbability
    : 100 - matchup.userWinProbability;

  return (
    <section className="weekly-matchup-command">
      <header>
        <span>
          <Swords />
          <span>
            <small>Week {model.week} matchup</small>
            <h2>{user.teamName} vs {opponent.teamName}</h2>
          </span>
        </span>
        <span className="weekly-win-odds">
          <strong>{winProbability}%</strong>
          <small>projected win chance</small>
        </span>
      </header>
      <div className="weekly-team-score">
        <article>
          <span className="weekly-team-mark">YOU</span>
          <span>
            <small>Your optimized starters</small>
            <strong>{user.teamName}</strong>
            <em>ROS rank #{user.strength.rank}</em>
          </span>
          <span>
            <small>Week projection</small>
            <strong>{user.projectedPoints?.toFixed(1) ?? "—"}</strong>
            <em>{userPoints.toFixed(1)} scored</em>
          </span>
        </article>
        <span className="weekly-versus">VS</span>
        <article>
          <span className="weekly-team-mark opponent">OPP</span>
          <span>
            <small>Opponent</small>
            <strong>{opponent.teamName}</strong>
            <em>ROS rank #{opponent.strength.rank}</em>
          </span>
          <span>
            <small>Week projection</small>
            <strong>{opponent.projectedPoints?.toFixed(1) ?? "—"}</strong>
            <em>{opponentPoints.toFixed(1)} scored</em>
          </span>
        </article>
      </div>
      <footer>
        <Gauge />
        Win chance uses {matchup.projectionSource === "weekly"
          ? "FantasyPros weekly lineup projections"
          : "rest-of-season roster strength until weekly projections publish"}.
      </footer>
    </section>
  );
}

function StartSitPanel({ model }: { model: WeeklyDecisionModel }) {
  return (
    <section className="weekly-panel start-sit-panel">
      <header>
        <span>
          <Sparkles />
          <span>
            <h2>Start / sit calls</h2>
            <p>Changes from your current Sleeper starters for Week {model.week}.</p>
          </span>
        </span>
        <small>{model.startSit.length} move{model.startSit.length === 1 ? "" : "s"}</small>
      </header>
      {model.startSit.length ? (
        <div className="start-sit-list">
          {model.startSit.map((decision) => (
            <article key={`${decision.slot}-${decision.start.sleeperId}`}>
              <span className="start-sit-slot">{decision.slot}</span>
              <span className="start-call">
                <ArrowUp />
                <span>
                  <small>Start</small>
                  <strong>{decision.start.name}</strong>
                  <em>
                    {decision.start.team} · {decision.start.projectedPoints?.toFixed(1) ?? "—"} projected
                  </em>
                </span>
              </span>
              <ArrowRight className="start-sit-arrow" />
              <span className="sit-call">
                <ArrowDown />
                <span>
                  <small>Sit</small>
                  <strong>{decision.sit?.name ?? "Open slot"}</strong>
                  <em>
                    {decision.sit
                      ? `${decision.sit.team} · ${decision.sit.projectedPoints?.toFixed(1) ?? "—"} projected`
                      : "No eligible current starter"}
                  </em>
                </span>
              </span>
              <span className="start-sit-evidence">
                <strong>
                  {decision.projectedGain === null
                    ? decision.confidence
                    : `${decision.projectedGain >= 0 ? "+" : ""}${decision.projectedGain.toFixed(1)} pts`}
                </strong>
                <small>{decision.reason}</small>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="weekly-clear-state">
          <Check />
          <span>
            <strong>Your current starters already match the weekly optimizer</strong>
            <small>Recheck after injury reports and inactive lists update.</small>
          </span>
        </div>
      )}
    </section>
  );
}

function injuryIcon(alert: InjuryAlert) {
  return alert.severity === "critical" ? (
    <CircleAlert />
  ) : alert.severity === "warning" ? (
    <AlertTriangle />
  ) : (
    <Activity />
  );
}

function InjuryPanel({ model }: { model: WeeklyDecisionModel }) {
  return (
    <section className="weekly-panel injury-panel">
      <header>
        <span>
          <HeartPulse />
          <span>
            <h2>Injury alerts</h2>
            <p>Availability and practice risks that can change your lineup.</p>
          </span>
        </span>
        <small>{model.injuries.length} alert{model.injuries.length === 1 ? "" : "s"}</small>
      </header>
      {model.injuries.length ? (
        <div className="injury-alert-list">
          {model.injuries.map((alert) => (
            <article
              key={alert.player.sleeperId}
              className={`injury-${alert.severity}`}
            >
              <span className="injury-alert-icon">{injuryIcon(alert)}</span>
              <span>
                <small>{alert.lineupImpact} · {alert.player.position}</small>
                <strong>{alert.title}</strong>
                <em>{alert.detail}</em>
              </span>
              <p>{alert.action}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="weekly-clear-state">
          <Shield />
          <span>
            <strong>No injury action is required right now</strong>
            <small>Alerts will appear when FantasyPros reports an availability concern.</small>
          </span>
        </div>
      )}
    </section>
  );
}

function PlayoffPanel({
  model,
  userRosterId,
  playoffTeams,
}: {
  model: WeeklyDecisionModel;
  userRosterId: number;
  playoffTeams: number;
}) {
  const user = model.playoffOdds.find((team) => team.rosterId === userRosterId);
  return (
    <section className="weekly-panel playoff-panel">
      <header>
        <span>
          <Trophy />
          <span>
            <h2>Playoff odds</h2>
            <p>
              3,000 schedule simulations for {playoffTeams} playoff spots.
            </p>
          </span>
        </span>
        {user ? (
          <span className="user-playoff-odd">
            <strong>{user.probability}%</strong>
            <small>your odds</small>
          </span>
        ) : null}
      </header>
      {model.playoffOdds.length ? (
        <div className="playoff-table">
          {model.playoffOdds.map((team, index) => (
            <article
              key={team.rosterId}
              className={team.rosterId === userRosterId ? "is-user" : ""}
            >
              <b>{index + 1}</b>
              <span>
                <strong>{team.teamName}</strong>
                <small>
                  {team.currentWins.toFixed(1)} wins · strength {team.strength}
                </small>
              </span>
              <span>
                <small>Avg. seed</small>
                <strong>{team.projectedSeed.toFixed(1)}</strong>
              </span>
              <span className="playoff-probability">
                <i><b style={{ width: `${team.probability}%` }} /></i>
                <strong>{team.probability}%</strong>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="weekly-clear-state is-pending">
          <CalendarDays />
          <span>
            <strong>Playoff odds need the regular-season schedule</strong>
            <small>Sleeper has not published enough matchups to simulate yet.</small>
          </span>
        </div>
      )}
    </section>
  );
}

function SchedulePanel({
  model,
  userRosterId,
}: {
  model: WeeklyDecisionModel;
  userRosterId: number;
}) {
  const userDifficulty = model.scheduleDifficulty.find(
    (team) => team.rosterId === userRosterId,
  );
  const easiest = [...model.scheduleDifficulty]
    .filter((team) => team.rank !== null)
    .sort((left, right) => (right.rank ?? 0) - (left.rank ?? 0))
    .slice(0, 3);
  const hardest = model.scheduleDifficulty
    .filter((team) => team.rank !== null)
    .slice(0, 3);

  return (
    <section className="weekly-panel schedule-panel">
      <header>
        <span>
          <CalendarDays />
          <span>
            <h2>Schedule difficulty</h2>
            <p>Opponent roster strength through the fantasy regular season.</p>
          </span>
        </span>
        {userDifficulty ? (
          <span className={`schedule-label schedule-${userDifficulty.label.toLocaleLowerCase()}`}>
            <strong>{userDifficulty.label}</strong>
            <small>
              {userDifficulty.rank
                ? `#${userDifficulty.rank} hardest`
                : "schedule pending"}
            </small>
          </span>
        ) : null}
      </header>
      <div className="schedule-body">
        <div className="user-schedule-list">
          <h3>Your remaining opponents</h3>
          {model.userSchedule.length ? (
            model.userSchedule.map((week) => (
              <article key={`${week.week}-${week.opponentRosterId}`}>
                <b>W{week.week}</b>
                <span>
                  <strong>{week.opponentName}</strong>
                  <small>ROS opponent strength</small>
                </span>
                <em>{week.opponentStrength}</em>
              </article>
            ))
          ) : (
            <p>Sleeper has not published your remaining pairings.</p>
          )}
        </div>
        <div className="league-schedule-extremes">
          <section>
            <h3><ArrowUp /> Hardest paths</h3>
            {hardest.map((team) => (
              <span key={team.rosterId}>
                <strong>{team.teamName}</strong>
                <em>{team.averageOpponentStrength?.toFixed(1) ?? "—"}</em>
              </span>
            ))}
          </section>
          <section>
            <h3><ArrowDown /> Easiest paths</h3>
            {easiest.map((team) => (
              <span key={team.rosterId}>
                <strong>{team.teamName}</strong>
                <em>{team.averageOpponentStrength?.toFixed(1) ?? "—"}</em>
              </span>
            ))}
          </section>
        </div>
      </div>
    </section>
  );
}

export function WeeklyMatchupPage({
  snapshot,
  draftPicks,
  warRoom,
  weekly,
  refreshing,
  onRefresh,
}: {
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  warRoom: WarRoomState;
  weekly: WeeklyState;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const userRoster = getUserRoster(snapshot);
  const rosterHasPlayers = Boolean(
    userRoster?.players?.length ||
      draftPicks.picks.some(
        (pick) => Number(pick.roster_id) === userRoster?.roster_id,
      ),
  );
  const playerIds = useMemo(
    () => [
      ...snapshot.rosters.flatMap((roster) => roster.players ?? []),
      ...draftPicks.picks.map((pick) => String(pick.player_id)),
    ],
    [draftPicks.picks, snapshot.rosters],
  );
  const sleeperPlayers = useSleeperPlayers(
    playerIds,
    Boolean(userRoster && rosterHasPlayers),
  );
  const rosTeams = useMemo(
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
  const weeklyTeams = useMemo(
    () =>
      warRoom.weeklyBoard
        ? analyzeLeagueTeams({
            snapshot,
            picks: draftPicks.picks.filter((pick) => pick.is_keeper !== true),
            board: warRoom.weeklyBoard.players,
            sleeperPlayers: sleeperPlayers.players,
          })
        : [],
    [draftPicks.picks, sleeperPlayers.players, snapshot, warRoom.weeklyBoard],
  );
  const model = useMemo(
    () =>
      weekly.data &&
      userRoster &&
      rosTeams.length &&
      weeklyTeams.length
        ? buildWeeklyDecisionModel({
            snapshot,
            outlook: weekly.data,
            weeklyTeams,
            rosTeams,
            userRosterId: userRoster.roster_id,
          })
        : null,
    [rosTeams, snapshot, userRoster, weekly.data, weeklyTeams],
  );
  const busy =
    refreshing ||
    draftPicks.refreshing ||
    weekly.refreshing ||
    weekly.loading;

  return (
    <main className="workspace-page weekly-page">
      <header className="page-heading weekly-page-heading">
        <div>
          <h1>Weekly Matchup</h1>
          <p>
            {snapshot.league.name} · lineup calls, injury risk and playoff path.
          </p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw className={busy ? "spin" : ""} />
          Refresh week
        </button>
      </header>

      {!warRoom.isUnlocked ? <MatchupUnlock warRoom={warRoom} /> : null}

      {warRoom.isUnlocked && !rosterHasPlayers ? (
        <section className="weekly-waiting">
          <Swords />
          <h2>Weekly decisions begin after your draft</h2>
          <p>
            This new redraft league has no roster or matchup schedule yet. Once
            Sleeper records the draft, this page will build weekly start/sit
            calls, injury alerts, playoff odds and schedule difficulty.
          </p>
          <span>
            <UsersRound /> {snapshot.league.total_rosters} teams
            <Trophy /> {snapshot.league.settings.playoff_teams} playoff spots
            <CalendarDays /> Playoffs Week {snapshot.league.settings.playoff_week_start}
          </span>
        </section>
      ) : null}

      {warRoom.isUnlocked &&
      rosterHasPlayers &&
      (warRoom.loadingData ||
        sleeperPlayers.loading ||
        weekly.loading) ? (
        <section className="weekly-loading">
          <RefreshCw className="spin" />
          <strong>Building Week {weekly.data?.currentWeek ?? 1} decisions…</strong>
          <small>
            Combining Sleeper matchups with weekly and rest-of-season projections.
          </small>
        </section>
      ) : null}

      {warRoom.isUnlocked && (warRoom.dataError || sleeperPlayers.error || weekly.error) ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Weekly intelligence needs attention</strong>
            <small>
              {warRoom.dataError ?? sleeperPlayers.error ?? weekly.error}
            </small>
          </span>
          <button className="button outline" type="button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      ) : null}

      {model && userRoster ? (
        <>
          <MatchupCommand model={model} userRosterId={userRoster.roster_id} />
          <div className="weekly-grid">
            <StartSitPanel model={model} />
            <InjuryPanel model={model} />
            <PlayoffPanel
              model={model}
              userRosterId={userRoster.roster_id}
              playoffTeams={snapshot.league.settings.playoff_teams}
            />
            <SchedulePanel model={model} userRosterId={userRoster.roster_id} />
          </div>
          <p className="weekly-model-note">
            <Activity />
            Playoff odds are model estimates, not guarantees. Submit lineup
            changes in Sleeper before each player&apos;s game locks.
          </p>
        </>
      ) : null}
    </main>
  );
}
