import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFocusedDraftAlertEvents,
  positionRunSignature,
  type FocusedDraftAlertState,
} from "../src/features/live-draft/focusedMode.ts";

function state(
  picksUntilUser: number | null,
  currentPick: number,
  isUserTurn = false,
  run: string | null = null,
): FocusedDraftAlertState {
  return {
    currentPick,
    picksUntilUser,
    isUserTurn,
    positionRunSignature: run,
  };
}

test("focused mode emits one countdown event as each 5, 3 and 1 threshold is crossed", () => {
  const atFive = buildFocusedDraftAlertEvents(
    state(6, 20),
    state(5, 21),
    { positionRuns: false },
  );
  const atThree = buildFocusedDraftAlertEvents(
    state(4, 22),
    state(3, 23),
    { positionRuns: false },
  );
  const atOne = buildFocusedDraftAlertEvents(
    state(2, 24),
    state(1, 25),
    { positionRuns: false },
  );

  assert.match(atFive[0]?.title ?? "", /^5 picks/);
  assert.match(atThree[0]?.title ?? "", /^3 picks/);
  assert.match(atOne[0]?.title ?? "", /^1 pick /);
  assert.equal(atOne[0]?.tone, "urgent");
});

test("unchanged Sleeper polling does not repeat a countdown alert", () => {
  const repeated = buildFocusedDraftAlertEvents(
    state(3, 23),
    state(3, 23),
    { positionRuns: true },
  );
  assert.deepEqual(repeated, []);
});

test("on-clock alert supersedes countdown and uses the strong urgent signal", () => {
  const events = buildFocusedDraftAlertEvents(
    state(1, 25),
    state(0, 26, true),
    { positionRuns: true },
  );
  assert.equal(events.length, 1);
  assert.equal(events[0]?.title, "You are on the clock");
  assert.equal(events[0]?.tone, "urgent");
  assert.equal(events[0]?.sound, "clock");
});

test("position-run notification is optional and only fires for a new run signature", () => {
  const run = positionRunSignature({
    position: "RB",
    count: 4,
    window: 6,
    pickNumbers: [31, 32, 34, 36],
  });
  assert.equal(run, "RB:31-32-34-36");

  const disabled = buildFocusedDraftAlertEvents(
    state(8, 30),
    state(7, 31, false, run),
    { positionRuns: false },
  );
  assert.deepEqual(disabled, []);

  const enabled = buildFocusedDraftAlertEvents(
    state(8, 30),
    state(7, 31, false, run),
    { positionRuns: true },
  );
  assert.equal(enabled[0]?.title, "Position run detected");

  const repeated = buildFocusedDraftAlertEvents(
    state(7, 31, false, run),
    state(6, 32, false, run),
    { positionRuns: true },
  );
  assert.deepEqual(repeated, []);
});

test("a fast pick burst reports only the nearest crossed countdown threshold", () => {
  const events = buildFocusedDraftAlertEvents(
    state(6, 40),
    state(2, 44),
    { positionRuns: false },
  );
  assert.equal(events.length, 1);
  assert.match(events[0]?.title ?? "", /^3 picks/);
});
