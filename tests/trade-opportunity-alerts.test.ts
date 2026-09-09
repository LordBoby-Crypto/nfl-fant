import assert from "node:assert/strict";
import test from "node:test";
import {
  detectTradeOpportunityAlert,
  tradeOpportunityStorageKey,
} from "../src/features/trades/opportunityAlerts.ts";

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
    ),
    { count: 2, opportunityIds: ["offer-2", "offer-3"] },
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
