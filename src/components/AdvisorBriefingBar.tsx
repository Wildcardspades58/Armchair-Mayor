// ============================================================================
// GOVERNOR — Phase 2 (Step 1/4): Expressive Advisor Portraits & Pre-Vote Briefings
// Renders 3 illustrated SVG character avatars inside each Monthly Docket issue card:
// 1. City Comptroller (Fiscal & Treasury)
// 2. Policy Analyst (Heatmap Metrics & Infrastructure)
// 3. Street Pulse (Voter Demographics & Public Sentiment)
// Expressions shift dynamically (happy, worried, shocked, angry, neutral) based
// on the hovered policy option's projected impact, showing 1-sentence warnings.
// ============================================================================

import React from "react";
import { DocketPresetOption } from "../types/simulation";

export type AdvisorExpression =
  | "happy"
  | "worried"
  | "shocked"
  | "angry"
  | "neutral";

interface AdvisorReaction {
  expression: AdvisorExpression;
  warningText: string;
}

const EXPRESSION_BADGE_MAP: Record<
  AdvisorExpression,
  { label: string; cls: string; ringColor: string }
> = {
  happy: { label: "APPROVES", cls: "gov-badge-emerald", ringColor: "#3B7A57" },
  neutral: { label: "MEASURED", cls: "gov-badge-cyan", ringColor: "#B6862C" },
  worried: { label: "WORRIED", cls: "gov-badge-amber", ringColor: "#D97706" },
  shocked: { label: "ALARMED", cls: "gov-badge-amber", ringColor: "#C85A32" },
  angry: { label: "OPPOSES", cls: "gov-badge-crimson", ringColor: "#B83A2D" },
};

function evaluateComptrollerReaction(
  hoveredOption: DocketPresetOption | null
): AdvisorReaction {
  if (!hoveredOption) {
    return {
      expression: "neutral",
      warningText:
        "Hover any option below to inspect its monthly treasury and debt impact.",
    };
  }
  const delta = hoveredOption.policyEffect.budget_impact.monthly_change;
  const absK = Math.round(Math.abs(delta) / 1000);

  if (delta >= 20_000) {
    return {
      expression: "happy",
      warningText: `Fiscally sound: adds +$${absK}K/mo directly to city reserves.`,
    };
  }
  if (delta >= 0) {
    return {
      expression: "happy",
      warningText: `Budget-neutral or slight surplus (+$${absK}K/mo) with zero deficit risk.`,
    };
  }
  if (delta <= -50_000) {
    return {
      expression: "shocked",
      warningText: `Heavy outlay alert: -$${absK}K/mo could strain reserves if deficits persist!`,
    };
  }
  return {
    expression: "worried",
    warningText: `Costs -$${absK}K/mo in recurring spending; ensure tax revenue covers it.`,
  };
}

function evaluateAnalystReaction(
  hoveredOption: DocketPresetOption | null
): AdvisorReaction {
  if (!hoveredOption) {
    return {
      expression: "neutral",
      warningText:
        "Hover an option to preview projected Crime, Pollution, Land Value, and Traffic shifts.",
    };
  }
  const mods = hoveredOption.policyEffect.heatmap_modifiers;
  let netImprovement = 0;
  let hasNegativeSideEffect = false;

  for (const m of mods) {
    const goodDelta = m.metric === "land_value" ? m.change : -m.change;
    netImprovement += goodDelta;
    if (goodDelta < -3) hasNegativeSideEffect = true;
  }

  if (netImprovement >= 10 && !hasNegativeSideEffect) {
    return {
      expression: "happy",
      warningText: `Strong civic gain: projected +${netImprovement} net improvement across city heatmaps.`,
    };
  }
  if (netImprovement < 0) {
    return {
      expression: "angry",
      warningText: `Metric warning: this choice worsens key city indicators by ${netImprovement} pts!`,
    };
  }
  if (hasNegativeSideEffect) {
    return {
      expression: "worried",
      warningText:
        "Trade-off alert: improves one pillar while slightly straining another metric.",
    };
  }
  return {
    expression: "neutral",
    warningText:
      "Modest, targeted adjustment to municipal operations with low volatility.",
  };
}

