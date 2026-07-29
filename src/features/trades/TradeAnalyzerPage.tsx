import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CircleAlert,
  Gauge,
  LockKeyhole,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { useSleeperPlayers } from "../../hooks/useSleeperPlayers";
import { getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot } from "../../types";
import {
  analyzeLeagueTeams,
  type TeamAnalysis,
  type TeamPlayer,
} from "../my-team/engine";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import {
  analyzeTrade,
  type TradeAnalysis,
  type TradeTeamImpact,
} from "./engine";

type DraftPickState = ReturnType<typeof useDraftPicks>;
type WarRoomState = ReturnType<typeof useWarRoom>;

interface SubmittedOffer {
  partnerRosterId: number;
  userSends: string[];
  partnerSends: string[];
}

const MAX_PLAYERS_PER_SIDE = 4;

function signed(value: number, digits = 0) {
  const formatted = value.toFixed(digits);
  return value > 0 ? `+${formatted}` : formatted;
}

function TradeUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="trade-unlock">
      <LockKeyhole />
      <div>
        <h2>Unlock trade intelligence</h2>
        <p>
          Trades use protected rest-of-season rankings and projections. Your
          FantasyPros API key never enters the browser.
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

function RosterPlayerRow({
  player,
  selected,
  disabled,
  onToggle,
}: {
  player: TeamPlayer;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`trade-player-row ${selected ? "is-selected" : ""}`}
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <span className={`position-mark position-${player.position.toLowerCase()}`}>
        {player.position}
      </span>
      <span className="trade-player-name">
        <strong>{player.name}</strong>
        <small>
          {player.team} · {player.positionRank || "Unranked"}
          {player.byeWeek ? ` · Bye ${player.byeWeek}` : ""}
        </small>
      </span>
      <span className="trade-player-projection">
        <small>ROS proj.</small>
        <strong>
          {player.projectedPoints === null
            ? "—"
            : player.projectedPoints.toFixed(1)}
        </strong>
      </span>
      <span className="trade-player-select">
        {selected ? <Check /> : <span />}
      </span>
    </button>
  );
}

function RosterSide({
  label,
  team,
  selectedIds,
  query,
  onQuery,
  onToggle,
}: {
  label: string;
  team: TeamAnalysis;
  selectedIds: string[];
  query: string;
  onQuery: (value: string) => void;
  onToggle: (id: string) => void;
}) {
  const normalized = query.trim().toLowerCase();
  const players = team.players.filter(
    (player) =>
      !normalized ||
      player.name.toLowerCase().includes(normalized) ||
      player.position.toLowerCase().includes(normalized) ||
      player.team.toLowerCase().includes(normalized),
  );
  const needs = team.depth
    .filter((item) => item.required > 0 && item.grade < 62)
    .sort((left, right) => left.grade - right.grade)
    .slice(0, 3);
  return (
    <section className="trade-roster-side">
      <header>
        <span>
          <small>{label}</small>
          <h2>{team.teamName}</h2>
          <p>
            ROS #{team.strength.rank} · {team.strength.overall} score
          </p>
        </span>
        <span className="trade-needs">
          <small>Needs</small>
          <strong>
            {needs.length
              ? needs.map((item) => item.position).join(" · ")
              : "No urgent need"}
          </strong>
        </span>
      </header>
      <label className="trade-player-search">
        <Search />
        <input
          type="search"
          placeholder="Find roster player"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <div className="trade-player-list">
        {players.map((player) => (
          <RosterPlayerRow
            key={player.sleeperId}
            player={player}
            selected={selectedIds.includes(player.sleeperId)}
            disabled={
              selectedIds.length >= MAX_PLAYERS_PER_SIDE &&
              !selectedIds.includes(player.sleeperId)
            }
            onToggle={() => onToggle(player.sleeperId)}
          />
        ))}
        {!players.length ? (
          <p className="trade-no-players">No roster players match that search.</p>
        ) : null}
      </div>
      <footer>
        <strong>{selectedIds.length}</strong>
        <span>
          selected · up to {MAX_PLAYERS_PER_SIDE}
        </span>
      </footer>
    </section>
  );
}

