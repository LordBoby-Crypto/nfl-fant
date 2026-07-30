import assert from "node:assert/strict";
import test from "node:test";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";
import {
  createSyncCredentials,
  decryptDraftPreferences,
  deriveVaultSecret,
  encryptDraftPreferences,
  formatRecoveryCode,
  parseRecoveryCode,
} from "../src/features/safety/sync.ts";

const controls: DraftControlState = {
  watchlist: ["p1"],
  queue: ["p2", "p1"],
  target: ["p2"],
  sleeper: ["p3"],
  avoid: ["p4"],
};

test("secure sync recovery code preserves a 128-bit vault id and 256-bit key", () => {
  const credentials = createSyncCredentials();
  const parsed = parseRecoveryCode(formatRecoveryCode(credentials));
  assert.deepEqual(parsed, credentials);
  assert.throws(() => parseRecoveryCode("wr1.invalid.short"), /valid War Room/);
  assert.throws(
    () => parseRecoveryCode(`wr1.${"!".repeat(22)}.${"x".repeat(43)}`),
    /valid War Room/,
  );
});

test("draft preferences round-trip through AES-GCM without plaintext in ciphertext", async () => {
  const credentials = createSyncCredentials();
  const envelope = await encryptDraftPreferences(
    controls,
    credentials,
    new Date("2026-07-30T17:00:00.000Z"),
  );
  assert.equal(envelope.version, 1);
  assert.equal(envelope.ciphertext.includes("p1"), false);
  const backup = await decryptDraftPreferences(envelope, credentials);
  assert.deepEqual(backup.controls, controls);
});

test("a different recovery key cannot decrypt the encrypted sync vault", async () => {
  const envelope = await encryptDraftPreferences(controls, createSyncCredentials());
  await assert.rejects(
    decryptDraftPreferences(envelope, createSyncCredentials()),
    /cannot decrypt/,
  );
});

test("vault authorization secret is stable but does not equal the encryption key", async () => {
  const credentials = createSyncCredentials();
  const first = await deriveVaultSecret(credentials);
  const second = await deriveVaultSecret(credentials);
  assert.equal(first, second);
  assert.notEqual(first, credentials.key);
});
