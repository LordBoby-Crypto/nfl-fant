import {
  useDeferredValue,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Bell,
  BellRing,
  Check,
  CircleAlert,
  Database,
  Moon,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  UserMinus,
  UsersRound,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks.ts";
import type { Draft, SleeperDraftPick } from "../../types.ts";
import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import type {
  DraftCursor,
  DraftRecommendation,
  TeamDraftState,
} from "./engine.ts";
import { pickPlayerName, pickPosition } from "./engine.ts";
import type { NextTurnForecast } from "./nextTurnForecast.ts";
import type {
  ProofSourceStatus,
  RecommendationProof,
} from "./recommendationProof.ts";
import type { RosterPlan } from "./rosterPlan.ts";
import type { useDraftFocusTools } from "./useDraftFocusTools.ts";

type DraftPickState = ReturnType<typeof useDraftPicks>;
type FocusTools = ReturnType<typeof useDraftFocusTools>;

interface SimpleDraftModeProps {
  draft: Draft;
  cursor: DraftCursor;
  currentTeamName: string;
  recommendations: DraftRecommendation[];
  recommendationProofs: Map<string, RecommendationProof>;
  forecast: NextTurnForecast;
  available: PlayerIntelligence[];
  rosterPlan: RosterPlan;
  teams: TeamDraftState[];
  recentPicks: SleeperDraftPick[];
  draftPicks: DraftPickState;
  intelligenceError: string | null;
  intelligenceLoading: boolean;
  usingCachedBoard: boolean;
  refreshing: boolean;
  tools: FocusTools;
  reliabilityPanel: ReactNode;
  onMarkDrafted: (player: PlayerIntelligence) => void;
  onRefresh: () => void;
}

const SOURCE_SEVERITY: Record<ProofSourceStatus, number> = {
  Fresh: 0,
  Partial: 1,
  Stale: 2,
  Missing: 3,
};

function number(value: number | null, digits = 0) {
  return value === null ? "—" : value.toFixed(digits);
}

function age(timestamp: number | null) {
  if (!timestamp) return "not available";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return `${Math.max(1, Math.round(elapsed / 1_000))} sec ago`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  return `${Math.floor(elapsed / 3_600_000)} hr ago`;
}

function worstStatus(statuses: ProofSourceStatus[]) {
  return statuses.reduce<ProofSourceStatus>(
    (worst, status) =>
      SOURCE_SEVERITY[status] > SOURCE_SEVERITY[worst] ? status : worst,
    "Fresh",
  );
}

function sourceGroup(proof: RecommendationProof | null, sleeper: boolean) {
  const sources = (proof?.sources ?? []).filter((source) =>
    sleeper ? source.name.startsWith("Sleeper") : !source.name.startsWith("Sleeper"),
  );
  return {
    status: sources.length ? worstStatus(sources.map((source) => source.status)) : "Missing",
    age: sources.find((source) => source.fetchedAt)?.ageLabel ?? "not available",
  } satisfies { status: ProofSourceStatus; age: string };
}

function RecommendationRow({
  recommendation,
  proof,
  forecast,
  rank,
}: {
  recommendation: DraftRecommendation;
  proof: RecommendationProof | null;
  forecast: NextTurnForecast;
  rank: number;
}) {
  const wait = forecast.players.find(
    (candidate) => candidate.player.id === recommendation.player.id,
  );
  return (
    <article className={`simple-recommendation-row ${rank === 1 ? "is-primary" : ""}`}>
      <strong className="simple-rank">{rank}</strong>
      <span className={`position-mark position-${recommendation.player.position.toLowerCase()}`}>
        {recommendation.player.position}
      </span>
      <span className="simple-player-name">
        <strong>{recommendation.player.name}</strong>
        <small>
          {recommendation.player.team} · League #{number(recommendation.player.leagueRank ?? recommendation.player.ecr)}
        </small>
      </span>
      <span className="simple-roster-value">
        <strong>{recommendation.score}</strong>
        <small>roster value</small>
      </span>
      <span className={`simple-confidence is-${(proof?.confidence ?? recommendation.modelConfidence ?? "Medium").toLowerCase()}`}>
        <strong>{proof?.confidence ?? recommendation.modelConfidence ?? "Medium"}</strong>
        <small>confidence</small>
      </span>
      <span className={`simple-wait-call is-${wait?.tone ?? "neutral"}`}>
        <strong>{wait?.recommendation ?? "Wait forecast pending"}</strong>
        <small>
          {wait?.survivalProbability === null || wait?.survivalProbability === undefined
            ? "survival pending"
            : `${wait.survivalProbability}% survives`}
        </small>
      </span>
    </article>
  );
}

function AvailableRanking({
  available,
  onMarkDrafted,
}: {
  available: PlayerIntelligence[];
  onMarkDrafted: (player: PlayerIntelligence) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const players = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase();
    return [...available]
      .sort(
        (left, right) =>
          (left.leagueRank ?? left.ecr ?? 9_999) -
            (right.leagueRank ?? right.ecr ?? 9_999) ||
          left.name.localeCompare(right.name),
      )
      .filter(
        (player) =>
          !search ||
          player.name.toLocaleLowerCase().includes(search) ||
          player.team.toLocaleLowerCase().includes(search) ||
          player.position.toLocaleLowerCase().includes(search),
      );
  }, [available, deferredQuery]);

  return (
    <section className="simple-ranking" aria-label="Complete available-player ranking">
      <header>
        <span>
          <h2>Complete available-player ranking</h2>
          <small>{players.length} of {available.length} available</small>
        </span>
        <label>
          <Search />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, team or position"
          />
        </label>
      </header>
      <div className="simple-ranking-table" role="table">
        <div className="simple-ranking-head" role="row">
          <span>Rank</span><span>Player</span><span>Pos</span><span>Team</span>
          <span>League</span><span>ADP</span><span>Status</span><span>Correction</span>
        </div>
        {players.map((player, index) => (
          <div className="simple-ranking-row" role="row" key={player.id}>
            <strong>{index + 1}</strong>
            <span>
              <strong>{player.name}</strong>
              <small>{player.positionRank || `${player.position} rank pending`}</small>
            </span>
            <b className={`position-${player.position.toLowerCase()}`}>{player.position}</b>
            <span>{player.team}</span>
            <span>#{number(player.leagueRank ?? player.ecr)}</span>
            <span>{number(player.adp, 1)}</span>
            <em>{player.injuryStatus || "Available"}</em>
            <button
              type="button"
              onClick={() => onMarkDrafted(player)}
              aria-label={`Mark ${player.name} drafted manually`}
            >
              <UserMinus /> Mark drafted
            </button>
          </div>
        ))}
        {!players.length ? <p>No available player matches that search.</p> : null}
      </div>
    </section>
  );
}

