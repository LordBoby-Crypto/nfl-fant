import { useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock3,
  Database,
  ExternalLink,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useLeagueSnapshot } from "./hooks/useLeagueSnapshot";
import { useDraftPicks } from "./hooks/useDraftPicks";
import { useIntelligenceStatus } from "./hooks/useIntelligenceStatus";
import { useWaiverActivity } from "./hooks/useWaiverActivity";
import { PlayerIntelligencePage } from "./features/player-intelligence/PlayerIntelligencePage";
import { useWarRoom } from "./features/player-intelligence/useWarRoom";
import { LiveDraftRoom } from "./features/live-draft/LiveDraftRoom";
import { MyTeamPage } from "./features/my-team/MyTeamPage";
import { WaiverAssistantPage } from "./features/waivers/WaiverAssistantPage";
import {
  getDraftPosition,
  USERNAME,
} from "./services/sleeper";
import type { LeagueSnapshot } from "./types";
import type { IntelligenceStatus } from "./services/intelligence";

type View =
  | "Overview"
  | "Draft Room"
  | "Rankings"
  | "Players"
  | "My Team"
  | "Waivers"
  | "Trades"
  | "Matchups";
type StatusView = Exclude<
  View,
  "Overview" | "Draft Room" | "Rankings" | "Players" | "My Team" | "Waivers"
>;

const NAV_ITEMS: Array<{
  name: View;
  icon: typeof LayoutDashboard;
}> = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Draft Room", icon: ClipboardList },
  { name: "Rankings", icon: Trophy },
  { name: "Players", icon: Search },
  { name: "My Team", icon: Shield },
  { name: "Waivers", icon: Sparkles },
  { name: "Trades", icon: WalletCards },
  { name: "Matchups", icon: UsersRound },
];

function formatDraftDate(startTime: number | null) {
  if (!startTime) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(startTime);
}

