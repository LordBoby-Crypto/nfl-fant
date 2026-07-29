import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  ChevronRight,
  CircleAlert,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import type { PlayerIntelligence } from "../player-intelligence/model";
import type {
  Draft,
  LeagueUser,
  Roster,
  SleeperDraftPick,
} from "../../types";
import {
  buildTeamDraftStates,
  createSimulationSlotMap,
  getUserDraftSlot,
  type DraftControlState,
  type DraftRecommendation,
  type TeamDraftState,
} from "./engine";
import {
  buildSlotDraftPlans,
  findPlayerForPick,
  forecastOpponentPicks,
  getUnassignedRosterKeepers,
  mergeKeeperPicks,
  type DraftSimulationResult,
  type KeeperMergeResult,
  type ManualKeeper,
  type SlotDraftPlan,
} from "./strategy";
import type {
  DraftStrategySettings,
} from "./useDraftStrategy";

type StrategyTab = "forecast" | "simulations" | "keepers" | "plans";

const TABS: Array<{
  id: StrategyTab;
  label: string;
  icon: typeof BrainCircuit;
}> = [
  { id: "forecast", label: "Forecast", icon: BrainCircuit },
  { id: "simulations", label: "Simulations", icon: BarChart3 },
  { id: "keepers", label: "Keepers", icon: ShieldCheck },
  { id: "plans", label: "14-slot plans", icon: Target },
];

function teamName(team: TeamDraftState | undefined, rosterId: number) {
  return team?.name ?? `Roster ${rosterId}`;
}

