import {
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
  FileText,
  LockKeyhole,
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

type WarRoomState = ReturnType<typeof useWarRoom>;
type IntelligenceMode = "Rankings" | "Players";
type SortMode = "ecr" | "adp" | "projection";
type PositionFilter = "ALL" | Exclude<PlayerPosition, "—">;

const POSITIONS: PositionFilter[] = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

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

function InjuryState({ player }: { player: PlayerIntelligence }) {
  if (!player.injuryStatus && !player.injuryDetail) {
    return <span className="availability healthy">No designation</span>;
  }
  return (
    <span className="availability injured">
      {player.injuryStatus || player.injuryDetail}
    </span>
  );
}

function PlayerRows({
  players,
  selectedId,
  onSelect,
}: {
  players: PlayerIntelligence[];
  selectedId: string | null;
  onSelect: (playerId: string) => void;
}) {
  return (
    <div className="player-table-wrap">
      <table className="player-table">
        <thead>
          <tr>
            <th scope="col">ECR</th>
            <th scope="col">Player</th>
            <th scope="col">Tier</th>
            <th scope="col">ADP</th>
            <th scope="col">Proj.</th>
            <th scope="col">Availability</th>
            <th scope="col"><span className="sr-only">Open player</span></th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr
              key={player.id}
              className={selectedId === player.id ? "is-selected" : ""}
              onClick={() => onSelect(player.id)}
            >
              <td data-label="ECR">
                <strong className="rank-number">
                  {formatNumber(player.ecr)}
                </strong>
              </td>
              <td data-label="Player">
                <div className="player-identity">
                  <span className={`position-mark position-${player.position.toLowerCase()}`}>
                    {player.position}
                  </span>
                  <span>
                    <strong>{player.name}</strong>
                    <small>{player.team} · {player.positionRank}</small>
                  </span>
                </div>
              </td>
              <td data-label="Tier">{formatNumber(player.tier)}</td>
              <td data-label="ADP">{formatNumber(player.adp, 1)}</td>
              <td data-label="Projection">
                {player.projectedPoints === null
                  ? "—"
                  : `${formatNumber(player.projectedPoints, 1)} pts`}
              </td>
              <td data-label="Availability"><InjuryState player={player} /></td>
              <td className="row-action"><ChevronRight /></td>
            </tr>
          ))}
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
        <span><small>ECR</small><strong>{formatNumber(player.ecr)}</strong></span>
        <span><small>Tier</small><strong>{formatNumber(player.tier)}</strong></span>
        <span><small>ADP</small><strong>{formatNumber(player.adp, 1)}</strong></span>
        <span>
          <small>Projection</small>
          <strong>{formatNumber(player.projectedPoints, 1)}</strong>
        </span>
      </div>

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
  season,
  status,
  warRoom,
}: {
  leagueName: string;
  mode: IntelligenceMode;
  season: string;
  status: IntelligenceStatus | null;
  warRoom: WarRoomState;
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<PositionFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("ecr");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const filteredPlayers = useMemo(() => {
    const source = warRoom.board?.players ?? [];
    const search = deferredQuery.trim().toLocaleLowerCase();
    const filtered = source.filter((player) => {
      const positionMatches = position === "ALL" || player.position === position;
      const searchMatches =
        !search ||
        player.name.toLocaleLowerCase().includes(search) ||
        player.team.toLocaleLowerCase().includes(search) ||
        player.position.toLocaleLowerCase().includes(search);
      return positionMatches && searchMatches;
    });

    return [...filtered].sort((left, right) => {
      const field = sort === "ecr" ? "ecr" : sort === "adp" ? "adp" : "projectedPoints";
      const missingValue =
        sort === "projection" ? Number.MIN_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      const leftValue = left[field] ?? missingValue;
      const rightValue = right[field] ?? missingValue;
      if (sort === "projection") {
        return rightValue - leftValue || left.name.localeCompare(right.name);
      }
      return leftValue - rightValue || left.name.localeCompare(right.name);
    });
  }, [deferredQuery, position, sort, warRoom.board?.players]);

  const selected =
    filteredPlayers.find((player) => player.id === selectedId) ??
    filteredPlayers[0] ??
    null;

  if (!warRoom.isUnlocked) {
    return (
      <main className="workspace-page intelligence-page">
        <header className="page-heading">
          <div>
            <h1>{mode}</h1>
            <p>{leagueName} · {season} · Full PPR</p>
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
            {mode === "Rankings"
              ? "Live 2026 PPR consensus board with projections and risk context."
              : "Search every ranked player and open a complete research view."}
          </p>
        </div>
      </header>

      <IntelligenceToolbar
        board={warRoom.board}
        expiresAt={warRoom.sessionExpiresAt}
        loading={warRoom.loadingData}
        onLock={warRoom.lock}
        onRefresh={warRoom.refresh}
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

      {warRoom.board ? (
        <>
          <section className="board-summary" aria-label="Ranking summary">
            <span><strong>{warRoom.board.players.length}</strong><small>ranked players</small></span>
            <span><strong>{warRoom.board.totalExperts ?? "—"}</strong><small>consensus experts</small></span>
            <span><strong>PPR</strong><small>league scoring</small></span>
            <span><strong>{season}</strong><small>redraft season</small></span>
          </section>

          {Object.keys(warRoom.board.datasetErrors).length ? (
            <div className="partial-data-note">
              <CircleAlert />
              <span>
                Some provider feeds are temporarily unavailable. Available live
                data is shown; missing fields use —.
              </span>
            </div>
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
                <option value="ecr">Expert rank</option>
                <option value="adp">ADP</option>
                <option value="projection">Projected points</option>
              </select>
            </label>
          </section>

          {filteredPlayers.length ? (
            <div className={mode === "Players" ? "research-layout" : ""}>
              <section className="player-list-panel" aria-label={`${mode} player list`}>
                <div className="list-heading">
                  {mode === "Rankings" ? <Trophy /> : <UserRoundSearch />}
                  <div>
                    <h2>{position === "ALL" ? "Overall player board" : `${position} player board`}</h2>
                    <p>{filteredPlayers.length} matching players</p>
                  </div>
                </div>
                <PlayerRows
                  players={filteredPlayers}
                  selectedId={mode === "Players" ? selected?.id ?? null : null}
                  onSelect={(playerId) => {
                    setSelectedId(playerId);
                    if (mode === "Rankings") return;
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
                }}
              >
                Clear filters
              </button>
            </section>
          )}

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
