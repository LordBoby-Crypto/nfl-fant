import assert from "node:assert/strict";
import test from "node:test";
import {
  changedTradeRosters,
  detectTradeOpportunityAlert,
  tradeOpportunityStorageKey,
} from "../src/features/trades/opportunityAlerts.ts";
import {
  normalizeTradeFeedback,
  visibleTradeRecommendationIds,
} from "../src/features/trades/feedback.ts";

test("first trade scan establishes a baseline without a false alert", () => {
  assert.equal(
    detectTradeOpportunityAlert(null, "rosters-a", ["offer-1"]),
    null,
  );
});

test("refreshing unchanged rosters does not create a trade alert", () => {
  assert.equal(
    detectTradeOpportunityAlert(
      {
        rosterFingerprint: "rosters-a",
        opportunityIds: ["offer-1"],
        savedAt: 1,
      },
      "rosters-a",
      ["offer-1", "offer-2"],
    ),
    null,
  );
});

test("a roster change alerts only for newly viable opportunities", () => {
  assert.deepEqual(
    detectTradeOpportunityAlert(
      {
        rosterFingerprint: "rosters-a",
        opportunityIds: ["offer-1", "offer-old"],
        savedAt: 1,
      },
      "rosters-b",
      ["offer-1", "offer-2", "offer-3"],
      { "1": ["a", "c"], "2": ["b"] },
    ),
    {
      count: 2,
      opportunityIds: ["offer-2", "offer-3"],
      changedRosterIds: [],
      changeSummary: "Sleeper reported a roster change since the last scan.",
    },
  );
});

test("trade alerts identify the exact changed rosters", () => {
  const previous = { "1": ["a"], "2": ["b"], "3": ["c"] };
  const current = { "1": ["a"], "2": ["b", "d"], "3": [] };
  assert.deepEqual(changedTradeRosters(previous, current), [2, 3]);
  assert.deepEqual(
    detectTradeOpportunityAlert(
      {
        rosterFingerprint: "before",
        opportunityIds: ["old"],
        rosterState: previous,
        savedAt: 1,
      },
      "after",
      ["old", "new"],
      current,
    ),
    {
      count: 1,
      opportunityIds: ["new"],
      changedRosterIds: [2, 3],
      changeSummary: "2 rosters changed since the last scan.",
    },
  );
});

test("reserve-only moves still identify the changed roster", () => {
  assert.deepEqual(
    changedTradeRosters(
      { "7": ["roster:player-a"] },
      { "7": ["reserve:player-a", "roster:player-a"] },
    ),
    [7],
  );
});

test("a roster change without a new responsible offer stays quiet", () => {
  assert.equal(
    detectTradeOpportunityAlert(
      {
        rosterFingerprint: "rosters-a",
        opportunityIds: ["offer-1", "offer-2"],
        savedAt: 1,
      },
      "rosters-b",
      ["offer-1"],
    ),
    null,
  );
});

test("trade alert baselines are isolated by league and roster", () => {
  assert.notEqual(
    tradeOpportunityStorageKey("league-1", 1),
    tradeOpportunityStorageKey("league-1", 2),
  );
  assert.notEqual(
    tradeOpportunityStorageKey("league-1", 1),
    tradeOpportunityStorageKey("league-2", 1),
  );
});

test("recommendation feedback safely hides only rejected packages", () => {
  const feedback = normalizeTradeFeedback({
    keep: "helpful",
    hide: "not-helpful",
    invalid: "maybe",
  });
  assert.deepEqual(feedback, { keep: "helpful", hide: "not-helpful" });
  assert.deepEqual(
    visibleTradeRecommendationIds(["keep", "hide", "new"], feedback),
    ["keep", "new"],
  );
});
