import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCurrentSleeperPlayerData,
  sleeperPlayerIdsKey,
} from "../src/hooks/sleeperPlayerData.ts";

test("a changed roster waits for the matching Sleeper player dataset", () => {
  const oldKey = sleeperPlayerIdsKey(["player-a"]);
  const newKey = sleeperPlayerIdsKey(["player-a", "player-b"]);
  assert.equal(hasCurrentSleeperPlayerData(oldKey, newKey, true), false);
  assert.equal(hasCurrentSleeperPlayerData(newKey, newKey, true), true);
});

test("Sleeper player keys are stable across duplicate and reordered roster IDs", () => {
  assert.equal(
    sleeperPlayerIdsKey(["player-b", "player-a", "player-a"]),
    sleeperPlayerIdsKey(["player-a", "player-b"]),
  );
});
