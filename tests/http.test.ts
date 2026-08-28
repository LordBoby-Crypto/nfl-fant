import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCors,
  requireMethod,
  STATUS_CACHE_CONTROL,
} from "../api/_lib/http.ts";
import { createSessionToken } from "../api/_lib/session.ts";
import { hasValidSession } from "../api/_lib/session.ts";
import { createSyncHandler } from "../api/_lib/sync-handler.ts";

const syncHandler = createSyncHandler({
  applyCors,
  requireMethod,
  hasValidSession,
});

function responseHarness() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown = null;
  const response = {
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), String(value));
      return response;
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(value: unknown) {
      body = value;
      return response;
    },
    end() {
      return response;
    },
  } as unknown as VercelResponse;
  return {
    response,
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

test("CORS responses always vary by Origin and allow GitHub Pages", () => {
  const harness = responseHarness();
  const request = {
    method: "GET",
    headers: { origin: "https://lordboby-crypto.github.io" },
  } as VercelRequest;

  assert.equal(applyCors(request, harness.response), false);
  assert.equal(harness.headers.get("vary"), "Origin");
  assert.equal(
    harness.headers.get("access-control-allow-origin"),
    "https://lordboby-crypto.github.io",
  );
});

test("status cache policy cannot reuse an origin-specific CORS response", () => {
  assert.equal(STATUS_CACHE_CONTROL, "private, no-store");
});

test("secure sync rejects requests without a valid War Room session", async () => {
  const harness = responseHarness();
  const request = {
    method: "POST",
    headers: { origin: "https://lordboby-crypto.github.io" },
    body: {
      action: "read",
      p_vault_id: "abcdefghijklmnopqrstuv",
      p_secret: "x".repeat(43),
    },
  } as unknown as VercelRequest;

  await syncHandler(request, harness.response);
  assert.equal(harness.statusCode, 401);
  assert.deepEqual(harness.body, {
    error: "A valid War Room session is required.",
  });
  assert.equal(harness.headers.get("cache-control"), "private, no-store");
});

test("secure sync rejects malformed vault identifiers before storage access", async () => {
  const previousSecret = process.env.WAR_ROOM_SESSION_SECRET;
  process.env.WAR_ROOM_SESSION_SECRET = "test-session-secret-with-enough-entropy";
  try {
    const harness = responseHarness();
    const request = {
      method: "POST",
      headers: {
        origin: "https://lordboby-crypto.github.io",
        authorization: `Bearer ${createSessionToken()}`,
      },
      body: {
        action: "read",
        p_vault_id: "not-valid",
        p_secret: "x".repeat(43),
      },
    } as unknown as VercelRequest;

    await syncHandler(request, harness.response);
    assert.equal(harness.statusCode, 400);
    assert.deepEqual(harness.body, {
      error: "The secure sync request is invalid.",
    });
  } finally {
    if (previousSecret === undefined) delete process.env.WAR_ROOM_SESSION_SECRET;
    else process.env.WAR_ROOM_SESSION_SECRET = previousSecret;
  }
});

test("secure sync sends authorization separately from the encrypted vault row", async () => {
  const previousSecret = process.env.WAR_ROOM_SESSION_SECRET;
  const previousFetch = globalThis.fetch;
  process.env.WAR_ROOM_SESSION_SECRET = "test-session-secret-with-enough-entropy";
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(
      JSON.stringify([{ updated_at: "2026-07-30T17:20:00.000Z" }]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const harness = responseHarness();
    const request = {
      method: "POST",
      headers: {
        origin: "https://lordboby-crypto.github.io",
        authorization: `Bearer ${createSessionToken()}`,
      },
      body: {
        action: "save",
        p_vault_id: "abcdefghijklmnopqrstuv",
        p_secret: "x".repeat(43),
        p_envelope: {
          version: 1,
          iv: "encrypted-iv",
          ciphertext: "encrypted-preferences",
          updatedAt: "2026-07-30T17:20:00.000Z",
        },
      },
    } as unknown as VercelRequest;

    await syncHandler(request, harness.response);
    assert.equal(harness.statusCode, 200);
    assert.match(requestUrl, /war_room_sync_vaults/);
    assert.equal(requestInit?.method, "POST");
    const headers = requestInit?.headers as Record<string, string>;
    assert.equal(headers["X-Vault-Secret"], "x".repeat(43));
    assert.equal(
      headers.Prefer,
      "resolution=merge-duplicates,return=representation",
    );
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    assert.equal("p_secret" in body, false);
    assert.equal("secret" in body, false);
    assert.equal(body.vault_id, "abcdefghijklmnopqrstuv");
    assert.deepEqual(body.envelope, request.body.p_envelope);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.WAR_ROOM_SESSION_SECRET;
    else process.env.WAR_ROOM_SESSION_SECRET = previousSecret;
  }
});
