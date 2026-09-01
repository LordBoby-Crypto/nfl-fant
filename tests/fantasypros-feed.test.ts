import assert from "node:assert/strict";
import test from "node:test";
import {
  FANTASY_RANKING_POSITIONS,
  NFL_REGULAR_SEASON_START,
  fetchProjectionDataset,
  fetchRankingDataset,
  fetchSeasonProjectionDataset,
} from "../api/_lib/fantasypros.ts";
import { warRoomScoringLoadKey } from "../src/features/player-intelligence/warRoomLoadKey.ts";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.FANTASYPROS_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.FANTASYPROS_API_KEY;
  else process.env.FANTASYPROS_API_KEY = originalApiKey;
});

test("rankings use only documented FantasyPros positions with at most two concurrent requests", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  const urls: string[] = [];
  let active = 0;
  let maximumActive = 0;
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return new Response(JSON.stringify({ players: [] }), { status: 200 });
  }) as typeof fetch;

  await fetchRankingDataset("/nfl/2026/consensus-rankings", { scoring: "PPR" });

  assert.deepEqual(FANTASY_RANKING_POSITIONS, ["QB", "RB", "WR", "TE", "K", "DST"]);
  assert.equal(urls.length, 6);
  assert.equal(urls.some((url) => /position=(DL|LB|DB)/.test(url)), false);
  assert.ok(maximumActive <= 2);
});

test("projections use one documented combined-position request", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ players: [] }), { status: 200 });
  }) as typeof fetch;

  await fetchProjectionDataset("/nfl/2026/projections", {
    scoring: "PPR",
    ros: "true",
  });

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("positions"), "QB:RB:WR:TE:K:DST:DL:LB:DB");
});

test("season projections request the documented preseason week before ROS", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify({ players: [{ fpid: "1", name: "Test Player" }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  await fetchSeasonProjectionDataset("/nfl/2026/projections", {
    scoring: "PPR",
  }, Date.parse("2026-09-01T12:00:00Z"));

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("week"), "0");
  assert.equal(url.searchParams.has("ros"), false);
});

test("empty preseason projections fall back to rest-of-season projections", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    const url = new URL(String(input));
    const players = url.searchParams.get("week") === "0"
      ? []
      : [{ fpid: "1", name: "Test Player" }];
    return new Response(JSON.stringify({ players }), { status: 200 });
  }) as typeof fetch;

  await fetchSeasonProjectionDataset("/nfl/2026/projections", {
    scoring: "PPR",
  }, Date.parse("2026-09-01T12:00:00Z"));

  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[0]).searchParams.get("week"), "0");
  assert.equal(new URL(urls[1]).searchParams.get("ros"), "true");
});

test("empty preseason and ROS projection responses are rejected", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ players: [] }), { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () => fetchSeasonProjectionDataset("/nfl/2026/projections", { scoring: "PPR" }),
    /no 2026 preseason or rest-of-season projections/,
  );
  assert.equal(calls, 2);
});

test("regular-season consumers prefer ROS projections before the preseason fallback", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response(
      JSON.stringify({ players: [{ fpid: "1", name: "Test Player" }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  await fetchSeasonProjectionDataset(
    "/nfl/2026/projections",
    { scoring: "PPR" },
    NFL_REGULAR_SEASON_START + 1,
  );

  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("ros"), "true");
  assert.equal(url.searchParams.has("week"), false);
});

test("production API-key rejection is classified without exposing the key", async () => {
  process.env.FANTASYPROS_API_KEY = "never-expose-this";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "forbidden" }), { status: 403 })) as typeof fetch;

  await assert.rejects(
    () => fetchProjectionDataset("/nfl/2026/projections", { scoring: "PPR" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /production API key/);
      assert.doesNotMatch(error.message, /never-expose-this/);
      return true;
    },
  );
});

test("provider-wide ranking rate limits share one retry budget and stop later batches", async () => {
  process.env.FANTASYPROS_API_KEY = "test-key";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ message: "rate limited" }), {
      status: 429,
      headers: { "retry-after": "0" },
    });
  }) as typeof fetch;

  await assert.rejects(
    () => fetchRankingDataset("/nfl/2026/consensus-rankings", { scoring: "PPR" }),
    /rate limit reached/,
  );
  assert.equal(calls, 4);
});

test("equivalent Sleeper refresh objects keep the same FantasyPros load key", () => {
  const first = { fingerprint: "league-settings-v1" } as never;
  const refreshed = { fingerprint: "league-settings-v1" } as never;
  const changed = { fingerprint: "league-settings-v2" } as never;

  assert.equal(warRoomScoringLoadKey(first), warRoomScoringLoadKey(refreshed));
  assert.notEqual(warRoomScoringLoadKey(first), warRoomScoringLoadKey(changed));
});
