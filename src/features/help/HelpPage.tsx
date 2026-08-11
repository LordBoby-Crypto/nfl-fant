import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  Database,
  ListOrdered,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Target,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import type { LeagueSettingsModel } from "../league-settings/model";
import { humanizeSleeperSetting } from "../league-settings/model";
import type { PlayerBoardData } from "../player-intelligence/model";
import {
  GLOSSARY,
  HELP_TABS,
  LIVE_DRAFT_CHECKLIST,
  searchGlossary,
} from "./model";

const CHECKLIST_KEY = "war-room.help.live-checklist.m24";

function readChecklist() {
  try {
    const value = JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveChecklist(items: string[]) {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(items));
  } catch {
    // The checklist still works for this tab when storage is restricted.
  }
}

function formatTime(timestamp: number | null) {
  if (!timestamp) return "No successful update yet";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function formatTimer(seconds: number) {
  if (!seconds) return "No timer reported";
  if (seconds >= 3600) return `${seconds / 3600} hour timer`;
  return `${seconds}-second timer`;
}

export function HelpPage({
  settings,
  board,
  leagueFetchedAt,
  picksFetchedAt,
  leagueError,
  picksError,
  usingCachedBoard,
  onRestartWalkthrough,
  onRefresh,
}: {
  settings: LeagueSettingsModel;
  board: PlayerBoardData | null;
  leagueFetchedAt: number | null;
  picksFetchedAt: number | null;
  leagueError: string | null;
  picksError: string | null;
  usingCachedBoard: boolean;
  onRestartWalkthrough: () => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const glossary = useMemo(() => searchGlossary(deferredQuery), [deferredQuery]);
  const [checkedItems, setCheckedItems] = useState<string[]>(readChecklist);
  const activeCoverage = (board?.scoringCategories ?? []).filter(
    (category) => category.value !== 0,
  );
  const limitedCoverage = activeCoverage.filter(
    (category) => category.support !== "supported",
  );
  const connectionProblem = Boolean(leagueError || picksError);

  const toggleChecklist = (item: string) => {
    setCheckedItems((current) => {
      const next = current.includes(item)
        ? current.filter((candidate) => candidate !== item)
        : [...current, item];
      saveChecklist(next);
      return next;
    });
  };

  return (
    <main className="help-page">
      <header className="help-heading">
        <div>
          <span className="help-heading-icon"><CircleHelp /></span>
          <div>
            <h1>Help center</h1>
            <p>Fantasy language, live-draft instructions and your league model in plain English.</p>
          </div>
        </div>
        <button className="button outline" onClick={onRestartWalkthrough}>
          <RotateCcw /> Restart walkthrough
        </button>
      </header>

      <nav aria-label="Help topics" className="help-topic-nav">
        <a href="#help-start">Start here</a>
        <a href="#help-glossary">Glossary</a>
        <a href="#help-settings">League model</a>
        <a href="#help-checklist">Draft checklist</a>
        <a href="#help-offline">Offline emergency</a>
      </nav>

      <section className="help-section" id="help-start">
        <header>
          <BookOpen />
          <div><h2>Where everything is</h2><p>Every permanent left-side tab has one job.</p></div>
        </header>
        <div className="help-tab-list">
          {HELP_TABS.map((tab, index) => (
            <article key={tab.name}>
              <span>{index + 1}</span>
              <div><strong>{tab.name}</strong><p>{tab.purpose}</p><small>{tab.useWhen}</small></div>
            </article>
          ))}
        </div>
      </section>

      <section className="help-section help-concepts">
        <header>
          <Target />
          <div><h2>How a live recommendation works</h2><p>Three ideas explain most draft-day decisions.</p></div>
        </header>
        <div className="help-sync-explainer">
          <Wifi />
          <span>
            <strong>How Sleeper synchronization works</strong>
            <p>War Room reads the league, roster, settings, order and picks; it never drafts for you. During a live draft, picks refresh every five seconds and the wider league snapshot refreshes every ten seconds. If a request fails, the last successful data stays on screen. Reconnecting triggers a league refresh automatically.</p>
          </span>
        </div>
        <div className="help-concept-grid">
          <article>
            <Trophy />
            <strong>Complete rankings</strong>
            <p><b>Draft Rankings</b> contains every available player. Overall rank asks, “Who is best in general?”</p>
          </article>
          <article>
            <Target />
            <strong>Next-pick recommendation</strong>
            <p>Recommendation asks, “Who best helps this roster now?” It adds open starters, depth, tier scarcity, risk, bye weeks and wait odds.</p>
          </article>
          <article>
            <RefreshCw />
            <strong>After another team picks</strong>
            <p>Sleeper picks refresh every five seconds in a live draft. A selected player is removed, team needs change and all advice recalculates.</p>
          </article>
        </div>
        <div className="help-explanation-grid">
          <article>
            <small>“Why this pick” demonstration</small>
            <h3>RB A beats WR B by 6 roster-value points</h3>
            <p><b>Positive:</b> +8 for filling your empty RB2 starter and +4 because RB A is the last player in the tier.</p>
            <p><b>Negative:</b> −2 for injury risk. WR B is ranked higher overall but would become optional bench depth.</p>
          </article>
          <article>
            <small>Draft now versus Wait</small>
            <h3>Draft the scarce need; wait on the deep position</h3>
            <p>RB A has a 19% chance to survive and the fallback loses 28 projected points. TE A has a 78% chance to survive with two close alternatives.</p>
            <p><b>Advice:</b> Draft RB A now. Wait on tight end and reassess at the next turn.</p>
          </article>
        </div>
      </section>

      <section className="help-section" id="help-glossary">
        <header>
          <Search />
          <div><h2>Searchable glossary</h2><p>Search a term, abbreviation or idea.</p></div>
        </header>
        <label className="glossary-search">
          <Search />
          <span className="sr-only">Search glossary</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try ADP, floor, SUPER_FLEX or roster value"
            type="search"
            value={query}
          />
          <small>{glossary.length} of {GLOSSARY.length} terms</small>
        </label>
        {glossary.length ? (
          <div className="glossary-results" aria-live="polite">
            {glossary.map((entry) => (
              <article key={entry.term}>
                <h3>{entry.term}</h3>
                <p>{entry.shortDefinition}</p>
                <span><b>Example:</b> {entry.example}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="glossary-empty" aria-live="polite">
            <CircleHelp />
            <strong>No glossary term matches “{query}”</strong>
            <p>Try a shorter word such as rank, risk, tier or value.</p>
          </div>
        )}
      </section>

      <section className="help-section" id="help-settings">
        <header>
          <Database />
          <div><h2>League settings currently modeled</h2><p>These values come from the connected Sleeper league—not a generic preset.</p></div>
        </header>
        <div className="help-settings-grid">
          <article><small>League</small><strong>{settings.teamCount} teams · {settings.rounds} rounds</strong><span>{settings.draftFormat} draft · {formatTimer(settings.pickTimer)}</span></article>
          <article><small>Starting lineup</small><strong>{settings.starterPositions.length} required starters</strong><span>{settings.starterPositions.join(" · ")}</span></article>
          <article><small>Flexible starters</small><strong>{settings.flexSlots} FLEX · {settings.superFlexSlots} SUPER_FLEX</strong><span>{settings.idpSlots} individual defensive slots</span></article>
          <article><small>Depth and keepers</small><strong>{settings.benchSlots} bench · {settings.irSlots} IR · {settings.taxiSlots} taxi</strong><span>{settings.keeperLimit} keeper maximum · {settings.keeperCount} selected</span></article>
          <article><small>Scoring identity</small><strong>{settings.scoringLabel}</strong><span>{settings.scoring.length} Sleeper scoring rules imported</span></article>
          <article><small>Your team</small><strong>{settings.user.teamName}</strong><span>Draft position {settings.user.draftPosition ?? "pending"} · roster {settings.user.rosterId ?? "not found"}</span></article>
        </div>

        <details className="help-settings-details">
          <summary><ListOrdered /> Complete scoring settings ({settings.scoring.length})</summary>
          <div>
            {settings.scoring.map((item) => (
              <span key={item.key}><small>{humanizeSleeperSetting(item.key)}</small><strong>{item.value}</strong><code>{item.key}</code></span>
            ))}
          </div>
        </details>

        <div className="help-coverage">
          <header>
            <div>
              <h3>Partially supported data and scoring categories</h3>
              <p>No missing statistic is silently invented. Partial and unsupported rules stay visible and reduce confidence.</p>
            </div>
            {board?.scoringCategories ? (
              <span>{board.supportedScoringCategories ?? 0} supported · {board.partialScoringCategories ?? 0} partial · {board.unsupportedScoringCategories ?? 0} unsupported</span>
            ) : null}
          </header>
          {settings.limitations.map((limitation) => (
            <article className={`is-${limitation.level}`} key={limitation.id}>
              <AlertTriangle /><span><strong>{limitation.label}</strong><small>{limitation.detail}</small></span>
            </article>
          ))}
          {limitedCoverage.map((category) => (
            <article className={`is-${category.support}`} key={category.key}>
              <AlertTriangle />
              <span><strong>{category.label} ({category.value})</strong><small>{category.detail}</small></span>
              <em>{category.support}</em>
            </article>
          ))}
          {!board?.scoringCategories ? (
            <article className="is-warning">
              <AlertTriangle /><span><strong>Player scoring coverage is not loaded</strong><small>Unlock the private War Room data to compare the projection feed with every active scoring rule. League structure above is still current.</small></span>
            </article>
          ) : !limitedCoverage.length && !settings.limitations.length ? (
            <p className="help-all-modeled"><CheckCircle2 /> Every active league structure and scoring category is fully modeled by the loaded data.</p>
          ) : null}
        </div>
      </section>

      <section className="help-section" id="help-checklist">
        <header>
          <ClipboardCheck />
          <div><h2>Live-draft checklist</h2><p>Complete this before the room goes on the clock.</p></div>
          <span className="checklist-progress">{checkedItems.length}/{LIVE_DRAFT_CHECKLIST.length} ready</span>
        </header>
        <div className="live-checklist">
          {LIVE_DRAFT_CHECKLIST.map((item) => {
            const checked = checkedItems.includes(item);
            return (
              <label className={checked ? "is-checked" : ""} key={item}>
                <input checked={checked} onChange={() => toggleChecklist(item)} type="checkbox" />
                <span><Check /></span><strong>{item}</strong>
              </label>
            );
          })}
        </div>
        {checkedItems.length ? (
          <button
            className="help-reset-checklist"
            onClick={() => {
              setCheckedItems([]);
              saveChecklist([]);
            }}
          >
            Reset checklist
          </button>
        ) : null}
      </section>

      <section className="help-section" id="help-offline">
        <header>
          <WifiOff />
          <div><h2>Emergency offline instructions</h2><p>Stay calm and preserve the last known board.</p></div>
        </header>
        <div className="offline-status">
          <span className={connectionProblem ? "is-warning" : "is-online"}>
            {connectionProblem ? <WifiOff /> : <Wifi />}
            <small>Connection</small><strong>{connectionProblem ? "Using last successful data" : "Sleeper connected"}</strong>
          </span>
          <span><Database /><small>League updated</small><strong>{formatTime(leagueFetchedAt)}</strong></span>
          <span><RefreshCw /><small>Draft picks updated</small><strong>{formatTime(picksFetchedAt)}</strong></span>
          <span className={usingCachedBoard ? "is-warning" : "is-online"}><Trophy /><small>Rankings</small><strong>{usingCachedBoard ? "Saved board in use" : board?.players.length ? "Current board loaded" : "Unlock to load"}</strong></span>
        </div>
        <ol className="emergency-steps">
          <li><span>1</span><div><strong>Do not close or reload every tab.</strong><p>The open War Room can keep the last successful league, picks and ranking snapshots even when the network fails.</p></div></li>
          <li><span>2</span><div><strong>Check Sleeper directly.</strong><p>If Sleeper still works, trust its on-clock status and make the real selection there. War Room never submits the pick.</p></div></li>
          <li><span>3</span><div><strong>Use the saved available ranking.</strong><p>Open Draft Rankings. Ignore any player you can see was already selected after the displayed update time.</p></div></li>
          <li><span>4</span><div><strong>Reconnect once.</strong><p>Restore Wi-Fi or cellular data, return to this tab and press Refresh. The league also refreshes automatically when the browser reports that it is online again.</p></div></li>
          <li><span>5</span><div><strong>Make a manual fallback decision before the timer expires.</strong><p>Prioritize an empty essential starter, then the highest available tier/VOR. Avoid adding excessive depth at a position you already filled.</p></div></li>
        </ol>
        <div className="phone-recovery">
          <Smartphone />
          <span><strong>Phone use</strong><p>Use bottom navigation for the main draft screens and the menu for every tab. Keep Sleeper available in another tab or device, keep the phone charging, and avoid private browsing because it may block saved offline data.</p></span>
          <button className="button outline" onClick={onRefresh}><RefreshCw /> Refresh all live data</button>
        </div>
      </section>
    </main>
  );
}

export default HelpPage;
