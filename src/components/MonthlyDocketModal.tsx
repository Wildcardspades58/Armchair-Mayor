// ============================================================================
// GOVERNOR — NationStates-Style Monthly Docket Modal (4 Legislative Issues)
// Presents 4 active Policy Issues every month—one targeting each core pillar
// (Crime, Pollution, Land Value, Traffic).
// Each Issue offers 4 Ways to Resolve:
//   - Options 1..3: 3 Distinct Ideological Presets showing stance, estimated
//     budget/heatmap/approval trade-offs, and Political Capital cost (-10 CAP).
//   - Option 4: Custom Executive Override (inline text input routed through
//     our WebLLM policy parser & clamping guardrails, -15 CAP).
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { CivicPillar, DocketPresetOption } from "../types/simulation";
import { DOCKET_CUSTOM_CAPITAL_COST } from "../services/docketService";
import {
  parseAndApplyCustomPolicy,
  prefetchContextAwareMonthlyDocket,
  webLLMService,
} from "../services/webllmService";
import { AdvisorBriefingBar } from "./AdvisorBriefingBar";

const PILLAR_LABELS: Record<CivicPillar, string> = {
  crime: "CRIME & SAFETY",
  pollution: "POLLUTION & EPA",
  land_value: "LAND VALUE & ZONING",
  traffic: "TRAFFIC & TRANSIT",
  education: "EDUCATION & YOUTH",
  health: "PUBLIC HEALTH & WELFARE",
};

