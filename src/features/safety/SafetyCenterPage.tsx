import {
  AlertTriangle,
  Check,
  Cloud,
  Download,
  FileDown,
  FileUp,
  HardDrive,
  KeyRound,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { useWarRoom } from "../player-intelligence/useWarRoom";
import { useDraftControls } from "../live-draft/useDraftControls";
import {
  buildEmergencyCheatSheet,
  createDraftPreferenceBackup,
  getSessionClock,
  groupRankingsByPositionAndTier,
  parseDraftPreferenceBackup,
} from "./model";
import {
  createSyncCredentials,
  formatRecoveryCode,
  isSecureSyncConfigured,
  loadSecureSyncVault,
  parseRecoveryCode,
  saveSecureSyncVault,
  readSyncCredentials,
  storeSyncCredentials,
  type SyncCredentials,
} from "./sync";
import {
  readLatestLiveReliabilityState,
  writeLiveReliabilityState,
} from "../live-draft/liveReliability.ts";

type WarRoomState = ReturnType<typeof useWarRoom>;
function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatSavedAt(value: number | null) {
  if (!value) return "No backup saved yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function PrintableRankings({ warRoom }: { warRoom: WarRoomState }) {
  const groups = useMemo(
    () => groupRankingsByPositionAndTier(warRoom.board?.players ?? []),
    [warRoom.board],
  );

  return (
    <section className="printable-rankings" aria-label="Printable rankings">
      <header>
        <h1>NFL Fantasy War Room Rankings</h1>
        <p>
          Rankings by position and tier ·{" "}
          {warRoom.board?.fetchedAt
            ? `FantasyPros ${new Date(warRoom.board.fetchedAt).toLocaleString()}`
            : "No cached rankings timestamp"}
        </p>
      </header>
      {groups.map((group) => (
        <section key={group.position}>
          <h2>{group.position}</h2>
          {group.tiers.map((tier) => (
            <div key={`${group.position}-${tier.tier ?? "unassigned"}`}>
              <h3>{tier.tier === null ? "Tier not assigned" : `Tier ${tier.tier}`}</h3>
              <ol>
                {tier.players.map((player) => (
                  <li key={player.id}>
                    <strong>{player.positionRank || player.ecr}. {player.name}</strong>
                    <span>{player.team || "FA"} · ECR {player.ecr ?? "—"} · ADP {player.adp ?? "—"}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </section>
  );
}

export function SessionExpiryBanner({ warRoom }: { warRoom: WarRoomState }) {
  const [now, setNow] = useState(Date.now());
  const [renewing, setRenewing] = useState(false);
  const [password, setPassword] = useState("");
  const clock = getSessionClock(warRoom.sessionExpiresAt, now);

  useEffect(() => {
    if (!warRoom.sessionExpiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [warRoom.sessionExpiresAt]);

  if (!warRoom.isUnlocked || (!clock.warning && !clock.expired)) return null;

  async function renew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || warRoom.loggingIn) return;
    const renewed = await warRoom.login(password);
    if (renewed) {
      setPassword("");
      setRenewing(false);
      setNow(Date.now());
    }
  }

  return (
    <section className={`session-expiry-banner ${clock.expired ? "is-expired" : ""}`} role="alert">
      <AlertTriangle />
      <span>
        <strong>
          {clock.expired
            ? "War Room session expired"
            : `War Room session expires in ${clock.label}`}
        </strong>
        <small>
          Renew before draft data locks. Cached rankings and Sleeper state remain available.
        </small>
      </span>
      {renewing ? (
        <form onSubmit={renew}>
          <label className="sr-only" htmlFor="renew-session-password">War Room password</label>
          <input
            id="renew-session-password"
            type="password"
            autoComplete="current-password"
            placeholder="War Room password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="button primary" disabled={!password || warRoom.loggingIn}>
            {warRoom.loggingIn ? <RefreshCw className="spin" /> : <ShieldCheck />}
            {warRoom.loggingIn ? "Renewing…" : "Renew"}
          </button>
        </form>
      ) : (
        <button className="button outline" type="button" onClick={() => setRenewing(true)}>
          Renew session
        </button>
      )}
    </section>
  );
}

export function SafetyCenterPage({
  syncAvailable,
  warRoom,
}: {
  syncAvailable: boolean;
  warRoom: WarRoomState;
}) {
  const { controls, replace } = useDraftControls();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [syncCredentials, setSyncCredentials] = useState<SyncCredentials | null>(
    readSyncCredentials,
  );
  const [recoveryCode, setRecoveryCode] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<string | null>(null);
  const board = warRoom.board;
  const preferenceCount = Object.values(controls).reduce(
    (total, playerIds) => total + playerIds.length,
    0,
  );

  function exportPreferences() {
    const backup = createDraftPreferenceBackup(controls);
    downloadText(
      `war-room-preferences-${backup.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      "application/json",
    );
    setMessage(`Exported ${preferenceCount} saved draft preferences.`);
  }

  async function importPreferences(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 1_000_000) {
        throw new Error("That preference backup is larger than the 1 MB safety limit.");
      }
      const backup = parseDraftPreferenceBackup(await file.text());
      replace(backup.controls);
      const imported = Object.values(backup.controls).reduce(
        (total, playerIds) => total + playerIds.length,
        0,
      );
      setMessage(`Imported ${imported} preferences from ${file.name}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That preference backup could not be imported.",
      );
    }
  }

  function downloadCheatSheet() {
    downloadText(
      `war-room-emergency-cheat-sheet-${new Date().toISOString().slice(0, 10)}.html`,
      buildEmergencyCheatSheet(controls, board),
      "text/html",
    );
    setMessage("Emergency cheat sheet downloaded for offline use.");
  }

  async function createVault() {
    if (!syncAvailable || !isSecureSyncConfigured() || syncing) return;
    setSyncing(true);
    try {
      const credentials = createSyncCredentials();
      const result = await saveSecureSyncVault(
        controls,
        credentials,
        undefined,
        readLatestLiveReliabilityState(),
      );
      storeSyncCredentials(credentials);
      setSyncCredentials(credentials);
      setRecoveryCode(formatRecoveryCode(credentials));
      setSyncUpdatedAt(result.updatedAt);
      setMessage("Secure sync vault created. Save the recovery code before leaving this page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The secure sync vault could not be created.");
    } finally {
      setSyncing(false);
    }
  }

  async function pushVault() {
    if (!syncCredentials || syncing) return;
    setSyncing(true);
    try {
      const result = await saveSecureSyncVault(
        controls,
        syncCredentials,
        undefined,
        readLatestLiveReliabilityState(),
      );
      setSyncUpdatedAt(result.updatedAt);
      setMessage("This device pushed its current draft preferences to the encrypted vault.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Secure sync could not be updated.");
    } finally {
      setSyncing(false);
    }
  }

  async function pullVault(credentials = syncCredentials) {
    if (!credentials || syncing) return;
    setSyncing(true);
    try {
      const result = await loadSecureSyncVault(credentials);
      replace(result.backup.controls);
      if (result.backup.liveReliability) {
        writeLiveReliabilityState(result.backup.liveReliability);
      }
      storeSyncCredentials(credentials);
      setSyncCredentials(credentials);
      setSyncUpdatedAt(result.updatedAt);
      setRecoveryCode("");
      setMessage("Encrypted draft preferences were restored on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Secure sync could not be loaded.");
    } finally {
      setSyncing(false);
    }
  }

  async function connectVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await pullVault(parseRecoveryCode(recoveryCode));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enter a valid recovery code.");
    }
  }

  return (
    <main className="workspace-page safety-center">
      <header className="page-heading">
        <div>
          <h1>Backup & device safety</h1>
          <p>Keep draft decisions usable through browser, provider, or connection failures.</p>
        </div>
      </header>

      {message ? (
        <div className="safety-message" role="status">
          <Check />
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      ) : null}

      <section className="safety-status-grid" aria-label="Recovery status">
        <article>
          <HardDrive />
          <span>
            <small>Draft preferences</small>
            <strong>{preferenceCount} saved</strong>
            <p>Queue, watchlist, targets, sleepers and avoids.</p>
          </span>
        </article>
        <article className={board?.players.length ? "is-ready" : "is-warning"}>
          <ShieldCheck />
          <span>
            <small>Last-known rankings</small>
            <strong>{board?.players.length ?? 0} players</strong>
            <p>
              {warRoom.usingCachedBoard
                ? `Offline copy from ${formatSavedAt(warRoom.cachedBoardSavedAt)}`
                : `Latest copy saved ${formatSavedAt(warRoom.cachedBoardSavedAt)}`}
            </p>
          </span>
        </article>
        <article className="is-ready">
          <Cloud />
          <span>
            <small>Sleeper recovery</small>
            <strong>Automatic</strong>
            <p>The last complete draft state survives reloads and outages.</p>
          </span>
        </article>
      </section>

      <section className="safety-actions">
        <article>
          <FileDown />
          <div>
            <h2>Preference backup</h2>
            <p>Export every draft-control list to one versioned JSON file, or restore it on another browser.</p>
          </div>
          <div className="safety-button-row">
            <button className="button primary" type="button" onClick={exportPreferences}>
              <Download /> Export all
            </button>
            <button className="button outline" type="button" onClick={() => inputRef.current?.click()}>
              <FileUp /> Import backup
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void importPreferences(event)}
            />
          </div>
        </article>

        <article>
          <FileDown />
          <div>
            <h2>Emergency cheat sheet</h2>
            <p>Download a standalone HTML copy of your lists and the top 200 cached rankings. It opens without the War Room.</p>
          </div>
          <button className="button primary" type="button" onClick={downloadCheatSheet}>
            <Download /> Download cheat sheet
          </button>
        </article>

        <article>
          <Printer />
          <div>
            <h2>Printable rankings</h2>
            <p>Print a clean position-by-position board grouped by FantasyPros tier, using the last-known copy if necessary.</p>
          </div>
          <button
            className="button primary"
            type="button"
            disabled={!board?.players.length}
            onClick={() => window.print()}
          >
            <Printer /> Print rankings
          </button>
        </article>

        <article className="secure-sync-action">
          <Cloud />
          <div>
            <h2>Secure cross-device sync</h2>
            <p>
              Preferences, manual corrections, and recommendation history are encrypted
              in this browser with AES-GCM before upload. The sync service stores
              ciphertext and cannot read your queue, choices, or history.
            </p>
            {syncUpdatedAt ? <small>Last vault update {new Date(syncUpdatedAt).toLocaleString()}</small> : null}
          </div>
          {!syncAvailable || !isSecureSyncConfigured() ? (
            <span className="sync-unavailable">Sync service is not configured</span>
          ) : syncCredentials ? (
            <div className="safety-button-row">
              <button className="button primary" type="button" disabled={syncing} onClick={() => void pushVault()}>
                <Cloud /> {syncing ? "Syncing…" : "Push this device"}
              </button>
              <button className="button outline" type="button" disabled={syncing} onClick={() => void pullVault()}>
                <RefreshCw className={syncing ? "spin" : ""} /> Pull latest
              </button>
            </div>
          ) : (
            <button className="button primary" type="button" disabled={syncing} onClick={() => void createVault()}>
              <KeyRound /> {syncing ? "Creating…" : "Create secure vault"}
            </button>
          )}
          {syncAvailable && isSecureSyncConfigured() ? (
            <form className="sync-recovery-form" onSubmit={(event) => void connectVault(event)}>
              <label htmlFor="sync-recovery-code">
                {syncCredentials ? "Recovery code" : "Connect another vault"}
              </label>
              <div>
                <input
                  id="sync-recovery-code"
                  type="text"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  placeholder={syncCredentials ? "Create a new vault to reveal its code" : "wr1…"}
                  autoComplete="off"
                  spellCheck={false}
                />
                {recoveryCode ? (
                  <button
                    className="button outline"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCode).then(
                        () => setMessage("Recovery code copied. Store it like a password."),
                        () => setMessage("The browser blocked clipboard access. Select and copy the code manually."),
                      );
                    }}
                  >
                    Copy
                  </button>
                ) : null}
                {syncCredentials && !recoveryCode ? (
                  <button
                    className="button outline"
                    type="button"
                    onClick={() => setRecoveryCode(formatRecoveryCode(syncCredentials))}
                  >
                    Reveal
                  </button>
                ) : null}
                {!syncCredentials ? (
                  <button className="button outline" type="submit" disabled={!recoveryCode || syncing}>
                    Connect
                  </button>
                ) : null}
              </div>
              <small>
                Anyone with this code can read and replace the encrypted preferences. Store it like a password.
              </small>
            </form>
          ) : null}
        </article>
      </section>

      <PrintableRankings warRoom={warRoom} />
    </main>
  );
}
