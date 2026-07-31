import {
  Fragment,
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUpDown,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  EyeOff,
  FileText,
  ListChecks,
  LockKeyhole,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  UserRoundSearch,
} from "lucide-react";
import type { IntelligenceStatus } from "../../services/intelligence";
import type {
  PlayerBoardData,
  PlayerIntelligence,
  PlayerPosition,
} from "./model";
import type { useWarRoom } from "./useWarRoom";
import type { useDraftPicks } from "../../hooks/useDraftPicks";
import type { LeagueSnapshot } from "../../types";
import { getUserRoster } from "../../services/sleeper";
import {
  buildTeamDraftStates,
  draftPickForPlayer,
  getDraftCursor,
  pickPosition,
  recommendPlayers,
  type DraftedPlayerLookup,
  type TeamDraftState,
} from "../live-draft/engine";
import { useDraftControls } from "../live-draft/useDraftControls";
import {
  buildOffBoardEntries,
  completeDraftRankingState,
  filterDraftRankingPlayers,
  playerStatusLabel,
  type DraftRankingAvailability,
} from "./draftRankings";

type WarRoomState = ReturnType<typeof useWarRoom>;
type DraftPickState = ReturnType<typeof useDraftPicks>;
type IntelligenceMode = "Draft Rankings" | "Players";
type SortMode =
  | "leagueRank"
  | "nextPick"
  | "ecr"
  | "adp"
  | "projection"
  | "replacement";
type PositionFilter = "ALL" | Exclude<PlayerPosition, "—">;

const POSITIONS: PositionFilter[] = [
  "ALL",
  "QB",
  "RB",
  "WR",
  "TE",
  "K",
  "DST",
  "DL",
  "LB",
  "DB",
];
const EMPTY_PLAYER_BOARD: PlayerIntelligence[] = [];

function formatNumber(value: number | null, digits = 0) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatFetchedAt(value: string | null) {
  if (!value) return "Update time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Update time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSessionExpiry(value: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function WarRoomGate({
  status,
  state,
}: {
  status: IntelligenceStatus | null;
  state: WarRoomState;
}) {
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || state.loggingIn) return;
    const unlocked = await state.login(password);
    if (unlocked) setPassword("");
  }

  const unavailable = status ? !status.configured : false;

  return (
    <section className="war-room-gate" aria-labelledby="war-room-unlock-title">
      <span className="gate-icon">
        <LockKeyhole />
      </span>
      <div className="gate-copy">
        <h2 id="war-room-unlock-title">Unlock private player intelligence</h2>
        <p>
          Enter your War Room password to open a signed 12-hour session. Your
          FantasyPros key stays on the server and is never sent to this browser.
        </p>
        <div className="security-proof" aria-label="Session protections">
          <span><ShieldCheck /><strong>Server-only key</strong></span>
          <span><Clock3 /><strong>12-hour session</strong></span>
          <span><Check /><strong>Private access</strong></span>
        </div>
      </div>
      <form className="unlock-form" onSubmit={submit}>
        <label htmlFor="war-room-password">War Room password</label>
        <input
          id="war-room-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={unavailable || state.loggingIn}
          placeholder="Enter password"
        />
        {state.loginError ? (
          <p className="form-error" role="alert">{state.loginError}</p>
        ) : null}
        <button
          className="button primary"
          type="submit"
          disabled={!password || unavailable || state.loggingIn}
        >
          {state.loggingIn ? <RefreshCw className="spin" /> : <LockKeyhole />}
          {state.loggingIn ? "Unlocking…" : "Unlock War Room"}
        </button>
        {unavailable ? (
          <small>Production player data is not configured.</small>
        ) : (
          <small>Password attempts are rate-limited.</small>
        )}
      </form>
    </section>
  );
}

function IntelligenceToolbar({
  board,
  expiresAt,
  loading,
  onLock,
  onRefresh,
}: {
  board: PlayerBoardData | null;
  expiresAt: number | null;
  loading: boolean;
  onLock: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="intelligence-toolbar">
      <div className="private-session-state">
        <span><ShieldCheck /></span>
        <div>
          <strong>War Room unlocked</strong>
          <small>Private session until {formatSessionExpiry(expiresAt)}</small>
        </div>
      </div>
      <div className="provider-state">
        <small>FantasyPros data</small>
        <strong>{board ? formatFetchedAt(board.fetchedAt) : "Loading…"}</strong>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="Refresh FantasyPros data"
        title="Refresh data"
        disabled={loading}
        onClick={onRefresh}
      >
        <RefreshCw className={loading ? "spin" : ""} />
      </button>
      <button className="button subtle" type="button" onClick={onLock}>
        <LockKeyhole />
        Lock
      </button>
    </div>
  );
}

