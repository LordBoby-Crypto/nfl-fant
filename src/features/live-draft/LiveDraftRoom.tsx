import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  Ban,
  Bell,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Crosshair,
  Database,
  Grid3X3,
  Info,
  ListPlus,
  LockKeyhole,
  MoonStar,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Star,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import { USER_ID, getDraftPosition, getUserRoster } from "../../services/sleeper";
import type { LeagueSnapshot, SleeperDraftPick } from "../../types";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import type { PlayerIntelligence } from "../player-intelligence/model";
import {
  availablePlayers,
  buildTeamDraftStates,
  createSimulatedPick,
  createSimulationSlotMap,
  getDraftCursor,
  pickPlayerName,
  pickPosition,
  recommendPlayers,
  simulateToUserTurn,
  type DraftControlKind,
  type DraftControlState,
  type DraftRecommendation,
  type TeamDraftState,
} from "./engine";
import {
  buildRecommendationProofs,
  type RecommendationProof,
} from "./recommendationProof";
import { DraftStrategyLab } from "./DraftStrategyLab";
import {
  forecastNextTurnMarket,
  type OpponentForecast,
} from "./strategy";
import {
  buildNextTurnForecast,
  compareNextTurnForecast,
  describeTier,
  type NextTurnForecast,
  type NextTurnForecastChange,
} from "./nextTurnForecast";
import {
  buildDraftBoardRows,
  buildQueueDepletionWarning,
  buildWaitGuidance,
  compareRecommendations,
  detectDraftedControlledPlayers,
  detectPositionRun,
  nextUserDecisionPick,
  tierBreakForPlayer,
  type ControlledPlayerDrafted,
  type PlayerWaitGuidance,
  type QueueDepletionWarning,
  type RecommendationChange,
  type TierBreakWarning,
} from "./liveIntelligence";
import { useDraftControls } from "./useDraftControls";
import { useDraftFocusTools } from "./useDraftFocusTools";
import { useDraftStrategy } from "./useDraftStrategy";
import {
  ComparePlayerButton,
  WhatIfComparisonPanel,
} from "./WhatIfComparisonPanel";
import { buildWhatIfComparison } from "./whatIfComparison";

type WarRoomState = ReturnType<typeof useWarRoom>;
type DraftPickState = ReturnType<typeof useDraftPicks>;

const EMPTY_PLAYERS: PlayerIntelligence[] = [];
const CONTROL_META: Array<{
  kind: DraftControlKind;
  label: string;
  icon: typeof Star;
}> = [
  { kind: "watchlist", label: "Watch", icon: Star },
  { kind: "queue", label: "Queue", icon: ListPlus },
  { kind: "target", label: "Target", icon: Crosshair },
  { kind: "sleeper", label: "Sleeper", icon: MoonStar },
  { kind: "avoid", label: "Avoid", icon: Ban },
];

function formatNumber(value: number | null, digits = 0) {
  if (value === null) return "—";
  return value.toFixed(digits);
}