function RosterPlanPanel({ plan }: { plan: RosterPlan }) {
  return (
    <aside className="simple-roster-plan">
      <header>
        <UsersRound />
        <span>
          <h2>Your roster &amp; plan</h2>
          <small>{plan.roster.length} players drafted</small>
        </span>
      </header>

      <section className="simple-lineup-meter">
        <span>
          <strong>Starting-lineup completion</strong>
          <b>{plan.startersFilled} of {plan.starterTotal} · {plan.completionPercent}%</b>
        </span>
        <div aria-label={`${plan.completionPercent}% of starting lineup complete`}>
          <i style={{ width: `${plan.completionPercent}%` }} />
        </div>
      </section>

      <section className="simple-plan-block">
        <h3>Starting positions still needed</h3>
        <p className={plan.essentialNeeds.length ? "is-warning" : "is-clear"}>
          {plan.essentialNeeds.length ? plan.essentialNeeds.join(" · ") : "All essential starting positions are covered."}
        </p>
      </section>

      <section className="simple-plan-block">
        <h3>FLEX / SUPER_FLEX plan</h3>
        <p>{plan.flexPlan}</p>
      </section>

      <section className="simple-depth-targets">
        <h3>Position depth targets</h3>
        <div className="simple-depth-head">
          <span>Pos</span><span>Drafted</span><span>Starter</span><span>Depth</span><span>Status</span>
        </div>
        {plan.positions.map((position) => (
          <div key={position.position} className={`is-${position.status.toLowerCase().replace(" ", "-")}`}>
            <strong>{position.position}</strong>
            <span>{position.drafted}</span>
            <span>{position.starterTarget}</span>
            <span>{position.depthTarget}</span>
            <em>{position.status}</em>
          </div>
        ))}
      </section>

      <section className={`simple-plan-alert ${plan.overdraftedWarnings.length ? "is-danger" : "is-clear"}`}>
        <ShieldAlert />
        <span>
          <h3>Overdrafted-position warning</h3>
          <p>{plan.overdraftedWarnings[0] ?? "No position is above its planned depth target."}</p>
        </span>
      </section>

      <div className="simple-concentrations">
        <section className={`is-${plan.byeWeekTone}`}>
          <h3>Bye-week concentration</h3>
          <p>{plan.byeWeekSummary}</p>
        </section>
        <section className={`is-${plan.riskTone}`}>
          <h3>Risk concentration</h3>
          <p>{plan.riskSummary}</p>
        </section>
      </div>

      <section className="simple-plan-block">
        <h3>Bench-balance guidance</h3>
        <p>{plan.benchGuidance}</p>
      </section>

      <section className="simple-current-roster">
        <h3>Your current roster</h3>
        <div className="simple-roster-legend">
          <span><i /> Essential starter</span>
          <span><i /> Optional depth</span>
        </div>
        <div>
          {plan.roster.length ? plan.roster.map((item) => (
            <article key={`${item.pick.pick_no}-${item.pick.player_id}`}>
              <small>#{item.pick.pick_no}</small>
              <b className={`position-${(item.position ?? "—").toLowerCase()}`}>{item.position ?? "—"}</b>
              <span>
                <strong>{item.player?.name ?? pickPlayerName(item.pick)}</strong>
                <small>{item.player?.team ?? item.pick.metadata.team ?? "—"}</small>
              </span>
              <em className={item.role === "Essential starter" ? "is-essential" : "is-depth"}>{item.role}</em>
            </article>
          )) : <p>No players drafted to your roster yet.</p>}
        </div>
      </section>
    </aside>
  );
}