function evaluateStreetPulseReaction(
  hoveredOption: DocketPresetOption | null
): AdvisorReaction {
  if (!hoveredOption) {
    return {
      expression: "neutral",
      warningText:
        "Hover an option to gauge how voters and neighborhood factions will react.",
    };
  }
  const demos = hoveredOption.policyEffect.demographic_approval;
  let sum = 0;
  let hasDeepDrop = false;
  let hasBigGain = false;

  for (const d of demos) {
    sum += d.change;
    if (d.change <= -8) hasDeepDrop = true;
    if (d.change >= 8) hasBigGain = true;
  }

  if (hasDeepDrop && hasBigGain) {
    return {
      expression: "shocked",
      warningText:
        "Polarizing decree! Expect loud cheers from allies and angry protests from rivals.",
    };
  }
  if (sum >= 10 && !hasDeepDrop) {
    return {
      expression: "happy",
      warningText:
        "Crowd-pleaser! Neighborhoods and civic groups are poised to rally behind this.",
    };
  }
  if (sum <= -6 || hasDeepDrop) {
    return {
      expression: "angry",
      warningText:
        "Public backlash risk: key voter blocs will strongly resent this decision.",
    };
  }
  return {
    expression: "worried",
    warningText:
      "Mixed street reaction—some grumbling, but unlikely to spark major unrest.",
  };
}

// ----------------------------------------------------------------------------
// Illustrated SVG Portrait Component with Dynamic Expressions
// ----------------------------------------------------------------------------

interface PortraitSvgProps {
  role: "comptroller" | "analyst" | "street";
  expression: AdvisorExpression;
  ringColor: string;
}

