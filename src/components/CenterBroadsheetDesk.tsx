// ============================================================================
// GOVERNOR — Center-Stage Editorial & Legislative Desk (Unified 2-Tab View)
// 1. Top Visual Anchor: <ReactiveSkylineBanner /> (~120px vector diorama)
// 2. 2-Tab Navigation Bar:
//    - Tab 1: 📰 THE MUNICIPAL DISPATCH (Multi-paragraph newspaper, default)
//    - Tab 2: ⚖️ LEGISLATIVE DOCKET (X/4 PENDING) (4-issue voting desk)
// ============================================================================

import React, { useMemo, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import {
  CivicPillar,
  DocketPresetOption,
} from "../types/simulation";
import { DOCKET_CUSTOM_CAPITAL_COST } from "../services/docketService";
import {
  generateSponsoredBillDraft,
  parseAndApplyCustomPolicy,
  prefetchContextAwareMonthlyDocket,
  stressTestCustomPolicy,
  webLLMService,
} from "../services/webllmService";
import { ReactiveSkylineBanner } from "./ReactiveSkylineBanner";
import { AdvisorBriefingBar } from "./AdvisorBriefingBar";
import { soundEffects } from "../services/soundEffects";

const PILLAR_LABELS: Record<CivicPillar, string> = {
  crime: "CRIME & SAFETY",
  pollution: "POLLUTION & EPA",
  land_value: "HOUSING & LAND VALUE",
  traffic: "TRAFFIC & TRANSIT",
  education: "EDUCATION & YOUTH",
  health: "PUBLIC HEALTH & WELFARE",
};

const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export const CenterBroadsheetDesk: React.FC = () => {
  const broadsheet = useGameStore((s) => s.frontPageBroadsheet);
  const isGeneratingBroadsheet = useGameStore((s) => s.isGeneratingBroadsheet);
  const cityReport = useGameStore((s) => s.cityReport);
  const civicServices = useGameStore((s) => s.civicServices);
  const treasury = useGameStore((s) => s.treasury);
  const monthlyDocket = useGameStore((s) => s.monthlyDocket);
  const isGeneratingDocket = useGameStore((s) => s.isGeneratingDocket);
  const centerDeskTab = useGameStore((s) => s.centerDeskTab);
  const setCenterDeskTab = useGameStore((s) => s.setCenterDeskTab);
  const activeDocketPillar = useGameStore((s) => s.activeDocketPillar);
  const resolveDocketIssuePreset = useGameStore(
    (s) => s.resolveDocketIssuePreset
  );
  const resolveDocketIssueCustom = useGameStore(
    (s) => s.resolveDocketIssueCustom
  );
  const politicalCapital = useGameStore(
    (s) => s.voterSentiment.politicalCapital
  );
  const isTurnPausedForCrisis = useGameStore((s) => s.isTurnPausedForCrisis);
  const gameOverReason = useGameStore((s) => s.gameOverReason);
  const pendingSponsoredBills = useGameStore((s) => s.pendingSponsoredBills);
  const sponsorCustomBill = useGameStore((s) => s.sponsorCustomBill);
  const pressWireFlash = useGameStore((s) => s.pressWireFlash);
  const dismissPressWireFlash = useGameStore((s) => s.dismissPressWireFlash);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [sponsorBillInput, setSponsorBillInput] = useState("");
  const [isDraftingBill, setIsDraftingBill] = useState(false);
  const [sponsorFeedback, setSponsorFeedback] = useState<string | null>(null);
  const [customOverrideInput, setCustomOverrideInput] = useState("");
  const [isCompilingOverride, setIsCompilingOverride] = useState(false);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [overrideFeedback, setOverrideFeedback] = useState<string | null>(null);
  const [hoveredPreset, setHoveredPreset] = useState<DocketPresetOption | null>(
    null
  );

  const activeIssue = useMemo(
    () =>
      monthlyDocket.find((i) => i.id === selectedIssueId) ??
      monthlyDocket.find((i) => i.pillar === activeDocketPillar) ??
      monthlyDocket[0],
    [monthlyDocket, selectedIssueId, activeDocketPillar]
  );
  const pendingCount = useMemo(
    () => monthlyDocket.filter((i) => i.status === "PENDING").length,
    [monthlyDocket]
  );

  const monthName = MONTH_NAMES[(broadsheet.month - 1) % 12] ?? "JANUARY";

  const switchTab = (tab: "dispatch" | "docket", pillar?: CivicPillar) => {
    soundEffects.playUiClick();
    setCenterDeskTab(tab, pillar);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSelectIssue = (issueId: string, pillar: CivicPillar) => {
    soundEffects.playUiClick();
    setOverrideFeedback(null);
    setSelectedIssueId(issueId);
    setCenterDeskTab("docket", pillar);
  };

  const handleSponsorBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sponsorBillInput.trim();
    if (
      !trimmed ||
      isDraftingBill ||
      politicalCapital < 10 ||
      isTurnPausedForCrisis ||
      gameOverReason
    ) {
      return;
    }
    setIsDraftingBill(true);
    setSponsorFeedback("Drafting formal bill & legislative paths for next month's hearings...");
    try {
      const draft = await generateSponsoredBillDraft(
        trimmed,
        useGameStore.getState()
      );
      const ok = sponsorCustomBill(draft);
      if (ok) {
        setSponsorBillInput("");
        setSponsorFeedback(
          `QUEUED FOR NEXT MONTH: "${draft.formalTitle}" will undergo 30 days of public hearings & appear at the top of next month's docket.`
        );
      }
    } finally {
      setIsDraftingBill(false);
    }
  };

  const handleCustomOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customOverrideInput.trim();
    if (
      !trimmed ||
      !activeIssue ||
      activeIssue.status === "RESOLVED" ||
      isCompilingOverride ||
      politicalCapital < DOCKET_CUSTOM_CAPITAL_COST ||
      isTurnPausedForCrisis ||
      gameOverReason
    ) {
      return;
    }

    setIsCompilingOverride(true);
    setOverrideFeedback(
      "Compiling custom docket solution via WebLLM guardrails..."
    );

    try {
      const currentState = useGameStore.getState();
      const contextualPrompt = `[Docket Dilemma: "${activeIssue.title}" (${activeIssue.pillar.toUpperCase()})] Mayor's Solution: ${trimmed}`;
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

  const handleStressTestOverride = async () => {
    const trimmed = customOverrideInput.trim();
    if (!trimmed || isStressTesting || isCompilingOverride) return;
    setIsStressTesting(true);
    setOverrideFeedback(
      "Devil's Advocate auditing docket decree for loopholes..."
    );
    try {
      const warning = await stressTestCustomPolicy(
        trimmed,
        useGameStore.getState()
      );
      setOverrideFeedback(warning);
    } finally {
      setIsStressTesting(false);
    }
  };

  const pillarCards: Array<{
    key: CivicPillar;
    label: string;
    isLowerBetter: boolean;
  }> = [
    { key: "crime", label: "CRIME", isLowerBetter: true },
    { key: "pollution", label: "POLLUTION", isLowerBetter: true },
    { key: "land_value", label: "HOUSING / LAND", isLowerBetter: false },
    { key: "traffic", label: "TRAFFIC", isLowerBetter: true },
    { key: "education", label: "EDUCATION", isLowerBetter: false },
    { key: "health", label: "PUBLIC HEALTH", isLowerBetter: false },
  ];

  const falloutParas =
    broadsheet.falloutParagraphs?.length > 0
      ? broadsheet.falloutParagraphs
      : [broadsheet.humanScaleRipple];
  const crisesParas =
    broadsheet.crisesParagraphs?.length > 0
      ? broadsheet.crisesParagraphs
      : [
          `Four municipal dilemmas await City Hall's vote on the Month ${broadsheet.turn} Legislative Docket.`,
        ];

  return (
    <div className="gov-center-broadsheet-shell">
      {/* 1. Top Visual Anchor: Reactive City Skyline Banner (~120px) */}
      <ReactiveSkylineBanner />

      {/* 2. Prominent 2-Tab Navigation Bar */}
      <nav className="gov-center-nav-tabs" aria-label="Center Desk Views">
        <button
          type="button"
          className={`gov-center-tab-btn ${
            centerDeskTab === "dispatch" ? "is-active" : ""
          }`}
          onClick={() => switchTab("dispatch")}
        >
          <span>📰 THE MUNICIPAL DISPATCH</span>
        </button>

        <button
          type="button"
          className={`gov-center-tab-btn is-docket-tab ${
            centerDeskTab === "docket" ? "is-active" : ""
          } ${pendingCount > 0 ? "has-pending" : ""}`}
          onClick={() => switchTab("docket")}
        >
          <span>⚖️ LEGISLATIVE DOCKET ({pendingCount}/4 PENDING)</span>
          {pendingCount > 0 && (
            <span className="gov-docket-pulse-dot" aria-hidden="true" />
          )}
        </button>
      </nav>

      {/* 3. Scrollable Tab Content */}
      <div ref={scrollRef} className="gov-broadsheet-scroll">
        {/* Immediate Press Wire Flash Card upon Policy Enactment */}
        {pressWireFlash && (
          <div className="gov-press-wire-flash" role="status">
            <div className="gov-press-wire-top">
              <div>
                <span className="gov-badge gov-badge-cyan">
                  PRESS WIRE FLASH // IMMEDIATE FALLOUT
                </span>
                <strong style={{ marginLeft: "8px", fontSize: "13px" }}>
                  {pressWireFlash.title} ({pressWireFlash.budgetText})
                </strong>
              </div>
              <button
                type="button"
                className="gov-btn-micro"
                onClick={dismissPressWireFlash}
              >
                DISMISS WIRE
              </button>
            </div>
            <div className="gov-press-wire-body">
              {pressWireFlash.story.split(/\n\n+/).map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          </div>
        )}

        {centerDeskTab === "dispatch" ? (
          /* TAB 1: THE MUNICIPAL DISPATCH — Multi-Paragraph Front-Page Broadsheet */
          <article className="gov-broadsheet-paper">
            <header className="gov-broadsheet-masthead">
              <div className="gov-broadsheet-meta-row">
                <span>
                  VOL. {broadsheet.year} // EDITION NO. {broadsheet.turn}
                </span>
                <span>
                  {monthName} {broadsheet.year}
                </span>
                <span
                  className={`gov-badge ${
                    broadsheet.isAIGenerated
                      ? "gov-badge-cyan"
                      : "gov-badge-muted"
                  }`}
                >
                  {isGeneratingBroadsheet
                    ? "TYPESETTING AI EDITION..."
                    : broadsheet.isAIGenerated
                    ? "WEBLLM PRESS EDITION"
                    : "MUNICIPAL WIRE"}
                </span>
              </div>

              <div className="gov-broadsheet-title-banner">
                THE MUNICIPAL DISPATCH
              </div>

              <h1 className="gov-broadsheet-headline">
                {broadsheet.leadHeadline}
              </h1>
              <p className="gov-broadsheet-subhead">{broadsheet.subhead}</p>
            </header>

            <div className="gov-broadsheet-columns">
              {/* Main Feature Column (65% width): 3-4 Paragraphs, Resident Quote, Winners/Losers, Crises & Hearings */}
              <div className="gov-broadsheet-main-col">
                {/* Section A: Last Month's Fallout (3-4 Detailed Paragraphs) */}
                <section className="gov-broadsheet-editorial-section">
                  <h2 className="gov-broadsheet-section-heading">
                    LAST MONTH’S FALLOUT: THE IMPACT OF YOUR DECREES
                  </h2>
                  <div className="gov-broadsheet-prose">
                    {falloutParas.map((para, idx) => (
                      <p key={`fallout-${idx}`}>{para}</p>
                    ))}
                  </div>
                  {broadsheet.residentQuote && (
                    <blockquote className="gov-broadsheet-resident-quote">
                      <span className="gov-eyebrow">
                        VOX POPULI // RESIDENT REACTION
                      </span>
                      <p>{broadsheet.residentQuote}</p>
                    </blockquote>
                  )}
                </section>

                {/* Winners & Losers Callout Boxes */}
                <div className="gov-broadsheet-wl-grid">
                  <div className="gov-broadsheet-wl-card is-winner">
                    <div className="gov-docket-stance-row">
                      <span className="gov-badge gov-badge-emerald">
                        WINNERS
                      </span>
                      <span className="gov-eyebrow">
                        {broadsheet.winnersBox.deltaText}
                      </span>
                    </div>
                    <strong>{broadsheet.winnersBox.group}</strong>
                    <p>{broadsheet.winnersBox.summary}</p>
                  </div>

                  <div className="gov-broadsheet-wl-card is-loser">
                    <div className="gov-docket-stance-row">
                      <span className="gov-badge gov-badge-crimson">
                        FURIOUS
                      </span>
                      <span className="gov-eyebrow">
                        {broadsheet.losersBox.deltaText}
                      </span>
                    </div>
                    <strong>{broadsheet.losersBox.group}</strong>
                    <p>{broadsheet.losersBox.summary}</p>
                  </div>
                </div>

                {/* Section B: This Month's Developing Crises (2 Detailed Paragraphs) */}
                <section className="gov-broadsheet-editorial-section is-crises">
                  <h2 className="gov-broadsheet-section-heading">
                    THIS MONTH’S DEVELOPING CRISES
                  </h2>
                  <div className="gov-broadsheet-prose">
                    {crisesParas.map((para, idx) => (
                      <p key={`crises-${idx}`}>{para}</p>
                    ))}
                  </div>
                </section>

                {/* Dedicated Public Hearings & Debate Section for Sponsored Bills */}
                {broadsheet.publicHearingsDebate &&
                  broadsheet.publicHearingsDebate.length > 0 && (
                    <section className="gov-broadsheet-hearings-box">
                      <h2 className="gov-broadsheet-section-heading">
                        PUBLIC HEARINGS &amp; DEBATE // SPONSORED BILLS UP FOR
                        VOTE
                      </h2>
                      {broadsheet.publicHearingsDebate.map((h, hIdx) => (
                        <div key={hIdx} className="gov-hearing-item">
                          <strong>{h.billTitle}</strong>
                          <p>{h.analysis}</p>
                          <div className="gov-hearing-quotes">
                            <span>{h.metroChronicleTake}</span>
                            <span>{h.streetlightTake}</span>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
              </div>

              {/* Editorial Crossfire Column (35% width): Rival Op-Eds + By The Numbers (6 Pillars) + Warning */}
              <aside className="gov-broadsheet-side-col">
                <div className="gov-broadsheet-crossfire-box">
                  <div className="gov-eyebrow" style={{ marginBottom: "6px" }}>
                    EDITORIAL CROSSFIRE // RIVAL PRESS
                  </div>
                  <div className="gov-broadsheet-press-quote is-chronicle">
                    <span className="gov-eyebrow gov-text-amber">
                      THE METRO CHRONICLE (PRO-BUSINESS)
                    </span>
                    <p>{broadsheet.metroChronicleTake}</p>
                  </div>
                  <div className="gov-broadsheet-press-quote is-streetlight">
                    <span className="gov-eyebrow gov-text-emerald">
                      THE STREETLIGHT (GRASSROOTS &amp; LABOR)
                    </span>
                    <p>{broadsheet.streetlightTake}</p>
                  </div>
                </div>

                <div className="gov-broadsheet-numbers-box">
                  <div className="gov-eyebrow">
                    BY THE NUMBERS (6 CORE PILLARS)
                  </div>
                  <div className="gov-broadsheet-metrics-list">
                    {pillarCards.map((item) => {
                      const val =
                        item.key === "education"
                          ? civicServices?.education ?? 55
                          : item.key === "health"
                          ? civicServices?.health ?? 55
                          : cityReport.pillars[item.key].currentValue;
                      const rawDelta =
                        item.key === "education"
                          ? civicServices?.educationDelta ?? 0
                          : item.key === "health"
                          ? civicServices?.healthDelta ?? 0
                          : cityReport.pillars[item.key].delta;
                      const deltaRounded = Math.round(rawDelta);
                      const isGood = item.isLowerBetter
                        ? deltaRounded <= 0
                        : deltaRounded >= 0;
                      return (
                        <div
                          key={item.key}
                          className="gov-broadsheet-metric-row"
                        >
                          <span>{item.label}</span>
                          <div>
                            <strong>{Math.round(val)}</strong>
                            <span
                              className={`gov-broadsheet-delta ${
                                deltaRounded === 0
                                  ? ""
                                  : isGood
                                  ? "gov-text-emerald"
                                  : "gov-text-crimson"
                              }`}
                            >
                              {" "}
                              (
                              {deltaRounded >= 0
                                ? `+${deltaRounded}`
                                : deltaRounded}
                              )
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="gov-broadsheet-metric-row is-treasury">
                      <span>TREASURY NET</span>
                      <strong
                        className={
                          treasury.monthlyNet >= 0
                            ? "gov-text-emerald"
                            : "gov-text-crimson"
                        }
                      >
                        {treasury.monthlyNet >= 0 ? "+" : "-"}$
                        {Math.abs(treasury.monthlyNet).toLocaleString()}/mo
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="gov-broadsheet-horizon-box">
                  <div className="gov-eyebrow gov-text-crimson">
                    ON THE HORIZON // COMPTROLLER WARNING
                  </div>
                  <p>{broadsheet.onTheHorizonWarning}</p>
                </div>
              </aside>
            </div>

            {/* Bold Full-Width Call-To-Action at Bottom of Newspaper */}
            <button
              type="button"
              className="gov-btn-proceed-docket gov-btn-proceed-docket-lg"
              onClick={() => switchTab("docket")}
            >
              <span>
                PROCEED TO LEGISLATIVE DOCKET ({pendingCount} ISSUES AWAITING
                VOTE) &rarr;
              </span>
            </button>
          </article>
        ) : (
          /* TAB 2: LEGISLATIVE DOCKET (4 MONTHLY ISSUES + ADVISOR PORTRAITS + OVERRIDE) */
          <section className="gov-center-docket-section">
            <div className="gov-center-docket-header">
              <div>
                <div className="gov-eyebrow">
                  LEGISLATIVE DESK // MONTH {broadsheet.turn} DOCKET (
                  {pendingCount}/4 PENDING)
                </div>
                <h2 className="gov-center-docket-title">
                  ACTIVE MUNICIPAL DILEMMAS
                </h2>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="gov-btn-micro"
                  onClick={() => switchTab("dispatch")}
                >
                  &larr; BACK TO DISPATCH
                </button>
                {webLLMService.isEngineReady() && (
                  <button
                    type="button"
                    className="gov-btn-micro"
                    disabled={isGeneratingDocket}
                    onClick={() => void prefetchContextAwareMonthlyDocket()}
                  >
                    {isGeneratingDocket ? "DRAFTING..." : "REGENERATE VIA AI"}
                  </button>
                )}
              </div>
            </div>

            {/* Issue Tabs (Sponsored Bills + 4 Pillar Issues) */}
            <div className="gov-docket-tabs-grid">
              {monthlyDocket.map((issue) => {
                const isSelected = issue.id === activeIssue?.id;
                const isResolved = issue.status === "RESOLVED";
                return (
                  <button
                    key={issue.id}
                    type="button"
                    className={`gov-docket-tab-btn ${isSelected ? "active" : ""} ${
                      isResolved ? "resolved" : "pending"
                    }`}
                    onClick={() => handleSelectIssue(issue.id, issue.pillar)}
                  >
                    <div className="gov-docket-tab-top">
                      <span>
                        {issue.isSponsoredBill
                          ? "SPONSORED BILL"
                          : PILLAR_LABELS[issue.pillar]}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          alignItems: "center",
                        }}
                      >
                        {issue.isSponsoredBill && (
                          <span className="gov-badge gov-badge-crimson">
                            UP FOR VOTE
                          </span>
                        )}
                        {!issue.isSponsoredBill && issue.isFollowUpArc && (
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

            {/* Active Issue Card */}
            {activeIssue && (
              <div className="gov-docket-issue-body">
                <div className="gov-docket-issue-header">
                  <div>
                    <div
                      className="gov-eyebrow"
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        TARGET PILLAR: {PILLAR_LABELS[activeIssue.pillar]}
                      </span>
                      {activeIssue.isSponsoredBill && (
                        <span className="gov-badge gov-badge-crimson">
                          SPONSORED BILL — UP FOR VOTE
                        </span>
                      )}
                      {activeIssue.domainTag && (
                        <span className="gov-badge gov-badge-muted">
                          {activeIssue.domainTag.toUpperCase()}
                        </span>
                      )}
                      {(activeIssue.influencedByLawTitle ||
                        activeIssue.parentLawTitle) && (
                        <span className="gov-badge gov-badge-amber">
                          LAW INTERACTION: Influenced by “
                          {activeIssue.influencedByLawTitle ??
                            activeIssue.parentLawTitle}
                          ”
                        </span>
                      )}
                      {activeIssue.isAIGenerated && (
                        <span className="gov-badge gov-badge-cyan">
                          WEBLLM SYNTHESIZED
                        </span>
                      )}
                    </div>
                    <h3 className="gov-center-issue-title">
                      {activeIssue.title}
                    </h3>
                  </div>
                  {activeIssue.status === "RESOLVED" && (
                    <span className="gov-badge gov-badge-emerald">
                      RESOLVED: {activeIssue.resolvedWithLabel}
                    </span>
                  )}
                </div>

                <p className="gov-modal-desc">{activeIssue.briefing}</p>

                {/* Expressive Advisor Portraits & Pre-Vote Trade-Off Warnings */}
                <AdvisorBriefingBar hoveredOption={hoveredPreset} />

                {/* 3 Distinct Preset Options */}
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
                        className={`gov-crisis-choice-card gov-docket-preset-hoverable is-opt-${
                          idx + 1
                        }`}
                        onMouseEnter={() => setHoveredPreset(preset)}
                        onMouseLeave={() => setHoveredPreset(null)}
                        onFocus={() => setHoveredPreset(preset)}
                        onBlur={() => setHoveredPreset(null)}
                      >
                        <div>
                          <div className="gov-docket-stance-row">
                            <span className="gov-badge gov-badge-cyan">
                              OPTION #{idx + 1}:{" "}
                              {preset.stanceLabel.toUpperCase()}
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

                        <div className="gov-choice-math-box">
                          <div className="gov-math-row">
                            <span>Monthly Budget:</span>
                            <strong
                              className={
                                eff.budget_impact.monthly_change >= 0
                                  ? "gov-text-emerald"
                                  : "gov-text-crimson"
                              }
                            >
                              {eff.budget_impact.monthly_change >= 0 ? "+" : ""}
                              ${eff.budget_impact.monthly_change.toLocaleString()}
                              /mo
                            </strong>
                          </div>
                          <div className="gov-modifier-chip-row">
                            {eff.heatmap_modifiers.map((hm, hIdx) => (
                              <span
                                key={`${hm.metric}-${hIdx}`}
                                className="gov-chip"
                              >
                                {hm.metric}:{" "}
                                {hm.change > 0 ? `+${hm.change}` : hm.change}
                              </span>
                            ))}
                            {eff.demographic_approval.map((dm, dIdx) => (
                              <span
                                key={`${dm.demographic}-${dIdx}`}
                                className="gov-chip"
                              >
                                {dm.demographic}:{" "}
                                {dm.change > 0
                                  ? `+${dm.change}%`
                                  : `${dm.change}%`}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="gov-btn-enact"
                          disabled={
                            isResolved ||
                            !canAfford ||
                            isTurnPausedForCrisis ||
                            Boolean(gameOverReason)
                          }
                          onClick={() => {
                            soundEffects.playUiClick();
                            resolveDocketIssuePreset(
                              activeIssue.id,
                              idx as 0 | 1 | 2
                            );
                          }}
                        >
                          {isResolved
                            ? "ISSUE RESOLVED"
                            : !canAfford
                            ? `NEED ${preset.capitalCost} CAP`
                            : `ENACT OPTION #${idx + 1} ${buttonCostSuffix}`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Option 4: Custom Executive Override + Stress-Test */}
                <form
                  className="gov-docket-custom-box"
                  onSubmit={handleCustomOverrideSubmit}
                >
                  <div className="gov-docket-custom-header">
                    <span className="gov-eyebrow">
                      OPTION #4: CUSTOM EXECUTIVE OVERRIDE (COSTS{" "}
                      {DOCKET_CUSTOM_CAPITAL_COST} CAPITAL)
                    </span>
                    <span className="gov-eyebrow">
                      AVAILABLE CAPITAL: {Math.round(politicalCapital)}/100
                    </span>
                  </div>
                  <div className="gov-terminal-input-row">
                    <input
                      type="text"
                      className="gov-policy-input"
                      placeholder={`Write your own policy for "${activeIssue.title}"...`}
                      value={customOverrideInput}
                      maxLength={140}
                      disabled={
                        activeIssue.status === "RESOLVED" ||
                        isCompilingOverride ||
                        isTurnPausedForCrisis ||
                        Boolean(gameOverReason)
                      }
                      onChange={(e) => setCustomOverrideInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="gov-btn-stress-test"
                      disabled={
                        !customOverrideInput.trim() ||
                        isStressTesting ||
                        isCompilingOverride ||
                        activeIssue.status === "RESOLVED"
                      }
                      onClick={() => void handleStressTestOverride()}
                    >
                      {isStressTesting ? "AUDITING..." : "STRESS-TEST"}
                    </button>
                    <button
                      type="submit"
                      className="gov-btn-enact"
                      disabled={
                        !customOverrideInput.trim() ||
                        activeIssue.status === "RESOLVED" ||
                        isCompilingOverride ||
                        politicalCapital < DOCKET_CUSTOM_CAPITAL_COST ||
                        isTurnPausedForCrisis ||
                        Boolean(gameOverReason)
                      }
                    >
                      {isCompilingOverride
                        ? "COMPILING..."
                        : `ENACT OVERRIDE (-${DOCKET_CUSTOM_CAPITAL_COST} CAP)`}
                    </button>
                  </div>
                  {overrideFeedback && (
                    <div className="gov-compiler-note">{overrideFeedback}</div>
                  )}
                </form>
              </div>
            )}

            {/* Two-Turn "Sponsor Custom Bill for Next Month" Panel */}
            <form
              className="gov-sponsor-bill-box"
              onSubmit={handleSponsorBillSubmit}
            >
              <div className="gov-docket-custom-header">
                <span className="gov-eyebrow gov-text-cyan">
                  + SPONSOR CUSTOM BILL (10 CAPITAL — NEXT-MONTH BALLOT &amp;
                  PUBLIC DEBATE)
                </span>
                <span className="gov-eyebrow">
                  QUEUED FOR NEXT MONTH: {pendingSponsoredBills.length}
                </span>
              </div>
              <div className="gov-terminal-input-row">
                <input
                  type="text"
                  className="gov-policy-input"
                  placeholder='Introduce any custom ordinance for public hearings & next month vote (e.g., "Legalize midnight rooftop food markets")...'
                  value={sponsorBillInput}
                  maxLength={140}
                  disabled={
                    isDraftingBill ||
                    isTurnPausedForCrisis ||
                    Boolean(gameOverReason)
                  }
                  onChange={(e) => setSponsorBillInput(e.target.value)}
                />
                <button
                  type="submit"
                  className="gov-btn-civic-teal"
                  disabled={
                    !sponsorBillInput.trim() ||
                    isDraftingBill ||
                    politicalCapital < 10 ||
                    isTurnPausedForCrisis ||
                    Boolean(gameOverReason)
                  }
                >
                  {isDraftingBill
                    ? "DRAFTING BILL..."
                    : "+ SPONSOR CUSTOM BILL (-10 CAP)"}
                </button>
              </div>
              {pendingSponsoredBills.length > 0 && (
                <div className="gov-modifier-chip-row" style={{ marginTop: "6px" }}>
                  {pendingSponsoredBills.map((b) => (
                    <span key={b.id} className="gov-badge gov-badge-cyan">
                      QUEUED FOR MONTH {b.introducedTurn + 1}: {b.formalTitle}
                    </span>
                  ))}
                </div>
              )}
              {sponsorFeedback && (
                <div className="gov-compiler-note">{sponsorFeedback}</div>
              )}
            </form>
          </section>
        )}
      </div>
    </div>
  );
};
