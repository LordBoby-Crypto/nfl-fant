import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowDown,
  BadgeDollarSign,
  CheckCircle2,
  CircleAlert,
  Flame,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserMinus,
  WalletCards,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { useSleeperPlayers } from "../../hooks/useSleeperPlayers";
import type { useWaiverActivity } from "../../hooks/useWaiverActivity";
import { getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot } from "../../types";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import {
  buildWaiverAssistant,
  type WaiverPosition,
  type WaiverRecommendation,
} from "./engine";

type DraftPickState = ReturnType<typeof useDraftPicks>;
type WarRoomState = ReturnType<typeof useWarRoom>;
type WaiverActivityState = ReturnType<typeof useWaiverActivity>;
type PositionFilter = "ALL" | WaiverPosition;
type RecommendationFilter = "All recommendations" | "Claims now" | "Watch list";

const POSITION_FILTERS: PositionFilter[] = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

function WaiverUnlock({ warRoom }: { warRoom: WarRoomState }) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="waiver-unlock">
      <LockKeyhole />
      <div>
        <h2>Unlock waiver recommendations</h2>
        <p>
          Claims use protected FantasyPros rankings and rest-of-season projections.
          Your API key never enters the browser.
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

function BudgetCommand({
  result,
}: {
  result: ReturnType<typeof buildWaiverAssistant>;
}) {
  const remainingPercent = result.totalBudget
    ? Math.round((result.remainingBudget / result.totalBudget) * 100)
    : 0;
  return (
    <section className="waiver-budget-command">
      <div className="faab-balance">
        <WalletCards />
        <span>
          <small>FAAB remaining</small>
          <strong>${result.remainingBudget}</strong>
          <em>of ${result.totalBudget}</em>
        </span>
      </div>
      <div className="faab-progress">
        <span>
          <small>Budget available</small>
          <strong>{remainingPercent}%</strong>
        </span>
        <i><b style={{ width: `${remainingPercent}%` }} /></i>
      </div>
      <div className="waiver-command-fact">
        <small>Waiver priority</small>
        <strong>
          {result.waiverPosition > 0 ? `#${result.waiverPosition}` : "FAAB decides"}
        </strong>
      </div>
      <div className="waiver-command-fact">
        <small>League bid history</small>
        <strong>
          {result.bidClimate.medianWinningBid === null
            ? "No winning bids yet"
            : `$${result.bidClimate.medianWinningBid} median`}
        </strong>
        <em>{result.bidClimate.completedBids} completed</em>
      </div>
      <div className="waiver-command-fact">
        <small>Open roster spots</small>
        <strong>{result.rosterSpotsOpen}</strong>
      </div>
    </section>
  );
}