export const MonthlyDocketModal: React.FC = () => {
  const showDocketModal = useGameStore((s) => s.showDocketModal);
  const monthlyDocket = useGameStore((s) => s.monthlyDocket);
  const isGeneratingDocket = useGameStore((s) => s.isGeneratingDocket);
  const activeDocketPillar = useGameStore((s) => s.activeDocketPillar);
  const setShowDocketModal = useGameStore((s) => s.setShowDocketModal);
  const resolveDocketIssuePreset = useGameStore(
    (s) => s.resolveDocketIssuePreset
  );
  const resolveDocketIssueCustom = useGameStore(
    (s) => s.resolveDocketIssueCustom
  );
  const politicalCapital = useGameStore(
    (s) => s.voterSentiment.politicalCapital
  );
  const turn = useGameStore((s) => s.time.turn);

  const [customOverrideInput, setCustomOverrideInput] = useState("");
  const [isCompilingOverride, setIsCompilingOverride] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<DocketPresetOption | null>(
    null
  );

  if (!showDocketModal) return null;

  const activeIssue =
    monthlyDocket.find((i) => i.pillar === activeDocketPillar) ??
    monthlyDocket[0];

  const pendingCount = monthlyDocket.filter(
    (i) => i.status === "PENDING"
  ).length;

  const handleCustomOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customOverrideInput.trim();
    if (
      !trimmed ||
      !activeIssue ||
      activeIssue.status === "RESOLVED" ||
      isCompilingOverride ||
      politicalCapital < DOCKET_CUSTOM_CAPITAL_COST
    ) {
      return;
    }

    setIsCompilingOverride(true);
    setOverrideFeedback("Compiling custom docket solution via WebLLM guardrails...");

    try {
      const currentState = useGameStore.getState();
      const contextualPrompt = `[Docket Dilemma: "${activeIssue.title}" (${activeIssue.pillar.toUpperCase()})] Mayor's Solution: ${trimmed}`;

      // Parse & clamp via WebLLM pipeline (applyToStore = false so resolveDocketIssueCustom handles store update + RESOLVED status)
      const result = await parseAndApplyCustomPolicy(
        contextualPrompt,
        currentState,
        false
      );

      resolveDocketIssueCustom(activeIssue.id, result.policy, trimmed);
      setCustomOverrideInput("");
      setOverrideFeedback(
        `RESOLVED: Enacted "${result.policy.policy_name}" (${
          result.policy.budget_impact.monthly_change >= 0 ? "+" : ""
        }$${result.policy.budget_impact.monthly_change.toLocaleString()}/mo)`
      );
    } catch (err) {
      setOverrideFeedback(
        `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsCompilingOverride(false);
    }
  };

  return (
    <div
      className="gov-modal-backdrop"
      onClick={() => setShowDocketModal(false)}
    >
      <div
        className="gov-modal-card gov-docket-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gov-modal-header">
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <span className="gov-badge gov-badge-cyan">
              MONTH {turn} LEGISLATIVE DOCKET // {pendingCount} OF 4 ISSUES PENDING
            </span>
            {isGeneratingDocket && (
              <span className="gov-badge gov-badge-amber">
                ⚡ Drafting Next Month&apos;s Legislative Docket (WebLLM)...
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {webLLMService.isEngineReady() && !isGeneratingDocket && (
              <button
                type="button"
                className="gov-btn-micro gov-text-cyan"
                onClick={() => void prefetchContextAwareMonthlyDocket()}
                title="Synthesize fresh AI dilemmas using your recent enacted laws and city telemetry"
              >
                AI REFRESH DOCKET
              </button>
            )}
            <span className="gov-badge gov-badge-emerald">
              POLITICAL CAPITAL: {Math.round(politicalCapital)}/100
            </span>
            <button
              type="button"
              className="gov-btn-ghost"
              onClick={() => setShowDocketModal(false)}
            >
              CLOSE DOCKET [X]
            </button>
          </div>
        </div>

        {/* 4 Pillar Issue Tabs showing PENDING vs RESOLVED + FOLLOW-UP ARC badge */}
        <div className="gov-docket-tabs-grid">
          {monthlyDocket.map((issue) => {
            const isSelected = issue.pillar === activeIssue?.pillar;
            const isResolved = issue.status === "RESOLVED";
            return (
              <button
                key={issue.id}
                type="button"
                className={`gov-docket-tab-btn ${isSelected ? "active" : ""} ${
                  isResolved ? "resolved" : "pending"
                }`}
                onClick={() => {
                  setOverrideFeedback(null);
                  setShowDocketModal(true, issue.pillar);
                }}
              >
                <div className="gov-docket-tab-top">
                  <span>{PILLAR_LABELS[issue.pillar]}</span>
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {issue.isFollowUpArc && (
                      <span className="gov-badge gov-badge-crimson">
                        FOLLOW-UP ARC
                      </span>
                    )}
                    <span
                      className={`gov-badge ${
                        isResolved ? "gov-badge-emerald" : "gov-badge-amber"
                      }`}
                    >
                      {issue.status}
                    </span>
                  </div>
                </div>
                <div className="gov-docket-tab-title">{issue.title}</div>
              </button>
            );
          })}
        </div>

        {activeIssue && (
          <div className="gov-docket-issue-body">
            <div className="gov-docket-issue-header">
              <div>
                <div
                  className="gov-eyebrow"
                  style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}
                >
                  <span>
                    MUNICIPAL DILEMMA // TARGET PILLAR:{" "}
                    {PILLAR_LABELS[activeIssue.pillar]}
                  </span>
                  {activeIssue.isFollowUpArc && (
                    <span className="gov-badge gov-badge-crimson">
                      FOLLOW-UP ARC
                      {activeIssue.parentLawTitle
                        ? `: SEQUEL TO "${activeIssue.parentLawTitle.toUpperCase()}"`
                        : ""}
                    </span>
                  )}
                  {activeIssue.isAIGenerated && (
                    <span className="gov-badge gov-badge-cyan">
                      WEBLLM SYNTHESIZED
                    </span>
                  )}
                </div>
                <h2 className="gov-modal-title">{activeIssue.title}</h2>
              </div>
              {activeIssue.status === "RESOLVED" && (
                <span className="gov-badge gov-badge-emerald">
                  RESOLVED: {activeIssue.resolvedWithLabel}
                </span>
              )}
            </div>

            <p className="gov-modal-desc">{activeIssue.briefing}</p>

            {/* Phase 2: Expressive Advisor Portraits & Pre-Vote Trade-Off Warnings */}
            <AdvisorBriefingBar hoveredOption={hoveredPreset} />

            {/* 3 Distinct Preset Options (Radical: -15 CAP | Compromise: +5 CAP GAIN | Moderate: 0 CAP) */}
            <div className="gov-crisis-choices-grid">
              {activeIssue.presets.map((preset, idx) => {
                const eff = preset.policyEffect;
                const canAfford =
                  preset.capitalCost <= 0 ||
                  politicalCapital >= preset.capitalCost;
                const isResolved = activeIssue.status === "RESOLVED";

                const capBadgeText =
                  preset.capitalCost < 0
                    ? `+${Math.abs(preset.capitalCost)} CAP GAIN`
                    : preset.capitalCost === 0
                    ? "0 CAP (FREE)"
                    : `-${preset.capitalCost} CAP`;

                const capBadgeClass =
                  preset.capitalCost < 0
                    ? "gov-badge-emerald"
                    : preset.capitalCost === 0
                    ? "gov-badge-cyan"
                    : "gov-badge-amber";

                const buttonCostSuffix =
                  preset.capitalCost < 0
                    ? `(+${Math.abs(preset.capitalCost)} CAP)`
                    : preset.capitalCost === 0
                    ? "(0 CAP)"
                    : `(-${preset.capitalCost} CAP)`;

                return (
                  <div
                    key={preset.id}
                    className="gov-crisis-choice-card gov-docket-preset-hoverable"
                    onMouseEnter={() => setHoveredPreset(preset)}
                    onMouseLeave={() => setHoveredPreset(null)}
                    onFocus={() => setHoveredPreset(preset)}
                    onBlur={() => setHoveredPreset(null)}
                  >
                    <div>
                      <div className="gov-docket-stance-row">
                        <span className="gov-badge gov-badge-cyan">
                          OPTION #{idx + 1}: {preset.stanceLabel.toUpperCase()}
                        </span>
                        <span className={`gov-badge ${capBadgeClass}`}>
                          {capBadgeText}
                        </span>
                      </div>
                      <div
                        className="gov-choice-title"
                        style={{ marginTop: "6px" }}
                      >
                        {preset.optionTitle}
                      </div>
                      <p
                        className="gov-choice-desc"
                        style={{ marginTop: "4px" }}
                      >
                        {preset.description}
                      </p>
                    </div>

                    {/* Exact Applied Impact Preview */}
                    <div className="gov-choice-math-box">
                      <div className="gov-math-row">
                        <span>Monthly Treasury:</span>
                        <strong
                          className={
                            eff.budget_impact.monthly_change >= 0
                              ? "gov-text-emerald"
                              : "gov-text-crimson"
                          }
                        >
                          {eff.budget_impact.monthly_change >= 0 ? "+" : ""}$
                          {eff.budget_impact.monthly_change.toLocaleString()}/mo
                        </strong>
                      </div>

                      <div className="gov-modifier-chip-row">
                        {eff.heatmap_modifiers.map((hm, hIdx) => (
                          <span key={`${hm.metric}-${hIdx}`} className="gov-chip">
                            {hm.metric}: {hm.change > 0 ? `+${hm.change}` : hm.change}
                          </span>
                        ))}
                        {eff.demographic_approval.map((dm, dIdx) => (
                          <span
                            key={`${dm.demographic}-${dIdx}`}
                            className="gov-chip"
                          >
                            {dm.demographic}:{" "}
                            {dm.change > 0 ? `+${dm.change}%` : `${dm.change}%`}
                          </span>
                        ))}
                      </div>

                      {eff.unintended_consequence_trigger && (
                        <div className="gov-choice-fallout">
                          Fallout: {eff.unintended_consequence_trigger}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="gov-btn-choice-exec"
                      disabled={isResolved || !canAfford || isCompilingOverride}
                      title={
                        !canAfford
                          ? `Requires ${preset.capitalCost} Political Capital`
                          : preset.optionTitle
                      }
                      onClick={() =>
                        resolveDocketIssuePreset(
                          activeIssue.id,
                          idx as 0 | 1 | 2
                        )
                      }
                    >
                      {isResolved
                        ? "ISSUE RESOLVED"
                        : `ENACT OPTION #${idx + 1} ${buttonCostSuffix}`}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Option 4: Custom Executive Override for this specific Dilemma */}
            <form
              className="gov-crisis-custom-box"
              onSubmit={handleCustomOverrideSubmit}
            >
              <div className="gov-crisis-custom-header">
                <span className="gov-eyebrow">
                  OPTION #4 — CUSTOM EXECUTIVE OVERRIDE FOR &ldquo;
                  {activeIssue.title.toUpperCase()}&rdquo;
                </span>
                <span className="gov-badge gov-badge-cyan">
                  COSTS {DOCKET_CUSTOM_CAPITAL_COST} POLITICAL CAPITAL
                </span>
              </div>

              <div className="gov-terminal-input-row">
                <input
                  type="text"
                  className="gov-policy-input"
                  placeholder={`Write your own custom solution to "${activeIssue.title}"...`}
                  value={customOverrideInput}
                  maxLength={160}
                  disabled={
                    activeIssue.status === "RESOLVED" || isCompilingOverride
                  }
                  onChange={(e) => setCustomOverrideInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="gov-btn-enact"
                  disabled={
                    !customOverrideInput.trim() ||
                    activeIssue.status === "RESOLVED" ||
                    isCompilingOverride ||
                    politicalCapital < DOCKET_CUSTOM_CAPITAL_COST
                  }
                  title={
                    politicalCapital < DOCKET_CUSTOM_CAPITAL_COST
                      ? `Requires ${DOCKET_CUSTOM_CAPITAL_COST} Political Capital`
                      : "Compile & Enact Custom Docket Solution"
                  }
                >
                  {isCompilingOverride
                    ? "COMPILING..."
                    : `ENACT CUSTOM OVERRIDE (-${DOCKET_CUSTOM_CAPITAL_COST} CAP)`}
                </button>
              </div>

              {overrideFeedback && (
                <div className="gov-compiler-note">{overrideFeedback}</div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
