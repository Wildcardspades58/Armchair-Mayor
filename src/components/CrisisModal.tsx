// ============================================================================
// GOVERNOR — Step 3, 4 & Bonus Step 2: Boiling Point Crisis Modal,
// Exogenous Wildcard Modal & Custom Crisis Resolution Validation Engine
// - Displays the 3 pre-generated choices (where Option 3 is the default
//   Band-aid / Worst Consequences fallback).
// - Below the 3 options, renders the "Propose Custom Solution" input box and
//   "Submit" button wired to `validateAndApplyCustomCrisisSolution()`.
// - If `is_valid_solution` is FALSE: displays `rejection_reason` in red text
//   above the input box, decrements `crisisAttemptsRemaining` (from 2), and
//   if `crisisAttemptsRemaining` hits 0, forces Gridlock by automatically
//   applying Option 3 and closing the modal.
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { AICrisisChoice } from "../types/simulation";
import {
  clampAndApplyCrisisChoice,
  validateAndApplyCustomCrisisSolution,
} from "../services/crisisEngine";

export const CrisisModal: React.FC = () => {
  const activeCrisis = useGameStore((s) => s.activeCrisis);
  const crisisAttemptsRemaining = useGameStore(
    (s) => s.crisisAttemptsRemaining
  );
  const crisisRejectionReason = useGameStore((s) => s.crisisRejectionReason);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const gameOverTitle = useGameStore((s) => s.gameOverTitle);
  const legacyChronicle = useGameStore((s) => s.legacyChronicle);
  const managerTitle = useGameStore((s) => s.managerTitle);
  const culturePoints = useGameStore((s) => s.culturePoints);
  const electionCampaign = useGameStore((s) => s.electionCampaign);
  const dismissElectionVictoryModal = useGameStore(
    (s) => s.dismissElectionVictoryModal
  );
  const initializeCity = useGameStore((s) => s.initializeCity);
  const legacy = useGameStore((s) => s.legacy);
  const treasury = useGameStore((s) => s.treasury);
  const time = useGameStore((s) => s.time);

  const [customSolutionText, setCustomSolutionText] = useState("");
  const [isValidatingCustom, setIsValidatingCustom] = useState(false);

  // 0. Step 5.3: Election Victory Modal
  if (electionCampaign.showVictoryModal && !gameOverReason) {
    return (
      <div className="gov-modal-backdrop">
        <div
          className="gov-modal-card"
          style={{ borderColor: "var(--accent-emerald)" }}
        >
          <div className="gov-modal-eyebrow gov-text-emerald">
            ELECTION DAY VICTORY — STARTING TERM #{electionCampaign.termNumber}
          </div>
          <h2 className="gov-modal-title">RE-ELECTED BY THE VOTERS!</h2>
          <p className="gov-modal-desc">
            You defeated challenger{" "}
            <strong>{electionCampaign.challenger.name}</strong> (
            {electionCampaign.playerPollingPct.toFixed(1)}% to{" "}
            {electionCampaign.challenger.pollingPct.toFixed(1)}%). Turn counter
            has been reset to Turn 1 for your new term while your entire 10x10
            City Grid, Treasury reserves, and Legacy continue forward!
          </p>

          <div className="gov-legacy-summary-box">
            <div>
              <span className="gov-eyebrow">CURRENT OFFICE</span>
              <strong className="gov-text-cyan">{time.currentOffice}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">MANAGER REPUTATION TITLE</span>
              <strong className="gov-text-emerald">{managerTitle}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">PRESERVED TREASURY</span>
              <strong>${treasury.reserves.toLocaleString()}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">TERRITORIAL POPULATION</span>
              <strong>
                {legacy.population.toLocaleString()} (Tier {legacy.populationTier})
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="gov-btn-enact"
            onClick={dismissElectionVictoryModal}
          >
            BEGIN TERM #{electionCampaign.termNumber} (TURN 1)
          </button>
        </div>
      </div>
    );
  }

  // 1. Hard Fail State (Bankruptcy / Recall Election) or Regular Election Defeat Overlay
  // Suppressed when LegacyChronicleModal is open so the End-of-Term Chronicle is the single payoff.
  if (gameOverReason && !legacyChronicle.isOpen) {
    return (
      <div className="gov-modal-backdrop">
        <div className="gov-modal-card gov-gameover-card">
          <div className="gov-modal-eyebrow gov-text-crimson">
            GAME OVER — ADMINISTRATION TERMINATED ON TURN {time.turn}
          </div>
          <h2 className="gov-modal-title">
            {gameOverTitle || "ADMINISTRATION OUSTED"}
          </h2>
          <p className="gov-modal-desc">{gameOverReason}</p>

          <div className="gov-legacy-summary-box">
            <div>
              <span className="gov-eyebrow">FINAL OFFICE HELD</span>
              <strong>{time.currentOffice}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">MANAGER REPUTATION TITLE</span>
              <strong className="gov-text-cyan">{managerTitle}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">FINAL POPULATION</span>
              <strong>
                {legacy.population.toLocaleString()} (Tier {legacy.populationTier})
              </strong>
            </div>
            <div>
              <span className="gov-eyebrow">CULTURE ALIGNMENT VECTOR</span>
              <strong>
                Austerity: {culturePoints.Austerity} | Progressive:{" "}
                {culturePoints.Progressive} | Corporate: {culturePoints.Corporate}
              </strong>
            </div>
          </div>

          <button
            type="button"
            className="gov-btn-enact"
            onClick={() => initializeCity()}
          >
            LAUNCH NEW CAMPAIGN (ROLL NEW CITY)
          </button>
        </div>
      </div>
    );
  }

  // 2. Boiling Point Crisis & Exogenous Wildcard Modal
  if (!activeCrisis) {
    return null;
  }

  const handleSelectChoice = (choice: AICrisisChoice) => {
    setCustomSolutionText("");
    clampAndApplyCrisisChoice(
      choice,
      activeCrisis.tensionTriggered,
      activeCrisis.crisis_name
    );
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customSolutionText.trim();
    if (!trimmed || isValidatingCustom) return;

    setIsValidatingCustom(true);
    try {
      const result = await validateAndApplyCustomCrisisSolution(trimmed);
      if (result.is_valid_solution) {
        setCustomSolutionText("");
      }
    } finally {
      setIsValidatingCustom(false);
    }
  };

  return (
    <div className="gov-modal-backdrop">
      <div className="gov-modal-card">
        <div className="gov-modal-header">
          <span
            className={`gov-badge ${
              activeCrisis.isWildcard ? "gov-badge-amber" : "gov-badge-crimson"
            }`}
          >
            {activeCrisis.isWildcard
              ? "EXOGENOUS WILDCARD SCENARIO (MACRO REAL-WORLD SHOCK)"
              : `BOILING POINT REACHED (100/100): ${activeCrisis.tensionTriggered.toUpperCase()} TENSION`}
          </span>
          <span className="gov-modal-turn-lock">SIMULATION PAUSED</span>
        </div>

        <h2 className="gov-modal-title">{activeCrisis.crisis_name}</h2>
        <p className="gov-modal-desc">{activeCrisis.description}</p>

        {activeCrisis.isGenerating || !activeCrisis.choices ? (
          <div className="gov-crisis-loading">
            <div className="gov-spinner" />
            <span>
              Synthesizing &amp; Clamping 3 Distinct Mathematical Crisis Options...
            </span>
          </div>
        ) : (
          <>
            <div className="gov-crisis-choices-grid">
              {activeCrisis.choices.map((choice: AICrisisChoice, idx: number) => {
                return (
                  <div key={`crisis-opt-${idx}`} className="gov-crisis-choice-card">
                    <div>
                      <div className="gov-eyebrow">
                        {idx === 2
                          ? "OPTION #3 (DEFAULT GRIDLOCK / WORST FALLBACK)"
                          : `EXECUTIVE RESPONSE OPTION #${idx + 1}`}
                      </div>
                      <div className="gov-choice-title">{choice.option_label}</div>
                    </div>

                    {/* Clamped Mathematical Breakdown (Clamped: ±$250k, ±30 Heatmap, ±20% Approval) */}
                    <div className="gov-choice-math-box">
                      <div className="gov-math-row">
                        <span>Monthly Budget Impact:</span>
                        <strong
                          className={
                            choice.budget_impact.monthly_change >= 0
                              ? "gov-text-emerald"
                              : "gov-text-crimson"
                          }
                        >
                          {choice.budget_impact.monthly_change >= 0 ? "+" : ""}$
                          {choice.budget_impact.monthly_change.toLocaleString()}/mo
                        </strong>
                      </div>

                      <div className="gov-modifier-chip-row">
                        {choice.heatmap_modifiers.map((hm, hIdx) => (
                          <span key={`${hm.metric}-${hIdx}`} className="gov-chip">
                            {hm.metric}: {hm.change > 0 ? `+${hm.change}` : hm.change}
                          </span>
                        ))}
                        {choice.demographic_approval.map((dm, dIdx) => (
                          <span key={`${dm.demographic}-${dIdx}`} className="gov-chip">
                            {dm.demographic}:{" "}
                            {dm.change > 0 ? `+${dm.change}%` : `${dm.change}%`}
                          </span>
                        ))}
                      </div>

                      <div className="gov-choice-fallout">
                        {activeCrisis.isWildcard
                          ? "Exogenous Macro Response (6-Turn Cooldown Active)"
                          : `Resets ${activeCrisis.tensionTriggered} Tension Meter to 0/100`}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="gov-btn-choice-exec"
                      disabled={isValidatingCustom}
                      onClick={() => handleSelectChoice(choice)}
                    >
                      {choice.option_label}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Bonus Step 2: Custom Crisis Solution Input & Validation Pipeline */}
            <form
              className="gov-crisis-custom-box"
              onSubmit={handleCustomSubmit}
            >
              <div className="gov-crisis-custom-header">
                <span className="gov-eyebrow">
                  PROPOSE CUSTOM SOLUTION (LLM CONSTITUTIONAL &amp; RELEVANCE VALIDATION)
                </span>
                <span className="gov-badge gov-badge-amber">
                  ATTEMPTS BEFORE OPTION #3 GRIDLOCK: {crisisAttemptsRemaining}
                </span>
              </div>

              {/* Rejection Reason displayed in red text above the input box */}
              {crisisRejectionReason && (
                <div className="gov-crisis-rejection-banner" role="alert">
                  REJECTED: {crisisRejectionReason} (1 attempt remaining before
                  mandatory Option #3 Gridlock!)
                </div>
              )}

              <div className="gov-terminal-input-row">
                <input
                  type="text"
                  className="gov-policy-input"
                  placeholder="Propose Custom Solution (must realistically address this specific crisis)..."
                  value={customSolutionText}
                  maxLength={140}
                  disabled={isValidatingCustom}
                  onChange={(e) => setCustomSolutionText(e.target.value)}
                />
                <button
                  type="submit"
                  className="gov-btn-enact"
                  disabled={!customSolutionText.trim() || isValidatingCustom}
                >
                  {isValidatingCustom ? "VALIDATING..." : "SUBMIT"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
