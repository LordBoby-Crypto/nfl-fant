import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Ban,
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Crosshair,
  Dumbbell,
  Gauge,
  HeartPulse,
  Layers3,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UsersRound,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { useSleeperPlayers } from "../../hooks/useSleeperPlayers";
import { getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot } from "../../types";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import type { DraftSelectionReview, ReportGrade } from "./engine";
import { buildPostDraftReport } from "./engine";
import { useDraftControls } from "../live-draft/useDraftControls";

type WarRoomState = ReturnType<typeof useWarRoom>;
type DraftPickState = ReturnType<typeof useDraftPicks>;

function formatNumber(value: number | null, digits = 0) {
  return value === null ? "—" : value.toFixed(digits);
}

function gradeTone(score: number) {
  return score >= 80 ? "strong" : score >= 65 ? "middle" : "weak";
}

function GradeCard({
  grade,
  icon: Icon,
}: {
  grade: ReportGrade;
  icon: typeof Gauge;
}) {
  return (
    <article className={`post-grade-card ${gradeTone(grade.score)}`}>
      <span className="post-grade-icon"><Icon /></span>
      <span className="post-grade-letter">{grade.letter}</span>
      <span>
        <strong>{grade.label}</strong>
        <small>{grade.score}/100</small>
      </span>
      <p>{grade.explanation}</p>
    </article>
  );
}

function SelectionCard({
  title,
  selection,
  tone,
}: {
  title: string;
  selection: DraftSelectionReview | null;
  tone: "best" | "worst";
}) {
  return (
    <article className={`selection-review ${tone}`}>
      <header>
        {tone === "best" ? <Star /> : <ArrowDown />}
        <span>
          <small>{title}</small>
          <strong>{selection?.name ?? "Not enough ranked evidence"}</strong>
        </span>
      </header>
      {selection ? (
        <>
          <div>
            <span className={`position-mark position-${selection.position.toLowerCase()}`}>
              {selection.position}
            </span>
            <span>Pick {selection.pick.pick_no}</span>
            <span>
              Market {formatNumber(selection.marketPick, 1)}
            </span>
            <b>
              {selection.valueDelta === null
                ? "Ungraded"
                : `${selection.valueDelta > 0 ? "+" : ""}${formatNumber(selection.valueDelta, 1)} picks`}
            </b>
          </div>
          <p>{selection.explanation}</p>
        </>
      ) : (
        <p>FantasyPros could not grade a completed selection yet.</p>
      )}
    </article>
  );
}

function PostDraftUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="post-draft-unlock">
      <LockKeyhole />
      <span>
        <h2>Unlock the evidence-based draft report</h2>
        <p>
          Sleeper confirms the draft is complete. FantasyPros rankings,
          projections, injury context and Week 1 data remain protected by your
          private War Room session.
        </p>
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
          {warRoom.loggingIn ? "Unlocking…" : "Unlock report"}
        </button>
        {warRoom.loginError ? (
          <small className="form-error" role="alert">{warRoom.loginError}</small>
        ) : null}
      </form>
    </section>
  );
}

