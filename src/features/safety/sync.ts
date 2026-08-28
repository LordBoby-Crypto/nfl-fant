import {
  createDraftPreferenceBackup,
  parseDraftPreferenceBackup,
  type DraftPreferenceBackup,
} from "./model.ts";
import type { DraftControlState } from "../live-draft/engine.ts";
import type { LiveReliabilityState } from "../live-draft/liveReliability.ts";

export interface SyncCredentials {
  vaultId: string;
  key: string;
}

export interface EncryptedSyncEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

const RECOVERY_PREFIX = "wr1";
const SESSION_STORAGE_KEY = "war-room.session.v1";
export const SYNC_CREDENTIALS_KEY = "war-room.secure-sync-credentials.v1";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createSyncCredentials(): SyncCredentials {
  const vault = crypto.getRandomValues(new Uint8Array(16));
  const key = crypto.getRandomValues(new Uint8Array(32));
  return {
    vaultId: toBase64Url(vault),
    key: toBase64Url(key),
  };
}

export function formatRecoveryCode(credentials: SyncCredentials) {
  return `${RECOVERY_PREFIX}.${credentials.vaultId}.${credentials.key}`;
}

export function parseRecoveryCode(value: string): SyncCredentials {
  try {
    const [prefix, vaultId, key, ...extra] = value.trim().split(".");
    if (
      prefix !== RECOVERY_PREFIX ||
      extra.length ||
      !/^[A-Za-z0-9_-]{22}$/.test(vaultId ?? "") ||
      !/^[A-Za-z0-9_-]{43}$/.test(key ?? "") ||
      fromBase64Url(vaultId).length !== 16 ||
      fromBase64Url(key).length !== 32
    ) {
      throw new Error();
    }
    return { vaultId, key };
  } catch {
    throw new Error("Enter a valid War Room recovery code.");
  }
}

export function readSyncCredentials(): SyncCredentials | null {
  try {
    const value = JSON.parse(localStorage.getItem(SYNC_CREDENTIALS_KEY) ?? "null") as
      | Partial<SyncCredentials>
      | null;
    return value?.vaultId && value?.key
      ? parseRecoveryCode(formatRecoveryCode(value as SyncCredentials))
      : null;
  } catch {
    return null;
  }
}

export function storeSyncCredentials(credentials: SyncCredentials) {
  localStorage.setItem(SYNC_CREDENTIALS_KEY, JSON.stringify(credentials));
}

async function encryptionKey(key: string) {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(key),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveVaultSecret(credentials: SyncCredentials) {
  const rawKey = fromBase64Url(credentials.key);
  const context = textEncoder.encode("NFL Fantasy War Room sync authorization v1");
  const material = new Uint8Array(rawKey.length + context.length);
  material.set(rawKey);
  material.set(context, rawKey.length);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return toBase64Url(new Uint8Array(digest));
}

export async function encryptDraftPreferences(
  controls: DraftControlState,
  credentials: SyncCredentials,
  now = new Date(),
  liveReliability?: LiveReliabilityState | null,
): Promise<EncryptedSyncEnvelope> {
  const backup = createDraftPreferenceBackup(controls, now, liveReliability);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(credentials.key),
    textEncoder.encode(JSON.stringify(backup)),
  );
  return {
    version: 1,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    updatedAt: now.toISOString(),
  };
}

export async function decryptDraftPreferences(
  envelope: EncryptedSyncEnvelope,
  credentials: SyncCredentials,
): Promise<DraftPreferenceBackup> {
  if (
    envelope.version !== 1 ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("The secure sync vault contains an unsupported backup.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(envelope.iv) },
      await encryptionKey(credentials.key),
      fromBase64Url(envelope.ciphertext),
    );
    return parseDraftPreferenceBackup(textDecoder.decode(plaintext));
  } catch {
    throw new Error("The recovery code cannot decrypt this sync vault.");
  }
}

function syncApiRoot() {
  const configured = (import.meta.env.VITE_INTELLIGENCE_API_URL as string | undefined)
    ?.trim()
    .replace(/\/$/, "");
  const pageOrigin = typeof window === "undefined" ? undefined : window.location.origin;
  return pageOrigin &&
    /^https:\/\/nfl-fant-[a-z0-9-]+-logansai\.vercel\.app$/.test(pageOrigin)
    ? pageOrigin
    : configured;
}

function currentSessionToken() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? "null") as
      | { token?: unknown; expiresAt?: unknown }
      | null;
    return value &&
      typeof value.token === "string" &&
      typeof value.expiresAt === "number" &&
      value.expiresAt > Date.now()
      ? value.token
      : null;
  } catch {
    return null;
  }
}

export function isSecureSyncConfigured() {
  return Boolean(syncApiRoot());
}

async function callSyncApi<T>(
  action: "save" | "read",
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const root = syncApiRoot();
  const token = currentSessionToken();
  if (!root) throw new Error("Secure cross-device sync is not linked.");
  if (!token) throw new Error("Unlock the War Room before using secure sync.");
  const response = await fetch(`${root}/api/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...body }),
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    let message = `Secure sync returned ${response.status}.`;
    try {
      const value = (await response.json()) as {
        error?: unknown;
        message?: unknown;
      };
      if (typeof value.error === "string") message = value.error;
      else if (typeof value.message === "string") message = value.message;
    } catch {
      // Use the status-only message when PostgREST does not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function saveSecureSyncVault(
  controls: DraftControlState,
  credentials: SyncCredentials,
  signal?: AbortSignal,
  liveReliability?: LiveReliabilityState | null,
) {
  const envelope = await encryptDraftPreferences(
    controls,
    credentials,
    new Date(),
    liveReliability,
  );
  const secret = await deriveVaultSecret(credentials);
  const rows = await callSyncApi<Array<{ updated_at: string }>>(
    "save",
    {
      p_vault_id: credentials.vaultId,
      p_secret: secret,
      p_envelope: envelope,
    },
    signal,
  );
  return { envelope, updatedAt: rows[0]?.updated_at ?? envelope.updatedAt };
}

export async function loadSecureSyncVault(
  credentials: SyncCredentials,
  signal?: AbortSignal,
) {
  const secret = await deriveVaultSecret(credentials);
  const rows = await callSyncApi<
    Array<{ envelope: EncryptedSyncEnvelope; updated_at: string }>
  >(
    "read",
    {
      p_vault_id: credentials.vaultId,
      p_secret: secret,
    },
    signal,
  );
  const row = rows[0];
  if (!row) throw new Error("This secure sync vault was not found or has expired.");
  return {
    backup: await decryptDraftPreferences(row.envelope, credentials),
    updatedAt: row.updated_at,
  };
}
