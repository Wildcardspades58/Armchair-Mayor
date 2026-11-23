// ============================================================================
// GOVERNOR — Left Panel: Vibe Feed, Tension Watch & Full "Enacted Laws" Ledger
// - Top Sub-Section: Boiling Point Tension Meters (Crime, Transit, Sanitation: 0-100)
//   + Quick Triggers for "STATE OF THE CITY REPORT" and "MONTHLY DOCKET (4 ISSUES)".
// - Bottom Sub-Section:
//   * VIBE FEED (`news_ticker`): Live narrative headlines & fallout.
//   * ENACTED LAWS LEDGER: Full legislative record showing Month Enacted & Source,
//     Full Policy Title & Original Text / Chosen Option, Exact Clamped Impact Badges
//     (Monthly Treasury, Heatmap deltas, Demographic approval shifts, Fallout),
//     and a Strategic "REPEAL LAW (-10 CAP)" action to free up monthly budget.
// ============================================================================

import React, { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { Demographic, TensionKey, VibeFeedEntry } from "../types/simulation";
import { REPEAL_POLICY_CAPITAL_COST } from "../services/docketService";

const TENSION_LABELS: Record<TensionKey, { label: string; triggerHint: string }> = {
  Crime: {
    label: "Crime Tension",
    triggerHint: "Rises when District Crime exceeds 48 or Public Safety is underfunded",
  },
  Transit: {
    label: "Transit Tension",
    triggerHint: "Rises when District Traffic exceeds 50 or Infrastructure is underfunded",
  },
  Sanitation: {
    label: "Sanitation Tension",
    triggerHint: "Rises when District Pollution exceeds 45 or Environmental Bureau is underfunded",
  },
};

const CATEGORY_BADGES: Record<VibeFeedEntry["category"], { label: string; cls: string }> = {
  policy: { label: "DIRECTIVE", cls: "gov-badge-cyan" },
  economy: { label: "GROWTH", cls: "gov-badge-emerald" },
  tension: { label: "TENSION", cls: "gov-badge-amber" },
  election: { label: "BALLOT", cls: "gov-badge-cyan" },
  crisis: { label: "CRISIS", cls: "gov-badge-crimson" },
  staff: { label: "CABINET", cls: "gov-badge-amber" },
};

const METRIC_PRETTY: Record<string, string> = {
  crime: "Crime",
  pollution: "Pollution",
  land_value: "Land Value",
  traffic: "Traffic",
  education: "Education",
  health: "Public Health",
};

const DEMO_PRETTY: Record<Demographic, string> = {
  working_class: "Working Class",
  wealthy: "Wealthy",
  business: "Business",
  environmentalists: "Environmentalists",
};

export const LeftVibeFeed: React.FC = () => {
  const news_ticker = useGameStore((s) => s.news_ticker);
  const enactedPolicies = useGameStore((s) => s.enactedPolicies);
  const tensions = useGameStore((s) => s.tensions);
  const monthlyDocket = useGameStore((s) => s.monthlyDocket);
  const politicalCapital = useGameStore((s) => s.voterSentiment.politicalCapital);
  const setShowCityReportModal = useGameStore((s) => s.setShowCityReportModal);
  const setCenterDeskTab = useGameStore((s) => s.setCenterDeskTab);
  const repealEnactedPolicy = useGameStore((s) => s.repealEnactedPolicy);

  const [activeTab, setActiveTab] = useState<"dossiers" | "feed">("dossiers");
  const [pressFilter, setPressFilter] = useState<
    "all" | "The Metro Chronicle" | "The Streetlight"
  >("all");

  const getRivalEditorialSpins = (item: VibeFeedEntry) => {
    const lower = item.headline.toLowerCase();
    let chronicle =
      item.chronicleSpin ??
      "Chronicle Editorial: Markets & property owners watch City Hall's fiscal discipline closely.";
    let streetlight =
      item.streetlightSpin ??
      "Streetlight Dispatch: Working families ask whether this directive helps outer neighborhoods.";

    if (item.category === "crisis") {
      chronicle =
        "The Metro Chronicle: 'Executive stability tested as emergency rocks municipal bond confidence.'";
      streetlight =
        "The Streetlight: 'Neighborhoods demand immediate relief, not corporate bailouts!'";
    } else if (/tax|levy|fine|austerity|cut|privat|business/.test(lower)) {
      chronicle =
        "The Metro Chronicle: 'Fiscal hawks weigh commercial competitiveness and municipal solvency.'";
      streetlight =
        "The Streetlight: 'Working-class wards brace for the real cost on main street.'";
    } else if (/green|solar|pollut|clean|bus|rail|transit|housing/.test(lower)) {
      chronicle =
        "The Metro Chronicle: 'Chamber warns costly municipal mandates may squeeze downtown margins.'";
      streetlight =
        "The Streetlight: 'Grassroots coalition cheers bold public investment in working wards.'";
    }

    return { chronicle, streetlight };
  };

  const pendingDocketCount = monthlyDocket.filter(
    (i) => i.status === "PENDING"
  ).length;

  return (
    <aside className="gov-left-panel">
      {/* Top Sub-Section: Boiling Point Tension Meters (0-100) + Quick Briefing Buttons */}
      <section className="gov-panel-section gov-tension-box">
        <div className="gov-section-header">
          <span className="gov-section-title">BOILING POINT TENSIONS (0–100)</span>
          <span className="gov-section-sub">100 = CRISIS</span>
        </div>

        <div className="gov-tension-list">
          {(Object.keys(TENSION_LABELS) as TensionKey[]).map((key) => {
            const val = tensions[key];
            const meta = TENSION_LABELS[key];
            const barClass =
              val >= 80
                ? "gov-bar-crimson"
                : val >= 55
                ? "gov-bar-amber"
                : "gov-bar-cyan";

            return (
              <div key={key} className="gov-tension-item" title={meta.triggerHint}>
                <div className="gov-tension-label-row">
                  <span className="gov-tension-name">{meta.label}</span>
                  <span
                    className={`gov-tension-val ${
                      val >= 80
                        ? "gov-text-crimson"
                        : val >= 55
                        ? "gov-text-amber"
                        : ""
                    }`}
                  >
                    {Math.round(val)}/100
                  </span>
                </div>
                <div className="gov-progress-track">
                  <div
                    className={`gov-progress-fill ${barClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Executive Quick-Access Buttons: City Report & Proceed to Legislative Docket */}
        <div className="gov-quick-briefing-col">
          <button
            type="button"
            className="gov-btn-proceed-docket"
            onClick={() => setCenterDeskTab("docket")}
          >
            PROCEED TO LEGISLATIVE DOCKET ({pendingDocketCount} ISSUES AWAITING VOTE) &rarr;
          </button>
          <button
            type="button"
            className="gov-btn-quick-report"
            onClick={() => setShowCityReportModal(true)}
          >
            CHARTS &amp; POLITICAL COMPASS
          </button>
        </div>
      </section>

      {/* Bottom Sub-Section: Active Enacted Laws Ledger (Primary) & Dispatch Log */}
      <section className="gov-panel-section gov-feed-box">
        <div className="gov-tab-row">
          <button
            type="button"
            className={`gov-tab-btn ${activeTab === "dossiers" ? "active" : ""}`}
            onClick={() => setActiveTab("dossiers")}
          >
            ACTIVE ENACTED LAWS ({enactedPolicies.length})
          </button>
          <button
            type="button"
            className={`gov-tab-btn ${activeTab === "feed" ? "active" : ""}`}
            onClick={() => setActiveTab("feed")}
          >
            EVENT LOG ({news_ticker.length})
          </button>
        </div>

        {activeTab === "feed" ? (
          <>
            {/* Competing Local Newspapers Switcher: The Metro Chronicle vs. The Streetlight */}
            <div className="gov-press-filter-row">
              <button
                type="button"
                className={`gov-press-pill ${
                  pressFilter === "all" ? "active" : ""
                }`}
                onClick={() => setPressFilter("all")}
              >
                BOTH OUTLETS
              </button>
              <button
                type="button"
                className={`gov-press-pill ${
                  pressFilter === "The Metro Chronicle" ? "active" : ""
                }`}
                onClick={() => setPressFilter("The Metro Chronicle")}
              >
                METRO CHRONICLE
              </button>
              <button
                type="button"
                className={`gov-press-pill ${
                  pressFilter === "The Streetlight" ? "active" : ""
                }`}
                onClick={() => setPressFilter("The Streetlight")}
              >
                THE STREETLIGHT
              </button>
            </div>

            <div className="gov-feed-scroll">
              {news_ticker.map((item) => {
                const badge = CATEGORY_BADGES[item.category];
                const spins = getRivalEditorialSpins(item);

                return (
                  <article key={item.id} className="gov-feed-card">
                    <div className="gov-feed-card-meta">
                      <span className={`gov-badge ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="gov-feed-turn">MONTH {item.turn}</span>
                    </div>
                    <p className="gov-feed-headline">{item.headline}</p>

                    {/* Dual Rival Outlet Slants */}
                    <div className="gov-rival-outlets-box">
                      {(pressFilter === "all" ||
                        pressFilter === "The Metro Chronicle") && (
                        <div className="gov-outlet-chronicle">
                          <strong>📰</strong> {spins.chronicle}
                        </div>
                      )}
                      {(pressFilter === "all" ||
                        pressFilter === "The Streetlight") && (
                        <div className="gov-outlet-streetlight">
                          <strong>🔥</strong> {spins.streetlight}
                        </div>
                      )}
                    </div>

                    {item.unintendedConsequence && (
                      <div className="gov-feed-consequence">
                        <strong>FALLOUT:</strong> {item.unintendedConsequence}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="gov-feed-scroll">
            {enactedPolicies.length === 0 ? (
              <div className="gov-empty-state">
                No laws enacted yet. Resolve issues from the Monthly Docket (4
                Issues) or sign a Custom Executive Order below.
              </div>
            ) : (
              enactedPolicies.map((pol) => {
                const canAffordRepeal =
                  politicalCapital >= REPEAL_POLICY_CAPITAL_COST;
                const budgetDelta = pol.budget_impact.monthly_change;

                return (
                  <article key={pol.id} className="gov-feed-card gov-law-ledger-card">
                    {/* 1. Month Enacted & Source + Monthly Treasury Impact */}
                    <div className="gov-feed-card-meta">
                      <span className="gov-badge gov-badge-cyan">
                        {pol.sourceLabel || `Month ${pol.enactedTurn} — Executive Order`}
                      </span>
                      <strong
                        className={
                          budgetDelta >= 0
                            ? "gov-text-emerald"
                            : "gov-text-crimson"
                        }
                      >
                        {budgetDelta >= 0 ? "+" : ""}$
                        {budgetDelta.toLocaleString()}/mo
                      </strong>
                    </div>

                    {/* 2. Full Policy Title & Dilemma Context */}
                    <div className="gov-law-title">{pol.policy_name}</div>
                    {pol.issueTitle && (
                      <div className="gov-law-issue-ref">
                        Dilemma: <em>{pol.issueTitle}</em>
                      </div>
                    )}

                    {/* 3. Full Original Text / Chosen Option & Media Headline */}
                    {pol.originalPromptText && (
                      <div className="gov-law-original-text">
                        &ldquo;{pol.originalPromptText}&rdquo;
                      </div>
                    )}
                    <div className="gov-law-headline">
                      Headline: {pol.vibe_feed_headline}
                    </div>

                    {/* 4. Exact Clamped Applied Impact Badges */}
                    <div className="gov-modifier-chip-row">
                      {pol.heatmap_modifiers.map((m, idx) => {
                        const isGood =
                          m.metric === "land_value"
                            ? m.change > 0
                            : m.change < 0;
                        return (
                          <span
                            key={`${m.metric}-${idx}`}
                            className={`gov-chip ${
                              isGood ? "gov-text-emerald" : "gov-text-amber"
                            }`}
                          >
                            {METRIC_PRETTY[m.metric]}:{" "}
                            {m.change > 0 ? `+${m.change}` : m.change}
                          </span>
                        );
                      })}
                      {pol.demographic_approval.map((d, idx) => (
                        <span
                          key={`${d.demographic}-${idx}`}
                          className={`gov-chip ${
                            d.change >= 0
                              ? "gov-text-emerald"
                              : "gov-text-crimson"
                          }`}
                        >
                          {DEMO_PRETTY[d.demographic]}:{" "}
                          {d.change > 0 ? `+${d.change}%` : `${d.change}%`}
                        </span>
                      ))}
                    </div>

                    {/* 5. Fallout Consequence (if any) */}
                    {pol.unintended_consequence_trigger && (
                      <div className="gov-feed-consequence">
                        <strong>FALLOUT:</strong>{" "}
                        {pol.unintended_consequence_trigger}
                      </div>
                    )}

                    {/* 6. Strategic Repeal Option */}
                    <div className="gov-law-repeal-row">
                      <button
                        type="button"
                        className="gov-btn-repeal"
                        disabled={!canAffordRepeal}
                        title={
                          !canAffordRepeal
                            ? `Requires ${REPEAL_POLICY_CAPITAL_COST} Political Capital to repeal`
                            : `Repeal "${pol.policy_name}" and reverse its ${
                                budgetDelta >= 0 ? "+" : ""
                              }$${budgetDelta.toLocaleString()}/mo budget impact`
                        }
                        onClick={() => repealEnactedPolicy(pol.id)}
                      >
                        REPEAL LAW (-{REPEAL_POLICY_CAPITAL_COST} CAP)
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>
    </aside>
  );
};