function formatSyncTime(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function StatusIcon({
  complete,
  pending = false,
}: {
  complete: boolean;
  pending?: boolean;
}) {
  return (
    <span
      className={`status-icon ${complete ? "is-complete" : ""} ${pending ? "is-pending" : ""}`}
      aria-hidden="true"
    >
      {complete ? <Check size={18} /> : <span>—</span>}
    </span>
  );
}

function Overview({
  snapshot,
  refreshing,
  onRefresh,
  onOpenDraft,
  intelligence,
}: {
  snapshot: LeagueSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenDraft: () => void;
  intelligence: {
    data: IntelligenceStatus | null;
    error: string | null;
    linked: boolean;
  };
}) {
  const position = getDraftPosition(snapshot);
  const { draft, league } = snapshot;
  const isOrderPending = !position;

  return (
    <>
      <main className="main-column">
        <header className="page-heading">
          <div>
            <h1>Draft command center</h1>
            <p>Your hub for preparing, drafting, and managing the 2026 season.</p>
          </div>
          <button className="button primary" onClick={onOpenDraft}>
            <ExternalLink size={19} />
            Open Draft Room
          </button>
        </header>

        <section className="attention-panel" aria-labelledby="draft-status">
          <span className="attention-icon">
            {isOrderPending ? <CalendarClock /> : <Target />}
          </span>
          <div>
            <h2 id="draft-status">
              {isOrderPending
                ? "Draft order is not assigned yet"
                : `You are drafting from position ${position}`}
            </h2>
            <p>
              {isOrderPending
                ? `Sleeper has not set the draft order for ${league.name}.`
                : `Your slot is confirmed for the ${draft.type} draft.`}
            </p>
          </div>
          <button
            className="button outline"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw
              className={refreshing ? "spin" : ""}
              size={18}
            />
            {refreshing ? "Checking…" : "Check Sleeper"}
          </button>
        </section>

        <section className="section-block">
          <h2>League setup</h2>
          <div className="fact-rail">
            <div className="fact">
              <UsersRound />
              <strong>{league.total_rosters}</strong>
              <span>teams</span>
            </div>
            <div className="fact">
              <span className="letter-icon">PPR</span>
              <strong>Full PPR</strong>
            </div>
            <div className="fact">
              <Zap />
              <strong className="capitalize">{draft.type}</strong>
              <span>draft</span>
            </div>
            <div className="fact">
              <ClipboardList />
              <strong>{draft.settings.rounds}</strong>
              <span>rounds</span>
            </div>
          </div>
          <div className="secondary-facts">
            <div>
              <CalendarClock />
              <span>
                <small>Draft date</small>
                <strong>{formatDraftDate(draft.start_time)}</strong>
              </span>
            </div>
            <div>
              <UserRound />
              <span>
                <small>Draft position</small>
                <strong>{position ? `Pick ${position}` : "Pending"}</strong>
              </span>
            </div>
          </div>
        </section>

        <section className="section-block">
          <h2>Draft readiness</h2>
          <div className="readiness-rail">
            <div className="readiness-step">
              <StatusIcon complete />
              <span>
                <strong>League synced</strong>
                <small>{league.name} · {league.season}</small>
              </span>
            </div>
            <div className="connector" />
            <div className="readiness-step">
              <StatusIcon complete />
              <span>
                <strong>Live draft sync ready</strong>
                <small>Sleeper connected</small>
              </span>
            </div>
            <div className="connector" />
            <div className="readiness-step">
              <StatusIcon complete={!isOrderPending} pending={isOrderPending} />
              <span>
                <strong>
                  {isOrderPending ? "Position pending" : `Position ${position}`}
                </strong>
                <small>
                  {isOrderPending ? "Draft order not set" : "Draft slot confirmed"}
                </small>
              </span>
            </div>
          </div>
        </section>

        <section className="section-block">
          <h2>Player intelligence</h2>
          <div className="intelligence-rail">
            <div>
              <Database />
              <span>
                <strong>FantasyPros selected</strong>
                <small>Rankings, ADP, projections, injuries and news</small>
              </span>
              <StatusIcon complete />
            </div>
            <div>
              <LockKeyhole />
              <span>
                <strong>Protected server access</strong>
                <small>
                  {intelligence.linked
                    ? intelligence.error
                      ? "Backend link needs attention"
                      : "API key stays outside the browser"
                    : "Backend deployment URL is not linked yet"}
                </small>
              </span>
              <StatusIcon
                complete={Boolean(intelligence.data)}
                pending={!intelligence.data}
              />
            </div>
            <div>
              <CircleAlert />
              <span>
                <strong>
                  {intelligence.data?.configured
                    ? "Production data configured"
                    : "FantasyPros key still required"}
                </strong>
                <small>
                  {intelligence.data?.configured
                    ? "Private data routes are ready"
                    : "No subscription has been purchased or assumed"}
                </small>
              </span>
              <StatusIcon
                complete={Boolean(intelligence.data?.configured)}
                pending={!intelligence.data?.configured}
              />
            </div>
          </div>
        </section>

        <section className="section-block strategy">
          <h2>Strategy snapshot</h2>
          <div className="strategy-row">
            <Target />
            <div>
              <strong>RB/WR scarcity in a 14-team league</strong>
              <p>
                Starting-caliber running backs and receivers disappear quickly.
                We will adjust your board to the actual draft slot once Sleeper
                publishes it.
              </p>
            </div>
          </div>
        </section>
      </main>

      <aside className="activity-rail">
        <h2>League activity</h2>
        <div className="empty-activity">
          <Clock3 />
          <strong>No draft activity yet</strong>
          <p>
            Picks and roster changes will appear here once the draft starts.
          </p>
        </div>
      </aside>
    </>
  );
}

function StatusPage({
  view,
  snapshot,
}: {
  view: StatusView;
  snapshot: LeagueSnapshot;
}) {
  const content: Record<
    StatusView,
    { icon: typeof Activity; title: string; description: string; detail: string }
  > = {
    Trades: {
      icon: WalletCards,
      title: "Trade analyzer activates after rosters exist",
      description:
        "Every proposal will be scored against both teams' actual needs.",
      detail: `Trade deadline: Week ${snapshot.league.settings.trade_deadline}.`,
    },
    Matchups: {
      icon: UsersRound,
      title: "Matchup analysis begins in Week 1",
      description:
        "Start/sit decisions, opponent strength, and lineup risks will appear here.",
      detail: `${snapshot.league.settings.playoff_teams} playoff teams · playoffs start Week ${snapshot.league.settings.playoff_week_start}.`,
    },
  };

  const item = content[view];
  const Icon = item.icon;

  return (
    <main className="workspace-page">
      <header className="page-heading">
        <div>
          <h1>{view}</h1>
          <p>{snapshot.league.name} · {snapshot.league.season}</p>
        </div>
      </header>
      <section className="honest-empty">
        <Icon />
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <small>{item.detail}</small>
      </section>
    </main>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand">WAR <span>ROOM</span></div>
      <RefreshCw className="spin" />
      <p>Connecting to Sleeper…</p>
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const { data, error, loading, refreshing, refresh } = useLeagueSnapshot();
  const intelligence = useIntelligenceStatus();
  const warRoom = useWarRoom(
    view === "Draft Room" ||
      view === "Rankings" ||
      view === "Players" ||
      view === "My Team" ||
      view === "Waivers",
  );
  const waiverActivity = useWaiverActivity(
    data?.league.league_id ?? "",
    view === "Waivers" && Boolean(data),
  );
  const draftPicks = useDraftPicks(
    data?.draft.draft_id ?? null,
    data?.draft.status ?? null,
    view === "Draft Room" || view === "My Team" || view === "Waivers",
  );

  const title = useMemo(() => {
    if (!data) return "THE League";
    return `${data.league.name} · ${data.league.season}`;
  }, [data]);

  if (loading) return <LoadingScreen />;

  if (!data) {
    return (
      <div className="loading-screen error-screen">
        <X />
        <h1>Sleeper is not responding</h1>
        <p>{error ?? "The league data could not be loaded."}</p>
        <button className="button primary" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <button
          className="mobile-close"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        >
          <X />
        </button>
        <div className="brand">WAR <span>ROOM</span></div>
        <nav aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.name ? "active" : ""}
                key={item.name}
                onClick={() => {
                  setView(item.name);
                  setMenuOpen(false);
                }}
              >
                <Icon />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div
        className={`mobile-scrim ${menuOpen ? "is-visible" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      <header className="topbar">
        <button
          className="mobile-menu"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </button>
        <div className="mobile-brand brand">WAR <span>ROOM</span></div>
        <button className="league-selector" type="button">
          <span>{title}</span>
          <ChevronDown />
        </button>
        <div className="sync-state">
          <span className="sync-dot"><Check /></span>
          <span>
            <strong>Sleeper connected</strong>
            <small>Synced {formatSyncTime(data.fetchedAt)}</small>
          </span>
        </div>
        <div className="user-state">
          <span className="avatar">KB</span>
          <span>{USERNAME}</span>
        </div>
      </header>

      <div className={`content ${view === "Overview" ? "" : "single-page"}`}>
        {error ? (
          <div className="inline-error">
            Latest refresh failed. Showing the last successful Sleeper data.
          </div>
        ) : null}
        {view === "Overview" ? (
          <Overview
            snapshot={data}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            onOpenDraft={() => setView("Draft Room")}
            intelligence={intelligence}
          />
        ) : view === "Draft Room" ? (
          <LiveDraftRoom
            snapshot={data}
            draftPicks={draftPicks}
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
              void draftPicks.refresh();
            }}
            warRoom={warRoom}
          />
        ) : view === "Rankings" || view === "Players" ? (
          <PlayerIntelligencePage
            leagueName={data.league.name}
            mode={view}
            season={data.league.season}
            status={intelligence.data}
            warRoom={warRoom}
          />
        ) : view === "My Team" ? (
          <MyTeamPage
            snapshot={data}
            draftPicks={draftPicks}
            warRoom={warRoom}
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
              void draftPicks.refresh();
            }}
          />
        ) : view === "Waivers" ? (
          <WaiverAssistantPage
            snapshot={data}
            draftPicks={draftPicks}
            warRoom={warRoom}
            activity={waiverActivity}
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
              void draftPicks.refresh();
              void waiverActivity.refresh();
            }}
          />
        ) : (
          <StatusPage
            view={view}
            snapshot={data}
          />
        )}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.filter((item) =>
          ["Overview", "Draft Room", "My Team", "Waivers"].includes(item.name),
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.name}
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
            >
              <Icon />
              <span>
                {item.name === "Draft Room"
                  ? "Draft"
                  : item.name === "My Team"
                    ? "Team"
                    : item.name === "Waivers"
                      ? "Waivers"
                    : item.name}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
