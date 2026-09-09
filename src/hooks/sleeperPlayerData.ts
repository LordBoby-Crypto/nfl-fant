export function sleeperPlayerIdsKey(playerIds: string[]) {
  return [...new Set(playerIds.filter(Boolean))].sort().join(",");
}

export function hasCurrentSleeperPlayerData(
  loadedIdsKey: string,
  requestedIdsKey: string,
  active: boolean,
) {
  return !active || loadedIdsKey === requestedIdsKey;
}
