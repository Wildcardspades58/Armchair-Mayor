// ============================================================================
// ARMCHAIR MAYOR — Right Panel: Stakeholder & Press Pulse (Zero Nested Scrollbars)
// - Top Card: Non-scrolling 4-Bloc Demographic Approval Meters + Fiscal & Doctrine Summary
// - Bottom Card: Quick-Launch Chambers & Analytics (Doctrines, Cabinet 5, Charts/Compass)
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";
import { Demographic } from "../types/simulation";
import { soundEffects } from "../services/soundEffects";

const STAKEHOLDER_BLOCS: Array<{ key: Demographic; label: string; icon: string }> = [
  { key: "working_class", label: "Working Class", icon: "🛠️" },
  { key: "wealthy", label: "Wealthy & Landowners", icon: "🏛️" },
  { key: "business", label: "Business & Commerce", icon: "💼" },
  { key: "environmentalists", label: "Green Coalition", icon: "🌱" },
];

export const RightDepartmentHeads: React.FC = () => {
  const demographics = useGameStore((s) => s.voterSentiment.demographics);
  const treasury = useGameStore((s) => s.treasury);
  const doctrines = useGameStore((s) => s.doctrines);
  const departmentHeads = useGameStore((s) => s.departmentHeads);
  const setShowDoctrinesModal = useGameStore((s) => s.setShowDoctrinesModal);
  const setShowCabinetModal = useGameStore((s) => s.setShowCabinetModal);
  const setShowCityReportModal = useGameStore((s) => s.setShowCityReportModal);

  const leakRiskCount = Object.values(departmentHeads).filter(
    (d) => d && d.loyalty < 35
  ).length;
  const vacantCount = Object.values(departmentHeads).filter((d) => !d).length;

  return (
    <aside className="gov-right-panel" aria-label="Stakeholder and Press Pulse">
      {/* 1. Stakeholder Pulse: 4-Bloc Approval Meters + Fiscal Summary */}
      <section className="gov-panel-section gov-doctrines-panel">
        <div className="gov-section-header">
          <span className="gov-section-title">STAKEHOLDER PULSE</span>
          <span className="gov-section-sub">4 BLOCS</span>
        </div>

        <div className="gov-tension-list">
          {STAKEHOLDER_BLOCS.map((bloc) => {
            const val = demographics[bloc.key].approval;
            const barClass =
              val >= 55
                ? "gov-bar-emerald"
                : val >= 38
                ? "gov-bar-amber"
                : "gov-bar-crimson";

            return (
              <div key={bloc.key} className="gov-tension-item">
                <div className="gov-tension-label-row">
                  <span className="gov-tension-name">
                    {bloc.icon} {bloc.label}
                  </span>
                  <span
                    className={`gov-tension-val gov-num ${
                      val >= 55
                        ? "gov-text-emerald"
                        : val >= 38
                        ? "gov-text-amber"
                        : "gov-text-crimson"
                    }`}
                  >
                    {Math.round(val)}%
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

        {/* Compact Fiscal & Doctrine Summary */}
        <div className="gov-stakeholder-fiscal-box">
          <div className="gov-math-row">
            <span>Monthly Revenue</span>
            <strong className="gov-text-emerald gov-num">
              +${Math.round(treasury.monthlyRevenue / 1000)}K
            </strong>
          </div>
          <div className="gov-math-row">
            <span>Monthly Expenses</span>
            <strong className="gov-text-crimson gov-num">
              -${Math.round(treasury.monthlyExpenses / 1000)}K
            </strong>
          </div>
          <div className="gov-math-row">
            <span>Net Cashflow</span>
            <strong
              className={`gov-num ${
                treasury.monthlyNet >= 0 ? "gov-text-emerald" : "gov-text-crimson"
              }`}
            >
              {treasury.monthlyNet >= 0 ? "+" : "-"}$
              {Math.round(Math.abs(treasury.monthlyNet) / 1000)}K/mo
            </strong>
          </div>
          <div className="gov-modifier-chip-row" style={{ marginTop: "4px" }}>
            <span className="gov-chip">{doctrines.fiscal}</span>
            <span className="gov-chip">{doctrines.justice}</span>
            <span className="gov-chip">{doctrines.urban}</span>
          </div>
        </div>
      </section>

      {/* 2. Executive Chambers & Analytics Quick-Launch Card */}
      <section className="gov-panel-section gov-dept-section">
        <div className="gov-section-header">
          <span className="gov-section-title">EXECUTIVE CHAMBERS</span>
          <span className="gov-section-sub">QUICK LAUNCH</span>
        </div>

        <div className="gov-chamber-launch-stack">
          <button
            type="button"
            className="gov-chamber-launch-btn is-doctrines"
            onClick={() => {
              soundEffects.playUiClick();
              setShowDoctrinesModal(true);
            }}
          >
            <div>
              <strong>⚖️ GOVERNING DOCTRINES</strong>
              <span>Shift Fiscal, Justice &amp; Climate stances</span>
            </div>
            <span className="gov-badge gov-badge-emerald">OPEN</span>
          </button>

          <button
            type="button"
            className="gov-chamber-launch-btn is-cabinet"
            onClick={() => {
              soundEffects.playUiClick();
              setShowCabinetModal(true);
            }}
          >
            <div>
              <strong>👥 CABINET CHAMBER (5 DIRECTORS)</strong>
              <span>
                {leakRiskCount > 0
                  ? `${leakRiskCount} low-loyalty leak risk`
                  : vacantCount > 0
                  ? `${vacantCount} vacant seat(s) to hire`
                  : "All 5 directors active & staffed"}
              </span>
            </div>
            <span
              className={`gov-badge ${
                leakRiskCount > 0 || vacantCount > 0
                  ? "gov-badge-crimson"
                  : "gov-badge-cyan"
              }`}
            >
              {leakRiskCount > 0 ? "ALERT" : "MANAGE"}
            </span>
          </button>

          <button
            type="button"
            className="gov-chamber-launch-btn is-analytics"
            onClick={() => {
              soundEffects.playUiClick();
              setShowCityReportModal(true);
            }}
          >
            <div>
              <strong>📊 CHARTS &amp; POLITICAL COMPASS</strong>
              <span>12-month sparklines &amp; ideological profile</span>
            </div>
            <span className="gov-badge gov-badge-cyan">VIEW</span>
          </button>
        </div>
      </section>
    </aside>
  );
};
