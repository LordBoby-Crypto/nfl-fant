import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import {
  humanizeSleeperSetting,
  type LeagueSettingsModel,
  type SettingsChange,
} from "./model";

function formatTimer(seconds: number) {
  if (seconds >= 3600) {
    const hours = seconds / 3600;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
  }
  return `${seconds} seconds`;
}

export function SettingsChangeNotice({
  changes,
  onDismiss,
}: {
  changes: SettingsChange[];
  onDismiss: () => void;
}) {
  if (!changes.length) return null;
  return (
    <section className="settings-change-notice" role="status">
      <RefreshCw />
      <div>
        <small>Sleeper settings changed</small>
        <h2>
          War Room rebuilt from {changes.length} commissioner change
          {changes.length === 1 ? "" : "s"}
        </h2>
        <p>
          The values below replaced the previous model automatically. No
          Sleeper setting needs to be changed to match the War Room.
        </p>
        <div className="settings-change-list">
          {changes.map((change) => (
            <article key={`${change.category}-${change.label}`}>
              <span>{change.category}</span>
              <strong>{change.label}</strong>
              <p><del>{change.before}</del> → <b>{change.after}</b></p>
              <small>{change.recommendationImpact}</small>
            </article>
          ))}
        </div>
      </div>
      <button aria-label="Dismiss Sleeper settings changes" onClick={onDismiss}>
        <X />
      </button>
    </section>
  );
}

export function LeagueSettingsPanel({
  model,
  fetchedAt,
}: {
  model: LeagueSettingsModel;
  fetchedAt: number;
}) {
  return (
    <section className="league-settings-panel" aria-labelledby="settings-used-title">
      <header>
        <div>
          <small>Milestone 16 · Automatic source of truth</small>
          <h2 id="settings-used-title">Sleeper settings currently in use</h2>
          <p>
            Imported directly from Sleeper and rechecked automatically. Last
            checked {new Intl.DateTimeFormat("en-US", {
              timeStyle: "medium",
            }).format(fetchedAt)}.
          </p>
        </div>
        <span className="settings-source-badge">
          <CheckCircle2 /> Adaptive model active
        </span>
      </header>

      <div className="settings-summary-grid">
        <article>
          <UsersRound />
          <small>League</small>
          <strong>{model.teamCount} teams</strong>
          <span>{model.rounds} rounds · {model.draftFormat}</span>
        </article>
        <article>
          <ClipboardList />
          <small>Your team</small>
          <strong>{model.user.teamName}</strong>
          <span>
            Roster {model.user.rosterId ?? "not found"} · draft position{" "}
            {model.user.draftPosition ?? "pending"}
          </span>
        </article>
        <article>
          <ShieldCheck />
          <small>Roster depth</small>
          <strong>{model.starterPositions.length} starters · {model.benchSlots} bench</strong>
          <span>{model.irSlots} IR · {model.taxiSlots} taxi · {model.keeperLimit} keeper max</span>
        </article>
        <article>
          <RefreshCw />
          <small>Scoring</small>
          <strong>{model.scoringLabel}</strong>
          <span>{model.scoring.length} Sleeper scoring rules imported</span>
        </article>
      </div>

      {model.limitations.length ? (
        <div className="modeling-limitations">
          {model.limitations.map((limitation) => (
            <article
              className={`is-${limitation.level}`}
              key={limitation.id}
            >
              <AlertTriangle />
              <span>
                <strong>{limitation.label}</strong>
                <small>{limitation.detail}</small>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="modeling-clear">
          <CheckCircle2 />
          <span>
            <strong>No unmodeled league structure detected</strong>
            <small>
              The current draft format, roster positions, keepers, taxi and
              reserve structure can all be represented.
            </small>
          </span>
        </div>
      )}

      <details className="settings-details" open>
        <summary><ChevronDown /> Roster positions used</summary>
        <div className="setting-pills">
          {Object.entries(model.rosterCounts).map(([position, count]) => (
            <span key={position}><b>{count}×</b> {position}</span>
          ))}
          {model.irSlots ? <span><b>{model.irSlots}×</b> IR</span> : null}
          {model.taxiSlots ? <span><b>{model.taxiSlots}×</b> TAXI</span> : null}
        </div>
      </details>

      <details className="settings-details">
        <summary><ChevronDown /> Complete scoring configuration ({model.scoring.length})</summary>
        <div className="scoring-settings-grid">
          {model.scoring.map((setting) => (
            <span key={setting.key}>
              <small>{humanizeSleeperSetting(setting.key)}</small>
              <strong>{setting.value}</strong>
              <code>{setting.key}</code>
            </span>
          ))}
        </div>
      </details>

      <details className="settings-details">
        <summary><ChevronDown /> Draft behavior used</summary>
        <div className="draft-setting-list">
          <span><small>Format</small><strong>{model.draftFormat}</strong></span>
          <span><small>Teams</small><strong>{model.teamCount}</strong></span>
          <span><small>Rounds</small><strong>{model.rounds}</strong></span>
          <span><small>Pick timer</small><strong>{formatTimer(model.pickTimer)}</strong></span>
          <span><small>FLEX slots</small><strong>{model.flexSlots}</strong></span>
          <span><small>SUPER_FLEX slots</small><strong>{model.superFlexSlots}</strong></span>
          <span><small>IDP slots</small><strong>{model.idpSlots}</strong></span>
          <span><small>Selected keepers</small><strong>{model.keeperCount}</strong></span>
        </div>
      </details>
    </section>
  );
}