function RecentAndOpponents({
  picks,
  teams,
  forecast,
}: {
  picks: SleeperDraftPick[];
  teams: TeamDraftState[];
  forecast: NextTurnForecast;
}) {
  const teamsById = new Map(teams.map((team) => [team.rosterId, team]));
  return (
    <section className="simple-draft-context">
      <section>
        <header><Check /><h2>Recent selections</h2></header>
        <div>
          {[...picks].reverse().slice(0, 8).map((pick) => (
            <article key={`${pick.pick_no}-${pick.player_id}`}>
              <small>#{pick.pick_no}</small>
              <b className={`position-${(pickPosition(pick) ?? "—").toLowerCase()}`}>{pickPosition(pick) ?? "—"}</b>
              <span>
                <strong>{pickPlayerName(pick)}</strong>
                <small>{teamsById.get(Number(pick.roster_id))?.name ?? `Roster ${pick.roster_id}`}</small>
              </span>
            </article>
          ))}
          {!picks.length ? <p>No selections yet.</p> : null}
        </div>
      </section>
      <section>
        <header><Target /><h2>Opponent needs before your next turn</h2></header>
        <div>
          {forecast.likelyPicks.map((pick) => (
            <article key={pick.pickNumber}>
              <small>#{pick.pickNumber}</small>
              <span>
                <strong>{pick.teamName}</strong>
                <small>Needs {pick.needs.join(" · ") || "best value"}</small>
              </span>
              <em>{pick.positions[0] ? `${Math.round(pick.positions[0].probability * 100)}% ${pick.positions[0].position}` : "Open"}</em>
            </article>
          ))}
          {!forecast.likelyPicks.length ? (
            <p>{forecast.nextUserPick ? "No opponent picks remain before your next turn." : "Opponent needs activate when the draft order exposes your next turn."}</p>
          ) : null}
        </div>
      </section>
    </section>
  );
}

