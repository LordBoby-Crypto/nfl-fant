export interface StoredWarRoomSession {
  token: string;
  expiresAt: number;
}

export function validateWarRoomSession(
  value: unknown,
  now = Date.now(),
): StoredWarRoomSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<StoredWarRoomSession>;
  if (
    typeof session.token !== "string" ||
    !session.token ||
    typeof session.expiresAt !== "number" ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= now
  ) {
    return null;
  }
  return {
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
