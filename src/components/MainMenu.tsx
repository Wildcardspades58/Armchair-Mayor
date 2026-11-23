// ============================================================================
// GOVERNOR — Bonus Step 3: The Main Menu & Onboarding ("Classified Briefing")
// Overlays the entire screen on load with a dark, minimalist, high-tech command
// terminal above the slow-pulsing 2D react-konva 10x10 blueprint grid.
// - "New Campaign": Triggers initializeCity() ("The Inherited Mess") and hides the menu.
// - "Classified Briefing (How to Play)": Opens a 3-tabbed onboarding modal
//   explaining The Dashboard, The Policy Desk, and The AI Engine.
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { generateCustomCityScenario } from "../services/webllmService";
import {
  CampaignTermMode,
  STARTING_ARCHETYPES,
  StartingArchetype,
} from "../types/simulation";
import { soundEffects } from "../services/soundEffects";

export interface MainMenuProps {
  onStartCampaign: () => void;
}

type BriefingTab = "dashboard" | "policy_desk" | "ai_engine";

export const MainMenu: React.FC<MainMenuProps> = ({ onStartCampaign }) => {
  const initializeCity = useGameStore((s) => s.initializeCity);
  const initializeCustomCityScenario = useGameStore(
    (s) => s.initializeCustomCityScenario
  );
  const [showBriefingModal, setShowBriefingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<BriefingTab>("dashboard");
  const [selectedPreset, setSelectedPreset] = useState<
    StartingArchetype | "RANDOM" | "CUSTOM"
  >("RANDOM");
  const [selectedTermMode, setSelectedTermMode] =
    useState<CampaignTermMode>("two_term_48");
  const [customScenarioPrompt, setCustomScenarioPrompt] = useState("");
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);

  const handleLaunchNewCampaign = async () => {
    soundEffects.playUiClick();
    if (selectedPreset === "CUSTOM" && customScenarioPrompt.trim()) {
      setIsGeneratingScenario(true);
      try {
        const scenario = await generateCustomCityScenario(
          customScenarioPrompt.trim()
        );
        initializeCustomCityScenario(scenario, selectedTermMode);
      } finally {
        setIsGeneratingScenario(false);
      }
    } else if (selectedPreset === "RANDOM" || selectedPreset === "CUSTOM") {
      initializeCity(undefined, selectedTermMode);
    } else {
      initializeCity(selectedPreset, selectedTermMode);
    }
    onStartCampaign();
  };

  return (
    <div className="gov-mainmenu-overlay">
      {/* Central Mayor's Desk & Civic Charter Landing Card */}
      <div className="gov-mainmenu-card">
        <div className="gov-mainmenu-eyebrow">
          MAYOR’S DESK &amp; CIVIC CHARTER // LOCAL WEBGPU AI EDITION
        </div>

        <h1 className="gov-mainmenu-title">ARMCHAIR MAYOR</h1>

        <p className="gov-mainmenu-subtitle">
          Civic Governance by Broadsheet &amp; Decree. Read the front-page
          fallout, steer public debate, and shape your city’s historical legacy.
        </p>

        {/* Concise 4-Step "How to Govern" Briefing Card */}
        <div className="gov-mainmenu-primer-box">
          <div className="gov-eyebrow" style={{ marginBottom: "6px" }}>
            HOW TO GOVERN (4-STEP BRIEFING)
          </div>
          <div className="gov-mainmenu-primer-grid">
            <div className="gov-primer-step">
              <strong>1. Read The Municipal Dispatch</strong>
              <span>
                Analyze multi-paragraph street-level fallout of last month’s
                laws and rival newspaper crossfire.
              </span>
            </div>
            <div className="gov-primer-step">
              <strong>2. Set Doctrines &amp; Vote on the Docket</strong>
              <span>
                Set broad governing doctrines and vote on 4 monthly AI-generated
                crises across 6 Core Pillars.
              </span>
            </div>
            <div className="gov-primer-step">
              <strong>3. Sponsor Bills vs. Executive Orders</strong>
              <span>
                Queue custom bills for next month’s debate (10 Cap), or bypass
                council immediately with Executive Orders (25 Cap, high backlash).
              </span>
            </div>
            <div className="gov-primer-step">
              <strong>4. Survive &amp; Build Your Legacy</strong>
              <span>
                Keep Approval above 25%, avoid sustained Treasury deficits, and
                earn your End-of-Term Historical Legacy Chronicle.
              </span>
            </div>
          </div>
        </div>

        {/* Optional Scenario Selector (Defaults to Pure RNG "The Inherited Mess") */}
        <div className="gov-mainmenu-preset-box">
          <span className="gov-eyebrow">
            TURN 1 PROCEDURAL SCENARIO (&ldquo;THE INHERITED MESS&rdquo;)
          </span>
          <div className="gov-preset-pill-row">
            <button
              type="button"
              className={`gov-preset-pill ${
                selectedPreset === "RANDOM" ? "active" : ""
              }`}
              onClick={() => setSelectedPreset("RANDOM")}
            >
              RANDOM DISASTER (RNG)
            </button>
            {STARTING_ARCHETYPES.map((arch) => (
              <button
                key={arch}
                type="button"
                className={`gov-preset-pill ${
                  selectedPreset === arch ? "active" : ""
                }`}
                onClick={() => setSelectedPreset(arch)}
              >
                {arch.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className={`gov-preset-pill ${
                selectedPreset === "CUSTOM" ? "active" : ""
              }`}
              onClick={() => setSelectedPreset("CUSTOM")}
            >
              ★ CUSTOM SCENARIO PROMPT
            </button>
          </div>

          {selectedPreset === "CUSTOM" && (
            <input
              type="text"
              className="gov-policy-input"
              placeholder='Describe any city (e.g. "Flooded cyberpunk harbor run by dock unions")...'
              value={customScenarioPrompt}
              maxLength={140}
              onChange={(e) => setCustomScenarioPrompt(e.target.value)}
            />
          )}

          {/* Term-Length Selector */}
          <div style={{ marginTop: "0.75rem" }}>
            <div className="gov-section-title" style={{ marginBottom: "0.4rem" }}>
              CAMPAIGN TERM LENGTH
            </div>
            <div className="gov-preset-pills">
              {(
                [
                  {
                    id: "single_24",
                    label: "SINGLE TERM (24M)",
                    title: "One 24-month administration ending in a final legacy review.",
                  },
                  {
                    id: "two_term_48",
                    label: "TWO-TERM LEGACY (48M)",
                    title:
                      "48-month legacy run with rising voter expectations & aging infrastructure in Term 2.",
                  },
                  {
                    id: "endless",
                    label: "PERPETUAL SANDBOX (ENDLESS)",
                    title:
                      "Govern indefinitely and use 'Retire & Review Legacy' whenever you are ready.",
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  title={mode.title}
                  className={`gov-preset-pill ${
                    selectedTermMode === mode.id ? "active" : ""
                  }`}
                  onClick={() => {
                    soundEffects.playUiClick();
                    setSelectedTermMode(mode.id);
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="gov-mainmenu-actions">
          <button
            type="button"
            className="gov-btn-new-campaign"
            disabled={isGeneratingScenario}
            onClick={() => void handleLaunchNewCampaign()}
          >
            {isGeneratingScenario
              ? "GENERATING CUSTOM SCENARIO..."
              : "NEW CAMPAIGN"}
          </button>

          <button
            type="button"
            className="gov-btn-classified-briefing"
            onClick={() => setShowBriefingModal(true)}
          >
            CLASSIFIED BRIEFING (HOW TO PLAY)
          </button>
        </div>

        <div className="gov-mainmenu-footer-meta">
          <span>1 TURN = 1 MONTH</span>
          <span>•</span>
          <span>24-TURN ELECTION CYCLE</span>
          <span>•</span>
          <span>100% LOCAL WEBGPU SANDBOX</span>
        </div>
      </div>

      {/* Onboarding Modal: "Classified Briefing (How to Play)" */}
      {showBriefingModal && (
        <div className="gov-modal-backdrop" onClick={() => setShowBriefingModal(false)}>
          <div
            className="gov-modal-card gov-briefing-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gov-modal-header">
              <span className="gov-badge gov-badge-cyan">
                EYES ONLY // EXECUTIVE TRANSITION DOSSIER
              </span>
              <span className="gov-eyebrow">OPERATIONAL MANUAL</span>
            </div>

            <h2 className="gov-modal-title">
              CLASSIFIED BRIEFING: HOW TO PLAY
            </h2>

            {/* 3 Briefing Tabs */}
            <div className="gov-briefing-tabs">
              <button
                type="button"
                className={`gov-tab-btn ${
                  activeTab === "dashboard" ? "active" : ""
                }`}
                onClick={() => setActiveTab("dashboard")}
              >
                1. THE DASHBOARD
              </button>
              <button
                type="button"
                className={`gov-tab-btn ${
                  activeTab === "policy_desk" ? "active" : ""
                }`}
                onClick={() => setActiveTab("policy_desk")}
              >
                2. THE POLICY DESK
              </button>
              <button
                type="button"
                className={`gov-tab-btn ${
                  activeTab === "ai_engine" ? "active" : ""
                }`}
                onClick={() => setActiveTab("ai_engine")}
              >
                3. THE AI ENGINE (CRITICAL)
              </button>
            </div>

            {/* Tab Content Body */}
            <div className="gov-briefing-content-box">
              {activeTab === "dashboard" && (
                <div className="gov-briefing-panel">
                  <div className="gov-briefing-section-tag">
                    SECTION 01 // THE EXECUTIVE DASHBOARD &amp; TENSION METERS
                  </div>
                  <p className="gov-briefing-quote">
                    &ldquo;You are not placing buildings. You are an executive.
                    Watch the Tension Meters (Crime, Transit, Sanitation). If
                    they hit 100, a crisis triggers.&rdquo;
                  </p>
                  <ul className="gov-briefing-list">
                    <li>
                      <strong>The Inherited Mess:</strong> On Turn 1, you
                      inherit a deeply flawed 10x10 city grid from the previous
                      Mayor (Rust Belt Decay, Silicon Boomtown, or Corrupt
                      Machine).
                    </li>
                    <li>
                      <strong>Appointees &amp; Scapegoats:</strong> Hire high-competence
                      Department Heads for up to a 0.5%/pt upkeep discount—or fire
                      them during a scandal (beware low-loyalty press leaks!).
                    </li>
                    <li>
                      <strong>Hard Fail States:</strong> Avoid Municipal
                      Bankruptcy (negative reserves + deficit for 2 consecutive
                      turns) and Voter Recall Elections (&lt;25% approval for 3
                      consecutive turns).
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === "policy_desk" && (
                <div className="gov-briefing-panel">
                  <div className="gov-briefing-section-tag">
                    SECTION 02 // THE POLICY DESK &amp; CRISIS RESPONSE
                  </div>
                  <p className="gov-briefing-quote">
                    &ldquo;When a crisis triggers, you can pick a standard
                    response, or type a Custom Executive Order. You can also
                    type custom policies at any time from your desk.&rdquo;
                  </p>
                  <ul className="gov-briefing-list">
                    <li>
                      <strong>Custom Executive Orders:</strong> Type any policy
                      directive into the bottom Policy Desk to shift heatmaps,
                      tax revenues, and voter demographics.
                    </li>
                    <li>
                      <strong>Boiling Point &amp; Wildcard Crises:</strong> When
                      a Tension Meter hits 100—or a 10% Exogenous Macro Wildcard
                      strikes—choose from 3 mathematical options or propose your
                      own Custom Solution.
                    </li>
                    <li>
                      <strong>Turn 24 Election Campaign:</strong> At the end of
                      your 2-year term, convert your Treasury surplus and
                      Corporate connections into a War Chest to defeat your AI
                      Challenger at the ballot box.
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === "ai_engine" && (
                <div className="gov-briefing-panel">
                  <div className="gov-briefing-section-tag gov-text-amber">
                    SECTION 03 // THE IN-BROWSER WEBGPU AI &amp; GUARDRAILS (CRITICAL)
                  </div>
                  <p className="gov-briefing-quote">
                    &ldquo;This game runs a live AI inside your browser to
                    simulate the City Council and voters. When you submit a
                    custom order, the game may pause for a few seconds while
                    your local hardware processes the political consequences. Do
                    not try to cheat the system with magic or infinite
                    money—the AI will reject unconstitutional orders.&rdquo;
                  </p>
                  <ul className="gov-briefing-list">
                    <li>
                      <strong>Strict Mathematical Clamping:</strong> Every AI
                      response is sandboxed and physically clamped (Custom
                      Policies: ±$100K budget, ±20 heatmap, ±15% approval;
                      Crises: ±$250K budget, ±30 heatmap, ±20% approval).
                    </li>
                    <li>
                      <strong>2-Strike Gridlock Penalty:</strong> During a
                      crisis, if you submit nonsense, magic, or unconstitutional
                      proposals twice in a row, City Council forces Gridlock and
                      automatically enacts Option #3 (Worst Consequences).
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="gov-briefing-footer">
              <button
                type="button"
                className="gov-btn-ghost"
                onClick={() => setShowBriefingModal(false)}
              >
                RETURN TO MAIN MENU
              </button>
              <button
                type="button"
                className="gov-btn-enact"
                onClick={() => {
                  setShowBriefingModal(false);
                  handleLaunchNewCampaign();
                }}
              >
                ACKNOWLEDGE &amp; LAUNCH NEW CAMPAIGN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
