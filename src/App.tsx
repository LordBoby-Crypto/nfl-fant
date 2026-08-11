import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  ExternalLink,
  HardDrive,
  LayoutDashboard,
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
import { useWeeklyOutlook } from "./hooks/useWeeklyOutlook";
import { PlayerIntelligencePage } from "./features/player-intelligence/PlayerIntelligencePage";
import { useWarRoom } from "./features/player-intelligence/useWarRoom";
import { LiveDraftRoom } from "./features/live-draft/LiveDraftRoom";
import { MyTeamPage } from "./features/my-team/MyTeamPage";
import { WaiverAssistantPage } from "./features/waivers/WaiverAssistantPage";
import { TradeAnalyzerPage } from "./features/trades/TradeAnalyzerPage";
import { WeeklyMatchupPage } from "./features/weekly/WeeklyMatchupPage";
import { PreflightReport } from "./features/preflight/PreflightReport";
import {
  SafetyCenterPage,
  SessionExpiryBanner,
} from "./features/safety/SafetyCenterPage";
import { PostDraftReport } from "./features/post-draft/PostDraftReport";
import { shouldAutoOpenPostDraft } from "./features/post-draft/engine";
import {
  getDraftPosition,
  USER_ID,
  USERNAME,
} from "./services/sleeper";
import type { LeagueSnapshot } from "./types";
import {
  LeagueSettingsPanel,
  SettingsChangeNotice,
} from "./features/league-settings/LeagueSettingsPanel";
import {
  buildLeagueSettingsModel,
  type LeagueSettingsModel,
} from "./features/league-settings/model";
import { FirstTimeWalkthrough } from "./features/help/FirstTimeWalkthrough";

const HelpPage = lazy(() => import("./features/help/HelpPage"));

type View =
  | "Overview"
  | "Draft Room"
  | "Draft Rankings"
  | "Players"
  | "My Team"
  | "Waivers"
  | "Trades"
  | "Matchups"
  | "Safety"
  | "Help";
type StatusView = Exclude<
  View,
  | "Overview"
  | "Draft Room"
  | "Draft Rankings"
  | "Players"
  | "My Team"
  | "Waivers"
  | "Trades"
  | "Safety"
  | "Help"
>;

const NAV_ITEMS: Array<{
  name: View;
  icon: typeof LayoutDashboard;
}> = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Draft Room", icon: ClipboardList },
  { name: "Draft Rankings", icon: Trophy },
  { name: "Players", icon: Search },
  { name: "My Team", icon: Shield },
  { name: "Waivers", icon: Sparkles },
  { name: "Trades", icon: WalletCards },
  { name: "Matchups", icon: UsersRound },
  { name: "Safety", icon: HardDrive },
  { name: "Help", icon: CircleHelp },
];

const WALKTHROUGH_STORAGE_KEY = "war-room.walkthrough.m24.complete";

