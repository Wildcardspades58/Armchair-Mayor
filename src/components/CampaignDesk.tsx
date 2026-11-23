// ============================================================================
// GOVERNOR — Step 5.3: The Campaign Desk (Turn 24 Election Mode Bottom Panel)
// Replaces the Policy Desk when `isElectionMode` is true.
// - Displays WarChest balance (10% of Treasury surplus + Corporate culture bonus),
//   Player Polling vs. AI_Challenger Polling.
// - Presents the 3 clickable Campaign Actions:
//   1. Grassroots Rally (Low Cost $40K): +2% to +4% Polling swing (RNG)
//   2. Smear Campaign (Medium Cost $90K): +5% Polling swing, adds +1 to Crime_Tension
//   3. Media Blitz (High Cost $160K): Guaranteed +8% Polling swing
// - Includes the massive "HOLD ELECTION" resolution button.
// ============================================================================

import React from "react";
import { CAMPAIGN_ACTION_COSTS, useGameStore } from "../store/useGameStore";
import { CampaignActionType } from "../types/simulation";

export const CampaignDesk: React.FC = () => {
  const electionCampaign = useGameStore((s) => s.electionCampaign);
  const executeCampaignAction = useGameStore((s) => s.executeCampaignAction);
  const holdElection = useGameStore((s) => s.holdElection);

  const { warChest, playerPollingPct, challenger, actionLog } = electionCampaign;
  const isLeading = playerPollingPct >= challenger.pollingPct;

  const actions: CampaignActionType[] = [
    "grassroots_rally",
    "smear_campaign",
    "media_blitz",
  ];

  return (
    <footer className="gov-campaign-desk">
      {/* 1. War Chest & Head-to-Head Polling Readout */}
      <div className="gov-campaign-summary">
        <div className="gov-eyebrow">TURN 24 CAMPAIGN HEADQUARTERS</div>
        <div className="gov-warchest-row">
          <span className="gov-warchest-label">WAR CHEST:</span>
          <span className="gov-warchest-val">
            ${warChest.toLocaleString()}
          </span>
        </div>
        <div className="gov-polling-versus">
          <span className="gov-poll-blue">
            YOU: <strong>{playerPollingPct.toFixed(1)}%</strong>
          </span>
          <span className="gov-poll-vs">VS</span>
          <span className="gov-poll-red">
            {challenger.name.toUpperCase()}:{" "}
            <strong>{challenger.pollingPct.toFixed(1)}%</strong>
          </span>
        </div>
        {actionLog[0] && (
          <div className="gov-campaign-last-log">{actionLog[0]}</div>
        )}
      </div>

      {/* 2. The 3 Clickable Campaign Actions (Spend War Chest) */}
      <div className="gov-campaign-actions-grid">
        {actions.map((actKey) => {
          const meta = CAMPAIGN_ACTION_COSTS[actKey];
          const canAfford = warChest >= meta.cost;

          return (
            <button
              key={actKey}
              type="button"
              className="gov-campaign-action-btn"
              disabled={!canAfford}
              onClick={() => executeCampaignAction(actKey)}
            >
              <div className="gov-camp-btn-top">
                <span className="gov-camp-btn-title">{meta.label}</span>
                <span className="gov-badge gov-badge-cyan">
                  ${(meta.cost / 1000).toFixed(0)}K
                </span>
              </div>
              <span className="gov-camp-btn-desc">{meta.desc}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Massive "HOLD ELECTION" Resolution Button */}
      <div className="gov-hold-election-box">
        <button
          type="button"
          className={`gov-btn-hold-election ${
            isLeading ? "leading" : "trailing"
          }`}
          onClick={holdElection}
        >
          <span className="gov-hold-main">HOLD ELECTION</span>
          <span className="gov-hold-sub">
            {isLeading
              ? `Projected Victory (+${(
                  playerPollingPct - challenger.pollingPct
                ).toFixed(1)}%)`
              : `Projected Defeat (${(
                  playerPollingPct - challenger.pollingPct
                ).toFixed(1)}%)`}
          </span>
        </button>
      </div>
    </footer>
  );
};
