// ============================================================================
// GOVERNOR — Step 4: Bottom Policy Desk & "Advance Month" Command Deck
// Includes the Heatmap Layer Selector, the AI Custom Policy Drafting Terminal
// (connected to the 3-strike clamped WebLLM pipeline), WebGPU status telemetry,
// and the "NEXT MONTH" turn execution button.
// ============================================================================

import React, { useEffect, useState } from "react";
import {
  EXECUTIVE_ORDER_CAPITAL_COST,
  useGameStore,
} from "../store/useGameStore";
import {
  CivicPillar,
  HeatmapMetric,
  VALID_CIVIC_PILLARS,
  VALID_HEATMAP_METRICS,
} from "../types/simulation";
import {
  PUBLIC_ADDRESS_CAPITAL_GAIN,
  PUBLIC_ADDRESS_TREASURY_COST,
} from "../services/docketService";
import {
  generateTownHallQuestions,
  parseAndApplyCustomPolicy,
  stressTestCustomPolicy,
  webLLMService,
  WebLLMStatus,
} from "../services/webllmService";

const PILLAR_LABELS: Record<CivicPillar, string> = {
  crime: "CRIME",
  pollution: "POLLUTION",
  land_value: "HOUSING",
  traffic: "TRAFFIC",
  education: "EDUCATION",
  health: "HEALTH",
};