export function SimpleDraftMode({
  draft,
  cursor,
  currentTeamName,
  recommendations,
  recommendationProofs,
  forecast,
  available,
  rosterPlan,
  teams,
  recentPicks,
  draftPicks,
  intelligenceError,
  intelligenceLoading,
  usingCachedBoard,
  refreshing,
  tools,
  reliabilityPanel,
  onMarkDrafted,
  onRefresh,
}: SimpleDraftModeProps) {
  const lead = recommendations[0] ?? null;
  const leadProof = lead ? recommendationProofs.get(lead.player.id) ?? null : null;
  const leadForecast = lead
    ? forecast.players.find((candidate) => candidate.player.id === lead.player.id) ?? null
    : null;
  const sleeperSource = sourceGroup(leadProof, true);
  const fantasyProsSource = sourceGroup(leadProof, false);
  const connectionLabel = draftPicks.error
    ? draftPicks.retainedAfterError
      ? "Connected with retained board"
      : "Connection needs attention"
    : draftPicks.refreshing
      ? "Refreshing"
      : "Connected";
  const displayedNextPick = forecast.nextUserPick ?? cursor.nextUserPick;
  const displayedPicksAway = forecast.nextUserPick
    ? forecast.interveningPicks
    : cursor.picksUntilUser;

  return (
    <section className={`simple-draft-mode ${cursor.isUserTurn ? "is-on-clock" : ""}`} aria-label="Simple Draft Mode">
      <header className="simple-status-bar">
        <span className="simple-mode-name"><Radio /><strong>Simple Draft Mode</strong></span>
        <strong className={`simple-turn-state ${cursor.isUserTurn ? "is-now" : ""}`}>
          {cursor.complete ? "Draft complete" : cursor.isUserTurn ? "On clock" : "Waiting"}
        </strong>
        <span><small>Current pick</small><strong>{cursor.currentRound}.{String(cursor.currentSlot).padStart(2, "0")} · #{cursor.currentPick}</strong></span>
        <span><small>Next pick</small><strong>{displayedNextPick ? `#${displayedNextPick}` : "—"}</strong></span>
        <span><small>Picks away</small><strong>{displayedPicksAway === null ? "—" : displayedPicksAway === 0 ? "Now" : displayedPicksAway}</strong></span>
        <span className={`simple-connection ${draftPicks.error ? "is-warning" : "is-live"}`}>
          <small>Sleeper</small><strong>{connectionLabel}</strong>
        </span>
        <div className="simple-status-actions">
          <button type="button" onClick={() => void tools.toggleAlerts()} className={tools.alertsEnabled ? "is-active" : ""}>
            {tools.alertsEnabled ? <BellRing /> : <Bell />}<span>Alerts</span>
          </button>
          <button type="button" onClick={() => void tools.toggleWakeLock()} disabled={tools.wakeLockState === "unsupported" || tools.wakeLockState === "requesting"} className={tools.wakeLockEnabled ? "is-active" : ""}>
            <Moon /><span>Keep awake</span>
          </button>
          <button type="button" onClick={onRefresh} disabled={refreshing || draftPicks.refreshing}>
            <RefreshCw className={refreshing || draftPicks.refreshing ? "spin" : ""} /><span>Refresh</span>
          </button>
        </div>
      </header>

      {cursor.isUserTurn ? (
        <div className="simple-on-clock-alert" role="alert">
          <BellRing /><strong>You are on the clock — make the selection in Sleeper now.</strong>
        </div>
      ) : null}

      {draftPicks.error || intelligenceError ? (
        <div className="simple-data-warning" role="alert">
          <CircleAlert />
          <span><strong>Some draft data needs attention</strong><small>{draftPicks.error ?? intelligenceError}</small></span>
        </div>
      ) : null}

      <div className="simple-primary-grid">
        <main>
          <section className="simple-primary-pick">
            {lead ? (
              <>
                <header>
                  <strong className="simple-primary-rank">#1</strong>
                  <span>
                    <h1>{lead.player.name}</h1>
                    <p><b className={`position-${lead.player.position.toLowerCase()}`}>{lead.player.position}</b> · {lead.player.team} · League #{number(lead.player.leagueRank ?? lead.player.ecr)}</p>
                  </span>
                  <strong className={`simple-primary-call is-${leadForecast?.tone ?? "neutral"}`}>{leadForecast?.recommendation ?? "Forecast pending"}</strong>
                </header>
                <div className="simple-primary-reason">
                  <span><small>Survival estimate</small><strong>{leadForecast?.survivalProbability === null || leadForecast?.survivalProbability === undefined ? "—" : `${leadForecast.survivalProbability}%`}</strong></span>
                  <div>
                    <h2>Why this recommendation is best</h2>
                    <p>{leadProof?.rankingExplanation ?? lead.reasons[0]?.value ?? "Best available roster-specific value."}</p>
                    <strong>{leadProof?.overallVsRosterExplanation ?? lead.reasons.find((reason) => reason.label.includes("Starting lineup"))?.value}</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="simple-empty-primary">
                <Target /><h1>{intelligenceLoading ? "Loading recommendations…" : "Recommendations unavailable"}</h1>
                <p>Keep Sleeper open and refresh the private player board.</p>
              </div>
            )}
          </section>

          <section className="simple-best-five">
            <header><Target /><span><h2>Best five recommendations</h2><small>Roster value, confidence and draft-now/wait advice</small></span></header>
            <div>
              {recommendations.slice(0, 5).map((recommendation, index) => (
                <RecommendationRow key={recommendation.player.id} recommendation={recommendation} proof={recommendationProofs.get(recommendation.player.id) ?? null} forecast={forecast} rank={index + 1} />
              ))}
              {!recommendations.length ? <p>No recommendation board is available.</p> : null}
            </div>
          </section>

          <AvailableRanking
            available={available}
            onMarkDrafted={onMarkDrafted}
          />
        </main>

        <RosterPlanPanel plan={rosterPlan} />
      </div>

      <RecentAndOpponents picks={recentPicks} teams={teams} forecast={forecast} />

      {reliabilityPanel}

      <footer className="simple-freshness">
        <Database />
        <strong>Data freshness &amp; connection</strong>
        <span><small>Sleeper picks</small><b className={`is-${sleeperSource.status.toLowerCase()}`}>{sleeperSource.status}</b><em>{age(draftPicks.fetchedAt)}</em></span>
        <span><small>FantasyPros</small><b className={`is-${fantasyProsSource.status.toLowerCase()}`}>{fantasyProsSource.status}</b><em>{fantasyProsSource.age}</em></span>
        <span><small>Board mode</small><b className={usingCachedBoard ? "is-partial" : "is-fresh"}>{usingCachedBoard ? "Cached fallback" : "Live source"}</b><em>{draft.status}</em></span>
        <span><small>Connection</small><b className={draftPicks.error ? "is-stale" : "is-fresh"}>{connectionLabel}</b><em>{currentTeamName} on clock</em></span>
      </footer>
    </section>
  );
}
