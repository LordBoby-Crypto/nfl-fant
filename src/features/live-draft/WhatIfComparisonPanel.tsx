import {
  AlertTriangle,
  Check,
  GitCompareArrows,
  ShieldAlert,
  TrendingDown,
  UsersRound,
  X,
} from "lucide-react";
import type { PlayerIntelligence } from "../player-intelligence/model.ts";
import type { WhatIfComparison } from "./whatIfComparison.ts";

function number(value: number | null, digits = 0) {
  return value === null ? "—" : value.toFixed(digits);
}

export function ComparePlayerButton({
  player,
  selected,
  disabled,
  onToggle,
}: {
  player: PlayerIntelligence;
  selected: boolean;
  disabled: boolean;
  onToggle: (playerId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`compare-player-button ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      disabled={disabled && !selected}
      title={disabled && !selected ? "Remove a player before adding another" : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(player.id);
      }}
    >
      {selected ? <Check /> : <GitCompareArrows />}
      {selected ? "Comparing" : "Compare"}
    </button>
  );
}

export function WhatIfComparisonPanel({
  selectedPlayers,
  comparison,
  onRemove,
  onClear,
}: {
  selectedPlayers: PlayerIntelligence[];
  comparison: WhatIfComparison | null;
  onRemove: (playerId: string) => void;
  onClear: () => void;
}) {
  return (
    <section className="what-if-panel" aria-labelledby="what-if-title">
      <header>
        <span className="what-if-icon"><GitCompareArrows /></span>
        <div>
          <h2 id="what-if-title">What-If Player Comparison</h2>
          <p>
            Test 2–4 available players without committing a pick. Every option
            recalculates your roster and projected next recommendation.
          </p>
        </div>
        <strong>{selectedPlayers.length}/4 selected</strong>
        {selectedPlayers.length ? (
          <button type="button" className="button subtle" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </header>

      <div className="what-if-selection-tray" aria-live="polite">
        {selectedPlayers.map((player) => (
          <span key={player.id}>
            <b className={`position-mark position-${player.position.toLowerCase()}`}>
              {player.position}
            </b>
            <strong>{player.name}</strong>
            <button
              type="button"
              aria-label={`Remove ${player.name} from comparison`}
              onClick={() => onRemove(player.id)}
            >
              <X />
            </button>
          </span>
        ))}
        {!selectedPlayers.length ? (
          <p>Use a <strong>Compare</strong> button beside any available player.</p>
        ) : selectedPlayers.length === 1 ? (
          <p>Select one more available player to create the side-by-side forecast.</p>
        ) : null}
      </div>

      {comparison && comparison.scenarios.length >= 2 ? (
        <>
          <section className="what-if-verdict">
            <Check />
            <span>
              <strong>Best modeled choice at pick {comparison.selectionPick}</strong>
              <p>{comparison.winnerExplanation}</p>
            </span>
          </section>
          <div className="what-if-grid">
            {comparison.scenarios.map((scenario) => (
              <article
                key={scenario.player.id}
                className={`what-if-card ${scenario.player.id === comparison.winnerId ? "is-winner" : ""}`}
              >
                <header>
                  <span className="what-if-rank">#{scenario.comparisonRank}</span>
                  <span className={`position-mark position-${scenario.player.position.toLowerCase()}`}>
                    {scenario.player.position}
                  </span>
                  <span>
                    <strong>{scenario.player.name}</strong>
                    <small>
                      {scenario.player.team} · Overall #{number(scenario.player.leagueRank ?? scenario.player.ecr)} · Tier {number(scenario.player.leagueTier ?? scenario.player.tier)}
                    </small>
                  </span>
                  <span className="what-if-score">
                    <strong>{scenario.selectionScore}</strong>
                    <small>roster value</small>
                  </span>
                </header>

                <div className="what-if-key-metrics">
                  <span>
                    <small>Survives next turn</small>
                    <strong>{scenario.survivalProbability === null ? "Pending" : `${scenario.survivalProbability}%`}</strong>
                    <em>{scenario.waitLabel}</em>
                  </span>
                  <span>
                    <small>Expected starters</small>
                    <strong>{scenario.roster.startersFilled}/{scenario.roster.starterSlots}</strong>
                    <em>{scenario.roster.openStarterSlots} still open</em>
                  </span>
                  <span>
                    <small>Bench depth</small>
                    <strong>{scenario.roster.benchDepth}</strong>
                    <em>{scenario.player.position} depth: {scenario.roster.positionCount}</em>
                  </span>
                  <span>
                    <small>Risk</small>
                    <strong>{scenario.recommendation?.risk ?? "—"}</strong>
                    <em>{scenario.excessiveDepth ? "Excessive depth" : "Depth remains balanced"}</em>
                  </span>
                </div>

                <section className={`what-if-depth ${scenario.excessiveDepth ? "is-warning" : "is-safe"}`}>
                  {scenario.excessiveDepth ? <ShieldAlert /> : <UsersRound />}
                  <span>
                    <strong>{scenario.excessiveDepth ? "Positional depth warning" : "Roster projection"}</strong>
                    <small>{scenario.depthExplanation}</small>
                    <em>
                      {scenario.roster.openNeeds.length
                        ? `Open: ${scenario.roster.openNeeds.join(" · ")}`
                        : "All modeled starting needs filled"}
                    </em>
                  </span>
                </section>

                <section className="what-if-consequences">
                  <p><strong>Tier consequence:</strong> {scenario.tierConsequence}</p>
                  <p><strong>Replacement consequence:</strong> {scenario.replacementConsequence}</p>
                </section>

                <section className="what-if-next-pick">
                  <GitCompareArrows />
                  <span>
                    <small>Predicted recommendation after this choice</small>
                    <strong>
                      {scenario.nextRecommendation
                        ? `${scenario.nextRecommendation.player.name} · ${scenario.nextRecommendation.score} roster value`
                        : "No later recommendation"}
                    </strong>
                    <em>
                      {scenario.nextUserPick
                        ? `Projected for your next turn at pick ${scenario.nextUserPick}`
                        : "No later user pick is currently assigned"}
                    </em>
                  </span>
                </section>

                {scenario.weakerByWaiting.length ? (
                  <section className="what-if-wait-risks">
                    <header><TrendingDown /><strong>Positions weaker by waiting</strong></header>
                    {scenario.weakerByWaiting.map((item) => (
                      <span key={item.position}>
                        <b>{item.position}</b>
                        <small>
                          {item.bestNow} → {item.likelyNext}
                          {item.rankDrop === null ? "" : ` · ${item.rankDrop}-rank drop`}
                          {item.tierDrop === null ? "" : ` · ${item.tierDrop}-tier drop`}
                        </small>
                        <em className={`is-${item.risk.toLowerCase().replace(" ", "-")}`}>
                          {item.risk}
                        </em>
                      </span>
                    ))}
                  </section>
                ) : (
                  <section className="what-if-wait-pending">
                    <AlertTriangle /> Position wait risk is pending until a later draft turn is assigned.
                  </section>
                )}

                <p className="what-if-explanation">{scenario.explanation}</p>

                <details className="what-if-score-details">
                  <summary>Side-by-side score effects</summary>
                  <div>
                    <section className="is-positive">
                      <strong>Positive effects</strong>
                      {scenario.positiveFactors.map((item) => (
                        <span key={item.key}>
                          <b>+{item.score.toFixed(1)}</b>
                          <small>{item.label} · {item.value}</small>
                        </span>
                      ))}
                      {!scenario.positiveFactors.length ? <p>No positive effects.</p> : null}
                    </section>
                    <section className="is-negative">
                      <strong>Negative effects</strong>
                      {scenario.negativeFactors.map((item) => (
                        <span key={item.key}>
                          <b>{item.score.toFixed(1)}</b>
                          <small>{item.label} · {item.value}</small>
                        </span>
                      ))}
                      {!scenario.negativeFactors.length ? <p>No negative effects.</p> : null}
                    </section>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
