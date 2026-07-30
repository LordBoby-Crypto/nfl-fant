import type { VercelRequest, VercelResponse } from "@vercel/node";

type SyncAction = "save" | "read";

type SyncHandlerDependencies = {
  applyCors: (request: VercelRequest, response: VercelResponse) => boolean;
  requireMethod: (
    request: VercelRequest,
    response: VercelResponse,
    methods: string[],
  ) => boolean;
  hasValidSession: (request: VercelRequest) => boolean;
};

const DEFAULT_SYNC_SUPABASE_URL = "https://ecybgsrxjnmifahtbazk.supabase.co";
const DEFAULT_SYNC_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_Gp3VCnJmsPi0J5NwGdxRgw_iKNFPY11";

function syncConfigured() {
  return Boolean(syncSupabaseUrl() && syncSupabaseKey());
}

function syncSupabaseUrl() {
  return (
    process.env.SYNC_SUPABASE_URL?.trim() || DEFAULT_SYNC_SUPABASE_URL
  ).replace(/\/$/, "");
}

function syncSupabaseKey() {
  return (
    process.env.SYNC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    DEFAULT_SYNC_SUPABASE_PUBLISHABLE_KEY
  );
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength
    ? value
    : null;
}

async function callSyncStorage(
  action: SyncAction,
  vaultId: string,
  secret: string,
  envelope?: unknown,
) {
  const url = syncSupabaseUrl();
  const key = syncSupabaseKey();
  if (!url || !key) throw new Error("Secure sync is not configured.");
  const endpoint = new URL(`${url}/rest/v1/war_room_sync_vaults`);
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "X-Vault-Secret": secret,
  };

  if (action === "read") {
    endpoint.searchParams.set("vault_id", `eq.${vaultId}`);
    endpoint.searchParams.set("select", "envelope,updated_at");
    endpoint.searchParams.set("limit", "1");
  } else {
    endpoint.searchParams.set("on_conflict", "vault_id");
    endpoint.searchParams.set("select", "updated_at");
    headers.Prefer = "resolution=merge-duplicates,return=representation";
  }

  return fetch(endpoint, {
    method: action === "read" ? "GET" : "POST",
    headers,
    ...(action === "save"
      ? {
          body: JSON.stringify({
            vault_id: vaultId,
            secret_hash: "set-by-database-trigger",
            envelope,
          }),
        }
      : {}),
    cache: "no-store",
  });
}

export function createSyncHandler({
  applyCors,
  requireMethod,
  hasValidSession,
}: SyncHandlerDependencies) {
  return async function handler(
    request: VercelRequest,
    response: VercelResponse,
  ) {
    if (applyCors(request, response)) return;
    if (requireMethod(request, response, ["POST"])) return;
    response.setHeader("Cache-Control", "private, no-store");

    if (!hasValidSession(request)) {
      response
        .status(401)
        .json({ error: "A valid War Room session is required." });
      return;
    }
    if (!syncConfigured()) {
      response.status(503).json({ error: "Secure sync is not configured." });
      return;
    }

    const action = request.body?.action as SyncAction | undefined;
    const vaultId = stringValue(request.body?.p_vault_id, 80);
    const secret = stringValue(request.body?.p_secret, 100);
    if (
      !vaultId ||
      !/^[A-Za-z0-9_-]{20,32}$/.test(vaultId) ||
      !secret ||
      secret.length < 40 ||
      (action !== "save" && action !== "read")
    ) {
      response.status(400).json({ error: "The secure sync request is invalid." });
      return;
    }

    const envelope = request.body?.p_envelope as
      | {
          version?: unknown;
          iv?: unknown;
          ciphertext?: unknown;
          updatedAt?: unknown;
        }
      | undefined;
    if (
      action === "save" &&
      (!envelope ||
        typeof envelope !== "object" ||
        envelope.version !== 1 ||
        typeof envelope.iv !== "string" ||
        typeof envelope.ciphertext !== "string" ||
        typeof envelope.updatedAt !== "string" ||
        JSON.stringify(envelope).length > 100_000)
    ) {
      response
        .status(400)
        .json({ error: "The encrypted sync backup is invalid." });
      return;
    }

    try {
      const upstream = await callSyncStorage(action, vaultId, secret, envelope);
      if (!upstream.ok) {
        console.warn(
          JSON.stringify({
            level: "warning",
            message: "Secure sync storage rejected",
            action,
            status: upstream.status,
          }),
        );
        response.status(upstream.status === 404 ? 404 : 502).json({
          error:
            action === "read"
              ? "The secure sync vault was not found or the recovery code is incorrect."
              : "The secure sync vault could not be updated.",
        });
        return;
      }
      const value = await upstream.json();
      response.status(200).json(value);
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Secure sync request failed",
          action,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      response
        .status(502)
        .json({ error: "Secure sync is temporarily unavailable." });
    }
  };
}