const AdvisorPortraitSvg: React.FC<PortraitSvgProps> = ({
  role,
  expression,
  ringColor,
}) => {
  const skin =
    role === "comptroller"
      ? "#F0C8A0"
      : role === "analyst"
      ? "#F5D5B8"
      : "#D99B72";
  const hair =
    role === "comptroller"
      ? "#6B5B53"
      : role === "analyst"
      ? "#2C221E"
      : "#3A2820";
  const coat =
    role === "comptroller"
      ? "#3B5249"
      : role === "analyst"
      ? "#7A4932"
      : "#C85A32";

  // Dynamic Eyebrow & Mouth SVG paths
  const renderFaceFeatures = () => {
    // Eyebrows
    let leftBrow = "M22 25 Q26 23 30 25";
    let rightBrow = "M34 25 Q38 23 42 25";
    if (expression === "angry") {
      leftBrow = "M22 24 L30 27";
      rightBrow = "M42 24 L34 27";
    } else if (expression === "worried") {
      leftBrow = "M22 27 Q26 24 30 24";
      rightBrow = "M34 24 Q38 24 42 27";
    } else if (expression === "shocked") {
      leftBrow = "M22 22 Q26 19 30 22";
      rightBrow = "M34 22 Q38 19 42 22";
    } else if (expression === "happy") {
      leftBrow = "M22 24 Q26 21 30 24";
      rightBrow = "M34 24 Q38 21 42 24";
    }

    // Mouth
    let mouthNode = (
      <line
        x1="27"
        y1="40"
        x2="37"
        y2="40"
        stroke="#2C221E"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
    if (expression === "happy") {
      mouthNode = (
        <path
          d="M26 38 Q32 45 38 38"
          fill="none"
          stroke="#2C221E"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      );
    } else if (expression === "worried") {
      mouthNode = (
        <path
          d="M26 42 Q32 37 38 42"
          fill="none"
          stroke="#2C221E"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    } else if (expression === "shocked") {
      mouthNode = (
        <ellipse
          cx="32"
          cy="40.5"
          rx="3.5"
          ry="4.2"
          fill="#4A251D"
          stroke="#2C221E"
          strokeWidth="1.5"
        />
      );
    } else if (expression === "angry") {
      mouthNode = (
        <path
          d="M26 42 L32 39 L38 42"
          fill="none"
          stroke="#2C221E"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      );
    }

    const eyeRadius = expression === "shocked" ? 2.6 : 2.1;

    return (
      <>
        <path
          d={leftBrow}
          fill="none"
          stroke="#2C221E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d={rightBrow}
          fill="none"
          stroke="#2C221E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="26" cy="30" r={eyeRadius} fill="#2C221E" />
        <circle cx="38" cy="30" r={eyeRadius} fill="#2C221E" />
        {mouthNode}
      </>
    );
  };

  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 64 64"
      className={`gov-advisor-svg gov-expr-${expression}`}
      aria-hidden="true"
    >
      {/* Storybook Medallion Background */}
      <circle
        cx="32"
        cy="32"
        r="29"
        fill="#F3EAD8"
        stroke={ringColor}
        strokeWidth="3"
      />
      {/* Shoulders / Tunic */}
      <path
        d="M14 58 C14 46 50 46 50 58 Z"
        fill={coat}
        stroke="#2C221E"
        strokeWidth="1.5"
      />
      {/* Head */}
      <circle
        cx="32"
        cy="31"
        r="14"
        fill={skin}
        stroke="#2C221E"
        strokeWidth="1.5"
      />
      {/* Hair / Hat per Role */}
      {role === "comptroller" && (
        <>
          <path
            d="M18 28 C18 16 46 16 46 28 C42 21 22 21 18 28 Z"
            fill={hair}
          />
          {/* Gold Monocle */}
          <circle
            cx="38"
            cy="30"
            r="5.2"
            fill="none"
            stroke="#D4A359"
            strokeWidth="1.6"
          />
        </>
      )}
      {role === "analyst" && (
        <>
          <path
            d="M17 29 C17 15 47 15 47 29 C43 20 21 20 17 29 Z"
            fill={hair}
          />
          {/* Scholarly Spectacles */}
          <rect
            x="21"
            y="26.5"
            width="9"
            height="6.5"
            rx="2"
            fill="none"
            stroke="#4A3B32"
            strokeWidth="1.4"
          />
          <rect
            x="34"
            y="26.5"
            width="9"
            height="6.5"
            rx="2"
            fill="none"
            stroke="#4A3B32"
            strokeWidth="1.4"
          />
          <line x1="30" y1="29.5" x2="34" y2="29.5" stroke="#4A3B32" strokeWidth="1.4" />
        </>
      )}
      {role === "street" && (
        <>
          {/* Newsboy / Civic Cap */}
          <path
            d="M17 25 C19 14 45 14 47 25 Z"
            fill="#5C4A3E"
            stroke="#2C221E"
            strokeWidth="1.4"
          />
          <path d="M16 25 L48 25 L44 28 L20 28 Z" fill="#3A2C24" />
        </>
      )}
      {renderFaceFeatures()}
    </svg>
  );
};

// ----------------------------------------------------------------------------
// Main AdvisorBriefingBar Component
// ----------------------------------------------------------------------------

export interface AdvisorBriefingBarProps {
  hoveredOption: DocketPresetOption | null;
}

export const AdvisorBriefingBar: React.FC<AdvisorBriefingBarProps> = ({
  hoveredOption,
}) => {
  const comptroller = evaluateComptrollerReaction(hoveredOption);
  const analyst = evaluateAnalystReaction(hoveredOption);
  const street = evaluateStreetPulseReaction(hoveredOption);

  const advisors: Array<{
    key: "comptroller" | "analyst" | "street";
    name: string;
    title: string;
    reaction: AdvisorReaction;
  }> = [
    {
      key: "comptroller",
      name: "Alden Sterling",
      title: "City Comptroller",
      reaction: comptroller,
    },
    {
      key: "analyst",
      name: "Clara Chen",
      title: "Policy Analyst",
      reaction: analyst,
    },
    {
      key: "street",
      name: "Marco Vega",
      title: "Street Pulse",
      reaction: street,
    },
  ];

  return (
    <div className="gov-advisor-bar">
      {advisors.map((adv) => {
        const badgeMeta = EXPRESSION_BADGE_MAP[adv.reaction.expression];
        return (
          <div
            key={adv.key}
            className={`gov-advisor-card gov-advisor-${adv.reaction.expression}`}
          >
            <AdvisorPortraitSvg
              role={adv.key}
              expression={adv.reaction.expression}
              ringColor={badgeMeta.ringColor}
            />
            <div className="gov-advisor-text">
              <div className="gov-advisor-top">
                <span className="gov-advisor-title">{adv.title}</span>
                <span className={`gov-badge ${badgeMeta.cls}`}>
                  {badgeMeta.label}
                </span>
              </div>
              <p className="gov-advisor-warning">{adv.reaction.warningText}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