function confidenceLabel(player: PlayerIntelligence) {
  if (!player.scoringConfidence) return "Not recalculated";
  return `${player.scoringConfidence[0].toUpperCase()}${player.scoringConfidence.slice(1)}`;
}

function PlayerScoringFormula({ player }: { player: PlayerIntelligence }) {
  const formula = player.scoringFormula ?? [];
  return (
    <section className="player-scoring-formula" aria-label={`${player.name} scoring formula`}>
      <header>
        <div>
          <h3>Exact league scoring formula</h3>
          <p>
            {formula.length
              ? `${formula.length} applicable scoring components were checked against this player's statistical projection.`
              : "No usable component statistics were returned for this player."}
          </p>
        </div>
        <span className={`scoring-confidence is-${player.scoringConfidence ?? "low"}`}>
          {confidenceLabel(player)} confidence · {formatNumber(player.scoringCoverage ?? 0)}% coverage
        </span>
      </header>
      <div className="formula-total">
        <span>
          League projection ={" "}
          {formula
            .filter((term) => term.points !== null)
            .map((term) => `${term.label} (${term.note})`)
            .join(" + ") || "provider fallback only"}
        </span>
        <strong>
          {player.projectedPoints === null
            ? "Unavailable"
            : `${formatNumber(player.projectedPoints, 2)} points`}
        </strong>
      </div>
      {formula.length ? (
        <div className="formula-terms">
          {formula.map((term) => (
            <article key={term.key} className={`is-${term.support}`}>
              <span>
                <strong>{term.label}</strong>
                <small><code>{term.key}</code> · {term.stat}</small>
              </span>
              <span className="formula-calculation">
                <strong>
                  {term.points === null ? "Not modeled" : `${formatNumber(term.points, 2)} pts`}
                </strong>
                <small>{term.note}</small>
              </span>
              <em>{term.support}</em>
            </article>
          ))}
        </div>
      ) : null}
      {player.scoringWarnings?.length ? (
        <div className="formula-warning" role="note">
          <CircleAlert />
          <span>
            <strong>Projection confidence is limited</strong>
            <small>{player.scoringWarnings.join(" ")}</small>
          </span>
        </div>
      ) : null}
    </section>
  );
}

