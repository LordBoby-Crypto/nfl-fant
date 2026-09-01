export function warRoomScoringLoadKey(
  scoringContext: { fingerprint?: string } | null,
) {
  return scoringContext?.fingerprint ?? null;
}