export const BottomPolicyDesk: React.FC = () => {
  const activeDocketPillar = useGameStore((s) => s.activeDocketPillar);
  const globalAverages = useGameStore((s) => s.grid.globalAverages);
  const civicServices = useGameStore((s) => s.civicServices);
  const setActiveHeatmapLayer = useGameStore((s) => s.setActiveHeatmapLayer);
  const advanceTurn = useGameStore((s) => s.advanceTurn);
  const isTurnPausedForCrisis = useGameStore((s) => s.isTurnPausedForCrisis);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const politicalCapital = useGameStore((s) => s.voterSentiment.politicalCapital);
  const reserves = useGameStore((s) => s.treasury.reserves);
  const publicAddressUsedThisTurn = useGameStore(
    (s) => s.publicAddressUsedThisTurn
  );
  const holdPublicAddress = useGameStore((s) => s.holdPublicAddress);
  const monthlyDocket = useGameStore((s) => s.monthlyDocket);
  const isGeneratingDocket = useGameStore((s) => s.isGeneratingDocket);
  const setCenterDeskTab = useGameStore((s) => s.setCenterDeskTab);
  const setShowCityReportModal = useGameStore((s) => s.setShowCityReportModal);
  const townHallUsedThisTurn = useGameStore((s) => s.townHall.usedThisTurn);
  const openTownHallSession = useGameStore((s) => s.openTownHallSession);
  const setTownHallQuestions = useGameStore((s) => s.setTownHallQuestions);

  const [policyInput, setPolicyInput] = useState("");
  const [isCompilingPolicy, setIsCompilingPolicy] = useState(false);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [lastCompilerNote, setLastCompilerNote] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<WebLLMStatus>(() =>
    webLLMService.getStatus()
  );

  useEffect(() => {
    return webLLMService.subscribe(setLlmStatus);
  }, []);

  const handleEnactPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = policyInput.trim();
    if (!trimmed || isCompilingPolicy || isTurnPausedForCrisis || gameOverReason) {
      return;
    }

    setIsCompilingPolicy(true);
    setLastCompilerNote("Compiling policy via Guardrail Clamping Pipeline...");

    try {
      const currentState = useGameStore.getState();
      const result = await parseAndApplyCustomPolicy(trimmed, currentState, false);
      currentState.applyClampedCustomPolicy(result.policy, {
        sourceLabel: `Month ${currentState.time.turn} — Unilateral Executive Order`,
        originalPromptText: trimmed,
        capitalCostOverride: EXECUTIVE_ORDER_CAPITAL_COST,
        isExecutiveOrder: true,
      });
      const sourceLabel = result.usedFallback
        ? "Fallback: Policy gridlocked in City Council"
        : `WebLLM (Strike ${result.attemptsUsed}/3)`;

      setLastCompilerNote(
        `[${sourceLabel} | -5% EO Backlash]: "${result.policy.vibe_feed_headline}" (${
          result.policy.budget_impact.monthly_change >= 0 ? "+" : ""
        }$${result.policy.budget_impact.monthly_change.toLocaleString()}/mo)`
      );
      setPolicyInput("");
    } catch (err) {
      setLastCompilerNote(
        `Guardrail Error: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsCompilingPolicy(false);
    }
  };

  const handleStressTestPolicy = async () => {
    const trimmed = policyInput.trim();
    if (!trimmed || isStressTesting || isCompilingPolicy) return;

    setIsStressTesting(true);
    setLastCompilerNote("Devil's Advocate auditing policy wording for loopholes...");
    try {
      const warning = await stressTestCustomPolicy(trimmed, useGameStore.getState());
      setLastCompilerNote(warning);
    } finally {
      setIsStressTesting(false);
    }
  };

  const handleHoldTownHall = async () => {
    if (townHallUsedThisTurn || isTurnPausedForCrisis || gameOverReason) return;
    openTownHallSession();
    const qs = await generateTownHallQuestions(useGameStore.getState());
    setTownHallQuestions(qs);
  };

  return (
    <footer className="gov-bottom-desk">
      {/* 1. City Pillars & Docket Focus Strip */}
      <div className="gov-desk-heatmap-group">
        <div className="gov-desk-left-top">
          <span className="gov-eyebrow">
            {isGeneratingDocket
              ? "⚡ DRAFTING NEXT MONTH'S DOCKET..."
              : "CITY PILLARS & DOCKET FOCUS"}
          </span>
          <button
            type="button"
            className="gov-btn-micro gov-text-cyan"
            onClick={() => setShowCityReportModal(true)}
          >
            STATE OF THE CITY
          </button>
        </div>
        <div className="gov-heatmap-btn-row">
          {VALID_CIVIC_PILLARS.map((metric) => {
            const avg =
              metric === "education"
                ? civicServices?.education ?? 55
                : metric === "health"
                ? civicServices?.health ?? 55
                : globalAverages[metric];
            const isActive = activeDocketPillar === metric;
            const docketIssue = monthlyDocket.find((d) => d.pillar === metric);
            const isResolved = docketIssue?.status === "RESOLVED";
            const isFollowUp = docketIssue?.isFollowUpArc;

            return (
              <div key={metric} className="gov-layer-docket-col">
                <button
                  type="button"
                  className={`gov-layer-btn ${isActive ? "active" : ""}`}
                  onClick={() => {
                    if (
                      (VALID_HEATMAP_METRICS as readonly string[]).includes(
                        metric
                      )
                    ) {
                      setActiveHeatmapLayer(metric as HeatmapMetric);
                    }
                    setCenterDeskTab("docket", metric);
                  }}
                >
                  <span className="gov-layer-name">{PILLAR_LABELS[metric]}</span>
                  <span className="gov-layer-val">{Math.round(avg)}</span>
                </button>
                <button
                  type="button"
                  className={`gov-docket-mini-pill ${
                    isResolved
                      ? "resolved"
                      : isFollowUp
                      ? "followup"
                      : "pending"
                  }`}
                  title={
                    docketIssue
                      ? `Focus ${metric.toUpperCase()} Docket Issue: "${
                          docketIssue.title
                        }" (${
                          isFollowUp ? "FOLLOW-UP ARC | " : ""
                        }${docketIssue.status})`
                      : "Open Legislative Docket"
                  }
                  onClick={() => setCenterDeskTab("docket", metric)}
                >
                  {isResolved
                    ? "✓ RESOLVED"
                    : isFollowUp
                    ? "★ FOLLOW-UP"
                    : "● ISSUE"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. AI Custom Policy Drafting Terminal ("Custom Executive Order") */}
      <form className="gov-policy-terminal" onSubmit={handleEnactPolicy}>
        <div className="gov-terminal-top">
          <span className="gov-eyebrow">
            EXECUTIVE ORDER BYPASS ({EXECUTIVE_ORDER_CAPITAL_COST} CAP | IMMEDIATE BYPASS: -5% APPROVAL &amp; AUTHORITARIAN SHIFT)
          </span>
          <div className="gov-webllm-status">
            <span
              className={`gov-status-dot ${
                llmStatus.isReady
                  ? "ready"
                  : llmStatus.isLoading
                  ? "loading"
                  : "standby"
              }`}
            />
            <span className="gov-status-text">{llmStatus.statusText}</span>
            {!llmStatus.isReady && !llmStatus.isLoading && llmStatus.webGPUSupported && (
              <button
                type="button"
                className="gov-btn-micro"
                onClick={() => void webLLMService.initializeEngine()}
              >
                LOAD WEBGPU LLM
              </button>
            )}
          </div>
        </div>

        <div className="gov-terminal-input-row">
          <input
            type="text"
            className="gov-policy-input"
            placeholder='Enter Custom Executive Order (e.g., "Mandate rooftop solar & electric freight lanes")...'
            value={policyInput}
            maxLength={140}
            disabled={isCompilingPolicy || isTurnPausedForCrisis || Boolean(gameOverReason)}
            onChange={(e) => setPolicyInput(e.target.value)}
          />
          <button
            type="button"
            className="gov-btn-stress-test"
            disabled={
              !policyInput.trim() ||
              isStressTesting ||
              isCompilingPolicy ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason)
            }
            title="Run Policy Devil's Advocate to preview how citizens or businesses will game this wording before signing"
            onClick={() => void handleStressTestPolicy()}
          >
            {isStressTesting ? "AUDITING..." : "STRESS-TEST POLICY"}
          </button>

          <button
            type="submit"
            className="gov-btn-enact"
            title={
              politicalCapital < EXECUTIVE_ORDER_CAPITAL_COST
                ? `Immediate Bypass (High Backlash): Requires ${EXECUTIVE_ORDER_CAPITAL_COST} Capital (${Math.round(
                    politicalCapital
                  )}/100 available). Inflicts -5% Approval backlash & Authoritarian shift.`
                : `Immediate Bypass (High Backlash): Enacts immediately this turn for ${EXECUTIVE_ORDER_CAPITAL_COST} Capital, inflicting -5% Approval & Authoritarian shift. Use Sponsor Custom Bill (10 Cap) in Docket for public debate!`
            }
            disabled={
              !policyInput.trim() ||
              isCompilingPolicy ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason) ||
              politicalCapital < EXECUTIVE_ORDER_CAPITAL_COST
            }
          >
            {isCompilingPolicy
              ? "CLAMPING..."
              : `SIGN EXECUTIVE ORDER (-${EXECUTIVE_ORDER_CAPITAL_COST} CAPITAL)`}
          </button>

          <button
            type="button"
            className="gov-btn-civic-teal"
            disabled={
              townHallUsedThisTurn ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason)
            }
            title={
              townHallUsedThisTurn
                ? "Town Hall Q&A already held this month."
                : "Convene a live Press & Citizen Town Hall Q&A (1/month) to win Approval & Political Capital"
            }
            onClick={() => void handleHoldTownHall()}
          >
            {townHallUsedThisTurn ? "TOWN HALL HELD" : "HOLD TOWN HALL"}
          </button>

          {/* Active "PUBLIC ADDRESS (+20 CAPITAL)" Button (Spends $250K Treasury once per month) */}
          <button
            type="button"
            className="gov-btn-civic-teal"
            disabled={
              publicAddressUsedThisTurn ||
              reserves < PUBLIC_ADDRESS_TREASURY_COST ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason)
            }
            title={
              publicAddressUsedThisTurn
                ? "Public Address already broadcast this month (resets next month)."
                : reserves < PUBLIC_ADDRESS_TREASURY_COST
                ? `Requires $${(
                    PUBLIC_ADDRESS_TREASURY_COST / 1000
                  ).toFixed(0)}K in Treasury Reserves.`
                : `Spend $${(
                    PUBLIC_ADDRESS_TREASURY_COST / 1000
                  ).toFixed(
                    0
                  )}K from Treasury on a city-wide media/PR address to immediately gain +${PUBLIC_ADDRESS_CAPITAL_GAIN} Political Capital (1/month).`
            }
            onClick={holdPublicAddress}
          >
            {publicAddressUsedThisTurn
              ? "PR BLITZ USED"
              : `PUBLIC ADDRESS (+${PUBLIC_ADDRESS_CAPITAL_GAIN} CAPITAL | -$250K)`}
          </button>
        </div>

        {lastCompilerNote && (
          <div className="gov-compiler-note">{lastCompilerNote}</div>
        )}
      </form>

      {/* 3. Turn Execution ("ADVANCE MONTH") Button */}
      <div className="gov-turn-action-box">
        <button
          type="button"
          className={`gov-btn-next-month ${
            isTurnPausedForCrisis ? "paused" : ""
          }`}
          disabled={isTurnPausedForCrisis || Boolean(gameOverReason) || isCompilingPolicy}
          onClick={advanceTurn}
        >
          <span className="gov-next-main">
            {isTurnPausedForCrisis
              ? "SIMULATION PAUSED"
              : gameOverReason
              ? "TERM CONCLUDED"
              : "ADVANCE MONTH"}
          </span>
          <span className="gov-next-sub">
            {isTurnPausedForCrisis
              ? "Resolve Boiling Point Crisis"
              : "Next Turn (+1 Month)"}
          </span>
        </button>
      </div>
    </footer>
  );
};
