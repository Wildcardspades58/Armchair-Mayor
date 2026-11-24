// ============================================================================
// ARMCHAIR MAYOR — Synchronous Between-Turn AI Processing Modal
// Displays a Fabledom-styled End-of-Month Simulation & Press Briefing Overlay
// with an animated progress bar, live elapsed timer, and rotating satirical
// ticker so WebLLM generation never appears frozen.
// ============================================================================

import React, { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

const PIPELINE_STEPS = [
  { pct: 20, label: "Calculating Fiscal & 6-Pillar Spillover..." },
  { pct: 40, label: "Evaluating Public Debate on Sponsored Bills & Active Laws..." },
  { pct: 65, label: "Drafting Next Month's 4 Law-Aware Legislative Docket Issues..." },
  { pct: 85, label: "Writing The Municipal Dispatch Front-Page Satire..." },
  { pct: 100, label: "Convening City Council..." },
];

const SATIRICAL_WAIT_TICKERS = [
  "Typesetters arguing over headline font sizes...",
  "City Comptroller double-checking receipts behind the filing cabinet...",
  "Lobbyists queuing outside Chamber B with lukewarm pastries...",
  "Rival newspaper editors sharpening their red pens...",
  "Precinct dispatchers tallying late-night noise complaints...",
];

export const TurnProcessingModal: React.FC = () => {
  const progress = useGameStore((s) => s.turnTransitionProgress);
  const [displayPct, setDisplayPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [tickerIdx, setTickerIdx] = useState(0);

  useEffect(() => {
    if (!progress.isOpen) {
      setDisplayPct(0);
      setElapsedSec(0);
      setTickerIdx(0);
      return;
    }

    setDisplayPct((prev) => Math.max(prev, progress.pct));

    const pctTimer = window.setInterval(() => {
      setDisplayPct((prev) => {
        const cap = Math.min(98, progress.pct + 18);
        if (prev < progress.pct) return progress.pct;
        return prev < cap ? prev + 1 : prev;
      });
    }, 400);

    const secTimer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
      setTickerIdx((i) => (i + 1) % SATIRICAL_WAIT_TICKERS.length);
    }, 1000);

    return () => {
      window.clearInterval(pctTimer);
      window.clearInterval(secTimer);
    };
  }, [progress.isOpen, progress.pct]);

  if (!progress.isOpen) return null;

  return (
    <div
      className="gov-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="End-of-Month Simulation & Press Briefing"
    >
      <div className="gov-modal-card gov-turn-processing-card">
        <div className="gov-modal-header">
          <div className="gov-modal-eyebrow gov-text-cyan">
            END-OF-MONTH SIMULATION &amp; PRESS BRIEFING
          </div>
          <span className="gov-badge gov-badge-muted">
            ELAPSED: {elapsedSec}S
          </span>
        </div>
        <h2 className="gov-modal-title">CONVENING NEXT MONTH’S COUNCIL</h2>
        <p className="gov-modal-desc">
          {progress.subLabel || SATIRICAL_WAIT_TICKERS[tickerIdx]}
        </p>

        <div className="gov-turn-progress-track">
          <div
            className="gov-turn-progress-fill"
            style={{ width: `${Math.min(99, Math.max(5, displayPct))}%` }}
          />
        </div>

        <div className="gov-turn-progress-meta">
          <strong>{progress.stepLabel}</strong>
          <span>{Math.min(99, displayPct)}%</span>
        </div>

        <div className="gov-eyebrow" style={{ fontStyle: "italic" }}>
          {SATIRICAL_WAIT_TICKERS[tickerIdx]}
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
