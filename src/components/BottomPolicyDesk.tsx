// ============================================================================
// ARMCHAIR MAYOR — Phase 4 Sleek Floating 3-Zone Command Footer
// 1. Left Zone: 6 Compact Pillar Gauges (Crime, Pollution, Housing, Traffic, Edu, Health)
// 2. Center Zone: Mayoral Actions (⚡ EXECUTIVE ORDER modal trigger, Town Hall, Public Address)
// 3. Right Zone: ADVANCE MONTH → primary turn execution button
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
import { soundEffects } from "../services/soundEffects";

const PILLAR_LABELS: Record<CivicPillar, { short: string; icon: string }> = {
  crime: { short: "CRIME", icon: "🚨" },
  pollution: { short: "POLLUTION", icon: "🌫️" },
  land_value: { short: "HOUSING", icon: "🏠" },
  traffic: { short: "TRANSIT", icon: "🚋" },
  education: { short: "EDUCATION", icon: "📚" },
  health: { short: "HEALTH", icon: "🏥" },
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
  const setCenterDeskTab = useGameStore((s) => s.setCenterDeskTab);
  const townHallUsedThisTurn = useGameStore((s) => s.townHall.usedThisTurn);
  const openTownHallSession = useGameStore((s) => s.openTownHallSession);
  const setTownHallQuestions = useGameStore((s) => s.setTownHallQuestions);

  const [showEOModal, setShowEOModal] = useState(false);
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
    setLastCompilerNote("Compiling unilateral decree via Guardrail Pipeline...");

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
      setShowEOModal(false);
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
    soundEffects.playUiClick();
    openTownHallSession();
    const qs = await generateTownHallQuestions(useGameStore.getState());
    setTownHallQuestions(qs);
  };

  return (
    <>
      <footer className="gov-bottom-desk">
        {/* 1. Left Zone: 6 Compact Pillar Gauges */}
        <div className="gov-footer-pillars-zone">
          {VALID_CIVIC_PILLARS.map((metric) => {
            const avg =
              metric === "education"
                ? civicServices?.education ?? 55
                : metric === "health"
                ? civicServices?.health ?? 55
                : globalAverages[metric];
            const docketIssue = monthlyDocket.find((d) => d.pillar === metric);
            const hasActiveIssue = Boolean(docketIssue);
            const isActive = hasActiveIssue && activeDocketPillar === metric;
            const isResolved = docketIssue?.status === "RESOLVED";
            const meta = PILLAR_LABELS[metric];

            return (
              <button
                key={metric}
                type="button"
                className={`gov-pillar-gauge-pill ${isActive ? "active" : ""}`}
                title={
                  docketIssue
                    ? `${meta.short}: ${Math.round(avg)}/100 — Active Docket Issue: "${docketIssue.title}" (${docketIssue.status})`
                    : `${meta.short}: ${Math.round(avg)}/100 — Quiet this month (4 of 6 pillars active per turn)`
                }
                onClick={() => {
                  if (
                    (VALID_HEATMAP_METRICS as readonly string[]).includes(
                      metric
                    )
                  ) {
                    setActiveHeatmapLayer(metric as HeatmapMetric);
                  }
                  if (docketIssue) {
                    soundEffects.playUiClick();
                    setCenterDeskTab("docket", metric);
                  }
                }}
              >
                <div className="gov-pillar-gauge-top">
                  <span>
                    {meta.icon} {meta.short}
                  </span>
                  {docketIssue && (
                    <span
                      className={`gov-pillar-dot ${
                        isResolved ? "is-resolved" : "is-pending"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <strong className="gov-num">{Math.round(avg)}</strong>
              </button>
            );
          })}
        </div>

        {/* 2. Center Zone: Clean Mayoral Actions + WebGPU Status */}
        <div className="gov-footer-actions-zone">
          <button
            type="button"
            className="gov-btn-enact"
            disabled={isTurnPausedForCrisis || Boolean(gameOverReason)}
            title="Immediate Bypass (High Backlash): Enact any custom decree immediately for 25 Capital, inflicting -5% Approval & Authoritarian shift"
            onClick={() => {
              soundEffects.playUiClick();
              setShowEOModal(true);
            }}
          >
            ⚡ EXECUTIVE ORDER (-{EXECUTIVE_ORDER_CAPITAL_COST} CAP)
          </button>

          <button
            type="button"
            className="gov-btn-civic-teal"
            disabled={
              townHallUsedThisTurn ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason)
            }
            title="Convene a live Press & Citizen Town Hall Q&A (1/month) to win Approval & Political Capital"
            onClick={() => void handleHoldTownHall()}
          >
            {townHallUsedThisTurn ? "🎙️ TOWN HALL HELD" : "🎙️ HOLD TOWN HALL"}
          </button>

          <button
            type="button"
            className="gov-btn-civic-teal"
            disabled={
              publicAddressUsedThisTurn ||
              reserves < PUBLIC_ADDRESS_TREASURY_COST ||
              isTurnPausedForCrisis ||
              Boolean(gameOverReason)
            }
            title={`Spend $${(PUBLIC_ADDRESS_TREASURY_COST / 1000).toFixed(
              0
            )}K from Treasury on a city-wide address to immediately gain +${PUBLIC_ADDRESS_CAPITAL_GAIN} Political Capital`}
            onClick={() => {
              soundEffects.playUiClick();
              holdPublicAddress();
            }}
          >
            {publicAddressUsedThisTurn
              ? "📢 PR BLITZ USED"
              : `📢 PUBLIC ADDRESS (+${PUBLIC_ADDRESS_CAPITAL_GAIN} CAP | -$250K)`}
          </button>

          <div className="gov-footer-llm-pill">
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
                LOAD AI
              </button>
            )}
          </div>
        </div>

        {/* 3. Right Zone: ADVANCE MONTH → Primary Action */}
        <div className="gov-turn-action-box">
          <button
            type="button"
            className={`gov-btn-next-month ${
              isTurnPausedForCrisis ? "paused" : ""
            }`}
            disabled={
              isTurnPausedForCrisis || Boolean(gameOverReason) || isCompilingPolicy
            }
            onClick={() => void advanceTurn()}
          >
            <span className="gov-next-main">
              {isTurnPausedForCrisis
                ? "SIMULATION PAUSED"
                : gameOverReason
                ? "TERM CONCLUDED"
                : "ADVANCE MONTH →"}
            </span>
            <span className="gov-next-sub">
              {isTurnPausedForCrisis
                ? "Resolve Boiling Point Crisis"
                : "Simulate & Print Next Issue"}
            </span>
          </button>
        </div>
      </footer>

      {/* Executive Order Popover Modal */}
      {showEOModal && (
        <div
          className="gov-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Unilateral Executive Order Bypass"
        >
          <div className="gov-modal-card gov-eo-popover-card">
            <div className="gov-modal-header">
              <div>
                <div className="gov-modal-eyebrow gov-text-crimson">
                  UNILATERAL BYPASS // HIGH INSTITUTIONAL BACKLASH
                </div>
                <h2 className="gov-modal-title">SIGN EXECUTIVE ORDER</h2>
              </div>
              <button
                type="button"
                className="gov-btn-ghost"
                onClick={() => setShowEOModal(false)}
              >
                CLOSE
              </button>
            </div>

            <p className="gov-modal-desc">
              Bypasses the Legislative Docket and enacts your custom decree
              immediately this month. Costs{" "}
              <strong>{EXECUTIVE_ORDER_CAPITAL_COST} Political Capital</strong>{" "}
              (available: <strong>{Math.round(politicalCapital)}/100</strong>),
              inflicts <strong>-5% Institutional Backlash Approval</strong>, and
              pushes your Political Compass toward Authoritarian. For zero
              backlash, use{" "}
              <strong>+ Sponsor Custom Bill (10 Cap)</strong> inside the
              Legislative Docket.
            </p>

            <form
              className="gov-policy-terminal"
              onSubmit={handleEnactPolicy}
              style={{ gap: "10px" }}
            >
              <input
                type="text"
                className="gov-policy-input"
                placeholder='Draft unilateral Executive Order (e.g., "Mandate rooftop solar & electric freight lanes")...'
                value={policyInput}
                maxLength={140}
                disabled={isCompilingPolicy}
                onChange={(e) => setPolicyInput(e.target.value)}
              />

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="gov-btn-stress-test"
                  disabled={
                    !policyInput.trim() || isStressTesting || isCompilingPolicy
                  }
                  onClick={() => void handleStressTestPolicy()}
                >
                  {isStressTesting ? "AUDITING..." : "STRESS-TEST POLICY"}
                </button>
                <button
                  type="submit"
                  className="gov-btn-enact"
                  disabled={
                    !policyInput.trim() ||
                    isCompilingPolicy ||
                    politicalCapital < EXECUTIVE_ORDER_CAPITAL_COST
                  }
                >
                  {isCompilingPolicy
                    ? "CLAMPING DECREE..."
                    : `SIGN EXECUTIVE ORDER (-${EXECUTIVE_ORDER_CAPITAL_COST} CAP)`}
                </button>
              </div>

              {lastCompilerNote && (
                <div className="gov-compiler-note">{lastCompilerNote}</div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
};
