// ============================================================================
// GOVERNOR — Synchronous Between-Turn AI Processing Modal
// Displays a Fabledom-styled End-of-Month Simulation & Press Briefing Overlay
// with an animated progress bar and live status steps while WebLLM completes
// all generation before revealing the new month.
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";

const PIPELINE_STEPS = [
  { pct: 25, label: "Calculating Fiscal & District Spillover..." },
  { pct: 55, label: "Evaluating Public Debate on Sponsored Bills & Active Laws..." },
  { pct: 80, label: "Writing The Municipal Dispatch Front-Page Fallout..." },
  { pct: 100, label: "Drafting Next Month's Law-Aware Legislative Docket..." },
];

export const TurnProcessingModal: React.FC = () => {
  const progress = useGameStore((s) => s.turnTransitionProgress);

  if (!progress.isOpen) return null;

  return (
    <div className="gov-modal-backdrop" role="dialog" aria-modal="true" aria-label="End-of-Month Simulation & Press Briefing">
      <div className="gov-modal-card gov-turn-processing-card">
        <div className="gov-modal-eyebrow gov-text-cyan">
          END-OF-MONTH SIMULATION &amp; PRESS BRIEFING
        </div>
        <h2 className="gov-modal-title">CONVENING NEXT MONTH’S COUNCIL</h2>
        <p className="gov-modal-desc">{progress.subLabel}</p>

        <div className="gov-turn-progress-track">
          <div
            className="gov-turn-progress-fill"
            style={{ width: `${Math.min(100, Math.max(5, progress.pct))}%` }}
          />
        </div>

        <div className="gov-turn-progress-meta">
          <strong>{progress.stepLabel}</strong>
          <span>{progress.pct}%</span>
        </div>

        <div className="gov-turn-steps-checklist">
          {PIPELINE_STEPS.map((st) => {
            const isDone = progress.pct > st.pct;
            const isCurrent = progress.pct === st.pct;
            return (
              <div
                key={st.pct}
                className={`gov-turn-step-row ${
                  isDone ? "is-done" : isCurrent ? "is-current" : ""
                }`}
              >
                <span className="gov-turn-step-icon">
                  {isDone ? "✓" : isCurrent ? "●" : "○"}
                </span>
                <span>{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
