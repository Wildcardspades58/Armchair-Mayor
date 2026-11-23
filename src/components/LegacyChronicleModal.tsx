// ============================================================================
// GOVERNOR — Phase 2 (Step 4/4): End-of-Term Legacy Chronicle Modal
// Fabledom-styled Historical Storybook Chronicle displayed when a campaign
// concludes (victory, retirement, recall, bankruptcy, or defeat):
// (a) Day 1 vs. Final Day Scorecard (Treasury, Approval, and 4 Core Pillars)
// (b) Signature Laws & Impact Audit (Top 3 most impactful enacted laws)
// (c) Final Political Compass Coordinates + WebLLM-generated Wikipedia-Style
//     Historical Encyclopedia Entry judging the administration.
// ============================================================================

import React, { useMemo } from "react";
import { useGameStore } from "../store/useGameStore";
import { ActiveCustomPolicy } from "../types/simulation";

function scorePolicyImpact(pol: ActiveCustomPolicy): number {
  const budgetScore = Math.abs(pol.budget_impact.monthly_change) / 2_000;
  const heatmapScore = pol.heatmap_modifiers.reduce(
    (sum, m) => sum + Math.abs(m.change) * 2,
    0
  );
  const demoScore = pol.demographic_approval.reduce(
    (sum, d) => sum + Math.abs(d.change) * 1.5,
    0
  );
  return budgetScore + heatmapScore + demoScore;
}

