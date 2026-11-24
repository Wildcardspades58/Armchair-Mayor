// ============================================================================
// ARMCHAIR MAYOR — Left Panel: City Pulse & Active Laws (Zero Nested Scrollbars)
// - Top Card: Boiling Point Tension Meters (Crime, Transit, Sanitation: 0-100)
//   + Prominent PROCEED TO LEGISLATIVE DOCKET button.
// - Bottom Card: Compact, scannable 1-line Enacted Law Pills with full
//   details on hover tooltip and compact Repeal button.
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";
import { TensionKey } from "../types/simulation";
import { REPEAL_POLICY_CAPITAL_COST } from "../services/docketService";
import { soundEffects } from "../services/soundEffects";

const TENSION_LABELS: Record<TensionKey, { label: string; triggerHint: string }> = {
  Crime: {
    label: "Crime Tension",
    triggerHint: "Rises when District Crime exceeds 48 or Public Safety is underfunded",
  },
  Transit: {
    label: "Transit Tension",
    triggerHint: "Rises when District Traffic exceeds 50 or Infrastructure is underfunded",
  },
  Sanitation: {
    label: "Sanitation Tension",
    triggerHint: "Rises when District Pollution exceeds 45 or Environmental Bureau is underfunded",
  },
};

export const LeftVibeFeed: React.FC = () => {
  const enactedPolicies = useGameStore((s) => s.enactedPolicies);
  const tensions = useGameStore((s) => s.tensions);
  const monthlyDocket = useGameStore((s) => s.monthlyDocket);
  const politicalCapital = useGameStore((s) => s.voterSentiment.politicalCapital);
  const setCenterDeskTab = useGameStore((s) => s.setCenterDeskTab);
  const repealEnactedPolicy = useGameStore((s) => s.repealEnactedPolicy);

  const pendingDocketCount = monthlyDocket.filter(
    (i) => i.status === "PENDING"
  ).length;

  const canAffordRepeal = politicalCapital >= REPEAL_POLICY_CAPITAL_COST;

  return (
    <aside className="gov-left-panel" aria-label="City Pulse and Active Laws">
      {/* Top Card: Boiling Point Tensions (0-100) + Docket CTA */}
      <section className="gov-panel-section gov-tension-box">
        <div className="gov-section-header">
          <span className="gov-section-title">CITY PULSE // TENSIONS</span>
          <span className="gov-section-sub">100 = CRISIS</span>
        </div>

        <div className="gov-tension-list">
          {(Object.keys(TENSION_LABELS) as TensionKey[]).map((key) => {
            const val = tensions[key];
            const meta = TENSION_LABELS[key];
            const barClass =
              val >= 80
                ? "gov-bar-crimson"
                : val >= 55
                ? "gov-bar-amber"
                : "gov-bar-cyan";

            return (
              <div key={key} className="gov-tension-item" title={meta.triggerHint}>
                <div className="gov-tension-label-row">
                  <span className="gov-tension-name">{meta.label}</span>
                  <span
                    className={`gov-tension-val gov-num ${
                      val >= 80
                        ? "gov-text-crimson"
                        : val >= 55
                        ? "gov-text-amber"
                        : ""
                    }`}
                  >
                    {Math.round(val)}/100
                  </span>
                </div>
                <div className="gov-progress-track">
                  <div
                    className={`gov-progress-fill ${barClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="gov-quick-briefing-col">
          <button
            type="button"
            className="gov-btn-proceed-docket"
            onClick={() => {
              soundEffects.playUiClick();
              setCenterDeskTab("docket");
            }}
          >
            LEGISLATIVE DOCKET ({pendingDocketCount}/4 PENDING) &rarr;
          </button>
        </div>
      </section>

      {/* Bottom Card: Compact Scannable Enacted Law Pills (Zero Nested Scrollbars) */}
      <section className="gov-panel-section gov-feed-box gov-laws-compact-box">
        <div className="gov-section-header gov-laws-header-indigo">
          <span className="gov-section-title">
            ACTIVE ENACTED LAWS ({enactedPolicies.length})
          </span>
          <span className="gov-section-sub">HOVER FOR DETAILS</span>
        </div>

        {enactedPolicies.length === 0 ? (
          <div className="gov-empty-state">
            No active statutes yet. Vote on the Legislative Docket or issue an
            Executive Order to enact laws.
          </div>
        ) : (
          <div className="gov-law-pill-list">
            {enactedPolicies.slice(0, 9).map((pol) => {
              const budgetDelta = pol.budget_impact.monthly_change;
              const modsSummary = pol.heatmap_modifiers
                .map((m) => `${m.metric}: ${m.change > 0 ? `+${m.change}` : m.change}`)
                .join(", ");
              const fullTooltip = [
                `${pol.policy_name} (${pol.sourceLabel || `Month ${pol.enactedTurn}`})`,
                `Budget: ${budgetDelta >= 0 ? "+" : "-"}$${Math.abs(budgetDelta).toLocaleString()}/mo`,
                modsSummary ? `Effects: ${modsSummary}` : null,
                pol.originalPromptText ? `Decree: "${pol.originalPromptText}"` : null,
                pol.unintended_consequence_trigger
                  ? `Fallout: ${pol.unintended_consequence_trigger}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n");

              return (
                <div
                  key={pol.id}
                  className="gov-law-pill-item"
                  title={fullTooltip}
                >
                  <span className="gov-law-pill-title">{pol.policy_name}</span>
                  <div className="gov-law-pill-right">
                    <span
                      className={`gov-law-pill-budget gov-num ${
                        budgetDelta >= 0 ? "gov-text-emerald" : "gov-text-crimson"
                      }`}
                    >
                      {budgetDelta >= 0 ? "+" : "-"}$
                      {Math.round(Math.abs(budgetDelta) / 1000)}K
                    </span>
                    <button
                      type="button"
                      className="gov-law-pill-repeal"
                      disabled={!canAffordRepeal}
                      title={
                        canAffordRepeal
                          ? `Repeal "${pol.policy_name}" (-${REPEAL_POLICY_CAPITAL_COST} Capital)`
                          : `Need ${REPEAL_POLICY_CAPITAL_COST} Capital to repeal`
                      }
                      onClick={() => {
                        soundEffects.playUiClick();
                        repealEnactedPolicy(pol.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
            {enactedPolicies.length > 9 && (
              <div className="gov-eyebrow" style={{ textAlign: "center", paddingTop: "2px" }}>
                +{enactedPolicies.length - 9} more laws archived in Ledger
              </div>
            )}
          </div>
        )}
      </section>
    </aside>
  );
};