function RecommendationRow({
  recommendation,
  selected,
  onSelect,
}: {
  recommendation: WaiverRecommendation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`waiver-player-row ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onSelect}
    >
      <span className={`position-mark position-${recommendation.position.toLowerCase()}`}>
        {recommendation.position}
      </span>
      <span className="waiver-player-name">
        <strong>{recommendation.player.name}</strong>
        <small>
          {recommendation.player.team} · {recommendation.player.positionRank || "Unranked"}
        </small>
      </span>
      <span className={`waiver-priority priority-${recommendation.priority.replaceAll(" ", "-").toLowerCase()}`}>
        {recommendation.priority}
      </span>
      <span className="waiver-bid">
        <small>Recommended bid</small>
        <strong>${recommendation.faab.target}</strong>
        <em>${recommendation.faab.low}–${recommendation.faab.high}</em>
      </span>
      <span className="waiver-drop-preview">
        <small>{recommendation.drop ? "Drop" : "Roster move"}</small>
        <strong>{recommendation.drop?.player.name ?? "Add only"}</strong>
      </span>
      <span className="waiver-score">
        <strong>{recommendation.score}</strong>
        <small>claim score</small>
      </span>
    </button>
  );
}

function RecommendationDetail({
  recommendation,
}: {
  recommendation: WaiverRecommendation;
}) {
  return (
    <aside className="waiver-detail">
      <header>
        <span className={`position-mark position-${recommendation.position.toLowerCase()}`}>
          {recommendation.position}
        </span>
        <span>
          <small>{recommendation.priority}</small>
          <h2>{recommendation.player.name}</h2>
          <p>
            {recommendation.player.team} · {recommendation.player.positionRank || "Unranked"}
            {recommendation.player.byeWeek ? ` · Bye ${recommendation.player.byeWeek}` : ""}
          </p>
        </span>
        <b>{recommendation.score}</b>
      </header>

      <section className="detail-faab">
        <span>
          <BadgeDollarSign />
          <small>Bid this amount</small>
          <strong>${recommendation.faab.target}</strong>
        </span>
        <span>
          <small>Playable range</small>
          <strong>${recommendation.faab.low}–${recommendation.faab.high}</strong>
          <em>{recommendation.faab.budgetPercent}% of remaining budget</em>
        </span>
      </section>

      <section className="detail-swap">
        <article className="add-player">
          <CheckCircle2 />
          <span>
            <small>Add</small>
            <strong>{recommendation.player.name}</strong>
            <em>{recommendation.need} need</em>
          </span>
        </article>
        <ArrowDown />
        <article className={recommendation.drop ? "drop-player" : "open-spot"}>
          {recommendation.drop ? <UserMinus /> : <ShieldCheck />}
          <span>
            <small>{recommendation.drop ? "Drop" : "Use open roster spot"}</small>
            <strong>{recommendation.drop?.player.name ?? "No drop required"}</strong>
            <em>
              {recommendation.drop?.reason ??
                "Sleeper currently shows room for this addition."}
            </em>
          </span>
        </article>
      </section>

      <section className="waiver-reasons">
        <h3>Why this recommendation</h3>
        {recommendation.reasons.map((reason) => (
          <p key={reason}><CheckCircle2 /> {reason}</p>
        ))}
      </section>

      <section className="waiver-evidence">
        <span>
          <TrendingUp />
          <small>Sleeper adds · 24h</small>
          <strong>{recommendation.trendingAdds.toLocaleString()}</strong>
        </span>
        <span>
          <Sparkles />
          <small>Model confidence</small>
          <strong>{recommendation.confidence}</strong>
        </span>
        <span>
          <Flame />
          <small>Roster gain</small>
          <strong>
            {recommendation.rosterGain > 0 ? "+" : ""}
            {recommendation.rosterGain.toFixed(1)}
          </strong>
        </span>
      </section>

      {recommendation.warning ? (
        <div className="waiver-warning">
          <AlertTriangle />
          <span>{recommendation.warning}</span>
        </div>
      ) : null}

      <p className="waiver-read-only-note">
        Recommendation only. Submit the claim and conditional drop in Sleeper.
      </p>
    </aside>
  );
}

export function WaiverAssistantPage({
  snapshot,
  draftPicks,
  warRoom,
  activity,
  refreshing,
  onRefresh,
}: {
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  warRoom: WarRoomState;
  activity: WaiverActivityState;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [recommendationFilter, setRecommendationFilter] =
    useState<RecommendationFilter>("All recommendations");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const userRoster = getUserRoster(snapshot);
  const playerIds = useMemo(
    () => [
      ...snapshot.rosters.flatMap((roster) => roster.players ?? []),
      ...draftPicks.picks.map((pick) => String(pick.player_id)),
      ...activity.trendingAdds.map((item) => String(item.player_id)),
    ],
    [activity.trendingAdds, draftPicks.picks, snapshot.rosters],
  );
  const sleeperPlayers = useSleeperPlayers(
    playerIds,
    Boolean(userRoster && warRoom.isUnlocked),
  );
  const result = useMemo(
    () =>
      warRoom.board && userRoster
        ? buildWaiverAssistant({
            snapshot,
            picks: draftPicks.picks,
            board: warRoom.board.players,
            sleeperPlayers: sleeperPlayers.players,
            trendingAdds: activity.trendingAdds,
            transactions: activity.transactions,
            userRosterId: userRoster.roster_id,
          })
        : null,
    [
      activity.transactions,
      activity.trendingAdds,
      draftPicks.picks,
      sleeperPlayers.players,
      snapshot,
      userRoster,
      warRoom.board,
    ],
  );
  const rosterHasPlayers = Boolean(
    userRoster?.players?.length ||
      draftPicks.picks.some(
        (pick) => Number(pick.roster_id) === userRoster?.roster_id,
      ),
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (result?.recommendations ?? []).filter((item) => {
      if (position !== "ALL" && item.position !== position) return false;
      if (
        recommendationFilter === "Claims now" &&
        item.priority === "Watch"
      ) {
        return false;
      }
      if (
        recommendationFilter === "Watch list" &&
        item.priority !== "Watch"
      ) {
        return false;
      }
      return (
        !normalizedQuery ||
        item.player.name.toLowerCase().includes(normalizedQuery) ||
        item.player.team.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [position, query, recommendationFilter, result]);
  const selected =
    filtered.find((item) => item.player.id === selectedId) ??
    filtered[0] ??
    null;
  const isLoading =
    warRoom.loadingData ||
    sleeperPlayers.loading ||
    activity.loading;

  return (
    <main className="workspace-page waiver-page">
      <header className="page-heading waiver-page-heading">
        <div>
          <h1>Waiver Assistant</h1>
          <p>
            Ranked claims, FAAB ranges and the safest corresponding drop.
          </p>
        </div>
        <button
          className="button outline"
          type="button"
          disabled={
            refreshing ||
            draftPicks.refreshing ||
            activity.refreshing
          }
          onClick={onRefresh}
        >
          <RefreshCw
            className={
              refreshing || draftPicks.refreshing || activity.refreshing
                ? "spin"
                : ""
            }
          />
          Refresh waivers
        </button>
      </header>

      {!warRoom.isUnlocked ? <WaiverUnlock warRoom={warRoom} /> : null}

      {warRoom.isUnlocked && !rosterHasPlayers ? (
        <section className="waiver-waiting">
          <Sparkles />
          <h2>Waiver recommendations begin after your draft</h2>
          <p>
            This is a new redraft league and your Sleeper roster is still empty.
            Once picks are recorded, the assistant will compare every unrostered
            player against your actual lineup, depth, FAAB balance and league bid
            history.
          </p>
          <span>
            <BadgeDollarSign /> ${snapshot.league.settings.waiver_budget} starting FAAB
            <ShieldCheck /> No carryover players
          </span>
        </section>
      ) : null}

      {warRoom.isUnlocked && rosterHasPlayers && isLoading ? (
        <section className="waiver-loading">
          <RefreshCw className="spin" />
          <strong>Building the waiver board…</strong>
          <small>
            Comparing league rosters, current trends and rest-of-season value.
          </small>
        </section>
      ) : null}

      {warRoom.isUnlocked && warRoom.dataError ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Waiver intelligence needs attention</strong>
            <small>{warRoom.dataError}</small>
          </span>
          <button className="button outline" type="button" onClick={warRoom.refresh}>
            Retry
          </button>
        </div>
      ) : null}

      {activity.error || sleeperPlayers.error ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Sleeper waiver context is incomplete</strong>
            <small>{activity.error ?? sleeperPlayers.error}</small>
          </span>
        </div>
      ) : null}

      {warRoom.isUnlocked && rosterHasPlayers && result && !isLoading ? (
        <>
          <BudgetCommand result={result} />
          <section className="waiver-toolbar">
            <label className="waiver-search">
              <Search />
              <input
                aria-label="Search available players"
                type="search"
                placeholder="Search available players"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="waiver-position-filter" aria-label="Position filter">
              {POSITION_FILTERS.map((item) => (
                <button
                  key={item}
                  className={position === item ? "active" : ""}
                  type="button"
                  onClick={() => setPosition(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <select
              aria-label="Recommendation type"
              value={recommendationFilter}
              onChange={(event) =>
                setRecommendationFilter(event.target.value as RecommendationFilter)
              }
            >
              <option>All recommendations</option>
              <option>Claims now</option>
              <option>Watch list</option>
            </select>
          </section>

          <div className="waiver-workspace">
            <section className="waiver-board">
              <header>
                <span>
                  <h2>Available player board</h2>
                  <p>
                    {filtered.length} shown · {result.availableCount} verified
                    unrostered players
                  </p>
                </span>
                <small>Data obtained from FantasyPros · trends by Sleeper</small>
              </header>
              <div className="waiver-player-list">
                {filtered.length ? (
                  filtered.map((recommendation) => (
                    <RecommendationRow
                      key={recommendation.player.id}
                      recommendation={recommendation}
                      selected={recommendation.player.id === selected?.player.id}
                      onSelect={() => setSelectedId(recommendation.player.id)}
                    />
                  ))
                ) : (
                  <p className="waiver-no-results">
                    No available players match these filters.
                  </p>
                )}
              </div>
            </section>
            {selected ? <RecommendationDetail recommendation={selected} /> : null}
          </div>
        </>
      ) : null}
    </main>
  );
}