export const LegacyChronicleModal: React.FC = () => {
  const legacyChronicle = useGameStore((s) => s.legacyChronicle);
  const monthlyHistory = useGameStore((s) => s.monthlyHistory);
  const treasury = useGameStore((s) => s.treasury);
  const voterSentiment = useGameStore((s) => s.voterSentiment);
  const grid = useGameStore((s) => s.grid);
  const time = useGameStore((s) => s.time);
  const enactedPolicies = useGameStore((s) => s.enactedPolicies);
  const politicalCompass = useGameStore((s) => s.politicalCompass);
  const initializeCity = useGameStore((s) => s.initializeCity);
  const closeLegacyChronicle = useGameStore((s) => s.closeLegacyChronicle);

  if (!legacyChronicle.isOpen) return null;

  const day1 = monthlyHistory[0] ?? {
    turn: 1,
    month: 1,
    year: 2026,
    treasury: treasury.reserves,
    approval: voterSentiment.overallApproval,
    crimeAvg: grid.globalAverages.crime,
    pollutionAvg: grid.globalAverages.pollution,
    landValueAvg: grid.globalAverages.land_value,
    trafficAvg: grid.globalAverages.traffic,
  };

  const finalStats = {
    treasury: treasury.reserves,
    approval: voterSentiment.overallApproval,
    crimeAvg: grid.globalAverages.crime,
    pollutionAvg: grid.globalAverages.pollution,
    landValueAvg: grid.globalAverages.land_value,
    trafficAvg: grid.globalAverages.traffic,
  };

  const top3Laws = useMemo(
    () =>
      [...enactedPolicies]
        .sort((a, b) => scorePolicyImpact(b) - scorePolicyImpact(a))
        .slice(0, 3),
    [enactedPolicies]
  );

  const scorecardRows: Array<{
    label: string;
    day1Text: string;
    finalText: string;
    deltaText: string;
    isPositiveGood: boolean;
    rawDelta: number;
  }> = [
    {
      label: "Treasury Reserves",
      day1Text: `$${day1.treasury.toLocaleString()}`,
      finalText: `$${finalStats.treasury.toLocaleString()}`,
      rawDelta: finalStats.treasury - day1.treasury,
      deltaText: `${
        finalStats.treasury - day1.treasury >= 0 ? "+" : "-"
      }$${Math.abs(finalStats.treasury - day1.treasury).toLocaleString()}`,
      isPositiveGood: true,
    },
    {
      label: "Overall Approval",
      day1Text: `${day1.approval.toFixed(1)}%`,
      finalText: `${finalStats.approval.toFixed(1)}%`,
      rawDelta: finalStats.approval - day1.approval,
      deltaText: `${
        finalStats.approval - day1.approval >= 0 ? "+" : ""
      }${(finalStats.approval - day1.approval).toFixed(1)}%`,
      isPositiveGood: true,
    },
    {
      label: "Crime Index",
      day1Text: `${Math.round(day1.crimeAvg)}/100`,
      finalText: `${Math.round(finalStats.crimeAvg)}/100`,
      rawDelta: finalStats.crimeAvg - day1.crimeAvg,
      deltaText: `${
        finalStats.crimeAvg - day1.crimeAvg >= 0 ? "+" : ""
      }${Math.round(finalStats.crimeAvg - day1.crimeAvg)}`,
      isPositiveGood: false,
    },
    {
      label: "Pollution Index",
      day1Text: `${Math.round(day1.pollutionAvg)}/100`,
      finalText: `${Math.round(finalStats.pollutionAvg)}/100`,
      rawDelta: finalStats.pollutionAvg - day1.pollutionAvg,
      deltaText: `${
        finalStats.pollutionAvg - day1.pollutionAvg >= 0 ? "+" : ""
      }${Math.round(finalStats.pollutionAvg - day1.pollutionAvg)}`,
      isPositiveGood: false,
    },
    {
      label: "Land Value",
      day1Text: `${Math.round(day1.landValueAvg)}/100`,
      finalText: `${Math.round(finalStats.landValueAvg)}/100`,
      rawDelta: finalStats.landValueAvg - day1.landValueAvg,
      deltaText: `${
        finalStats.landValueAvg - day1.landValueAvg >= 0 ? "+" : ""
      }${Math.round(finalStats.landValueAvg - day1.landValueAvg)}`,
      isPositiveGood: true,
    },
    {
      label: "Traffic Congestion",
      day1Text: `${Math.round(day1.trafficAvg)}/100`,
      finalText: `${Math.round(finalStats.trafficAvg)}/100`,
      rawDelta: finalStats.trafficAvg - day1.trafficAvg,
      deltaText: `${
        finalStats.trafficAvg - day1.trafficAvg >= 0 ? "+" : ""
      }${Math.round(finalStats.trafficAvg - day1.trafficAvg)}`,
      isPositiveGood: false,
    },
  ];

  const isSuccessOutcome =
    legacyChronicle.outcome === "victory" ||
    legacyChronicle.outcome === "retirement";

  return (
    <div className="gov-modal-backdrop">
      <div
        className="gov-modal-card gov-report-modal"
        style={{
          borderColor: isSuccessOutcome
            ? "var(--accent-emerald)"
            : "var(--accent-crimson)",
        }}
      >
        <div className="gov-modal-header">
          <span
            className={`gov-badge ${
              isSuccessOutcome ? "gov-badge-emerald" : "gov-badge-crimson"
            }`}
          >
            ARMCHAIR MAYOR ARCHIVES // {time.totalTurnsPlayed} MONTHS SERVED
          </span>
          <span className="gov-badge gov-badge-cyan">
            {grid.startingArchetype.toUpperCase()}
          </span>
        </div>

        <h2 className="gov-modal-title">{legacyChronicle.headlineTitle}</h2>

        {/* Tone-Adaptive Historical Verdict */}
        <div
          className={`gov-chronicle-verdict-box is-${legacyChronicle.toneCategory}`}
        >
          <span className="gov-eyebrow">
            HISTORICAL POST-MORTEM VERDICT //{" "}
            {legacyChronicle.toneCategory.toUpperCase()}
          </span>
          <p className="gov-chronicle-wiki-text">
            {legacyChronicle.isGeneratingEntry
              ? "Weighing decades of civic fallout and composing final historical verdict..."
              : legacyChronicle.toneAdaptiveVerdict ||
                legacyChronicle.encyclopediaEntry}
          </p>
        </div>

        {/* (c) Wikipedia-Style Historical Encyclopedia Entry & Political Compass */}
        <div className="gov-chronicle-wiki-box">
          <div className="gov-chronicle-wiki-header">
            <div>
              <span className="gov-eyebrow">
                MUNICIPAL HISTORICAL ENCYCLOPEDIA ENTRY
              </span>
              <h3 className="gov-chronicle-leader-name">
                The “{politicalCompass.leaderTitle}” Era (2026–{time.year})
              </h3>
            </div>
            <div className="gov-modifier-chip-row">
              <span className="gov-chip">
                Economic Axis:{" "}
                {politicalCompass.economicAxis >= 0
                  ? `+${politicalCompass.economicAxis}`
                  : politicalCompass.economicAxis}
              </span>
              <span className="gov-chip">
                Governance Axis:{" "}
                {politicalCompass.governanceAxis >= 0
                  ? `+${politicalCompass.governanceAxis}`
                  : politicalCompass.governanceAxis}
              </span>
            </div>
          </div>

          <p className="gov-chronicle-wiki-text">
            {legacyChronicle.isGeneratingEntry
              ? "Synthesizing Wikipedia-style Historical Encyclopedia entry..."
              : legacyChronicle.encyclopediaEntry}
          </p>
        </div>

        {/* (a) Day 1 vs. Final Day Scorecard */}
        <div>
          <div className="gov-section-title" style={{ marginBottom: "8px" }}>
            DAY 1 VS. FINAL DAY SCORECARD
          </div>
          <div className="gov-chronicle-scorecard-grid">
            {scorecardRows.map((row) => {
              const isGood = row.isPositiveGood
                ? row.rawDelta >= 0
                : row.rawDelta <= 0;
              return (
                <div key={row.label} className="gov-chronicle-score-cell">
                  <span className="gov-eyebrow">{row.label}</span>
                  <div className="gov-chronicle-score-nums">
                    <span className="gov-text-muted">{row.day1Text}</span>
                    <span>&rarr;</span>
                    <strong>{row.finalText}</strong>
                  </div>
                  <span
                    className={`gov-badge ${
                      row.rawDelta === 0
                        ? "gov-badge-muted"
                        : isGood
                        ? "gov-badge-emerald"
                        : "gov-badge-crimson"
                    }`}
                  >
                    {row.deltaText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* (b) The "Hall of Fame & Infamy" Law Audit */}
        <div>
          <div className="gov-section-title" style={{ marginBottom: "8px" }}>
            THE “HALL OF FAME &amp; INFAMY” LAW AUDIT
          </div>
          {legacyChronicle.hallOfFameAudit.length > 0 ? (
            <div className="gov-crisis-choices-grid">
              {legacyChronicle.hallOfFameAudit.map((entry, idx) => (
                <div
                  key={`${entry.lawName}-${idx}`}
                  className="gov-crisis-choice-card"
                >
                  <div>
                    <div className="gov-docket-stance-row">
                      <span
                        className={`gov-badge ${
                          entry.verdictTag === "HALL OF FAME"
                            ? "gov-badge-emerald"
                            : entry.verdictTag === "HALL OF INFAMY"
                            ? "gov-badge-crimson"
                            : "gov-badge-amber"
                        }`}
                      >
                        {entry.verdictTag}
                      </span>
                      <span className="gov-badge gov-badge-muted">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="gov-choice-title" style={{ marginTop: "6px" }}>
                      {entry.lawName}
                    </div>
                    <p className="gov-choice-desc" style={{ marginTop: "4px" }}>
                      {entry.historianNote}
                    </p>
                  </div>
                  <div className="gov-choice-math-box">
                    <div className="gov-math-row">
                      <span>Cumulative Impact:</span>
                      <strong>{entry.cumulativeSummary}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : top3Laws.length === 0 ? (
            <div className="gov-empty-state">
              No custom or docket laws enacted—the administration governed purely
              via broad executive doctrines.
            </div>
          ) : (
            <div className="gov-crisis-choices-grid">
              {top3Laws.map((pol, idx) => (
                <div key={pol.id} className="gov-crisis-choice-card">
                  <div>
                    <div className="gov-docket-stance-row">
                      <span className="gov-badge gov-badge-cyan">
                        SIGNATURE LAW #{idx + 1}
                      </span>
                      <span className="gov-badge gov-badge-muted">
                        MONTH {pol.enactedTurn}
                      </span>
                    </div>
                    <div className="gov-choice-title" style={{ marginTop: "6px" }}>
                      {pol.policy_name}
                    </div>
                    <p className="gov-choice-desc" style={{ marginTop: "4px" }}>
                      {pol.vibe_feed_headline}
                    </p>
                  </div>

                  <div className="gov-choice-math-box">
                    <div className="gov-math-row">
                      <span>Treasury Impact:</span>
                      <strong
                        className={
                          pol.budget_impact.monthly_change >= 0
                            ? "gov-text-emerald"
                            : "gov-text-crimson"
                        }
                      >
                        {pol.budget_impact.monthly_change >= 0 ? "+" : ""}$
                        {pol.budget_impact.monthly_change.toLocaleString()}/mo
                      </strong>
                    </div>
                    <div className="gov-modifier-chip-row">
                      {pol.heatmap_modifiers.map((hm, hIdx) => (
                        <span key={`${hm.metric}-${hIdx}`} className="gov-chip">
                          {hm.metric}: {hm.change > 0 ? `+${hm.change}` : hm.change}
                        </span>
                      ))}
                      {pol.demographic_approval.map((dm, dIdx) => (
                        <span
                          key={`${dm.demographic}-${dIdx}`}
                          className="gov-chip"
                        >
                          {dm.demographic}:{" "}
                          {dm.change > 0 ? `+${dm.change}%` : `${dm.change}%`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="gov-briefing-footer">
          {isSuccessOutcome ? (
            <button
              type="button"
              className="gov-btn-ghost"
              onClick={closeLegacyChronicle}
            >
              CONTINUE INSPECTING CITY
            </button>
          ) : (
            <span className="gov-eyebrow">TERM CONCLUDED</span>
          )}
          <button
            type="button"
            className="gov-btn-enact"
            onClick={() => initializeCity(undefined, time.campaignTermMode)}
          >
            LAUNCH NEW CAMPAIGN
          </button>
        </div>
      </div>
    </div>
  );
};