function ImpactMetric({
  label,
  before,
  after,
  delta,
}: {
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}) {
  const direction =
    delta === null || delta === 0 ? "neutral" : delta > 0 ? "positive" : "negative";
  return (
    <span className={`trade-impact-metric ${direction}`}>
      <small>{label}</small>
      <strong>
        {before === null ? "—" : before}
        <ArrowRight />
        {after === null ? "—" : after}
      </strong>
      <em>{delta === null ? "No complete projection" : signed(delta, 1)}</em>
    </span>
  );
}

function TeamImpactCard({
  impact,
  label,
}: {
  impact: TradeTeamImpact;
  label: string;
}) {
  return (
    <article className="trade-impact-card">
      <header>
        <span>
          <small>{label}</small>
          <h3>{impact.teamName}</h3>
        </span>
        <b className={impact.impactScore > 0 ? "positive" : impact.impactScore < 0 ? "negative" : ""}>
          {signed(impact.impactScore, 1)}
          <small>team impact</small>
        </b>
      </header>
      <div className="trade-impact-metrics">
        <ImpactMetric
          label="ROS score"
          before={impact.before.strength.overall}
          after={impact.after.strength.overall}
          delta={impact.overallDelta}
        />
        <ImpactMetric
          label="Starting lineup"
          before={impact.before.strength.starterScore}
          after={impact.after.strength.starterScore}
          delta={impact.starterDelta}
        />
        <ImpactMetric
          label="Bench depth"
          before={impact.before.strength.depthScore}
          after={impact.after.strength.depthScore}
          delta={impact.depthDelta}
        />
        <ImpactMetric
          label="Projected starters"
          before={impact.before.projectedPoints}
          after={impact.after.projectedPoints}
          delta={impact.projectedPointsDelta}
        />
      </div>
      <div className="trade-need-result">
        <span className="solved">
          <ShieldCheck />
          <small>Needs solved</small>
          <strong>
            {impact.needsSolved.length ? impact.needsSolved.join(", ") : "None"}
          </strong>
        </span>
        <span className="created">
          <CircleAlert />
          <small>New weaknesses</small>
          <strong>
            {impact.needsCreated.length ? impact.needsCreated.join(", ") : "None"}
          </strong>
        </span>
      </div>
      <div className="trade-position-impact">
        {impact.positionImpacts.slice(0, 4).map((item) => (
          <span key={item.position}>
            <b className={`position-mark position-${item.position.toLowerCase()}`}>
              {item.position}
            </b>
            <small>{item.before} → {item.after}</small>
            <strong className={item.delta > 0 ? "positive" : "negative"}>
              {signed(item.delta)}
            </strong>
          </span>
        ))}
        {!impact.positionImpacts.length ? (
          <p>No material position-grade change.</p>
        ) : null}
      </div>
    </article>
  );
}