export function PostDraftReport({
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
  const { controls } = useDraftControls();
  const playerIds = useMemo(
    () => [
      ...snapshot.rosters.flatMap((roster) => roster.players ?? []),
      ...draftPicks.picks.map((pick) => String(pick.player_id)),
    ],
    [draftPicks.picks, snapshot.rosters],
  );
  const sleeperPlayers = useSleeperPlayers(
    playerIds,
    warRoom.isUnlocked && Boolean(userRoster),
  );
  const report = useMemo(
    () =>
      userRoster && warRoom.board
        ? buildPostDraftReport({
            snapshot,
            picks: draftPicks.picks,
            board: warRoom.board.players,
            weeklyBoard: warRoom.weeklyBoard?.players ?? null,
            sleeperPlayers: sleeperPlayers.players,
            userRosterId: userRoster.roster_id,
            controls,
          })
        : null,
    [
      controls,
      draftPicks.picks,
      sleeperPlayers.players,
      snapshot,
      userRoster,
      warRoom.board,
      warRoom.weeklyBoard,
    ],
  );
  const loading =
    warRoom.isUnlocked &&
    (warRoom.loadingData || sleeperPlayers.loading || draftPicks.loading);

  return (
    <main className="post-draft-report">
      <header className="post-draft-heading">
        <div>
          <span className="draft-complete-kicker">
            <CheckCircle2 /> Draft complete
          </span>
          <h1>Post-draft report</h1>
          <p>
            Honest roster grades, selection review and the first Week 1 action plan.
          </p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={refreshing || draftPicks.refreshing || warRoom.loadingData}
          onClick={onRefresh}
        >
          <RefreshCw
            className={
              refreshing || draftPicks.refreshing || warRoom.loadingData
                ? "spin"
                : ""
            }
          />
          Refresh report
        </button>
      </header>

      {!warRoom.isUnlocked ? <PostDraftUnlock warRoom={warRoom} /> : null}

      {loading ? (
        <section className="post-report-loading">
          <RefreshCw className="spin" />
          <span>
            <strong>Grading the completed draft…</strong>
            <small>
              Resolving every roster, selection, market value and Week 1 projection.
            </small>
          </span>
        </section>
      ) : null}

      {warRoom.isUnlocked && (warRoom.dataError || sleeperPlayers.error) ? (
        <div className="data-error post-report-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Some report evidence could not refresh</strong>
            <small>
              {warRoom.dataError ?? sleeperPlayers.error} Last-known rankings
              remain available when possible.
            </small>
          </span>
        </div>
      ) : null}

      {report ? (
        <>
          <section className={`post-overall ${gradeTone(report.overall.score)}`}>
            <div className="overall-grade">
              <span>{report.overall.letter}</span>
              <small>{report.overall.score}/100</small>
            </div>
            <div>
              <span className="overall-rank">
                <Trophy />
                #{report.team.strength.rank} of {report.team.strength.totalTeams}
              </span>
              <h2>{report.team.teamName}</h2>
              <p>{report.overall.explanation}</p>
              <small>
                {report.reviewedSelections} selections reviewed
                {report.ungradedSelections
                  ? ` · ${report.ungradedSelections} lacked a market baseline`
                  : " · every selection matched"}
                {" · "}
                {report.team.strength.confidence} model confidence
              </small>
            </div>
          </section>

          <section className="post-report-section">
            <header>
              <span>
                <Gauge />
                <span>
                  <h2>Roster grades</h2>
                  <p>Starting quality, reserves, structural coverage and safety.</p>
                </span>
              </span>
            </header>
            <div className="post-grade-grid">
              <GradeCard grade={report.grades.startingLineup} icon={UsersRound} />
              <GradeCard grade={report.grades.bench} icon={Dumbbell} />
              <GradeCard grade={report.grades.depth} icon={Layers3} />
              <GradeCard grade={report.grades.risk} icon={ShieldCheck} />
            </div>
          </section>

          <section className="post-report-section">
            <header>
              <span>
                <ClipboardCheck />
                <span>
                  <h2>Selection audit</h2>
                  <p>Actual pick number compared with FantasyPros ADP, then ECR.</p>
                </span>
              </span>
            </header>
            <div className="selection-review-grid">
              <SelectionCard
                title="Best selection"
                selection={report.bestSelection}
                tone="best"
              />
              <SelectionCard
                title="Worst selection"
                selection={report.worstSelection}
                tone="worst"
              />
            </div>
            <div className="reach-review-grid">
              <article>
                <header>
                  <BadgeCheck />
                  <span>
                    <strong>Justified reaches</strong>
                    <small>{report.justifiedReaches.length} selections</small>
                  </span>
                </header>
                {report.justifiedReaches.length ? (
                  report.justifiedReaches.map((reach) => (
                    <div key={reach.pick.pick_no}>
                      <span className={`position-mark position-${reach.position.toLowerCase()}`}>
                        {reach.position}
                      </span>
                      <span>
                        <strong>{reach.name}</strong>
                        <small>Pick {reach.pick.pick_no} · {reach.explanation}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p>No early pick met the reach threshold and objective justification.</p>
                )}
              </article>
              <article className="unnecessary">
                <header>
                  <Ban />
                  <span>
                    <strong>Unnecessary reaches</strong>
                    <small>{report.unnecessaryReaches.length} selections</small>
                  </span>
                </header>
                {report.unnecessaryReaches.length ? (
                  report.unnecessaryReaches.map((reach) => (
                    <div key={reach.pick.pick_no}>
                      <span className={`position-mark position-${reach.position.toLowerCase()}`}>
                        {reach.position}
                      </span>
                      <span>
                        <strong>{reach.name}</strong>
                        <small>Pick {reach.pick.pick_no} · {reach.explanation}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p>No selection paid an unjustified premium under this model.</p>
                )}
              </article>
            </div>
            <div className="waited-on">
              <header>
                <Crosshair />
                <span>
                  <strong>Players you successfully waited on</strong>
                  <small>Drafted at least half a league round after market</small>
                </span>
              </header>
              <div>
                {report.waitedOn.length ? (
                  report.waitedOn.map((selection) => (
                    <span key={selection.pick.pick_no}>
                      <b>{selection.name}</b>
                      <small>
                        Pick {selection.pick.pick_no} · +{formatNumber(selection.valueDelta, 1)}
                      </small>
                    </span>
                  ))
                ) : (
                  <p>No completed selection cleared the conservative wait-win threshold.</p>
                )}
              </div>
            </div>
          </section>

          <section className="post-report-section">
            <header>
              <span>
                <HeartPulse />
                <span>
                  <h2>Bye-week and injury risk</h2>
                  <p>Concentrations that can create a lineup emergency.</p>
                </span>
              </span>
            </header>
            <div className="risk-concentration-grid">
              <article className={report.injuryConcentration.level}>
                <HeartPulse />
                <span>
                  <strong>{report.injuryConcentration.title}</strong>
                  <p>{report.injuryConcentration.detail}</p>
                  <small>
                    {report.injuryConcentration.players.join(", ") ||
                      "No flagged players"}
                  </small>
                </span>
              </article>
              <article
                className={
                  report.byeConcentrations.some((item) => item.level === "risk")
                    ? "risk"
                    : report.byeConcentrations.length
                      ? "watch"
                      : "clear"
                }
              >
                <CalendarRange />
                <span>
                  <strong>
                    {report.byeConcentrations.length
                      ? `${report.byeConcentrations.length} bye-week concentration${report.byeConcentrations.length === 1 ? "" : "s"}`
                      : "No material bye-week concentration"}
                  </strong>
                  {report.byeConcentrations.length ? (
                    report.byeConcentrations.map((item) => (
                      <p key={item.title}>
                        <b>{item.title}</b> · {item.players.join(", ")}
                      </p>
                    ))
                  ) : (
                    <p>No week currently has three starters or four total players.</p>
                  )}
                </span>
              </article>
            </div>
          </section>

          <section className="post-report-section post-action-section">
            <header>
              <span>
                <Sparkles />
                <span>
                  <h2>Immediate action plan</h2>
                  <p>Best undrafted talent and the first waiver watchlist.</p>
                </span>
              </span>
            </header>
            <div className="post-action-grid">
              <article>
                <header>
                  <Trophy />
                  <span>
                    <strong>Best available undrafted</strong>
                    <small>Top 10 by current consensus rank</small>
                  </span>
                </header>
                <div className="post-player-list">
                  {report.bestAvailable.map((player, index) => (
                    <div key={player.id}>
                      <b>{index + 1}</b>
                      <span className={`position-mark position-${player.position.toLowerCase()}`}>
                        {player.position}
                      </span>
                      <span>
                        <strong>{player.name}</strong>
                        <small>
                          {player.team} · ECR {formatNumber(player.ecr)} · ADP{" "}
                          {formatNumber(player.adp, 1)}
                        </small>
                      </span>
                      <em>Tier {formatNumber(player.tier)}</em>
                    </div>
                  ))}
                </div>
              </article>
              <article>
                <header>
                  <ListChecks />
                  <span>
                    <strong>First waiver watchlist</strong>
                    <small>Need, saved intent and upside combined</small>
                  </span>
                </header>
                <div className="post-player-list waiver-watch">
                  {report.waiverWatchlist.map((item, index) => (
                    <div key={item.player.id}>
                      <b>{index + 1}</b>
                      <span className={`position-mark position-${item.player.position.toLowerCase()}`}>
                        {item.player.position}
                      </span>
                      <span>
                        <strong>{item.player.name}</strong>
                        <small>{item.reason}</small>
                      </span>
                      <em>{item.score}</em>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="post-report-section">
            <header>
              <span>
                <UsersRound />
                <span>
                  <h2>Week 1 optimized lineup</h2>
                  <p>
                    {report.weekOneProjectionReady
                      ? "FantasyPros Week 1 projections with injury-aware slot optimization."
                      : "Weekly projections are not published yet; current rankings are the fallback."}
                  </p>
                </span>
              </span>
              <small className={report.weekOneProjectionReady ? "ready" : "fallback"}>
                {report.weekOneProjectionReady ? "Week 1 data ready" : "Rankings fallback"}
              </small>
            </header>
            <div className="week-one-lineup">
              {report.weekOneLineup.map((assignment) => (
                <article key={assignment.key} className={!assignment.player ? "empty" : ""}>
                  <span className={`position-mark position-${assignment.slot.toLowerCase()}`}>
                    {assignment.slot}
                  </span>
                  <span>
                    <small>{assignment.label}</small>
                    <strong>{assignment.player?.name ?? "Empty slot"}</strong>
                  </span>
                  <span>
                    <strong>{assignment.player?.team ?? "—"}</strong>
                    <small>
                      {assignment.player?.byeWeek
                        ? `Bye ${assignment.player.byeWeek}`
                        : "Bye —"}
                    </small>
                  </span>
                  <span>
                    <small>Week 1 projection</small>
                    <strong>
                      {formatNumber(assignment.player?.projectedPoints ?? null, 1)}
                    </strong>
                  </span>
                  <em className={assignment.change}>
                    {assignment.change === "start"
                      ? "Move into lineup"
                      : assignment.change === "keep"
                        ? "Keep starting"
                        : "Add player"}
                  </em>
                </article>
              ))}
            </div>
          </section>

          <section className="post-report-section weakness-priority-section">
            <header>
              <span>
                <AlertTriangle />
                <span>
                  <h2>Weaknesses to address first</h2>
                  <p>Ordered by structural urgency, not by name recognition.</p>
                </span>
              </span>
            </header>
            <div>
              {report.weaknesses.map((weakness, index) => (
                <article
                  key={`${weakness.position}-${weakness.title}`}
                  className={weakness.severity}
                >
                  <b>{index + 1}</b>
                  <span>{weakness.position}</span>
                  <span>
                    <strong>{weakness.title}</strong>
                    <small>{weakness.detail}</small>
                  </span>
                  <p>
                    {weakness.action} <ArrowRight />
                  </p>
                </article>
              ))}
            </div>
          </section>

          {report.team.unresolvedPlayers ? (
            <div className="post-report-caveat">
              <AlertTriangle />
              <span>
                <strong>This grade is provisional</strong>
                <small>
                  {report.team.unresolvedPlayers} roster player
                  {report.team.unresolvedPlayers === 1 ? "" : "s"} could not be
                  matched to a ranked player. The report refuses to invent grades
                  for those selections.
                </small>
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
