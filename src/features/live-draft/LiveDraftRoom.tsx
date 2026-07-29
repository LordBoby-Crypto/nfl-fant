import {
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Ban,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Crosshair,
  ListPlus,
  LockKeyhole,
  MoonStar,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Target,
  UsersRound,
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
import { DraftStrategyLab } from "./DraftStrategyLab";
import { useDraftControls } from "./useDraftControls";
import { useDraftStrategy } from "./useDraftStrategy";

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
  rank,
  controls,
  canDraft,
  onDraft,
  onToggle,
}: {
  recommendation: DraftRecommendation;
  rank: number;
  controls: DraftControlState;
  canDraft: boolean;
  onDraft: (player: PlayerIntelligence) => void;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const { player } = recommendation;
  return (
    <article className={`recommendation-card ${rank === 1 ? "top-pick" : ""}`}>
      <div className="recommendation-rank">{rank}</div>
      <div className="recommendation-main">
        <header>
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
          <span className="recommendation-score">
            <strong>{recommendation.score}</strong>
            <small>fit score</small>
          </span>
        </header>
        <DraftControls
          controls={controls}
          playerId={player.id}
          onToggle={onToggle}
        />
        <details className="recommendation-reasons">
          <summary>Why this pick</summary>
          <div>
            {recommendation.reasons.map((reason) => (
              <span className={reason.tone} key={reason.label}>
                <small>{reason.label}</small>
                <strong>{reason.value}</strong>
              </span>
            ))}
          </div>
        </details>
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
  onDraft,
  onToggle,
}: {
  player: PlayerIntelligence;
  controls: DraftControlState;
  canDraft: boolean;
  onDraft: (player: PlayerIntelligence) => void;
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

function QueuePanel({
  board,
  controls,
  onMove,
  onToggle,
}: {
  board: PlayerIntelligence[];
  controls: DraftControlState;
  onMove: (playerId: string, direction: -1 | 1) => void;
  onToggle: (kind: DraftControlKind, playerId: string) => void;
}) {
  const playersById = new Map(board.map((player) => [player.id, player]));
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

export function LiveDraftRoom({
  snapshot,
  draftPicks,
  refreshing,
  onRefresh,
  warRoom,
}: {
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  refreshing: boolean;
  onRefresh: () => void;
  warRoom: WarRoomState;
}) {
  const draft = snapshot.draft;
  const userRoster = getUserRoster(snapshot);
  const actualPosition = getDraftPosition(snapshot);
  const [simSlot, setSimSlot] = useState(7);
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulatedPicks, setSimulatedPicks] = useState<SleeperDraftPick[]>([]);
  const [query, setQuery] = useState("");
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
  const livePicks = useMemo(
    () => draftPicks.picks.filter((pick) => pick.is_keeper !== true),
    [draftPicks.picks],
  );
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
          })
        : [],
    [available, board, controls, cursor, teams, userRoster],
  );
  const visibleAvailable = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase();
    return available
      .filter(
        (player) =>
          !search ||
          player.name.toLocaleLowerCase().includes(search) ||
          player.team.toLocaleLowerCase().includes(search) ||
          player.position.toLocaleLowerCase().includes(search),
      )
      .slice(0, 80);
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

  return (
    <main className="workspace-page live-draft-page">
      <header className="page-heading draft-room-heading">
        <div>
          <h1>Draft room</h1>
          <p>
            {simulationActive
              ? `Pre-draft simulation from slot ${simSlot}`
              : "Live Sleeper picks with personalized 14-team PPR strategy."}
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

      {warRoom.isUnlocked ? (
        <>
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
                  <p>Recalculates after every Sleeper or simulator pick.</p>
                </span>
                {warRoom.loadingData ? <RefreshCw className="spin" /> : null}
              </header>
              <div className="recommendation-list">
                {recommendations.length ? (
                  recommendations.map((recommendation, index) => (
                    <RecommendationCard
                      key={recommendation.player.id}
                      recommendation={recommendation}
                      rank={index + 1}
                      controls={controls}
                      canDraft={simulationActive && cursor.isUserTurn}
                      onDraft={draftInSimulation}
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
                    onDraft={draftInSimulation}
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
            board={board}
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
            <h2>All 14 teams</h2>
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
