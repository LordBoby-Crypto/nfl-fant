export type TradeRecommendationFeedback = "helpful" | "not-helpful";

export type TradeFeedbackMap = Record<string, TradeRecommendationFeedback>;

export function tradeFeedbackStorageKey(leagueId: string, rosterId: number) {
  return `war-room.trade-feedback.v1.${leagueId}.${rosterId}`;
}

export function normalizeTradeFeedback(value: unknown): TradeFeedbackMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([id, feedback]) =>
          Boolean(id) && (feedback === "helpful" || feedback === "not-helpful"),
      )
      .slice(-100),
  );
}

export function visibleTradeRecommendationIds(
  opportunityIds: string[],
  feedback: TradeFeedbackMap,
) {
  return opportunityIds.filter((id) => feedback[id] !== "not-helpful");
}
