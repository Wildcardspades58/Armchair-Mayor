// ============================================================================
// GOVERNOR — Phase 2 (Step 3/4): Live Press & Citizen Town Hall Q&A Modal
// - Triggered by the "HOLD TOWN HALL" button on the Policy Desk.
// - WebLLM generates 2 sharp questions referencing the player's actual enacted
//   laws and struggling metrics.
// - The player types an open-ended response, and WebLLM grades the spin
//   (Authentic, Inspiring, Evasive, or Tone-Deaf), adjusting Approval & Capital.
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { gradeTownHallResponse } from "../services/webllmService";
import { TownHallGrade } from "../types/simulation";

const GRADE_BADGE_MAP: Record<TownHallGrade, string> = {
  Inspiring: "gov-badge-emerald",
  Authentic: "gov-badge-cyan",
  Evasive: "gov-badge-amber",
  "Tone-Deaf": "gov-badge-crimson",
};

export const TownHallModal: React.FC = () => {
  const townHall = useGameStore((s) => s.townHall);
  const closeTownHallSession = useGameStore((s) => s.closeTownHallSession);
  const applyTownHallGradingResult = useGameStore(
    (s) => s.applyTownHallGradingResult
  );

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [answerText, setAnswerText] = useState("");
  const [isGrading, setIsGrading] = useState(false);

  if (!townHall.isOpen) return null;

  const activeQuestion = townHall.questions[selectedIdx] ?? townHall.questions[0];

  const handleSubmitSpin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = answerText.trim();
    if (!trimmed || !activeQuestion || isGrading || townHall.usedThisTurn) {
      return;
    }

    setIsGrading(true);
    try {
      const result = await gradeTownHallResponse(activeQuestion, trimmed);
      applyTownHallGradingResult(result, activeQuestion.question, trimmed);
      setAnswerText("");
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="gov-modal-backdrop" onClick={closeTownHallSession}>
      <div
        className="gov-modal-card gov-briefing-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gov-modal-header">
          <span className="gov-badge gov-badge-cyan">
            LIVE PRESS &amp; CITIZEN TOWN HALL // OPEN MIC
          </span>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={closeTownHallSession}
          >
            CLOSE [X]
          </button>
        </div>

        <h2 className="gov-modal-title">CITY HALL PRESS &amp; CITIZEN Q&amp;A</h2>

        {townHall.isLoading ? (
          <div className="gov-crisis-loading">
            <div className="gov-spinner" />
            <span>
              Convening reporters and neighborhood delegates (referencing your
              laws &amp; metrics)...
            </span>
          </div>
        ) : townHall.lastResult ? (
          <div className="gov-townhall-result-card">
            <div className="gov-modal-header">
              <span className="gov-eyebrow">PRESS &amp; CROWD VERDICT</span>
              <span
                className={`gov-badge ${
                  GRADE_BADGE_MAP[townHall.lastResult.grade]
                }`}
              >
                SPIN GRADE: {townHall.lastResult.grade.toUpperCase()}
              </span>
            </div>

            <p className="gov-modal-desc" style={{ marginTop: "6px" }}>
              {townHall.lastResult.commentary}
            </p>

            <div className="gov-modifier-chip-row" style={{ marginTop: "8px" }}>
              <span
                className={`gov-chip ${
                  townHall.lastResult.approval_change >= 0
                    ? "gov-text-emerald"
                    : "gov-text-crimson"
                }`}
              >
                Overall Approval:{" "}
                {townHall.lastResult.approval_change >= 0 ? "+" : ""}
                {townHall.lastResult.approval_change}%
              </span>
              <span
                className={`gov-chip ${
                  townHall.lastResult.capital_change >= 0
                    ? "gov-text-emerald"
                    : "gov-text-crimson"
                }`}
              >
                Political Capital:{" "}
                {townHall.lastResult.capital_change >= 0 ? "+" : ""}
                {townHall.lastResult.capital_change} CAP
              </span>
            </div>

            <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="gov-btn-enact"
                onClick={closeTownHallSession}
              >
                RETURN TO DESK
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="gov-modal-desc">
              Select a tough question from the floor and deliver an open-ended
              response. The AI Press Panel will grade your spin as{" "}
              <strong>Authentic</strong>, <strong>Inspiring</strong>,{" "}
              <strong>Evasive</strong>, or <strong>Tone-Deaf</strong>.
            </p>

            {/* 2 Sharp Questions */}
            <div className="gov-townhall-q-list">
              {townHall.questions.map((q, idx) => {
                const isSelected = idx === selectedIdx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`gov-townhall-q-card ${
                      isSelected ? "active" : ""
                    }`}
                    onClick={() => setSelectedIdx(idx)}
                  >
                    <div className="gov-townhall-q-top">
                      <strong>{q.speaker}</strong>
                      <span className="gov-badge gov-badge-muted">{q.role}</span>
                    </div>
                    <p className="gov-townhall-q-text">&ldquo;{q.question}&rdquo;</p>
                  </button>
                );
              })}
            </div>

            {/* Open-Ended Player Response Form */}
            {activeQuestion && (
              <form className="gov-crisis-custom-box" onSubmit={handleSubmitSpin}>
                <span className="gov-eyebrow">
                  YOUR SPOKEN RESPONSE TO {activeQuestion.speaker.toUpperCase()}
                </span>
                <div className="gov-terminal-input-row">
                  <input
                    type="text"
                    className="gov-policy-input"
                    placeholder="Type your candid explanation, pledge, or political spin..."
                    value={answerText}
                    maxLength={200}
                    disabled={isGrading}
                    onChange={(e) => setAnswerText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="gov-btn-enact"
                    disabled={!answerText.trim() || isGrading}
                  >
                    {isGrading ? "GRADING SPIN..." : "DELIVER RESPONSE"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