function PlayerRows({
  players,
  selectedId,
  drafted,
  teams,
  nextPickRanks,
  onSelect,
}: {
  players: PlayerIntelligence[];
  selectedId: string | null;
  drafted: DraftedPlayerLookup;
  teams: TeamDraftState[];
  nextPickRanks: Map<string, number>;
  onSelect: (playerId: string) => void;
}) {
  const teamsByRoster = new Map(
    teams.map((team) => [team.rosterId, team.name]),
  );
  return (
    <div className="player-table-wrap">
      <table className="player-table">
        <thead>
          <tr>
            <th scope="col">Overall rank</th>
            <th scope="col">Player</th>
            <th scope="col">Position rank</th>
            <th scope="col">ADP</th>
            <th scope="col">Tier</th>
            <th scope="col">League proj.</th>
            <th scope="col">Availability</th>
            <th scope="col">Confidence</th>
            <th scope="col"><span className="sr-only">Open player</span></th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const pick = draftPickForPlayer(player, drafted);
            const teamName = pick
              ? teamsByRoster.get(Number(pick.roster_id)) ??
                `Roster ${pick.roster_id}`
              : null;
            const nextPickRank = nextPickRanks.get(player.id) ?? null;
            return (
              <Fragment key={player.id}>
              <tr
                className={[
                  selectedId === player.id ? "is-selected" : "",
                  pick ? "is-drafted" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => onSelect(player.id)}
              >
                <td data-label="Overall rank">
                  <strong className="rank-number">
                    #{formatNumber(player.leagueRank ?? null)}
                  </strong>
                  <small className="consensus-rank">ECR {formatNumber(player.ecr)}</small>
                </td>
                <td data-label="Player">
                  <div className="player-identity">
                    <span className={`position-mark position-${player.position.toLowerCase()}`}>
                      {player.position}
                    </span>
                    <span>
                      <strong>{player.name}</strong>
                      <small>
                        {player.team} · {player.positionRank}
                        {nextPickRank ? ` · Next pick #${nextPickRank}` : ""}
                      </small>
                    </span>
                  </div>
                </td>
                <td data-label="Position rank">
                  {player.position}{formatNumber(player.leaguePositionRank ?? null)}
                </td>
                <td data-label="ADP">{formatNumber(player.adp, 1)}</td>
                <td data-label="Tier">{formatNumber(player.leagueTier ?? player.tier)}</td>
                <td data-label="League projection">
                  {player.projectedPoints === null
                    ? "—"
                    : `${formatNumber(player.projectedPoints, 1)} pts`}
                </td>
                <td data-label="Availability">
                  {pick ? (
                    <span className="drafted-status">
                      <strong>Drafted · Pick {pick.pick_no}</strong>
                      <small>{teamName}</small>
                    </span>
                  ) : (
                    <span className="available-status">Available</span>
                  )}
                </td>
                <td data-label="Confidence">
                  <span className={`scoring-confidence compact is-${player.scoringConfidence ?? "low"}`}>
                    {confidenceLabel(player)}
                  </span>
                </td>
                <td className="row-action"><ChevronRight /></td>
              </tr>
              {selectedId === player.id ? (
                <tr className="player-formula-row">
                  <td colSpan={9}>
                    <PlayerScoringFormula player={player} />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerDetail({ player }: { player: PlayerIntelligence }) {
  const latestNews = player.news.slice(0, 3);
  const spread =
    player.expertBest !== null && player.expertWorst !== null
      ? `${formatNumber(player.expertBest)}–${formatNumber(player.expertWorst)}`
      : "—";

  return (
    <aside className="player-detail" aria-label={`${player.name} research`}>
      <header>
        <span className={`position-mark position-${player.position.toLowerCase()}`}>
          {player.position}
        </span>
        <div>
          <h2>{player.name}</h2>
          <p>{player.team} · {player.positionRank}</p>
        </div>
      </header>

      <div className="detail-metrics">
        <span><small>League rank</small><strong>#{formatNumber(player.leagueRank ?? null)}</strong></span>
        <span><small>Position rank</small><strong>{player.position}{formatNumber(player.leaguePositionRank ?? null)}</strong></span>
        <span><small>League tier</small><strong>{formatNumber(player.leagueTier ?? player.tier)}</strong></span>
        <span><small>ADP</small><strong>{formatNumber(player.adp, 1)}</strong></span>
        <span>
          <small>League projection</small>
          <strong>{formatNumber(player.projectedPoints, 1)}</strong>
        </span>
        <span>
          <small>Value over replacement</small>
          <strong>{formatNumber(player.replacementValue ?? null, 1)}</strong>
        </span>
      </div>

      <PlayerScoringFormula player={player} />

      <section>
        <h3>Expert range</h3>
        <div className="expert-range">
          <ArrowUpDown />
          <span>
            <strong>{spread}</strong>
            <small>
              Average {formatNumber(player.expertAverage, 1)}
            </small>
          </span>
        </div>
      </section>

      <section>
        <h3>Availability</h3>
        <div className="availability-detail">
          <CircleAlert />
          <span>
            <strong>
              {player.injuryStatus || "No active injury designation"}
            </strong>
            <small>
              {[player.injuryDetail, player.practiceStatus]
                .filter(Boolean)
                .join(" · ") || "No injury or practice limitation reported."}
            </small>
          </span>
        </div>
      </section>

      <section>
        <h3>Latest news</h3>
        {latestNews.length ? (
          <div className="news-list">
            {latestNews.map((item) => (
              <article key={item.id}>
                <FileText />
                <div>
                  <strong>{item.title}</strong>
                  {item.impact || item.summary ? (
                    <p>{item.impact || item.summary}</p>
                  ) : null}
                  {item.sourceUrl ? (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Source <ExternalLink />
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="no-news">No recent player-specific news was returned.</p>
        )}
      </section>
    </aside>
  );
}

function LeagueScoringCoverage({ board }: { board: PlayerBoardData }) {
  const active = (board.scoringCategories ?? []).filter(
    (category) => category.value !== 0,
  );
  const warnings = active.filter(
    (category) => category.support !== "supported",
  );
  return (
    <section className="scoring-coverage-panel" aria-labelledby="scoring-coverage-title">
      <header>
        <span className="coverage-icon"><ShieldCheck /></span>
        <div>
          <h2 id="scoring-coverage-title">League scoring projection coverage</h2>
          <p>
            Every non-zero Sleeper rule is checked against the underlying FantasyPros
            statistical projections before rankings are rebuilt.
          </p>
        </div>
      </header>
      <div className="coverage-counts">
        <span className="is-supported">
          <strong>{board.supportedScoringCategories ?? 0}</strong>
          <small>supported</small>
        </span>
        <span className="is-partial">
          <strong>{board.partialScoringCategories ?? 0}</strong>
          <small>partially supported</small>
        </span>
        <span className="is-unsupported">
          <strong>{board.unsupportedScoringCategories ?? 0}</strong>
          <small>unsupported</small>
        </span>
      </div>
      {warnings.length ? (
        <details>
          <summary>
            <CircleAlert />
            Review {warnings.length} confidence warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <div className="coverage-warning-list">
            {warnings.map((category) => (
              <article key={category.key} className={`is-${category.support}`}>
                <span>
                  <strong>{category.label}</strong>
                  <small><code>{category.key}</code> · {category.value} points</small>
                </span>
                <p>{category.detail}</p>
                <em>{category.support}</em>
              </article>
            ))}
          </div>
        </details>
      ) : (
        <p className="coverage-complete">
          <Check /> All active scoring categories have the required projections.
        </p>
      )}
    </section>
  );
}

function RankingGlossary() {
  return (
    <details className="ranking-glossary">
      <summary>
        <CircleAlert />
        What do Overall Rank, Position Rank, ADP, Tier and Projection mean?
      </summary>
      <div>
        <article>
          <strong>Overall Rank</strong>
          <p>The player’s #1-to-# order after your Sleeper scoring and roster settings are applied.</p>
        </article>
        <article>
          <strong>Position Rank</strong>
          <p>The player’s rank only among eligible players at the same position, such as RB3 or WR12.</p>
        </article>
        <article>
          <strong>ADP</strong>
          <p>Average Draft Position: where that player is typically selected across drafts.</p>
        </article>
        <article>
          <strong>Tier</strong>
          <p>A group of similarly valuable players. A tier ending means the next alternative has a meaningful drop.</p>
        </article>
        <article>
          <strong>Projection</strong>
          <p>Expected fantasy points rebuilt from statistical projections using this league’s Sleeper scoring rules.</p>
        </article>
      </div>
    </details>
  );
}

function OffTheBoard({
  entries,
}: {
  entries: ReturnType<typeof buildOffBoardEntries>;
}) {
  return (
    <section className="off-board-section" aria-labelledby="off-board-title">
      <header>
        <ListChecks />
        <span>
          <h2 id="off-board-title">Off the Board</h2>
          <p>
            Every Sleeper selection, newest first. These players are excluded
            from availability and every recommendation.
          </p>
        </span>
        <strong>{entries.length} drafted</strong>
      </header>
      {entries.length ? (
        <div className="off-board-list">
          {entries.map((entry) => {
            const position =
              entry.player?.position ?? pickPosition(entry.pick) ?? "—";
            return (
              <article key={`${entry.pick.pick_no}-${entry.pick.player_id}`}>
                <span className="off-board-pick">#{entry.pick.pick_no}</span>
                <span className={`position-mark position-${position.toLowerCase()}`}>
                  {position}
                </span>
                <span>
                  <strong>{entry.playerName}</strong>
                  <small>
                    Round {entry.pick.round}.{String(entry.pick.draft_slot).padStart(2, "0")}
                    {" · "}{entry.teamName}
                  </small>
                </span>
                <em>Drafted</em>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="off-board-empty">No Sleeper selections have been made yet.</p>
      )}
    </section>
  );
}

function LoadingBoard() {
  return (
    <section className="board-loading" aria-live="polite">
      <RefreshCw className="spin" />
      <div>
        <h2>Loading live player intelligence</h2>
        <p>Rankings, projections, injuries, news, and player records are loading in parallel.</p>
      </div>
    </section>
  );
}

export function PlayerIntelligencePage({
  leagueName,
  mode,
  scoringLabel,
  season,
  draftFormat,
  snapshot,
  draftPicks,
  status,
  warRoom,
}: {
  leagueName: string;
  mode: IntelligenceMode;
  scoringLabel: string;
  season: string;
  draftFormat: string;
  snapshot: LeagueSnapshot;
  draftPicks: DraftPickState;
  status: IntelligenceStatus | null;
  warRoom: WarRoomState;
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("leagueRank");
  const [tier, setTier] = useState<"ALL" | number>("ALL");
  const [team, setTeam] = useState<"ALL" | string>("ALL");
  const [playerStatus, setPlayerStatus] = useState<"ALL" | string>("ALL");
  const [availability, setAvailability] =
    useState<DraftRankingAvailability>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const { controls } = useDraftControls();
  const boardPlayers = warRoom.board?.players ?? EMPTY_PLAYER_BOARD;
  const teams = useMemo(
    () =>
      buildTeamDraftStates({
        draft: snapshot.draft,
        users: snapshot.users,
        rosters: snapshot.rosters,
        picks: draftPicks.picks,
      }),
    [draftPicks.picks, snapshot.draft, snapshot.rosters, snapshot.users],
  );
  const userRoster = useMemo(() => getUserRoster(snapshot), [snapshot]);
  const cursor = useMemo(
    () =>
      getDraftCursor(
        snapshot.draft,
        draftPicks.picks,
        userRoster?.roster_id ?? -1,
      ),
    [draftPicks.picks, snapshot.draft, userRoster?.roster_id],
  );
  const draftState = useMemo(
    () => completeDraftRankingState(boardPlayers, draftPicks.picks),
    [boardPlayers, draftPicks.picks],
  );
  const nextPickRecommendations = useMemo(
    () =>
      userRoster
        ? recommendPlayers({
            available: draftState.available,
            allPlayers: boardPlayers,
            teams,
            userRosterId: userRoster.roster_id,
            cursor,
            controls,
            draft: snapshot.draft,
            limit: draftState.available.length,
          })
        : [],
    [
      boardPlayers,
      controls,
      cursor,
      draftState.available,
      snapshot.draft,
      teams,
      userRoster,
    ],
  );
  const nextPickRanks = useMemo(
    () =>
      new Map(
        nextPickRecommendations.map((recommendation, index) => [
          recommendation.player.id,
          index + 1,
        ]),
      ),
    [nextPickRecommendations],
  );
  const offBoardEntries = useMemo(
    () =>
      buildOffBoardEntries({
        picks: draftPicks.picks,
        players: boardPlayers,
        teams,
      }),
    [boardPlayers, draftPicks.picks, teams],
  );
  const tiers = useMemo(
    () =>
      Array.from(
        new Set(
          boardPlayers
            .map((player) => player.leagueTier ?? player.tier)
            .filter((value): value is number => value !== null),
        ),
      ).sort((left, right) => left - right),
    [boardPlayers],
  );
  const playerTeams = useMemo(
    () =>
      Array.from(
        new Set(boardPlayers.map((player) => player.team).filter(Boolean)),
      ).sort(),
    [boardPlayers],
  );
  const playerStatuses = useMemo(
    () =>
      Array.from(new Set(boardPlayers.map(playerStatusLabel))).sort(),
    [boardPlayers],
  );

  const filteredPlayers = useMemo(() => {
    const filtered = filterDraftRankingPlayers({
      players: boardPlayers,
      drafted: draftState.drafted,
      filters: {
        query: deferredQuery,
        position,
        tier,
        team,
        status: playerStatus,
        availability,
      },
    });

    return [...filtered].sort((left, right) => {
      if (sort === "nextPick") {
        const leftRank = nextPickRanks.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = nextPickRanks.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return (
          leftRank - rightRank ||
          (left.leagueRank ?? Number.MAX_SAFE_INTEGER) -
            (right.leagueRank ?? Number.MAX_SAFE_INTEGER)
        );
      }
      const field =
        sort === "leagueRank"
          ? "leagueRank"
          : sort === "ecr"
            ? "ecr"
            : sort === "adp"
              ? "adp"
              : sort === "replacement"
                ? "replacementValue"
                : "projectedPoints";
      const missingValue =
        sort === "projection" || sort === "replacement"
          ? Number.MIN_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
      const leftValue = left[field] ?? missingValue;
      const rightValue = right[field] ?? missingValue;
      if (sort === "projection" || sort === "replacement") {
        return rightValue - leftValue || left.name.localeCompare(right.name);
      }
      return leftValue - rightValue || left.name.localeCompare(right.name);
    });
  }, [
    availability,
    boardPlayers,
    deferredQuery,
    draftState.drafted,
    nextPickRanks,
    playerStatus,
    position,
    sort,
    team,
    tier,
  ]);

  const selected =
    filteredPlayers.find((player) => player.id === selectedId) ??
    filteredPlayers[0] ??
    null;
  const isDraftRankings = mode === "Draft Rankings";

  if (!warRoom.isUnlocked) {
    return (
      <main className="workspace-page intelligence-page">
        <header className="page-heading">
          <div>
            <h1>{mode}</h1>
            <p>{leagueName} · {season} · {scoringLabel}</p>
          </div>
        </header>
        <WarRoomGate status={status} state={warRoom} />
      </main>
    );
  }

  return (
    <main className="workspace-page intelligence-page">
      <header className="page-heading intelligence-heading">
        <div>
          <h1>{mode}</h1>
          <p>
            {isDraftRankings
              ? `The complete live ${season} board, rebuilt for ${scoringLabel}, ${draftFormat} roster demand and every Sleeper selection.`
              : "Search every ranked player and open a complete research view."}
          </p>
        </div>
      </header>

      <IntelligenceToolbar
        board={warRoom.board}
        expiresAt={warRoom.sessionExpiresAt}
        loading={warRoom.loadingData || draftPicks.refreshing}
        onLock={warRoom.lock}
        onRefresh={() => {
          warRoom.refresh();
          void draftPicks.refresh();
        }}
      />

      {warRoom.loadingData && !warRoom.board ? <LoadingBoard /> : null}

      {warRoom.dataError ? (
        <div className="data-error" role="alert">
          <CircleAlert />
          <span>
            <strong>Player data needs attention</strong>
            <small>{warRoom.dataError}</small>
          </span>
          <button className="button outline" onClick={warRoom.refresh}>Try again</button>
        </div>
      ) : null}

      {warRoom.usingCachedBoard && warRoom.board?.players.length ? (
        <div className="cached-data-note" role="status">
          <ShieldCheck />
          <span>
            <strong>Showing last-known rankings</strong>
            <small>
              FantasyPros is temporarily unavailable. This saved board remains
              usable while the War Room retries.
            </small>
          </span>
        </div>
      ) : null}

      {warRoom.board?.players.length ? (
        <>
          <section className="board-summary" aria-label="Ranking summary">
            <span><strong>{warRoom.board.players.length}</strong><small>complete ranked list</small></span>
            <span><strong>{draftState.available.length}</strong><small>available now</small></span>
            <span><strong>{draftPicks.picks.length}</strong><small>off the board</small></span>
            <span><strong>{scoringLabel}</strong><small>league-adjusted scoring</small></span>
          </section>

          {isDraftRankings ? (
            <section className="ranking-live-sync" aria-live="polite">
              <Radio />
              <span>
                <strong>
                  {snapshot.draft.status === "drafting"
                    ? "Live Sleeper synchronization active"
                    : "Sleeper draft board connected"}
                </strong>
                <small>
                  {draftPicks.fetchedAt
                    ? `Last checked ${formatFetchedAt(new Date(draftPicks.fetchedAt).toISOString())}`
                    : "Waiting for the first pick check"}
                  {snapshot.draft.status === "drafting"
                    ? " · Automatically checks every 5 seconds"
                    : ""}
                </small>
              </span>
              <em>
                {draftPicks.error
                  ? "Using last complete board"
                  : `${draftPicks.picks.length} selections synchronized`}
              </em>
            </section>
          ) : null}

          <LeagueScoringCoverage board={warRoom.board} />
          {isDraftRankings ? <RankingGlossary /> : null}

          {Object.keys(warRoom.board.datasetErrors).length ? (
            <div className="partial-data-note">
              <CircleAlert />
              <span>
                Some provider data is temporarily unavailable:{" "}
                {Object.keys(warRoom.board.datasetErrors).join(", ")}. Available
                live data is shown; missing fields use —.
              </span>
            </div>
          ) : null}

          {isDraftRankings ? (
            <section className="ranking-mode-switch" aria-label="Ranking mode">
              <button
                type="button"
                className={sort === "leagueRank" ? "active" : ""}
                aria-pressed={sort === "leagueRank"}
                onClick={() => setSort("leagueRank")}
              >
                <Trophy />
                <span>
                  <strong>League-Adjusted Ranking</strong>
                  <small>Best player value for anyone in this league</small>
                </span>
              </button>
              <button
                type="button"
                className={sort === "nextPick" ? "active" : ""}
                aria-pressed={sort === "nextPick"}
                onClick={() => setSort("nextPick")}
              >
                <UserRoundSearch />
                <span>
                  <strong>Best for Your Next Pick</strong>
                  <small>Your roster, needs, controls and the live board</small>
                </span>
              </button>
            </section>
          ) : null}

          <section className="player-board-controls" aria-label="Player filters">
            <label className="player-search">
              <span className="sr-only">Search players</span>
              <Search />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search player, team, or position"
              />
            </label>
            <div className="position-filters" aria-label="Position filter">
              {POSITIONS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={position === item ? "active" : ""}
                  aria-pressed={position === item}
                  onClick={() => setPosition(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="sort-control">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                <option value="leagueRank">League-adjusted rank</option>
                {isDraftRankings ? (
                  <option value="nextPick">Best for your next pick</option>
                ) : null}
                <option value="ecr">Expert rank</option>
                <option value="adp">ADP</option>
                <option value="projection">Projected points</option>
                <option value="replacement">Value over replacement</option>
              </select>
            </label>
          </section>

          <section className="advanced-ranking-filters" aria-label="Additional player filters">
            <label>
              <span>Tier</span>
              <select
                value={tier}
                onChange={(event) =>
                  setTier(event.target.value === "ALL" ? "ALL" : Number(event.target.value))
                }
              >
                <option value="ALL">All tiers</option>
                {tiers.map((value) => (
                  <option key={value} value={value}>Tier {value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Team</span>
              <select value={team} onChange={(event) => setTeam(event.target.value)}>
                <option value="ALL">All teams</option>
                {playerTeams.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                value={playerStatus}
                onChange={(event) => setPlayerStatus(event.target.value)}
              >
                <option value="ALL">All statuses</option>
                {playerStatuses.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="availability-filter">
              <span>Availability</span>
              <select
                value={availability}
                onChange={(event) =>
                  setAvailability(event.target.value as DraftRankingAvailability)
                }
              >
                <option value="ALL">Show drafted crossed out</option>
                <option value="AVAILABLE">Hide drafted players</option>
                <option value="DRAFTED">Drafted players only</option>
              </select>
            </label>
            <span className="filter-result-count">
              <EyeOff />
              {filteredPlayers.length} of {boardPlayers.length} shown
            </span>
          </section>

          {filteredPlayers.length ? (
            <div className={mode === "Players" ? "research-layout" : ""}>
              <section className="player-list-panel" aria-label={`${mode} player list`}>
                <div className="list-heading">
                  {isDraftRankings ? <Trophy /> : <UserRoundSearch />}
                  <div>
                    <h2>
                      {sort === "nextPick"
                        ? "Best for Your Next Pick"
                        : position === "ALL"
                          ? "Complete League-Adjusted Ranking"
                          : `${position} League-Adjusted Ranking`}
                    </h2>
                    <p>
                      {filteredPlayers.length} matching players · drafted rows
                      are crossed out and never recommended
                    </p>
                  </div>
                </div>
                <PlayerRows
                  players={filteredPlayers}
                  selectedId={selectedId}
                  drafted={draftState.drafted}
                  teams={teams}
                  nextPickRanks={nextPickRanks}
                  onSelect={(playerId) => {
                    setSelectedId((current) =>
                      current === playerId ? null : playerId
                    );
                    if (isDraftRankings) return;
                    document
                      .querySelector(".player-detail")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                />
              </section>
              {mode === "Players" && selected ? <PlayerDetail player={selected} /> : null}
            </div>
          ) : (
            <section className="no-player-results">
              <Search />
              <h2>No matching players</h2>
              <p>Try a different name, team, or position filter.</p>
              <button
                className="button outline"
                type="button"
                onClick={() => {
                  setQuery("");
                  setPosition("ALL");
                  setTier("ALL");
                  setTeam("ALL");
                  setPlayerStatus("ALL");
                  setAvailability("ALL");
                }}
              >
                Clear filters
              </button>
            </section>
          )}

          {isDraftRankings ? <OffTheBoard entries={offBoardEntries} /> : null}

          <footer className="fantasypros-attribution">
            <span>{warRoom.board.attribution}</span>
            <a
              href="https://www.fantasypros.com/"
              target="_blank"
              rel="noreferrer"
            >
              FantasyPros <ExternalLink />
            </a>
          </footer>
        </>
      ) : null}
    </main>
  );
}
