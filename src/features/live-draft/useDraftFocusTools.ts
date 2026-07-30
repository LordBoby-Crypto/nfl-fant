import { useCallback, useEffect, useRef, useState } from "react";
import type { PositionRunAlert } from "./liveIntelligence";
import {
  buildFocusedDraftAlertEvents,
  positionRunSignature,
  type FocusedDraftAlertState,
} from "./focusedMode";

const RUN_ALERTS_KEY = "war-room.focused-draft-run-alerts.v1";

type NotificationState = NotificationPermission | "unsupported";
type WakeLockState = "unsupported" | "off" | "requesting" | "active" | "blocked";

function readBoolean(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeBoolean(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function playAlert(
  context: AudioContext,
  sound: "countdown" | "clock" | "run",
) {
  const tones =
    sound === "clock"
      ? [660, 880, 1040]
      : sound === "run"
        ? [520, 650]
        : [720, 720];
  const startedAt = context.currentTime;
  tones.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = startedAt + index * 0.14;
    oscillator.frequency.value = frequency;
    oscillator.type = sound === "clock" ? "square" : "sine";
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.12);
  });
}

export function useDraftFocusTools({
  active,
  currentPick,
  picksUntilUser,
  isUserTurn,
  positionRun,
}: {
  active: boolean;
  currentPick: number;
  picksUntilUser: number | null;
  isUserTurn: boolean;
  positionRun: PositionRunAlert | null;
}) {
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [positionRunAlerts, setPositionRunAlerts] = useState(() =>
    readBoolean(RUN_ALERTS_KEY, false),
  );
  const [notificationState, setNotificationState] = useState<NotificationState>(
    () => ("Notification" in window ? Notification.permission : "unsupported"),
  );
  const [wakeLockState, setWakeLockState] = useState<WakeLockState>(() =>
    "wakeLock" in navigator ? "off" : "unsupported",
  );
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const previous = useRef<FocusedDraftAlertState | null>(null);
  const delivered = useRef(new Set<string>());
  const currentPositionRunSignature = positionRunSignature(positionRun);

  const requestWakeLock = useCallback(async () => {
    const wakeLockApi = navigator.wakeLock;
    if (!wakeLockApi) {
      setWakeLockState("unsupported");
      return false;
    }
    setWakeLockState("requesting");
    try {
      const sentinel = await wakeLockApi.request("screen");
      wakeLock.current = sentinel;
      setWakeLockState("active");
      sentinel.addEventListener("release", () => {
        wakeLock.current = null;
        setWakeLockState((current) => (current === "active" ? "off" : current));
      });
      return true;
    } catch {
      setWakeLockState("blocked");
      return false;
    }
  }, []);

  const toggleWakeLock = useCallback(async () => {
    if (wakeLockEnabled) {
      setWakeLockEnabled(false);
      await wakeLock.current?.release();
      wakeLock.current = null;
      setWakeLockState("off");
      return;
    }
    const acquired = await requestWakeLock();
    setWakeLockEnabled(acquired);
  }, [requestWakeLock, wakeLockEnabled]);

  const toggleAlerts = useCallback(async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false);
      return;
    }
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
    }
    await audioContext.current.resume();
    playAlert(audioContext.current, "countdown");
    if ("Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      setNotificationState(permission);
    } else if ("Notification" in window) {
      setNotificationState(Notification.permission);
    }
    setAlertsEnabled(true);
  }, [alertsEnabled]);

  const togglePositionRunAlerts = useCallback(() => {
    setPositionRunAlerts((current) => {
      const next = !current;
      writeBoolean(RUN_ALERTS_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active) {
      previous.current = null;
      delivered.current.clear();
      return;
    }
    const current: FocusedDraftAlertState = {
      currentPick,
      picksUntilUser,
      isUserTurn,
      positionRunSignature: currentPositionRunSignature,
    };
    const events = buildFocusedDraftAlertEvents(previous.current, current, {
      positionRuns: positionRunAlerts,
    });
    previous.current = current;
    if (!alertsEnabled) return;

    events.forEach((event) => {
      if (delivered.current.has(event.id)) return;
      delivered.current.add(event.id);
      if (audioContext.current) {
        void audioContext.current.resume().then(() => {
          if (audioContext.current) playAlert(audioContext.current, event.sound);
        });
      }
      if ("Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(event.title, {
            body: event.body,
            tag: event.id,
            requireInteraction: event.tone === "urgent",
          });
        } catch {
          // Some mobile browsers expose Notification but require a service worker.
        }
      }
    });
  }, [
    active,
    alertsEnabled,
    currentPick,
    currentPositionRunSignature,
    isUserTurn,
    picksUntilUser,
    positionRunAlerts,
  ]);

  useEffect(() => {
    if (!wakeLockEnabled || !active) return;
    const reacquire = () => {
      if (document.visibilityState === "visible" && !wakeLock.current) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => document.removeEventListener("visibilitychange", reacquire);
  }, [active, requestWakeLock, wakeLockEnabled]);

  useEffect(() => {
    if (active) return;
    setAlertsEnabled(false);
    if (wakeLock.current) void wakeLock.current.release();
    wakeLock.current = null;
    setWakeLockEnabled(false);
    setWakeLockState("wakeLock" in navigator ? "off" : "unsupported");
  }, [active]);

  useEffect(
    () => () => {
      void wakeLock.current?.release();
      void audioContext.current?.close();
    },
    [],
  );

  return {
    alertsEnabled,
    notificationState,
    positionRunAlerts,
    wakeLockEnabled,
    wakeLockState,
    toggleAlerts,
    togglePositionRunAlerts,
    toggleWakeLock,
  };
}