function DraftControls({
  controls,
  playerId,
  onToggle,
}: {
  controls: DraftControlState;
  playerId: string;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  return (
    <div className="draft-player-controls" aria-label="Draft controls">
      {CONTROL_META.map(({ kind, label, icon: Icon }) => {
        const active = controls[kind].includes(playerId);
        return (
          <button
            key={kind}
            type="button"
            className={`${kind} ${active ? "active" : ""}`}
            aria-label={`${active ? "Remove from" : "Add to"} ${label}`}
            aria-pressed={active}
            title={label}
            onClick={() => onToggle(kind, playerId)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DraftUnlock({
  warRoom,
}: {
  warRoom: WarRoomState;
}) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const unlocked = await warRoom.login(password);
    if (unlocked) setPassword("");
  }

  return (
    <section className="draft-unlock">
      <LockKeyhole />
      <div>
        <h2>Unlock personalized draft recommendations</h2>
        <p>
          Live Sleeper picks work without a password. Unlock the private
          FantasyPros board to activate recommendations and the simulator.
        </p>
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="draft-war-room-password">
          War Room password
        </label>
        <input
          id="draft-war-room-password"
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

function RecommendationCard({
  recommendation,
  proof,
  rank,
  guidance,
  tierBreak,
  change,
  controls,
  canDraft,
  comparisonIds,
  onDraft,
  onToggleComparison,
  onToggle,
}: {
  recommendation: DraftRecommendation;
  proof: RecommendationProof | null;
  rank: number;
  guidance: PlayerWaitGuidance | null;
  tierBreak: TierBreakWarning | null;
  change: RecommendationChange | null;
  controls: DraftControlState;
  canDraft: boolean;
  comparisonIds: string[];
  onDraft: (player: PlayerIntelligence) => void;
  onToggleComparison: (playerId: string) => void;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const { player } = recommendation;
  const [proofOpen, setProofOpen] = useState(rank === 1);
  const changeLabel =
    change?.kind === "new"
      ? "New after last pick"
      : change?.kind === "up"
        ? `Up ${change.rankDelta}`
        : change?.kind === "down"
          ? `Down ${Math.abs(change.rankDelta)}`
          : change && change.scoreDelta !== 0
            ? `${change.scoreDelta > 0 ? "+" : ""}${change.scoreDelta} score`
            : null;
  return (
    <article
      className={`recommendation-card ${rank === 1 ? "top-pick" : ""} ${
        change && change.kind !== "steady"
          ? `recommendation-changed change-${change.kind}`
          : ""
      }`}
    >
      <div className="recommendation-rank">{rank}</div>
      <div className="recommendation-main">
        <header>
          <span className={`position-mark position-${player.position.toLowerCase()}`}>
            {player.position}
          </span>
          <span>
            <strong>{player.name}</strong>
            <small>
              {player.team} · League #{formatNumber(player.leagueRank ?? player.ecr)}
              {" "}· {player.position} #{formatNumber(player.leaguePositionRank ?? null)}
              {" "}· ADP {formatNumber(player.adp, 1)}
            </small>
          </span>
          <span className="recommendation-score">
            <strong>{recommendation.score}</strong>
            <small>roster value</small>
          </span>
        </header>
        <div className="recommendation-outcome" aria-label="Projected outcome range">
          <span>
            <small>Floor</small>
            <strong>{formatNumber(recommendation.outcomeRange?.floor ?? null, 1)}</strong>
          </span>
          <span>
            <small>Expected</small>
            <strong>{formatNumber(recommendation.outcomeRange?.expected ?? null, 1)}</strong>
          </span>
          <span>
            <small>Ceiling</small>
            <strong>{formatNumber(recommendation.outcomeRange?.ceiling ?? null, 1)}</strong>
          </span>
          <span>
            <small>Recommendation confidence</small>
            <strong className={`confidence-${(proof?.confidence ?? recommendation.modelConfidence ?? "Low").toLowerCase()}`}>
              {proof?.confidence ?? recommendation.modelConfidence ?? "Low"}
            </strong>
          </span>
        </div>
        {guidance ? (
          <div className="recommendation-guidance">
            <strong className={`is-${guidance.tone}`}>
              {guidance.guidance}
            </strong>
            <span>
              {guidance.survivalProbability === null
                ? guidance.reason
                : `${guidance.survivalProbability}% chance to survive to pick ${guidance.nextDecisionPick}`}
            </span>
            {tierBreak?.urgent ? (
              <em>
                Tier break · {tierBreak.remainingInTier} left
              </em>
            ) : null}
            {changeLabel ? (
              <b className={`change-${change?.kind}`}>
                {change?.kind === "down" ? <TrendingDown /> : <TrendingUp />}
                {changeLabel}
              </b>
            ) : null}
          </div>
        ) : null}
        <DraftControls
          controls={controls}
          playerId={player.id}
          onToggle={onToggle}
        />
        <ComparePlayerButton
          player={player}
          selected={comparisonIds.includes(player.id)}
          disabled={comparisonIds.length >= 4}
          onToggle={onToggleComparison}
        />
        {proof ? (
          <details
            className="recommendation-proof"
            open={proofOpen}
            onToggle={(event) => setProofOpen(event.currentTarget.open)}
          >
            <summary>
              Recommendation proof · complete {recommendation.reasons.length}-factor audit
            </summary>
            <div className="recommendation-proof-body">
              <section className="proof-score-ledger" aria-label="Complete score calculation">
                <span>
                  <small>Starting baseline</small>
                  <strong>{proof.baseline.toFixed(1)}</strong>
                </span>
                <b>+</b>
                <span className="is-positive">
                  <small>Positive effects</small>
                  <strong>+{proof.positiveTotal.toFixed(1)}</strong>
                </span>
                <b>−</b>
                <span className="is-negative">
                  <small>Negative effects</small>
                  <strong>−{proof.negativeTotal.toFixed(1)}</strong>
                </span>
                <b>=</b>
                <span className="is-total">
                  <small>Exact → ranked</small>
                  <strong>{proof.exactTotal.toFixed(1)} → {proof.roundedTotal}</strong>
                </span>
              </section>

              <section className="proof-ranking-explanation">
                <Info />
                <span>
                  <strong>{proof.rankingExplanation}</strong>
                  <small>{proof.overallVsRosterExplanation}</small>
                </span>
              </section>

              <section className="proof-value-split" aria-label="Overall and roster-specific value">
                <span>
                  <small>Overall player value</small>
                  <strong>{proof.overallValue.toFixed(1)}</strong>
                  <em>Player quality before your roster and live-draft context.</em>
                </span>
                <span>
                  <small>Roster-specific effect</small>
                  <strong>{proof.rosterSpecificEffect >= 0 ? "+" : ""}{proof.rosterSpecificEffect.toFixed(1)}</strong>
                  <em>Your needs, depth, concentrations, stacks, market and controls.</em>
                </span>
                <span>
                  <small>Final roster value</small>
                  <strong>{proof.roundedTotal}</strong>
                  <em>The value used to order these recommendations.</em>
                </span>
              </section>

              <section className="proof-at-a-glance">
                {[
                  ["Roster need", proof.rosterNeed],
                  ["Tier scarcity", proof.tierScarcity],
                  ["ADP", proof.adp],
                  ["Injury / role", proof.injury],
                  ["Bye week", proof.byeWeek],
                  ["Wait probability", proof.waitProbability],
                ].map(([label, value]) => (
                  <span key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </span>
                ))}
              </section>
              <p className="proof-wait-explanation">{proof.waitExplanation}</p>

              <div className="proof-effect-columns">
                <section className="proof-effect-group is-positive">
                  <header>
                    <strong>Positive effects</strong>
                    <small>+{proof.positiveTotal.toFixed(1)} total</small>
                  </header>
                  {proof.positiveFactors.map((factor) => (
                    <span key={factor.key}>
                      <b>+{factor.score.toFixed(1)}</b>
                      <span><strong>{factor.label}</strong><small>{factor.value}</small></span>
                    </span>
                  ))}
                  {!proof.positiveFactors.length ? <p>No positive effects.</p> : null}
                </section>
                <section className="proof-effect-group is-negative">
                  <header>
                    <strong>Negative effects</strong>
                    <small>−{proof.negativeTotal.toFixed(1)} total</small>
                  </header>
                  {proof.negativeFactors.map((factor) => (
                    <span key={factor.key}>
                      <b>{factor.score.toFixed(1)}</b>
                      <span><strong>{factor.label}</strong><small>{factor.value}</small></span>
                    </span>
                  ))}
                  {!proof.negativeFactors.length ? <p>No negative effects.</p> : null}
                </section>
              </div>

              <section className="proof-neutral-factors">
                <header>
                  <strong>No-score effects</strong>
                  <small>Modeled and shown for completeness</small>
                </header>
                <div>
                  {proof.neutralFactors.map((factor) => (
                    <span key={factor.key}>
                      <b>0.0</b>
                      <span><strong>{factor.label}</strong><small>{factor.value}</small></span>
                    </span>
                  ))}
                  {!proof.neutralFactors.length ? <p>Every factor changed the score.</p> : null}
                </div>
              </section>

              <section className={`proof-confidence is-${proof.confidence.toLowerCase()}`}>
                <ShieldAlert />
                <span>
                  <strong>{proof.confidence} recommendation confidence</strong>
                  {proof.confidenceReasons.map((reason) => <small key={reason}>{reason}</small>)}
                </span>
              </section>

              {proof.warnings.length ? (
                <section className="proof-warnings">
                  <header><CircleAlert /><strong>Data and modeling warnings</strong></header>
                  {proof.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </section>
              ) : null}

              <section className="proof-sources">
                <header><Database /><strong>Sources and freshness</strong></header>
                <div>
                  {proof.sources.map((source) => (
                    <span key={source.name}>
                      <b className={`is-${source.status.toLowerCase()}`}>{source.status}</b>
                      <span>
                        <strong>{source.name}</strong>
                        <small>{source.usedFor} · {source.ageLabel}</small>
                      </span>
                    </span>
                  ))}
                </div>
              </section>

              <section className="proof-alternatives">
                <header>
                  <strong>Top alternatives and tradeoffs</strong>
                  <small>Compared with {player.name}</small>
                </header>
                {proof.alternatives.map((alternative) => (
                  <article key={alternative.playerId}>
                    <span className={`position-mark position-${alternative.position.toLowerCase()}`}>
                      {alternative.position}
                    </span>
                    <span>
                      <strong>{alternative.name} · roster value {alternative.score}</strong>
                      <small>{alternative.tradeoff}</small>
                      <em>Overall {alternative.overallValue.toFixed(1)} · roster effect {alternative.rosterSpecificEffect >= 0 ? "+" : ""}{alternative.rosterSpecificEffect.toFixed(1)}</em>
                    </span>
                  </article>
                ))}
              </section>
            </div>
          </details>
        ) : null}
      </div>
      {canDraft ? (
        <button
          className="button primary simulate-draft-button"
          type="button"
          onClick={() => onDraft(player)}
        >
          Draft
        </button>
      ) : null}
    </article>
  );
}

function AvailablePlayerRow({
  player,
  controls,
  canDraft,
  comparisonIds,
  onDraft,
  onToggleComparison,
  onToggle,
}: {
  player: PlayerIntelligence;
  controls: DraftControlState;
  canDraft: boolean;
  comparisonIds: string[];
  onDraft: (player: PlayerIntelligence) => void;
  onToggleComparison: (playerId: string) => void;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  return (
    <article className="available-player-row">
      <span className={`position-mark position-${player.position.toLowerCase()}`}>
        {player.position}
      </span>
      <span className="available-player-name">
        <strong>{player.name}</strong>
        <small>{player.team} · ECR {formatNumber(player.ecr)}</small>
      </span>
      <span className="available-adp">
        <small>ADP</small>
        <strong>{formatNumber(player.adp, 1)}</strong>
      </span>
      <DraftControls
        controls={controls}
        playerId={player.id}
        onToggle={onToggle}
      />
      <ComparePlayerButton
        player={player}
        selected={comparisonIds.includes(player.id)}
        disabled={comparisonIds.length >= 4}
        onToggle={onToggleComparison}
      />
      {canDraft ? (
        <button
          className="row-draft-button"
          type="button"
          onClick={() => onDraft(player)}
        >
          Draft
        </button>
      ) : null}
    </article>
  );
}

function RecentPick({
  pick,
  teams,
}: {
  pick: SleeperDraftPick;
  teams: TeamDraftState[];
}) {
  const team = teams.find((item) => item.rosterId === Number(pick.roster_id));
  return (
    <article className="recent-pick-row">
      <span>{pick.pick_no}</span>
      <span className={`position-mark position-${(pickPosition(pick) ?? "—").toLowerCase()}`}>
        {pickPosition(pick) ?? "—"}
      </span>
      <span>
        <strong>{pickPlayerName(pick)}</strong>
        <small>{team?.name ?? `Roster ${pick.roster_id}`}</small>
      </span>
    </article>
  );
}

function TeamRosterCard({
  team,
  current,
  user,
}: {
  team: TeamDraftState;
  current: boolean;
  user: boolean;
}) {
  const visibleNeeds = team.needs.filter((need) => need.missing > 0).slice(0, 4);
  const draftedCount = team.picks.length;
  return (
    <article className={`team-roster-card ${current ? "on-clock" : ""} ${user ? "is-user" : ""}`}>
      <header>
        <span>#{team.slot ?? "—"}</span>
        <span>
          <strong>{team.name}</strong>
          <small>
            {draftedCount} drafted
          </small>
        </span>
        {current ? <em>On clock</em> : user ? <em>Your team</em> : null}
      </header>
      <div className="team-needs">
        {visibleNeeds.length ? (
          visibleNeeds.map((need) => (
            <span key={need.position}>
              {need.position} {need.missing}
            </span>
          ))
        ) : (
          <span>Starter needs filled</span>
        )}
      </div>
      <div className="team-pick-list">
        {team.picks.length ? (
          team.picks.map((pick) => (
            <span key={`${pick.pick_no}-${pick.player_id}`}>
              <small>{pick.pick_no}</small>
              <strong>{pickPlayerName(pick)}</strong>
              <em>{pickPosition(pick) ?? "—"}</em>
            </span>
          ))
        ) : (
          <p>No selections yet</p>
        )}
      </div>
    </article>
  );
}

function DraftBoardGrid({
  draft,
  teams,
  picks,
  currentPick,
  userRosterId,
}: {
  draft: LeagueSnapshot["draft"];
  teams: TeamDraftState[];
  picks: SleeperDraftPick[];
  currentPick: number;
  userRosterId: number | null;
}) {
  const rows = useMemo(
    () => buildDraftBoardRows(draft, teams, picks),
    [draft, picks, teams],
  );
  const style = {
    "--draft-team-count": draft.settings.teams,
  } as CSSProperties;

  return (
    <section className="full-draft-board">
      <header>
        <Grid3X3 />
        <span>
          <h2>Full {draft.settings.teams}-team draft board</h2>
          <p>
            {picks.length} of {draft.settings.teams * draft.settings.rounds} selections complete
          </p>
        </span>
        <small>Scroll sideways to see every team</small>
      </header>
      <div className="draft-board-scroll">
        <div className="draft-board-grid" style={style}>
          <span className="draft-board-corner">RD</span>
          {teams.map((team) => (
            <span
              className={`draft-board-team ${
                team.rosterId === userRosterId ? "is-user" : ""
              }`}
              key={team.rosterId}
            >
              <b>#{team.slot ?? "—"}</b>
              <strong>{team.name}</strong>
            </span>
          ))}
          {rows.flatMap((row) => [
            <span className="draft-board-round" key={`round-${row.round}`}>
              {row.round}
            </span>,
            ...row.cells.map((cell) => {
              const position = cell.pick ? pickPosition(cell.pick) : null;
              return (
                <span
                  className={`draft-board-cell ${
                    cell.pickNumber === currentPick && !cell.pick ? "is-current" : ""
                  } ${cell.team?.rosterId === userRosterId ? "is-user" : ""}`}
                  key={`${row.round}-${cell.slot}`}
                  title={
                    cell.pick
                      ? `Pick ${cell.pickNumber}: ${pickPlayerName(cell.pick)}`
                      : `Pick ${cell.pickNumber}`
                  }
                >
                  <small>{cell.pickNumber}</small>
                  {cell.pick ? (
                    <>
                      <b className={`position-${(position ?? "—").toLowerCase()}`}>
                        {position ?? "—"}
                      </b>
                      <strong>{pickPlayerName(cell.pick)}</strong>
                    </>
                  ) : (
                    <em>{cell.pickNumber === currentPick ? "On clock" : "Open"}</em>
                  )}
                </span>
              );
            }),
          ])}
        </div>
      </div>
    </section>
  );
}

function LiveIntelligencePanel({
  run,
  tierBreak,
  queue,
  draftedControlled,
  expected,
  changedCount,
}: {
  run: ReturnType<typeof detectPositionRun>;
  tierBreak: TierBreakWarning | null;
  queue: QueueDepletionWarning;
  draftedControlled: ControlledPlayerDrafted[];
  expected: OpponentForecast[];
  changedCount: number;
}) {
  const latestDrafted = draftedControlled[0] ?? null;
  return (
    <section className="live-intelligence-panel">
      <header>
        <ShieldAlert />
        <span>
          <h2>Live draft intelligence</h2>
          <p>Rebuilt after every selection using the board, tiers, queue and opponent needs.</p>
        </span>
        <small>
          {changedCount
            ? `${changedCount} recommendation${changedCount === 1 ? "" : "s"} changed`
            : "Recommendations steady"}
        </small>
      </header>
      <div className="live-alert-grid">
        <article className={run ? "is-warning" : "is-clear"}>
          <small>Position run</small>
          <strong>
            {run
              ? `${run.count} ${run.position}s in the last ${run.window} picks`
              : "No active run"}
          </strong>
          <p>
            {run
              ? `Pressure detected at picks ${run.pickNumbers.join(", ")}.`
              : "No position has crossed the four-of-six alert threshold."}
          </p>
        </article>
        <article className={tierBreak?.urgent ? "is-warning" : "is-clear"}>
          <small>Tier break</small>
          <strong>
            {tierBreak
              ? `${tierBreak.remainingInTier} ${tierBreak.position}${tierBreak.remainingInTier === 1 ? "" : "s"} left in tier ${tierBreak.tier}`
              : "No immediate tier cliff"}
          </strong>
          <p>
            {tierBreak?.urgent
              ? `The next tier begins${tierBreak.ecrDrop === null ? "" : ` about ${tierBreak.ecrDrop} ECR spots later`}.`
              : "The top recommendation still has a stable same-tier fallback."}
          </p>
        </article>
        <article className={`is-${queue.level}`}>
          <small>Queue health</small>
          <strong>{queue.remaining} available · {queue.drafted} drafted</strong>
          <p>{queue.message}</p>
        </article>
        <article className={latestDrafted ? "is-danger" : "is-clear"}>
          <small>Tracked-player detection</small>
          <strong>
            {latestDrafted
              ? `${latestDrafted.player.name} drafted at ${latestDrafted.pick.pick_no}`
              : "Targets and sleepers available"}
          </strong>
          <p>
            {latestDrafted
              ? `${latestDrafted.kinds.map((kind) => kind[0].toUpperCase() + kind.slice(1)).join(" + ")} status was detected automatically.`
              : "No queued, targeted or sleeper player has been lost."}
          </p>
        </article>
      </div>
      <div className="expected-picks-strip">
        <span>
          <small>Expected before your next turn</small>
          <strong>
            {expected.length
              ? `${expected.length} modeled selection${expected.length === 1 ? "" : "s"}`
              : "No intervening selections"}
          </strong>
        </span>
        <div>
          {expected.length ? (
            expected.map((forecast) => (
              <article key={forecast.pickNumber}>
                <small>Pick {forecast.pickNumber} · {forecast.teamName}</small>
                <b className={`position-${forecast.player.position.toLowerCase()}`}>
                  {forecast.player.position}
                </b>
                <strong>{forecast.player.name}</strong>
                <em>{forecast.confidence} confidence</em>
              </article>
            ))
          ) : (
            <p>You are on the clock, the draft is complete, or the order is still pending.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function NextTurnForecastPanel({
  forecast,
  change,
}: {
  forecast: NextTurnForecast;
  change: NextTurnForecastChange | null;
}) {
  const lead = forecast.players[0] ?? null;
  const likelyRuns = forecast.positionDemand.filter(
    (position) => position.risk !== "Stable",
  );
  return (
    <section className="next-turn-forecast-panel" aria-label="Next-Turn Forecast">
      <header>
        <Bot />
        <span>
          <h2>Next-Turn Forecast</h2>
          <p>
            {forecast.nextUserPick
              ? `${forecast.interveningPicks} pick${forecast.interveningPicks === 1 ? "" : "s"} modeled before your pick ${forecast.nextUserPick}`
              : "Waiting analysis activates when a later user pick is known"}
          </p>
        </span>
        <small>
          {forecast.simulations
            ? `${forecast.simulations} draft paths`
            : "Draft order pending"}
        </small>
      </header>

      {change ? (
        <div className="forecast-change" aria-live="polite">
          <TrendingUp />
          <span>
            <strong>{change.headline}</strong>
            <small>{change.details.join(" ")}</small>
          </span>
        </div>
      ) : (
        <div className="forecast-change is-baseline">
          <Radio />
          <span>
            <strong>Current baseline</strong>
            <small>The next Sleeper pick will show exactly what changed.</small>
          </span>
        </div>
      )}

      {lead ? (
        <div className="forecast-lead">
          <span className={`forecast-call is-${lead.tone}`}>
            {lead.recommendation}
          </span>
          <span>
            <small>Top decision</small>
            <strong>{lead.player.name}</strong>
          </span>
          <span>
            <small>Survives</small>
            <strong>
              {lead.survivalProbability === null
                ? "—"
                : `${lead.survivalProbability}%`}
            </strong>
          </span>
          <span>
            <small>Expected wait cost</small>
            <strong>{lead.expectedWaitCost.toFixed(1)} pts</strong>
          </span>
          <p>{lead.explanation}</p>
        </div>
      ) : null}

      <div className="next-turn-layout">
        <section className="forecast-player-decisions">
          <header>
            <h3>Draft now or wait</h3>
            <small>Compared with realistic fallbacks</small>
          </header>
          <div>
            {forecast.players.length ? (
              forecast.players.map((playerForecast, index) => (
                <article key={playerForecast.player.id}>
                  <strong className="forecast-rank">#{index + 1}</strong>
                  <span className={`position-mark position-${playerForecast.player.position.toLowerCase()}`}>
                    {playerForecast.player.position}
                  </span>
                  <span className="forecast-decision-player">
                    <strong>{playerForecast.player.name}</strong>
                    <small>
                      {describeTier(playerForecast.player)}
                      {playerForecast.finalValuablePlayerInTier
                        ? " · final valuable player"
                        : ""}
                    </small>
                  </span>
                  <span className={`forecast-decision is-${playerForecast.tone}`}>
                    <strong>{playerForecast.recommendation}</strong>
                    <small>
                      {playerForecast.survivalProbability === null
                        ? "No later pick"
                        : `${playerForecast.survivalProbability}% survives · ${playerForecast.expectedWaitCost.toFixed(1)} cost`}
                    </small>
                  </span>
                  <div className="forecast-survival-track" aria-label={`${playerForecast.player.name} survival estimate`}>
                    <i
                      style={{
                        width: `${playerForecast.survivalProbability ?? 0}%`,
                      }}
                    />
                  </div>
                  <p>{playerForecast.explanation}</p>
                  <small className="forecast-alternatives">
                    Alternatives: {playerForecast.alternatives.length
                      ? playerForecast.alternatives
                          .map((alternative) =>
                            `${alternative.player.name} (${alternative.scoreDelta >= 0 ? "+" : ""}${alternative.scoreDelta})`,
                          )
                          .join(" · ")
                      : "no lower-ranked fallback in the recommendation set"}
                  </small>
                </article>
              ))
            ) : (
              <p className="draft-panel-empty">No eligible players remain to forecast.</p>
            )}
          </div>
        </section>

        <section className="forecast-market">
          <header>
            <h3>Likely selections before your pick</h3>
            <small>Team needs + modeled outcomes</small>
          </header>
          <div className="forecast-market-picks">
            {forecast.likelyPicks.length ? (
              forecast.likelyPicks.map((pick) => {
                const player = pick.players[0];
                const position = pick.positions[0];
                return (
                  <article key={pick.pickNumber}>
                    <b>#{pick.pickNumber}</b>
                    <span>
                      <strong>{pick.teamName}</strong>
                      <small>
                        Needs {pick.needs.join(" · ") || "best value"}
                      </small>
                    </span>
                    <ChevronRight />
                    <span>
                      <strong>{player?.player.name ?? position?.position ?? "Open"}</strong>
                      <small>
                        {position
                          ? `${Math.round(position.probability * 100)}% ${position.position}`
                          : "No reliable position signal"}
                        {player ? ` · ${Math.round(player.probability * 100)}% player` : ""}
                      </small>
                    </span>
                  </article>
                );
              })
            ) : (
              <p>No opponent selection occurs before the next known user pick.</p>
            )}
          </div>
          <div className="forecast-run-risk">
            <h4>Position-run risk</h4>
            {likelyRuns.length ? (
              likelyRuns.map((position) => (
                <span key={position.position} className={`is-${position.risk.replace(" ", "-").toLowerCase()}`}>
                  <b>{position.position}</b>
                  <strong>{position.risk}</strong>
                  <small>{position.expectedSelections.toFixed(1)} expected selections</small>
                </span>
              ))
            ) : (
              <p>No position is currently projected to run before your next pick.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function QueuePanel({
  available,
  controls,
  onMove,
  onToggle,
}: {
  available: PlayerIntelligence[];
  controls: DraftControlState;
  onMove: (playerId: string, direction: -1 | 1) => void;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const playersById = new Map(available.map((player) => [player.id, player]));
  const queue = controls.queue
    .map((id) => playersById.get(id))
    .filter((player): player is PlayerIntelligence => Boolean(player));

  return (
    <section className="draft-queue-panel">
      <header>
        <ListPlus />
        <div>
          <h2>Your queue</h2>
          <p>Queue order directly influences personalized recommendations.</p>
        </div>
      </header>
      {queue.length ? (
        <div className="queue-list">
          {queue.map((player, index) => (
            <article key={player.id}>
              <strong>{index + 1}</strong>
              <span>
                <b>{player.name}</b>
                <small>{player.position} · {player.team}</small>
              </span>
              <button
                type="button"
                aria-label={`Move ${player.name} up`}
                disabled={index === 0}
                onClick={() => onMove(player.id, -1)}
              >
                <ChevronUp />
              </button>
              <button
                type="button"
                aria-label={`Move ${player.name} down`}
                disabled={index === queue.length - 1}
                onClick={() => onMove(player.id, 1)}
              >
                <ChevronDown />
              </button>
              <button
                type="button"
                aria-label={`Remove ${player.name} from queue`}
                onClick={() => onToggle("queue", player.id)}
              >
                <Ban />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-queue">Use the queue control beside any available player.</p>
      )}
    </section>
  );
}

function FocusedRecommendation({
  recommendation,
  rank,
  guidance,
  tierBreak,
  controls,
  onToggle,
}: {
  recommendation: DraftRecommendation;
  rank: number;
  guidance: PlayerWaitGuidance | null;
  tierBreak: TierBreakWarning | null;
  controls: DraftControlState;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const queued = controls.queue.includes(recommendation.player.id);
  return (
    <article className={`focused-recommendation ${rank === 1 ? "is-first" : ""}`}>
      <strong className="focused-rank">{rank}</strong>
      <span className={`position-mark position-${recommendation.player.position.toLowerCase()}`}>
        {recommendation.player.position}
      </span>
      <span className="focused-player">
        <strong>{recommendation.player.name}</strong>
        <small>
          {recommendation.player.team} · ECR {formatNumber(recommendation.player.ecr)}
        </small>
      </span>
      <span className="focused-guidance">
        <strong className={guidance ? `is-${guidance.tone}` : ""}>
          {guidance?.guidance ?? "Best available"}
        </strong>
        <small>
          {guidance?.survivalProbability === null || guidance?.survivalProbability === undefined
            ? recommendation.factors?.find((factor) => factor.key === "roster-fit")?.value ?? "Best fit for your current roster"
            : `${guidance.survivalProbability}% survives`}
        </small>
      </span>
      {tierBreak?.urgent ? (
        <em>{tierBreak.remainingInTier} left in tier</em>
      ) : null}
      <button
        type="button"
        className={queued ? "is-queued" : ""}
        aria-pressed={queued}
        onClick={() => onToggle("queue", recommendation.player.id)}
      >
        <ListPlus />
        {queued ? "Queued" : "Queue"}
      </button>
    </article>
  );
}

function FocusedDraftCommand({
  currentTeamName,
  currentPick,
  currentRound,
  currentSlot,
  picksUntilUser,
  isUserTurn,
  recommendations,
  waitGuidance,
  tierBreaks,
  available,
  controls,
  recentPicks,
  teams,
  positionRun,
  tools,
  onToggle,
}: {
  currentTeamName: string;
  currentPick: number;
  currentRound: number;
  currentSlot: number;
  picksUntilUser: number | null;
  isUserTurn: boolean;
  recommendations: DraftRecommendation[];
  waitGuidance: Map<string, PlayerWaitGuidance>;
  tierBreaks: Map<string, TierBreakWarning | null>;
  available: PlayerIntelligence[];
  controls: DraftControlState;
  recentPicks: SleeperDraftPick[];
  teams: TeamDraftState[];
  positionRun: ReturnType<typeof detectPositionRun>;
  tools: ReturnType<typeof useDraftFocusTools>;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const availableById = new Map(available.map((player) => [player.id, player]));
  const queuedPlayers = controls.queue
    .map((playerId) => availableById.get(playerId))
    .filter((player): player is PlayerIntelligence => Boolean(player))
    .slice(0, 6);
  const notificationCopy =
    tools.notificationState === "granted"
      ? "Sound + notifications"
      : tools.notificationState === "denied"
        ? "Sound only · notifications blocked"
        : tools.notificationState === "unsupported"
          ? "Sound only"
          : "Sound + permission prompt";
  const wakeCopy =
    tools.wakeLockState === "unsupported"
      ? "Wake lock unavailable"
      : tools.wakeLockState === "blocked"
        ? "Wake lock blocked"
        : tools.wakeLockEnabled
          ? "Screen stays awake"
          : "Keep screen awake";

  return (
    <section
      className={`focused-draft-command ${isUserTurn ? "is-on-clock" : ""}`}
      aria-label="Focused draft command screen"
    >
      {isUserTurn ? (
        <div className="focused-on-clock-alert" role="alert" aria-live="assertive">
          <BellRing />
          <span>
            <strong>You are on the clock</strong>
            <small>Make the selection in Sleeper now.</small>
          </span>
        </div>
      ) : null}

      <header className="focused-command-header">
        <span>
          <Radio />
          <strong>Focused draft mode</strong>
          <small>Live while Sleeper reports the draft running</small>
        </span>
        <div className="focused-command-tools">
          <button
            type="button"
            className={tools.alertsEnabled ? "is-active" : ""}
            onClick={() => void tools.toggleAlerts()}
          >
            {tools.alertsEnabled ? <BellRing /> : <Bell />}
            <span>{tools.alertsEnabled ? notificationCopy : "Enable alerts"}</span>
          </button>
          <button
            type="button"
            className={tools.positionRunAlerts ? "is-active" : ""}
            aria-pressed={tools.positionRunAlerts}
            onClick={tools.togglePositionRunAlerts}
          >
            <TrendingUp />
            <span>{tools.positionRunAlerts ? "Run alerts on" : "Run alerts off"}</span>
          </button>
          <button
            type="button"
            className={tools.wakeLockEnabled ? "is-active" : ""}
            disabled={tools.wakeLockState === "unsupported" || tools.wakeLockState === "requesting"}
            onClick={() => void tools.toggleWakeLock()}
          >
            <Sun />
            <span>{wakeCopy}</span>
          </button>
        </div>
      </header>

      <div className="focused-clock-grid">
        <article className="focused-current-picker">
          <small>Current picker</small>
          <strong>{isUserTurn ? "You — KingBoby" : currentTeamName}</strong>
          <span>
            Round {currentRound}.{String(currentSlot).padStart(2, "0")} · Pick {currentPick}
          </span>
        </article>
        <article className={`focused-turn-distance ${isUserTurn ? "is-now" : ""}`}>
          <small>Picks until your turn</small>
          <strong>
            {picksUntilUser === null
              ? "—"
              : picksUntilUser === 0
                ? "NOW"
                : picksUntilUser}
          </strong>
          <span>
            {isUserTurn
              ? "Submit your pick in Sleeper"
              : picksUntilUser === null
                ? "Waiting for draft order"
                : picksUntilUser <= 3
                  ? "Get your choice ready"
                  : "Watch the board"}
          </span>
        </article>
        <article className={`focused-run-status ${positionRun ? "is-running" : ""}`}>
          <small>Position pressure</small>
          <strong>
            {positionRun
              ? `${positionRun.count} ${positionRun.position}s in ${positionRun.window}`
              : "No active run"}
          </strong>
          <span>
            {positionRun
              ? `Picks ${positionRun.pickNumbers.join(", ")}`
              : "Four-of-six threshold is clear"}
          </span>
        </article>
      </div>

      <div className="focused-command-body">
        <section className="focused-top-three">
          <header>
            <Target />
            <span>
              <h2>Top three right now</h2>
              <p>Always visible and recalculated after every pick.</p>
            </span>
          </header>
          <div>
            {recommendations.slice(0, 3).map((recommendation, index) => (
              <FocusedRecommendation
                key={recommendation.player.id}
                recommendation={recommendation}
                rank={index + 1}
                guidance={waitGuidance.get(recommendation.player.id) ?? null}
                tierBreak={tierBreaks.get(recommendation.player.id) ?? null}
                controls={controls}
                onToggle={onToggle}
              />
            ))}
            {!recommendations.length ? (
              <p className="focused-empty">Unlock the War Room to load recommendations.</p>
            ) : null}
          </div>
        </section>

        <div className="focused-side-stack">
          <section className="focused-queue">
            <header>
              <ListPlus />
              <span>
                <h2>Queue</h2>
                <p>{queuedPlayers.length} ready</p>
              </span>
            </header>
            <div>
              {queuedPlayers.length ? (
                queuedPlayers.map((player, index) => (
                  <article key={player.id}>
                    <strong>{index + 1}</strong>
                    <span>
                      <b>{player.name}</b>
                      <small>{player.position} · {player.team}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${player.name} from queue`}
                      onClick={() => onToggle("queue", player.id)}
                    >
                      <X />
                    </button>
                  </article>
                ))
              ) : (
                <p className="focused-empty">Queue three fallback players.</p>
              )}
            </div>
          </section>

          <section className="focused-recent">
            <header>
              <Check />
              <span>
                <h2>Recent picks</h2>
                <p>Newest first</p>
              </span>
            </header>
            <div>
              {recentPicks.length ? (
                [...recentPicks]
                  .reverse()
                  .slice(0, 6)
                  .map((pick) => (
                    <RecentPick
                      key={`${pick.pick_no}-${pick.player_id}`}
                      pick={pick}
                      teams={teams}
                    />
                  ))
              ) : (
                <p className="focused-empty">Waiting for the first pick.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export function LiveDraftRoom({
  snapshot,
  draftPicks,
  refreshing,
  onRefresh,
  onEnsureSettingsFresh,
  warRoom,
}: {
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  refreshing: boolean;
  onRefresh: () => void;
  onEnsureSettingsFresh: (maximumAgeMs?: number) => Promise<void>;
  warRoom: WarRoomState;
}) {
  const draft = snapshot.draft;
  const userRoster = getUserRoster(snapshot);
  const actualPosition = getDraftPosition(snapshot);
  const [simSlot, setSimSlot] = useState(() =>
    Math.max(1, Math.ceil(draft.settings.teams / 2))
  );
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulatedPicks, setSimulatedPicks] = useState<SleeperDraftPick[]>([]);
  const [query, setQuery] = useState("");
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);
  const { controls, moveQueue, toggle } = useDraftControls();
  const { simulationRuns, setSimulationRuns } = useDraftStrategy();
  const board = warRoom.board?.players ?? EMPTY_PLAYERS;
  const canSimulate =
    draft.status === "pre_draft" && !actualPosition && Boolean(userRoster);
  const slotMap = useMemo(
    () =>
      simulationActive && userRoster
        ? createSimulationSlotMap(draft, userRoster.roster_id, simSlot)
        : actualPosition
          ? draft.slot_to_roster_id
          : {},
    [actualPosition, draft, simSlot, simulationActive, userRoster],
  );
  const livePicks = draftPicks.picks;
  const picks = simulationActive ? simulatedPicks : livePicks;
  const teams = useMemo(
    () =>
      buildTeamDraftStates({
        draft,
        users: snapshot.users,
        rosters: snapshot.rosters,
        picks,
        slotMap,
      }),
    [draft, picks, slotMap, snapshot.rosters, snapshot.users],
  );
  const cursor = useMemo(
    () =>
      getDraftCursor(
        draft,
        picks,
        userRoster?.roster_id ?? -1,
        slotMap,
      ),
    [draft, picks, slotMap, userRoster?.roster_id],
  );
  const available = useMemo(
    () => availablePlayers(board, picks),
    [board, picks],
  );
  const recommendations = useMemo(
    () =>
      userRoster
        ? recommendPlayers({
            available,
            allPlayers: board,
            teams,
            userRosterId: userRoster.roster_id,
            cursor,
            controls,
            draft,
            slotMap,
          })
        : [],
    [available, board, controls, cursor, draft, slotMap, teams, userRoster],
  );
  const positionRun = useMemo(() => detectPositionRun(picks), [picks]);
  const focusedModeActive = draft.status === "drafting" && !simulationActive;
  const focusTools = useDraftFocusTools({
    active: focusedModeActive,
    currentPick: cursor.currentPick,
    picksUntilUser: cursor.picksUntilUser,
    isUserTurn: cursor.isUserTurn,
    positionRun,
  });
  const nextDecisionPick = useMemo(
    () =>
      userRoster
        ? nextUserDecisionPick({
            draft,
            picks,
            cursor,
            userRosterId: userRoster.roster_id,
            slotMap,
          })
        : null,
    [cursor, draft, picks, slotMap, userRoster],
  );
  const tierBreaks = useMemo(
    () =>
      new Map(
        recommendations.map((recommendation) => [
          recommendation.player.id,
          tierBreakForPlayer(recommendation.player, available),
        ]),
      ),
    [available, recommendations],
  );
  const marketForecast = useMemo(() => {
    if (
      !userRoster ||
      !board.length ||
      nextDecisionPick === null ||
      nextDecisionPick <= cursor.currentPick
    ) {
      return null;
    }
    return forecastNextTurnMarket({
      draft,
      users: snapshot.users,
      rosters: snapshot.rosters,
      picks,
      board,
      userRosterId: userRoster.roster_id,
      slotMap,
    });
  }, [
    board,
    cursor.currentPick,
    draft,
    nextDecisionPick,
    picks,
    slotMap,
    snapshot.rosters,
    snapshot.users,
    userRoster,
  ]);
  const comparisonPlayers = useMemo(() => {
    const byId = new Map(available.map((player) => [player.id, player]));
    return comparisonIds.flatMap((id) => {
      const player = byId.get(id);
      return player ? [player] : [];
    });
  }, [available, comparisonIds]);
  const comparisonRecommendations = useMemo(
    () =>
      userRoster && comparisonIds.length
        ? recommendPlayers({
            available,
            allPlayers: board,
            teams,
            userRosterId: userRoster.roster_id,
            cursor,
            controls,
            draft,
            slotMap,
            limit: available.length,
          })
        : recommendations,
    [
      available,
      board,
      comparisonIds.length,
      controls,
      cursor,
      draft,
      recommendations,
      slotMap,
      teams,
      userRoster,
    ],
  );
  const whatIfComparison = useMemo(
    () =>
      userRoster && comparisonPlayers.length >= 2
        ? buildWhatIfComparison({
            candidates: comparisonPlayers,
            available,
            allPlayers: board,
            currentRecommendations: comparisonRecommendations,
            market: marketForecast,
            draft,
            users: snapshot.users,
            rosters: snapshot.rosters,
            picks,
            userRosterId: userRoster.roster_id,
            cursor,
            controls,
            slotMap,
          })
        : null,
    [
      available,
      board,
      comparisonPlayers,
      comparisonRecommendations,
      controls,
      cursor,
      draft,
      marketForecast,
      picks,
      slotMap,
      snapshot.rosters,
      snapshot.users,
      userRoster,
    ],
  );
  useEffect(() => {
    const availableIds = new Set(available.map((player) => player.id));
    setComparisonIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [available]);
  const nextTurnForecast = useMemo(
    () =>
      buildNextTurnForecast({
        generatedForPick: cursor.currentPick,
        nextUserPick: nextDecisionPick,
        recommendations,
        tierBreaks,
        market: marketForecast,
      }),
    [
      cursor.currentPick,
      marketForecast,
      nextDecisionPick,
      recommendations,
      tierBreaks,
    ],
  );
  const recommendationProofs = useMemo(
    () =>
      buildRecommendationProofs({
        recommendations,
        forecast: nextTurnForecast,
        board: warRoom.board,
        leagueFetchedAt: snapshot.fetchedAt,
        picksFetchedAt: draftPicks.fetchedAt,
        draftStatus: draft.status,
      }),
    [
      draft.status,
      draftPicks.fetchedAt,
      nextTurnForecast,
      recommendations,
      snapshot.fetchedAt,
      warRoom.board,
    ],
  );
  const waitGuidance = useMemo(
    () => {
      const forecastById = new Map(
        nextTurnForecast.players.map((forecast) => [forecast.player.id, forecast]),
      );
      return new Map(
        recommendations.map((recommendation) => {
          const forecast = forecastById.get(recommendation.player.id);
          if (forecast) {
            return [
              recommendation.player.id,
              {
                playerId: recommendation.player.id,
                nextDecisionPick,
                survivalProbability: forecast.survivalProbability,
                guidance: forecast.recommendation,
                tone: forecast.tone,
                reason: forecast.explanation,
              } satisfies PlayerWaitGuidance,
            ] as const;
          }
          const tierBreak = tierBreaks.get(recommendation.player.id) ?? null;
          return [
            recommendation.player.id,
            buildWaitGuidance({
              player: recommendation.player,
              nextDecisionPick,
              tierBreak,
              positionRun,
            }),
          ] as const;
        }),
      );
    },
    [nextDecisionPick, nextTurnForecast, positionRun, recommendations, tierBreaks],
  );
  const draftedControlled = useMemo(
    () => detectDraftedControlledPlayers(controls, board, picks),
    [board, controls, picks],
  );
  const queueWarning = useMemo(
    () =>
      buildQueueDepletionWarning(
        controls,
        available,
        draftedControlled,
        cursor.picksUntilUser,
      ),
    [available, controls, cursor.picksUntilUser, draftedControlled],
  );
  const expectedPicks = useMemo(
    () =>
      nextTurnForecast.likelyPicks.flatMap((forecast): OpponentForecast[] => {
        const first = forecast.players[0];
        if (!first) return [];
        const leadingPosition = forecast.positions[0];
        return [{
          pickNumber: forecast.pickNumber,
          round: forecast.round,
          rosterId: forecast.rosterId,
          teamName: forecast.teamName,
          style: forecast.archetype,
          player: first.player,
          alternatives: forecast.players.slice(1).map((candidate) => candidate.player),
          confidence:
            first.probability >= 0.55
              ? "High"
              : first.probability >= 0.32
                ? "Medium"
                : "Low",
          reason: leadingPosition
            ? `${leadingPosition.position} is ${Math.round(leadingPosition.probability * 100)}% of modeled outcomes`
            : "Best fit for roster need and market value",
        }];
      }),
    [nextTurnForecast.likelyPicks],
  );
  const [recommendationChanges, setRecommendationChanges] = useState(
    () => new Map<string, RecommendationChange>(),
  );
  const [nextTurnChange, setNextTurnChange] =
    useState<NextTurnForecastChange | null>(null);
  const previousRecommendations = useRef<DraftRecommendation[]>([]);
  const previousPickSignature = useRef("");
  const previousNextTurnForecast = useRef<NextTurnForecast | null>(null);
  const previousForecastPickSignature = useRef("");
  const pickSignature = useMemo(
    () => picks.map((pick) => `${pick.pick_no}:${pick.player_id}`).join("|"),
    [picks],
  );
  useEffect(() => {
    if (simulationActive) return;
    void onEnsureSettingsFresh(draft.status === "drafting" ? 8_000 : 30_000);
  }, [
    draft.status,
    onEnsureSettingsFresh,
    pickSignature,
    simulationActive,
  ]);
  useEffect(() => {
    if (!recommendations.length) return;
    if (!previousRecommendations.current.length) {
      previousRecommendations.current = recommendations;
      previousPickSignature.current = pickSignature;
      return;
    }
    if (pickSignature !== previousPickSignature.current) {
      setRecommendationChanges(
        compareRecommendations(previousRecommendations.current, recommendations),
      );
      previousPickSignature.current = pickSignature;
      previousRecommendations.current = recommendations;
    }
  }, [pickSignature, recommendations]);
  useEffect(() => {
    if (!nextTurnForecast.players.length) return;
    if (!previousNextTurnForecast.current) {
      previousNextTurnForecast.current = nextTurnForecast;
      previousForecastPickSignature.current = pickSignature;
      return;
    }
    if (pickSignature !== previousForecastPickSignature.current) {
      setNextTurnChange(
        compareNextTurnForecast(
          previousNextTurnForecast.current,
          nextTurnForecast,
        ),
      );
      previousNextTurnForecast.current = nextTurnForecast;
      previousForecastPickSignature.current = pickSignature;
    }
  }, [nextTurnForecast, pickSignature]);
  const visibleAvailable = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase();
    return available
      .filter(
        (player) =>
          !search ||
          player.name.toLocaleLowerCase().includes(search) ||
          player.team.toLocaleLowerCase().includes(search) ||
          player.position.toLocaleLowerCase().includes(search),
      );
  }, [available, deferredQuery]);
  const currentTeam = teams.find(
    (team) => team.rosterId === cursor.currentRosterId,
  );
  const completedPicks = picks;

  function advanceSimulation(basePicks: SleeperDraftPick[]) {
    if (!userRoster || !board.length) return basePicks;
    return simulateToUserTurn({
      draft,
      users: snapshot.users,
      rosters: snapshot.rosters,
      picks: basePicks,
      board,
      userRosterId: userRoster.roster_id,
      slotMap: createSimulationSlotMap(draft, userRoster.roster_id, simSlot),
    });
  }

  function startSimulation() {
    if (!userRoster) return;
    setSimulationActive(true);
    setSimulatedPicks(advanceSimulation([]));
  }

  function draftInSimulation(player: PlayerIntelligence) {
    if (!simulationActive || !userRoster || !cursor.isUserTurn) return;
    const userPick = createSimulatedPick({
      draft,
      pickNumber: cursor.currentPick,
      player,
      rosterId: userRoster.roster_id,
      ownerId: USER_ID,
    });
    setSimulatedPicks(advanceSimulation([...simulatedPicks, userPick]));
  }

  function resetSimulation() {
    setSimulationActive(false);
    setSimulatedPicks([]);
  }

  function toggleComparison(playerId: string) {
    setComparisonIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : current.length < 4
          ? [...current, playerId]
          : current,
    );
  }

  return (
    <main className="workspace-page live-draft-page">
      <header className="page-heading draft-room-heading">
        <div>
          <h1>Draft room</h1>
          <p>
            {simulationActive
              ? `Pre-draft simulation from slot ${simSlot}`
              : `Live Sleeper picks with personalized ${draft.settings.teams}-team strategy.`}
          </p>
        </div>
        <div className="draft-heading-actions">
          {simulationActive ? (
            <button className="button subtle" type="button" onClick={resetSimulation}>
              <RotateCcw /> Exit simulator
            </button>
          ) : null}
          <button
            className="button outline"
            type="button"
            disabled={refreshing || draftPicks.refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={refreshing || draftPicks.refreshing ? "spin" : ""}
            />
            Refresh
          </button>
        </div>
      </header>

      {canSimulate && !simulationActive ? (
        <section className="simulator-launch">
          <Bot />
          <div>
            <h2>Practice before Sleeper assigns your draft slot</h2>
            <p>
              Choose any position. Opponents draft by value and roster need,
              then the simulator stops for each of your selections.
            </p>
          </div>
          <label>
            <span>Practice slot</span>
            <select
              value={simSlot}
              onChange={(event) => setSimSlot(Number(event.target.value))}
            >
              {Array.from({ length: draft.settings.teams }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  Pick {index + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            type="button"
            disabled={!warRoom.isUnlocked || !board.length}
            onClick={startSimulation}
          >
            <Play /> Start simulation
          </button>
        </section>
      ) : null}

      {focusedModeActive ? (
        <FocusedDraftCommand
          currentTeamName={currentTeam?.name ?? "Waiting for draft order"}
          currentPick={cursor.currentPick}
          currentRound={cursor.currentRound}
          currentSlot={cursor.currentSlot}
          picksUntilUser={cursor.picksUntilUser}
          isUserTurn={cursor.isUserTurn}
          recommendations={recommendations}
          waitGuidance={waitGuidance}
          tierBreaks={tierBreaks}
          available={available}
          controls={controls}
          recentPicks={completedPicks}
          teams={teams}
          positionRun={positionRun}
          tools={focusTools}
          onToggle={toggle}
        />
      ) : (
        <section className="on-clock-rail" aria-label="Draft clock">
        <span className={cursor.isUserTurn ? "your-turn" : ""}>
          <small>On the clock</small>
          <strong>
            {cursor.complete
              ? "Draft complete"
              : cursor.isUserTurn
                ? "KingBoby — your pick"
                : currentTeam?.name ?? "Waiting for draft order"}
          </strong>
        </span>
        <span>
          <small>Current selection</small>
          <strong>
            {cursor.complete
              ? "—"
              : `${cursor.currentRound}.${String(cursor.currentSlot).padStart(2, "0")} · Pick ${cursor.currentPick}`}
          </strong>
        </span>
        <span>
          <small>Your next selection</small>
          <strong>
            {cursor.nextUserPick === null
              ? actualPosition
                ? "Complete"
                : "Position pending"
              : `Pick ${cursor.nextUserPick}`}
          </strong>
        </span>
        <span>
          <small>Picks until your turn</small>
          <strong>
            {cursor.picksUntilUser === null
              ? "—"
              : cursor.picksUntilUser === 0
                ? "You are up"
                : cursor.picksUntilUser}
          </strong>
        </span>
        <span>
          <small>Sync</small>
          <strong className={draftPicks.error ? "sync-warning" : "sync-live"}>
            {simulationActive
              ? "Simulator"
              : draftPicks.error
                ? "Needs refresh"
                : draft.status === "drafting"
                  ? "Live · 5 sec"
                  : "Sleeper ready"}
          </strong>
        </span>
        </section>
      )}

      {!warRoom.isUnlocked ? <DraftUnlock warRoom={warRoom} /> : null}
      {warRoom.dataError ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Recommendations need attention</strong>
            <small>{warRoom.dataError}</small>
          </span>
          <button className="button outline" type="button" onClick={warRoom.refresh}>
            Retry
          </button>
        </div>
      ) : null}

      <DraftBoardGrid
        draft={draft}
        teams={teams}
        picks={picks}
        currentPick={cursor.currentPick}
        userRosterId={userRoster?.roster_id ?? null}
      />

      {warRoom.isUnlocked ? (
        <>
          <WhatIfComparisonPanel
            selectedPlayers={comparisonPlayers}
            comparison={whatIfComparison}
            onRemove={toggleComparison}
            onClear={() => setComparisonIds([])}
          />
          <NextTurnForecastPanel
            forecast={nextTurnForecast}
            change={nextTurnChange}
          />
          <LiveIntelligencePanel
            run={positionRun}
            tierBreak={
              recommendations[0]
                ? (tierBreaks.get(recommendations[0].player.id) ?? null)
                : null
            }
            queue={queueWarning}
            draftedControlled={draftedControlled}
            expected={expectedPicks}
            changedCount={
              [...recommendationChanges.values()].filter(
                (change) =>
                  change.kind !== "steady" || change.scoreDelta !== 0,
              ).length
            }
          />
          {userRoster ? (
            <DraftStrategyLab
              draft={draft}
              users={snapshot.users}
              rosters={snapshot.rosters}
              board={board}
              basePicks={picks}
              userRosterId={userRoster.roster_id}
              slotMap={slotMap}
              controls={controls}
              recommendations={recommendations}
              simulationRuns={simulationRuns}
              onSimulationRunsChange={setSimulationRuns}
            />
          ) : null}
          <section className="draft-command-grid">
            <section className="recommendations-panel">
              <header className="draft-panel-heading">
                <Target />
                <span>
                  <h2>Best five for KingBoby</h2>
                  <p>Recalculates after every pick · every ranking has a complete proof.</p>
                </span>
                {warRoom.loadingData ? <RefreshCw className="spin" /> : null}
              </header>
              <div className="recommendation-list">
                {recommendations.length ? (
                  recommendations.map((recommendation, index) => (
                    <RecommendationCard
                      key={recommendation.player.id}
                      recommendation={recommendation}
                      proof={recommendationProofs.get(recommendation.player.id) ?? null}
                      rank={index + 1}
                      guidance={
                        waitGuidance.get(recommendation.player.id) ?? null
                      }
                      tierBreak={
                        tierBreaks.get(recommendation.player.id) ?? null
                      }
                      change={
                        recommendationChanges.get(recommendation.player.id) ??
                        null
                      }
                      controls={controls}
                      canDraft={simulationActive && cursor.isUserTurn}
                      comparisonIds={comparisonIds}
                      onDraft={draftInSimulation}
                      onToggleComparison={toggleComparison}
                      onToggle={toggle}
                    />
                  ))
                ) : (
                  <p className="draft-panel-empty">
                    {warRoom.loadingData
                      ? "Loading player intelligence…"
                      : "No recommendation board is available."}
                  </p>
                )}
              </div>
            </section>

            <section className="available-panel">
              <header className="draft-panel-heading">
                <Search />
                <span>
                  <h2>Available players</h2>
                  <p>{available.length} remaining</p>
                </span>
              </header>
              <label className="draft-player-search">
                <Search />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search available"
                />
              </label>
              <div className="available-player-list">
                {visibleAvailable.map((player) => (
                  <AvailablePlayerRow
                    key={player.id}
                    player={player}
                    controls={controls}
                    canDraft={simulationActive && cursor.isUserTurn}
                    comparisonIds={comparisonIds}
                    onDraft={draftInSimulation}
                    onToggleComparison={toggleComparison}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </section>

            <section className="recent-picks-panel">
              <header className="draft-panel-heading">
                <Check />
                <span>
                  <h2>Recent picks</h2>
                  <p>{completedPicks.length} selections</p>
                </span>
              </header>
              <div className="recent-pick-list">
                {completedPicks.length ? (
                  [...completedPicks]
                    .reverse()
                    .slice(0, 16)
                    .map((pick) => (
                      <RecentPick
                        key={`${pick.pick_no}-${pick.player_id}`}
                        pick={pick}
                        teams={teams}
                      />
                    ))
                ) : (
                  <p className="draft-panel-empty">No picks yet.</p>
                )}
              </div>
            </section>
          </section>

          <QueuePanel
            available={available}
            controls={controls}
            onMove={moveQueue}
            onToggle={toggle}
          />
        </>
      ) : null}

      <section className="league-rosters-section">
        <header>
          <UsersRound />
          <div>
            <h2>All {draft.settings.teams} teams</h2>
            <p>Drafted rosters and unfilled starting needs.</p>
          </div>
        </header>
        <div className="team-roster-grid">
          {teams.map((team) => (
            <TeamRosterCard
              key={team.rosterId}
              team={team}
              current={team.rosterId === cursor.currentRosterId}
              user={team.rosterId === userRoster?.roster_id}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
