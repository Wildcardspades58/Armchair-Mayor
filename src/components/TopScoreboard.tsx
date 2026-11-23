// ============================================================================
// GOVERNOR — Step 4, 5.1 & 5.2: Top Scoreboard HUD
// - Displays Political Survival (Approval, Political Capital, Election Countdown),
//   Treasury Reserves & Monthly Net, and Legacy & Growth.
// - Step 5.2: Displays the dynamic Manager Culture Title ("The Austerity Mayor",
//   "The Green Technocrat", "The Industrial Populist", "The Deficit Spender")
//   prominently next to the player's office/name, plus live Culture Vector points.
// - Step 5.1: Renders a flashing red danger banner when the player is 1 turn away
//   from Bankruptcy (State Takeover) or a Recall Election (Voter Revolt).
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { Demographic } from "../types/simulation";
import { RollingNumber } from "./RollingNumber";
import { soundEffects } from "../services/soundEffects";

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const DEMOGRAPHIC_LABELS: Record<Demographic, string> = {
  working_class: "Working Class",
  wealthy: "Wealthy Elite",
  business: "Business Sector",
  environmentalists: "Environmentalists",
};

const formatCurrency = (val: number): string => {
  const sign = val < 0 ? "-" : "";
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)}K`;
  }
  return `${sign}$${abs}`;
};

export const TopScoreboard: React.FC = () => {
  const time = useGameStore((s) => s.time);
  const treasury = useGameStore((s) => s.treasury);
  const voterSentiment = useGameStore((s) => s.voterSentiment);
  const legacy = useGameStore((s) => s.legacy);
  const managerTitle = useGameStore((s) => s.managerTitle);
  const culturePoints = useGameStore((s) => s.culturePoints);
  const failTrackers = useGameStore((s) => s.failTrackers);
  const startingArchetype = useGameStore((s) => s.grid.startingArchetype);
  const initializeCity = useGameStore((s) => s.initializeCity);
  const setShowSaveLoadModal = useGameStore((s) => s.setShowSaveLoadModal);
  const retireAndReviewLegacy = useGameStore((s) => s.retireAndReviewLegacy);
  const [isMuted, setIsMuted] = useState(() => soundEffects.isMuted());

  const monthLabel = MONTH_NAMES[(time.month - 1) % 12] || "JAN";
  const isApprovalSafe = voterSentiment.overallApproval >= 50;
  const isNetPositive = treasury.monthlyNet >= 0;

  // Step 5.1: Detect when the player is 1 turn away from Bankruptcy or Recall Election
  const isOneTurnFromBankruptcy =
    failTrackers.bankruptcyConsecutiveTurns === 1 ||
    (treasury.reserves < 0 &&
      treasury.monthlyNet < 0 &&
      failTrackers.bankruptcyConsecutiveTurns >= 1);

  const isOneTurnFromRecall = failTrackers.recallConsecutiveTurns === 2;

  return (
    <div className="gov-top-wrapper">
      <header className="gov-scoreboard">
        {/* 1. Office, Dynamic Manager Title (Step 5.2) & Turn Clock */}
        <div className="gov-score-block gov-office-block">
          <div className="gov-eyebrow">INHERITED: {startingArchetype.toUpperCase()}</div>
          <div className="gov-office-title-row">
            <span className="gov-office-title">{time.currentOffice}</span>
            <span
              className="gov-manager-title-pill"
              title="Evaluated every 6 turns from your Culture Vector (Austerity, Progressive, Corporate)"
            >
              “{managerTitle}”
            </span>
          </div>
          <div className="gov-clock-row">
            <span className="gov-badge gov-badge-cyan">
              {monthLabel} {time.year} (MONTH {time.totalTurnsPlayed}
              {time.maxTurns ? ` / ${time.maxTurns}` : " // ENDLESS"})
            </span>
            <span
              className={`gov-badge ${
                time.monthsUntilElection <= 6 ? "gov-badge-amber" : "gov-badge-muted"
              }`}
            >
              ELECTION IN {time.monthsUntilElection}M
            </span>
          </div>
        </div>

        {/* 2. Approval & Capital (Demographic Breakdown on Hover Popover) */}
        <div
          className="gov-score-block"
          tabIndex={0}
          title="Hover for 4-Demographic Approval Breakdown"
        >
          <div className="gov-eyebrow">
            APPROVAL &amp; POLITICAL CAPITAL (HOVER FOR BLOCS)
          </div>
          <div className="gov-stat-main-row">
            <RollingNumber
              value={voterSentiment.overallApproval}
              format={(v) => `${v.toFixed(1)}%`}
              className={`gov-stat-big ${
                isApprovalSafe ? "gov-text-emerald" : "gov-text-crimson"
              }`}
            />
            <span className="gov-stat-sub">
              CAP: <strong>{Math.round(voterSentiment.politicalCapital)}</strong>/100
            </span>
            {failTrackers.recallConsecutiveTurns > 0 && (
              <span className="gov-badge gov-badge-crimson">
                RECALL: {failTrackers.recallConsecutiveTurns}/3
              </span>
            )}
          </div>
          <div className="gov-hover-popover">
            <div className="gov-eyebrow">DEMOGRAPHIC BLOCS (50% RE-ELECT)</div>
            <div className="gov-demo-mini-grid">
              {(Object.keys(DEMOGRAPHIC_LABELS) as Demographic[]).map((demo) => {
                const val = voterSentiment.demographics[demo].approval;
                return (
                  <div key={demo} className="gov-demo-pill">
                    <span className="gov-demo-name">{DEMOGRAPHIC_LABELS[demo]}</span>
                    <span
                      className={
                        val >= 50
                          ? "gov-text-emerald"
                          : val >= 38
                          ? "gov-text-amber"
                          : "gov-text-crimson"
                      }
                    >
                      {Math.round(val)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Treasury & Net Cashflow (REV / EXP / POLICIES on Hover Popover) */}
        <div
          className="gov-score-block"
          tabIndex={0}
          title="Hover for Revenue, Expenses & Policy Net Breakdown"
        >
          <div className="gov-eyebrow">
            TREASURY &amp; NET CASHFLOW (HOVER FOR LEDGER)
          </div>
          <div className="gov-stat-main-row">
            <RollingNumber
              value={treasury.reserves}
              format={formatCurrency}
              className={`gov-stat-big ${
                treasury.reserves >= 0 ? "gov-text-cyan" : "gov-text-crimson"
              }`}
            />
            <span
              className={`gov-badge ${
                isNetPositive ? "gov-badge-emerald" : "gov-badge-crimson"
              }`}
            >
              {isNetPositive ? "+" : ""}
              {formatCurrency(treasury.monthlyNet)}/MO
            </span>
            {failTrackers.bankruptcyConsecutiveTurns > 0 && (
              <span className="gov-badge gov-badge-crimson">
                INSOLVENT: {failTrackers.bankruptcyConsecutiveTurns}/2
              </span>
            )}
          </div>
          <div className="gov-hover-popover">
            <div className="gov-eyebrow">MONTHLY FISCAL BREAKDOWN</div>
            <div className="gov-fiscal-subrow" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
              <span>REVENUE: <strong>{formatCurrency(treasury.monthlyRevenue)}</strong></span>
              <span>EXPENSES: <strong>{formatCurrency(treasury.monthlyExpenses)}</strong></span>
              <span>
                ACTIVE POLICIES:{" "}
                <strong>
                  {treasury.customPolicyRecurringNet >= 0 ? "+" : ""}
                  {formatCurrency(treasury.customPolicyRecurringNet)}/mo
                </strong>
              </span>
              <span>
                POP: <strong>{legacy.population.toLocaleString()}</strong> (Tier {legacy.populationTier}/5)
              </span>
              <span>
                CULTURE: AUST {culturePoints.Austerity} | PROG {culturePoints.Progressive} | CORP {culturePoints.Corporate}
              </span>
            </div>
          </div>
        </div>

        {/* 4. System Controls: SAVE/LOAD, LEGACY, SFX, NEW GAME */}
        <div className="gov-score-actions">
          <button
            type="button"
            className="gov-btn-ghost gov-text-emerald"
            onClick={() => setShowSaveLoadModal(true)}
            title="Open Campaign Save / Load Slots & JSON Export"
          >
            SAVE / LOAD
          </button>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => {
              soundEffects.playUiClick();
              retireAndReviewLegacy();
            }}
            title="Retire now and inspect your End-of-Term Legacy Chronicle"
          >
            LEGACY
          </button>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => {
              const next = !isMuted;
              soundEffects.setMuted(next);
              setIsMuted(next);
              if (!next) {
                soundEffects.playUiClick();
              }
            }}
            title="Toggle Web Audio Sound Effects"
          >
            {isMuted ? "SFX OFF" : "SFX ON"}
          </button>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => {
              soundEffects.playUiClick();
              initializeCity();
            }}
            title="Roll a new random Starting Archetype ('The Inherited Mess')"
          >
            NEW GAME
          </button>
        </div>
      </header>

      {/* Step 5.1: Flashing Red Warning Banner when 1 Turn Away from Bankruptcy or Recall */}
      {(isOneTurnFromBankruptcy || isOneTurnFromRecall) && (
        <div className="gov-danger-banner" role="alert">
          {isOneTurnFromBankruptcy && (
            <span>
              CRITICAL WARNING — 1 TURN FROM STATE TAKEOVER (BANKRUPTCY): Treasury is below $0
              with an active monthly deficit (Streak 1/2). Achieve a positive monthly surplus or
              restore reserves above $0 immediately!
            </span>
          )}
          {isOneTurnFromRecall && (
            <span>
              CRITICAL WARNING — 1 TURN FROM RECALL ELECTION (VOTER REVOLT): Overall Approval
              has remained below 25% for 2 consecutive turns (Streak 2/3). Raise approval to 25%+
              this month or be ousted!
            </span>
          )}
        </div>
      )}
    </div>
  );
};
