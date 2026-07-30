import type { PositionRunAlert } from "./liveIntelligence";

export const PICK_ALERT_THRESHOLDS = [5, 3, 1] as const;

export interface FocusedDraftAlertState {
  currentPick: number;
  picksUntilUser: number | null;
  isUserTurn: boolean;
  positionRunSignature: string | null;
}

export interface FocusedDraftAlertOptions {
  positionRuns: boolean;
}

export interface FocusedDraftAlertEvent {
  id: string;
  title: string;
  body: string;
  tone: "notice" | "urgent";
  sound: "countdown" | "clock" | "run";
}

export function positionRunSignature(run: PositionRunAlert | null) {
  if (!run) return null;
  return `${run.position}:${run.pickNumbers.join("-")}`;
}

function crossedThreshold(
  previous: number | null,
  current: number | null,
  threshold: (typeof PICK_ALERT_THRESHOLDS)[number],
) {
  if (current === null || current < 0) return false;
  if (previous === null) return current === threshold;
  return previous > threshold && current <= threshold;
}

export function buildFocusedDraftAlertEvents(
  previous: FocusedDraftAlertState | null,
  current: FocusedDraftAlertState,
  options: FocusedDraftAlertOptions,
): FocusedDraftAlertEvent[] {
  if (current.isUserTurn && previous?.isUserTurn !== true) {
    return [
      {
        id: `on-clock:${current.currentPick}`,
        title: "You are on the clock",
        body: `Sleeper is waiting for your selection at pick ${current.currentPick}.`,
        tone: "urgent",
        sound: "clock",
      },
    ];
  }

  const crossed = PICK_ALERT_THRESHOLDS.filter((threshold) =>
    crossedThreshold(previous?.picksUntilUser ?? null, current.picksUntilUser, threshold),
  );
  const nearestThreshold = crossed.at(-1);
  const events: FocusedDraftAlertEvent[] = nearestThreshold
    ? [
        {
          id: `countdown:${nearestThreshold}:${current.currentPick}`,
          title: `${nearestThreshold} pick${nearestThreshold === 1 ? "" : "s"} until your turn`,
          body:
            nearestThreshold === 1
              ? "One selection remains. Open your queue and lock in your choice."
              : `Your pick is approaching. Review the top three recommendations now.`,
          tone: nearestThreshold === 1 ? "urgent" : "notice",
          sound: "countdown",
        },
      ]
    : [];

  if (
    options.positionRuns &&
    current.positionRunSignature &&
    current.positionRunSignature !== previous?.positionRunSignature
  ) {
    events.push({
      id: `run:${current.positionRunSignature}`,
      title: "Position run detected",
      body: "A new position run has started. Recheck scarcity and tier-break guidance.",
      tone: "notice",
      sound: "run",
    });
  }

  return events;
}