function shouldLaunchWalkthrough() {
  try {
    return localStorage.getItem(WALKTHROUGH_STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

function rememberWalkthroughComplete() {
  try {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "true");
  } catch {
    // The walkthrough can still be dismissed for the current tab.
  }
}

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

function Overview({
  leagueState,
  draftPicks,
  intelligence,
  warRoom,
  refreshing,
  preflightRefreshKey,
  onRefresh,
  onOpenDraft,
  settingsModel,
}: {
  leagueState: ReturnType<typeof useLeagueSnapshot>;
  draftPicks: ReturnType<typeof useDraftPicks>;
  intelligence: ReturnType<typeof useIntelligenceStatus>;
  warRoom: ReturnType<typeof useWarRoom>;
  refreshing: boolean;
  preflightRefreshKey: number;
  onRefresh: () => void;
  onOpenDraft: () => void;
  settingsModel: LeagueSettingsModel;
}) {
  const snapshot = leagueState.data;
  if (!snapshot) return null;
  if (snapshot.draft.status === "complete") {
    return (
      <PostDraftReport
        snapshot={snapshot}
        draftPicks={draftPicks}
        warRoom={warRoom}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    );
  }
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
              <span className="letter-icon">PTS</span>
              <strong>{settingsModel.scoringLabel}</strong>
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

        <LeagueSettingsPanel
          model={settingsModel}
          fetchedAt={snapshot.fetchedAt}
        />

        <PreflightReport
          league={leagueState}
          draftPicks={draftPicks}
          intelligence={intelligence}
          warRoom={warRoom}
          running={refreshing}
          refreshKey={preflightRefreshKey}
          onRun={onRefresh}
        />

        <section className="section-block strategy">
          <h2>Strategy snapshot</h2>
          <div className="strategy-row">
            <Target />
            <div>
              <strong>
                Adaptive scarcity in a {settingsModel.teamCount}-team league
              </strong>
              <p>
                The War Room uses Sleeper’s current starters, FLEX and
                SUPER_FLEX slots, bench depth, keepers and turn spacing. It
                rebuilds again when Sleeper publishes your draft slot or a
                commissioner changes the league.
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
  const [walkthroughOpen, setWalkthroughOpen] = useState(
    shouldLaunchWalkthrough,
  );
  const finishWalkthrough = useCallback(() => {
    rememberWalkthroughComplete();
    setWalkthroughOpen(false);
  }, []);
  const openHelpFromWalkthrough = useCallback(() => {
    rememberWalkthroughComplete();
    setWalkthroughOpen(false);
    setView("Help");
  }, []);
  const [preflightRefreshKey, setPreflightRefreshKey] = useState(0);
  const league = useLeagueSnapshot();
  const { data, error, loading, refreshing, refresh } = league;
  const intelligence = useIntelligenceStatus();
  const weeklyOutlook = useWeeklyOutlook(
    data?.league.league_id ?? "",
    data?.league.settings.playoff_week_start ?? 15,
    view === "Matchups" && Boolean(data),
  );
  const settingsModel = useMemo(
    () => (data ? buildLeagueSettingsModel(data, USER_ID) : null),
    [data],
  );
  const warRoom = useWarRoom(
    view === "Overview" ||
      view === "Draft Room" ||
      view === "Draft Rankings" ||
      view === "Players" ||
      view === "My Team" ||
      view === "Waivers" ||
      view === "Trades" ||
      view === "Matchups" ||
      view === "Safety" ||
      view === "Help",
    view === "Matchups"
      ? weeklyOutlook.data?.currentWeek ?? 1
      : view === "Overview" && data?.draft.status === "complete"
        ? 1
        : null,
    settingsModel,
  );
  const waiverActivity = useWaiverActivity(
    data?.league.league_id ?? "",
    view === "Waivers" && Boolean(data),
  );
  const draftPicks = useDraftPicks(
    data?.draft.draft_id ?? null,
    data?.draft.status ?? null,
    view === "Overview" ||
      view === "Draft Room" ||
      view === "Draft Rankings" ||
      view === "My Team" ||
      view === "Waivers" ||
      view === "Trades" ||
      view === "Matchups" ||
      view === "Help",
  );
  const focusedDraftActive = data?.draft.status === "drafting";
  const previousDraftStatus = useRef(data?.draft.status ?? null);
  const visibleNavItems = useMemo(
    () =>
      focusedDraftActive
          ? NAV_ITEMS.filter(
            (item) => !["Waivers", "Trades", "Matchups", "Safety"].includes(item.name),
          )
        : NAV_ITEMS,
    [focusedDraftActive],
  );

  useEffect(() => {
    const current = data?.draft.status ?? null;
    const previous = previousDraftStatus.current;
    if (current === "drafting") {
      setView("Draft Room");
    } else if (shouldAutoOpenPostDraft(previous, current)) {
      setView("Overview");
    }
    previousDraftStatus.current = current;
  }, [data?.draft.status]);

  const title = useMemo(() => {
    if (!data) return "THE League";
    return `${data.league.name} · ${data.league.season}`;
  }, [data]);

  if (loading) return <LoadingScreen />;

  if (!data) {
    return (
      <>
        <div className="loading-screen error-screen">
          <X />
          <h1>Sleeper is not responding</h1>
          <p>{error ?? "The league data could not be loaded."}</p>
          <button className="button primary" onClick={() => void refresh()}>
            Try again
          </button>
          <button className="walkthrough-error-help" onClick={() => setWalkthroughOpen(true)}>
            Open beginner and offline help
          </button>
        </div>
        {walkthroughOpen ? (
          <FirstTimeWalkthrough
            onFinish={finishWalkthrough}
            onOpenHelp={finishWalkthrough}
          />
        ) : null}
      </>
    );
  }
  if (!settingsModel) return null;

  return (
    <div className={`app-shell ${focusedDraftActive ? "focused-draft-active" : ""}`}>
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
          {visibleNavItems.map((item) => {
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
        <div className={`sync-state ${error ? "is-warning" : ""}`}>
          <span className="sync-dot">
            {error ? <RefreshCw className="spin" /> : <Check />}
          </span>
          <span>
            <strong>
              {error ? "Sleeper reconnecting" : "Sleeper connected"}
            </strong>
            <small>
              {error
                ? "Showing last successful data"
                : `Synced ${formatSyncTime(data.fetchedAt)}`}
            </small>
          </span>
        </div>
        <div className="user-state">
          <span className="avatar">KB</span>
          <span>{settingsModel.user.displayName || USERNAME}</span>
        </div>
      </header>

      <div
        className={`content ${
          view === "Overview" && data.draft.status !== "complete"
            ? ""
            : "single-page"
        }`}
      >
        <SettingsChangeNotice
          changes={league.settingsChanges}
          onDismiss={league.dismissSettingsChanges}
        />
        <SessionExpiryBanner warRoom={warRoom} />
        {error ? (
          <div className="inline-error">
            Latest refresh failed. Showing the last successful Sleeper data.
          </div>
        ) : null}
        {view === "Overview" ? (
          <Overview
            leagueState={league}
            draftPicks={draftPicks}
            intelligence={intelligence}
            warRoom={warRoom}
            refreshing={
              refreshing ||
              draftPicks.refreshing ||
              intelligence.loading ||
              warRoom.loadingData
            }
            preflightRefreshKey={preflightRefreshKey}
            onRefresh={() => {
              setPreflightRefreshKey((value) => value + 1);
              void refresh();
              void draftPicks.refresh();
              intelligence.refresh();
              warRoom.refresh();
            }}
            onOpenDraft={() => setView("Draft Room")}
            settingsModel={settingsModel}
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
            onEnsureSettingsFresh={league.ensureFresh}
            warRoom={warRoom}
          />
        ) : view === "Draft Rankings" || view === "Players" ? (
          <PlayerIntelligencePage
            leagueName={data.league.name}
            mode={view}
            scoringLabel={settingsModel.scoringLabel}
            season={data.league.season}
            draftFormat={settingsModel.draftFormat}
            snapshot={data}
            draftPicks={draftPicks}
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
        ) : view === "Trades" ? (
          <TradeAnalyzerPage
            snapshot={data}
            draftPicks={draftPicks}
            warRoom={warRoom}
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
              void draftPicks.refresh();
              warRoom.refresh();
            }}
          />
        ) : view === "Matchups" ? (
          <WeeklyMatchupPage
            snapshot={data}
            draftPicks={draftPicks}
            warRoom={warRoom}
            weekly={weeklyOutlook}
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
              void draftPicks.refresh();
              weeklyOutlook.refresh();
              warRoom.refresh();
            }}
          />
        ) : view === "Safety" ? (
          <SafetyCenterPage
            syncAvailable={Boolean(intelligence.data?.features?.secureSync)}
            warRoom={warRoom}
          />
        ) : view === "Help" ? (
          <Suspense
            fallback={(
              <main className="workspace-page help-loading">
                <RefreshCw className="spin" />
                <strong>Loading Help…</strong>
              </main>
            )}
          >
            <HelpPage
              settings={settingsModel}
              board={warRoom.board}
              leagueFetchedAt={league.lastSuccessfulAt}
              picksFetchedAt={draftPicks.fetchedAt}
              leagueError={error}
              picksError={draftPicks.error}
              usingCachedBoard={warRoom.usingCachedBoard}
              onRestartWalkthrough={() => setWalkthroughOpen(true)}
              onRefresh={() => {
                void refresh();
                void draftPicks.refresh();
                warRoom.refresh();
              }}
            />
          </Suspense>
        ) : (
          <StatusPage
            view={view}
            snapshot={data}
          />
        )}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {visibleNavItems.filter((item) =>
          ["Overview", "Draft Room", "My Team", "Waivers", "Trades", "Matchups", "Safety"].includes(
            item.name,
          ),
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
                    : item.name === "Trades"
                      ? "Trades"
                    : item.name === "Matchups"
                      ? "Matchup"
                    : item.name === "Safety"
                      ? "Safety"
                    : item.name}
              </span>
            </button>
          );
        })}
      </nav>

      {walkthroughOpen ? (
        <FirstTimeWalkthrough
          onFinish={finishWalkthrough}
          onOpenHelp={openHelpFromWalkthrough}
        />
      ) : null}
    </div>
  );
}

export default App;
