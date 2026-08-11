import assert from "node:assert/strict";
import test from "node:test";
import type { DraftControlState } from "../src/features/live-draft/engine.ts";
import {
  createDraftPreferenceBackup,
} from "../src/features/safety/model.ts";
import {
  createSyncCredentials,
  decryptDraftPreferences,
  deriveVaultSecret,
  encryptDraftPreferences,
  formatRecoveryCode,
  parseRecoveryCode,
} from "../src/features/safety/sync.ts";
import {
  markPlayerDraftedManually,
  normalizeLiveReliabilityState,
} from "../src/features/live-draft/liveReliability.ts";
import type { PlayerIntelligence } from "../src/features/player-intelligence/model.ts";

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
  const exportedAt = new Date("2026-07-30T17:00:00.000Z");
  const plaintext = Buffer.from(
    JSON.stringify(createDraftPreferenceBackup(controls, exportedAt)),
  );
  const envelope = await encryptDraftPreferences(
    controls,
    credentials,
    exportedAt,
  );
  assert.equal(envelope.version, 1);
  assert.equal(Buffer.from(envelope.ciphertext, "base64url").indexOf(plaintext), -1);
  const backup = await decryptDraftPreferences(envelope, credentials);
  assert.deepEqual(backup.controls, controls);
});

test("encrypted device sync carries live corrections without exposing player names", async () => {
  const live = markPlayerDraftedManually(
    normalizeLiveReliabilityState(null, "draft-25"),
    {
      id: "p1",
      name: "Private Player",
      team: "DAL",
      position: "RB",
      positionRank: "RB1",
      ecr: 1,
      tier: 1,
      adp: 1,
      projectedPoints: 300,
      expertBest: 1,
      expertWorst: 2,
      expertAverage: 1,
      injuryStatus: "",
      injuryDetail: "",
      practiceStatus: "",
      byeWeek: 7,
      news: [],
    } satisfies PlayerIntelligence,
    100,
  );
  const credentials = createSyncCredentials();
  const envelope = await encryptDraftPreferences(
    controls,
    credentials,
    new Date("2026-08-11T12:00:00.000Z"),
    live,
  );
  assert.equal(envelope.ciphertext.includes("Private Player"), false);
  const backup = await decryptDraftPreferences(envelope, credentials);
  assert.equal(backup.liveReliability?.corrections[0].playerName, "Private Player");
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