function TradeResultPanel({ result }: { result: TradeAnalysis }) {
  return (
    <section className={`trade-result verdict-${result.verdict}`}>
      <header className="trade-verdict">
        <span className="trade-verdict-icon">
          {result.verdict === "helps-both" || result.verdict === "balanced" ? (
            <Scale />
          ) : result.verdict === "hurts-both" ? (
            <TrendingDown />
          ) : (
            <TrendingUp />
          )}
        </span>
        <span>
          <small>Two-team verdict</small>
          <h2>{result.verdictLabel}</h2>
          <p>{result.summary}</p>
        </span>
        <span className="trade-verdict-score">
          <strong>{result.fairnessScore}</strong>
          <small>fairness</small>
          <em>{result.confidence} confidence</em>
        </span>
      </header>

      <div className="trade-team-impacts">
        <TeamImpactCard impact={result.user} label="Your team" />
        <TeamImpactCard impact={result.partner} label="Trade partner" />
      </div>

      <div className="trade-evidence-grid">
        <section>
          <header><Target /> <h3>Why the model reached this verdict</h3></header>
          <div>
            {result.reasons.length ? result.reasons.map((reason) => (
              <p key={reason}><Check /> {reason}</p>
            )) : (
              <p><CircleAlert /> Neither lineup changes materially.</p>
            )}
          </div>
        </section>
        <section>
          <header><Gauge /> <h3>Package value is supporting evidence</h3></header>
          <div className="trade-package-values">
            <span>
              <small>You send</small>
              <strong>{result.userPackageValue}</strong>
            </span>
            <ArrowLeftRight />
            <span>
              <small>They send</small>
              <strong>{result.partnerPackageValue}</strong>
            </span>
          </div>
          <p>
            The verdict is driven by post-trade lineup, depth and needs—not this
            value comparison alone.
          </p>
        </section>
      </div>

      {result.warnings.length ? (
        <div className="trade-warnings">
          <AlertTriangle />
          <span>
            {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </span>
        </div>
      ) : null}
      <p className="trade-read-only-note">
        Analysis only. Review the offer, then send it through Sleeper.
      </p>
    </section>
  );
}

export function TradeAnalyzerPage({
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
  const [partnerRosterId, setPartnerRosterId] = useState(0);
  const [userSends, setUserSends] = useState<string[]>([]);
  const [partnerSends, setPartnerSends] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [partnerQuery, setPartnerQuery] = useState("");
  const [submitted, setSubmitted] = useState<SubmittedOffer | null>(null);
  const playerIds = useMemo(
    () => [
      ...snapshot.rosters.flatMap((roster) => roster.players ?? []),
      ...draftPicks.picks.map((pick) => String(pick.player_id)),
    ],
    [draftPicks.picks, snapshot.rosters],
  );
  const sleeperPlayers = useSleeperPlayers(
    playerIds,
    Boolean(userRoster && warRoom.isUnlocked),
  );
  const teams = useMemo(
    () =>
      warRoom.board
        ? analyzeLeagueTeams({
            snapshot,
            picks: draftPicks.picks,
            board: warRoom.board.players,
            sleeperPlayers: sleeperPlayers.players,
          })
        : [],
    [
      draftPicks.picks,
      sleeperPlayers.players,
      snapshot,
      warRoom.board,
    ],
  );
  const userTeam =
    teams.find((team) => team.rosterId === userRoster?.roster_id) ?? null;
  const partners = teams.filter(
    (team) => team.rosterId !== userRoster?.roster_id && team.players.length,
  );
  const activePartnerId = partners.some(
    (team) => team.rosterId === partnerRosterId,
  )
    ? partnerRosterId
    : partners[0]?.rosterId ?? 0;
  const partnerTeam =
    partners.find((team) => team.rosterId === activePartnerId) ?? null;
  const result = useMemo(() => {
    if (
      !submitted ||
      !warRoom.board ||
      !userRoster
    ) {
      return null;
    }
    return analyzeTrade({
      snapshot,
      picks: draftPicks.picks,
      board: warRoom.board.players,
      sleeperPlayers: sleeperPlayers.players,
      userRosterId: userRoster.roster_id,
      partnerRosterId: submitted.partnerRosterId,
      userSends: submitted.userSends,
      partnerSends: submitted.partnerSends,
    });
  }, [
    draftPicks.picks,
    sleeperPlayers.players,
    snapshot,
    submitted,
    userRoster,
    warRoom.board,
  ]);
  const rosterHasPlayers = Boolean(
    userRoster?.players?.length ||
      draftPicks.picks.some(
        (pick) => Number(pick.roster_id) === userRoster?.roster_id,
      ),
  );
  const isLoading =
    warRoom.loadingData || sleeperPlayers.loading || draftPicks.loading;

  function clearAnalysis() {
    setSubmitted(null);
  }

  function toggle(
    id: string,
    selected: string[],
    setSelected: (value: string[]) => void,
  ) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : selected.length < MAX_PLAYERS_PER_SIDE
        ? [...selected, id]
        : selected;
    setSelected(next);
    clearAnalysis();
  }

  function changePartner(value: number) {
    setPartnerRosterId(value);
    setPartnerSends([]);
    setPartnerQuery("");
    clearAnalysis();
  }

  function runAnalysis() {
    if (!activePartnerId || !userSends.length || !partnerSends.length) return;
    setSubmitted({
      partnerRosterId: activePartnerId,
      userSends: [...userSends],
      partnerSends: [...partnerSends],
    });
  }

  return (
    <main className="workspace-page trade-page">
      <header className="page-heading trade-page-heading">
        <div>
          <h1>Trade Analyzer</h1>
          <p>
            Evaluate the offer against both teams&apos; lineups, depth and needs.
          </p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={refreshing || draftPicks.refreshing}
          onClick={onRefresh}
        >
          <RefreshCw
            className={refreshing || draftPicks.refreshing ? "spin" : ""}
          />
          Refresh rosters
        </button>
      </header>

      {!warRoom.isUnlocked ? <TradeUnlock warRoom={warRoom} /> : null}

      {warRoom.isUnlocked && !rosterHasPlayers && !isLoading ? (
        <section className="trade-waiting">
          <WalletCards />
          <h2>Trade analysis begins after your draft</h2>
          <p>
            This new redraft league does not have rostered players yet. After
            Sleeper records the draft, you can build an offer and see how both
            teams change—not just whether the player values look close.
          </p>
          <span>
            <UsersRound /> {snapshot.league.total_rosters} teams
            <Target /> Deadline Week {snapshot.league.settings.trade_deadline}
          </span>
        </section>
      ) : null}

      {warRoom.isUnlocked && isLoading ? (
        <section className="trade-loading">
          <RefreshCw className="spin" />
          <strong>Building every team&apos;s depth chart…</strong>
          <small>Matching Sleeper rosters to rest-of-season intelligence.</small>
        </section>
      ) : null}

      {warRoom.isUnlocked && warRoom.dataError ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Trade intelligence needs attention</strong>
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

      {warRoom.isUnlocked && rosterHasPlayers && !isLoading && userTeam && partnerTeam ? (
        <>
          <section className="trade-partner-command">
            <span>
              <UsersRound />
              <span>
                <small>Trade with</small>
                <strong>{partnerTeam.teamName}</strong>
              </span>
            </span>
            <label>
              <span className="sr-only">Choose trade partner</span>
              <select
                value={activePartnerId}
                onChange={(event) => changePartner(Number(event.target.value))}
              >
                {partners.map((team) => (
                  <option key={team.rosterId} value={team.rosterId}>
                    {team.teamName} · ROS #{team.strength.rank}
                  </option>
                ))}
              </select>
            </label>
            <span>
              <small>Trade deadline</small>
              <strong>Week {snapshot.league.settings.trade_deadline}</strong>
            </span>
            <span>
              <small>Model</small>
              <strong>Both teams</strong>
            </span>
          </section>

          <div className="trade-builder">
            <RosterSide
              label="You send"
              team={userTeam}
              selectedIds={userSends}
              query={userQuery}
              onQuery={setUserQuery}
              onToggle={(id) => toggle(id, userSends, setUserSends)}
            />
            <div className="trade-builder-action">
              <span><ArrowLeftRight /></span>
              <button
                className="button primary"
                type="button"
                disabled={!userSends.length || !partnerSends.length}
                onClick={runAnalysis}
              >
                <Sparkles />
                Analyze both teams
              </button>
              <small>
                {userSends.length} for {partnerSends.length}
              </small>
            </div>
            <RosterSide
              label="You receive"
              team={partnerTeam}
              selectedIds={partnerSends}
              query={partnerQuery}
              onQuery={setPartnerQuery}
              onToggle={(id) => toggle(id, partnerSends, setPartnerSends)}
            />
          </div>

          {result?.valid ? <TradeResultPanel result={result} /> : null}
          {result && !result.valid ? (
            <div className="trade-analysis-error" role="alert">
              <AlertTriangle /> {result.error}
            </div>
          ) : null}
        </>
      ) : null}

      {warRoom.isUnlocked &&
      rosterHasPlayers &&
      !isLoading &&
      !warRoom.dataError &&
      !sleeperPlayers.error &&
      (!userTeam || !partnerTeam) ? (
        <section className="trade-waiting">
          <CircleAlert />
          <h2>No trade partner is available yet</h2>
          <p>
            Sleeper must show players on at least two league rosters before an
            offer can be analyzed.
          </p>
        </section>
      ) : null}
    </main>
  );
}