function ForecastPanel({
  forecast,
  assumedPlayer,
  analysisSlot,
}: {
  forecast: ReturnType<typeof forecastOpponentPicks>;
  assumedPlayer: PlayerIntelligence | undefined;
  analysisSlot: number;
}) {
  return (
    <section className="strategy-panel forecast-panel">
      <header className="strategy-panel-heading">
        <span>
          <h3>Before your next turn</h3>
          <p>
            Slot {analysisSlot}
            {assumedPlayer ? ` · assumes ${assumedPlayer.name} if you are up` : ""}
          </p>
        </span>
        <small>{forecast.length} opponent picks modeled</small>
      </header>
      {forecast.length ? (
        <div className="forecast-list">
          {forecast.map((item) => (
            <article key={`${item.pickNumber}-${item.rosterId}`}>
              <span className="forecast-pick">{item.pickNumber}</span>
              <span className="forecast-team">
                <strong>{item.teamName}</strong>
                <small>{item.style} · {item.confidence} confidence</small>
              </span>
              <ChevronRight />
              <span className={`position-mark position-${item.player.position.toLowerCase()}`}>
                {item.player.position}
              </span>
              <span className="forecast-player">
                <strong>{item.player.name}</strong>
                <small>
                  {item.reason} · pivots:{" "}
                  {item.alternatives.map((player) => player.name).join(", ") || "none"}
                </small>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className="strategy-empty">
          The next unresolved selection is yours, or the draft order is still
          unavailable. Choose an analysis slot above to forecast the turn.
        </p>
      )}
    </section>
  );
}

function SimulationPanel({
  result,
  runs,
  running,
  onRunsChange,
  onRun,
}: {
  result: DraftSimulationResult | null;
  runs: DraftStrategySettings["simulationRuns"];
  running: boolean;
  onRunsChange: (runs: DraftStrategySettings["simulationRuns"]) => void;
  onRun: () => void;
}) {
  return (
    <section className="strategy-panel simulation-panel">
      <header className="strategy-panel-heading">
        <span>
          <h3>Monte Carlo draft test</h3>
          <p>Opponent needs, ADP, observed style, keepers and your controls.</p>
        </span>
        <label className="simulation-run-control">
          <span>Runs</span>
          <select
            value={runs}
            onChange={(event) =>
              onRunsChange(
                Number(event.target.value) as DraftStrategySettings["simulationRuns"],
              )
            }
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </label>
        <button
          className="button primary"
          type="button"
          disabled={running}
          onClick={onRun}
        >
          <Bot className={running ? "spin" : ""} />
          {running ? "Running…" : "Run drafts"}
        </button>
      </header>
      {result ? (
        <>
          <div className="simulation-score-rail">
            <span>
              <small>Average grade</small>
              <strong>{result.averageGrade}</strong>
            </span>
            <span>
              <small>Best / worst</small>
              <strong>{result.bestGrade} / {result.worstGrade}</strong>
            </span>
            <span>
              <small>Completed</small>
              <strong>{result.runs} drafts</strong>
            </span>
            <span>
              <small>Average build</small>
              <strong>
                {Object.entries(result.averageBuild)
                  .filter(([, count]) => count > 0)
                  .map(([position, count]) => `${position} ${count}`)
                  .join(" · ")}
              </strong>
            </span>
          </div>
          <div className="simulation-results-grid">
            <section>
              <h4>Most common outcomes</h4>
              <div className="simulation-player-list">
                {result.commonPlayers.map((item) => (
                  <span key={item.player.id}>
                    <b>{item.rate}%</b>
                    <strong>{item.player.name}</strong>
                    <small>{item.player.position} · avg round {item.averageRound}</small>
                  </span>
                ))}
              </div>
            </section>
            <section>
              <h4>Target hit rates</h4>
              {result.targetRates.length ? (
                <div className="simulation-target-list">
                  {result.targetRates.map((item) => (
                    <span key={item.player.id}>
                      <strong>{item.player.name}</strong>
                      <i>
                        <b style={{ width: `${item.rate}%` }} />
                      </i>
                      <em>{item.rate}%</em>
                    </span>
                  ))}
                </div>
              ) : (
                <p>
                  Mark players as Target or add them to your queue to measure
                  how often this plan lands them.
                </p>
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="strategy-empty">
          Run the model to measure draft quality, common roster outcomes and
          the hit rate for your targets.
        </p>
      )}
    </section>
  );
}

function KeeperPanel({
  draft,
  teams,
  board,
  basePicks,
  rosters,
  keeperResult,
  manualKeepers,
  onAdd,
  onRemove,
}: {
  draft: Draft;
  teams: TeamDraftState[];
  board: PlayerIntelligence[];
  basePicks: SleeperDraftPick[];
  rosters: Roster[];
  keeperResult: KeeperMergeResult;
  manualKeepers: ManualKeeper[];
  onAdd: (keeper: Omit<ManualKeeper, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [playerName, setPlayerName] = useState("");
  const [rosterId, setRosterId] = useState(teams[0]?.rosterId ?? 1);
  const [round, setRound] = useState(Math.min(8, draft.settings.rounds));
  const [formError, setFormError] = useState<string | null>(null);
  const playerByName = useMemo(
    () =>
      new Map(
        board.map((player) => [
          `${player.name} — ${player.position}, ${player.team}`.toLocaleLowerCase(),
          player,
        ]),
      ),
    [board],
  );
  const unassigned = useMemo(
    () =>
      getUnassignedRosterKeepers({
        rosters,
        picks: basePicks,
        manualKeepers,
        board,
      }),
    [basePicks, board, manualKeepers, rosters],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const player =
      playerByName.get(playerName.trim().toLocaleLowerCase()) ??
      board.find(
        (item) =>
          item.name.toLocaleLowerCase() ===
          playerName.trim().toLocaleLowerCase(),
      );
    if (!player) {
      setFormError("Choose an exact player from the search suggestions.");
      return;
    }
    onAdd({ playerId: player.id, rosterId, round });
    setPlayerName("");
    setFormError(null);
  }

  return (
    <section className="strategy-panel keeper-panel">
      <header className="strategy-panel-heading">
        <span>
          <h3>Keeper cost board</h3>
          <p>Sleeper keepers sync automatically. Add missing round costs here.</p>
        </span>
        <small>{keeperResult.keeperPicks.length} applied</small>
      </header>
      <form className="keeper-form" onSubmit={submit}>
        <label>
          <span>Player</span>
          <input
            list="keeper-player-options"
            value={playerName}
            placeholder="Search player"
            onChange={(event) => setPlayerName(event.target.value)}
          />
          <datalist id="keeper-player-options">
            {board.slice(0, 350).map((player) => (
              <option
                key={player.id}
                value={`${player.name} — ${player.position}, ${player.team}`}
              />
            ))}
          </datalist>
        </label>
        <label>
          <span>Team</span>
          <select
            value={rosterId}
            onChange={(event) => setRosterId(Number(event.target.value))}
          >
            {teams.map((team) => (
              <option key={team.rosterId} value={team.rosterId}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Round cost</span>
          <select
            value={round}
            onChange={(event) => setRound(Number(event.target.value))}
          >
            {Array.from({ length: draft.settings.rounds }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Round {index + 1}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" type="submit">
          <LockKeyhole /> Apply keeper
        </button>
        {formError ? <small className="form-error">{formError}</small> : null}
      </form>

      {keeperResult.conflicts.length ? (
        <div className="keeper-conflicts" role="alert">
          <CircleAlert />
          <span>
            {keeperResult.conflicts.map((conflict) => (
              <small key={conflict.keeperId}>{conflict.message}</small>
            ))}
          </span>
        </div>
      ) : null}

      <div className="keeper-board">
        <section>
          <h4>Applied costs</h4>
          {keeperResult.keeperPicks.length ? (
            keeperResult.keeperPicks.map((pick) => {
              const player = findPlayerForPick(pick, board);
              const team = teams.find(
                (item) => item.rosterId === Number(pick.roster_id),
              );
              const manual = manualKeepers.find(
                (item) =>
                  item.playerId === player?.id &&
                  item.rosterId === Number(pick.roster_id),
              );
              return (
                <article key={`${pick.pick_no}-${pick.player_id}`}>
                  <span className={`position-mark position-${(player?.position ?? "—").toLowerCase()}`}>
                    {player?.position ?? "—"}
                  </span>
                  <span>
                    <strong>{player?.name ?? pick.player_id}</strong>
                    <small>
                      {teamName(team, Number(pick.roster_id))} · Round {pick.round} ·{" "}
                      {manual ? "Manual" : "Sleeper"}
                    </small>
                  </span>
                  {manual ? (
                    <button
                      type="button"
                      aria-label={`Remove ${player?.name ?? "keeper"}`}
                      onClick={() => onRemove(manual.id)}
                    >
                      <Trash2 />
                    </button>
                  ) : (
                    <ShieldCheck />
                  )}
                </article>
              );
            })
          ) : (
            <p>No keeper costs are applied yet.</p>
          )}
        </section>
        <section>
          <h4>Detected without a cost</h4>
          {unassigned.length ? (
            unassigned.map((keeper) => (
              <article key={`${keeper.rosterId}-${keeper.playerId}`}>
                <CircleAlert />
                <span>
                  <strong>{keeper.player?.name ?? keeper.playerId}</strong>
                  <small>
                    {teamName(
                      teams.find((team) => team.rosterId === keeper.rosterId),
                      keeper.rosterId,
                    )}{" "}
                    · choose its round above
                  </small>
                </span>
              </article>
            ))
          ) : (
            <p>No unresolved Sleeper keepers.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function SlotPlansPanel({
  plans,
  selectedSlot,
  onSelect,
}: {
  plans: SlotDraftPlan[];
  selectedSlot: number;
  onSelect: (slot: number) => void;
}) {
  const plan = plans.find((item) => item.slot === selectedSlot) ?? plans[0];
  return (
    <section className="strategy-panel slot-plans-panel">
      <header className="strategy-panel-heading">
        <span>
          <h3>Plan for every draft slot</h3>
          <p>Complete round-by-round routes using current ADP, ECR and keeper costs.</p>
        </span>
        <small>All {plans.length} positions ready</small>
      </header>
      <div className="slot-plan-selector" role="list" aria-label="Draft slot plans">
        {plans.map((item) => (
          <button
            key={item.slot}
            className={item.slot === selectedSlot ? "active" : ""}
            type="button"
            onClick={() => onSelect(item.slot)}
          >
            <b>{item.slot}</b>
            <span>{item.openingShape || "Pending"}</span>
            <small>{item.turnRisk}</small>
          </button>
        ))}
      </div>
      {plan ? (
        <div className="selected-slot-plan">
          <header>
            <span>
              <small>Selected plan</small>
              <strong>Slot {plan.slot}</strong>
            </span>
            <span>
              <small>Opportunity</small>
              <strong>{plan.opportunityScore}/99</strong>
            </span>
            <p>{plan.advice}</p>
          </header>
          <div className="slot-plan-rounds">
            {plan.targets.map((target) => (
              <article key={target.round}>
                <span>
                  <small>Round {target.round}</small>
                  <b>Pick {target.pickNumber}</b>
                </span>
                <span className={`position-mark position-${target.primary.position.toLowerCase()}`}>
                  {target.primary.position}
                </span>
                <span>
                  <strong>{target.primary.name}</strong>
                  <small>
                    {target.keeper
                      ? "Locked keeper cost"
                      : `${target.availability}% modeled availability`}
                  </small>
                </span>
                <em>
                  {target.alternatives.length
                    ? target.alternatives.map((player) => player.name).join(" / ")
                    : target.keeper
                      ? "Keeper"
                      : "No close pivot"}
                </em>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function DraftStrategyLab({
  draft,
  users,
  rosters,
  board,
  basePicks,
  teams,
  userRosterId,
  slotMap,
  controls,
  recommendations,
  manualKeepers,
  simulationRuns,
  onAddKeeper,
  onRemoveKeeper,
  onSimulationRunsChange,
}: {
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  board: PlayerIntelligence[];
  basePicks: SleeperDraftPick[];
  teams: TeamDraftState[];
  userRosterId: number;
  slotMap: Record<string, number>;
  controls: DraftControlState;
  recommendations: DraftRecommendation[];
  manualKeepers: ManualKeeper[];
  simulationRuns: DraftStrategySettings["simulationRuns"];
  onAddKeeper: (keeper: Omit<ManualKeeper, "id">) => void;
  onRemoveKeeper: (id: string) => void;
  onSimulationRunsChange: (
    runs: DraftStrategySettings["simulationRuns"],
  ) => void;
}) {
  const mappedSlot =
    Number(
      Object.entries(slotMap).find(
        ([, rosterId]) => Number(rosterId) === userRosterId,
      )?.[0],
    ) || null;
  const initialSlot =
    mappedSlot ??
    getUserDraftSlot(draft, rosters.find((roster) => roster.roster_id === userRosterId)?.owner_id ?? "", userRosterId) ??
    7;
  const [tab, setTab] = useState<StrategyTab>("forecast");
  const [analysisSlot, setAnalysisSlot] = useState(initialSlot);
  const activeAnalysisSlot = mappedSlot ?? analysisSlot;
  const [simulationResult, setSimulationResult] =
    useState<DraftSimulationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const simulationWorker = useRef<Worker | null>(null);
  const analysisSlotMap = useMemo(
    () =>
      Object.keys(slotMap).length
        ? slotMap
        : createSimulationSlotMap(draft, userRosterId, analysisSlot),
    [analysisSlot, draft, slotMap, userRosterId],
  );
  const keeperResult = useMemo(
    () =>
      mergeKeeperPicks({
        draft,
        picks: basePicks,
        manualKeepers,
        board,
        users,
        rosters,
        slotMap: analysisSlotMap,
      }),
    [
      analysisSlotMap,
      basePicks,
      board,
      draft,
      manualKeepers,
      rosters,
      users,
    ],
  );
  const analysisTeams = useMemo(
    () =>
      buildTeamDraftStates({
        draft,
        users,
        rosters,
        picks: keeperResult.picks,
        slotMap: analysisSlotMap,
      }),
    [analysisSlotMap, draft, keeperResult.picks, rosters, users],
  );
  const forecast = useMemo(
    () =>
      forecastOpponentPicks({
        draft,
        users,
        rosters,
        picks: keeperResult.picks,
        board,
        userRosterId,
        slotMap: analysisSlotMap,
        assumedUserPick: recommendations[0]?.player,
      }),
    [
      analysisSlotMap,
      board,
      draft,
      keeperResult.picks,
      recommendations,
      rosters,
      userRosterId,
      users,
    ],
  );
  const plans = useMemo(
    () =>
      buildSlotDraftPlans({
        draft,
        board,
        controls,
        manualKeepers,
        userRosterId,
      }),
    [board, controls, draft, manualKeepers, userRosterId],
  );

  useEffect(
    () => () => {
      simulationWorker.current?.terminate();
    },
    [],
  );

  function runSimulations() {
    simulationWorker.current?.terminate();
    setRunning(true);
    setSimulationError(null);
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" },
    );
    simulationWorker.current = worker;
    worker.onmessage = (event: MessageEvent<DraftSimulationResult>) => {
      setSimulationResult(event.data);
      setRunning(false);
      worker.terminate();
      simulationWorker.current = null;
    };
    worker.onerror = () => {
      setSimulationError("The simulation worker stopped unexpectedly. Run it again.");
      setRunning(false);
      worker.terminate();
      simulationWorker.current = null;
    };
    worker.postMessage({
      draft,
      users,
      rosters,
      picks: keeperResult.picks,
      board,
      userRosterId,
      slotMap: analysisSlotMap,
      controls,
      runs: simulationRuns,
    });
  }

  return (
    <section className="draft-strategy-lab">
      <header className="strategy-lab-heading">
        <BrainCircuit />
        <span>
          <h2>Draft strategy lab</h2>
          <p>Forecast the room, test outcomes and prepare every slot.</p>
        </span>
        {!Object.keys(slotMap).length ? (
          <label>
            <span>Analysis slot</span>
            <select
              value={analysisSlot}
              onChange={(event) => setAnalysisSlot(Number(event.target.value))}
            >
              {Array.from({ length: draft.settings.teams }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  Pick {index + 1}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="strategy-ready">
            <Sparkles /> Slot {activeAnalysisSlot} live
          </span>
        )}
      </header>
      <nav className="strategy-tabs" aria-label="Draft strategy tools">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            type="button"
            onClick={() => setTab(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {tab === "forecast" ? (
        <ForecastPanel
          forecast={forecast}
          assumedPlayer={recommendations[0]?.player}
          analysisSlot={activeAnalysisSlot}
        />
      ) : null}
      {tab === "simulations" ? (
        <>
          <SimulationPanel
            result={simulationResult}
            runs={simulationRuns}
            running={running}
            onRunsChange={onSimulationRunsChange}
            onRun={runSimulations}
          />
          {simulationError ? (
            <p className="strategy-worker-error" role="alert">
              {simulationError}
            </p>
          ) : null}
        </>
      ) : null}
      {tab === "keepers" ? (
        <KeeperPanel
          draft={draft}
          teams={analysisTeams.length ? analysisTeams : teams}
          board={board}
          basePicks={basePicks}
          rosters={rosters}
          keeperResult={keeperResult}
          manualKeepers={manualKeepers}
          onAdd={onAddKeeper}
          onRemove={onRemoveKeeper}
        />
      ) : null}
      {tab === "plans" ? (
        <SlotPlansPanel
          plans={plans}
          selectedSlot={analysisSlot}
          onSelect={setAnalysisSlot}
        />
      ) : null}
    </section>
  );
}
