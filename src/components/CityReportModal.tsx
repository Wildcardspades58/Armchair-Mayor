// ============================================================================
// GOVERNOR — Monthly "State of the City" Summary Report Modal
// Includes:
// 1. 4 Core Pillars Breakdown (Crime, Pollution, Land Value, Traffic) +
//    Month-to-Month SVG Trend Sparklines (comparing the last 6-12 months).
// 2. Historical Trend Sparklines for Overall Approval % and Treasury Reserves.
// 3. "Leadership Profile & Political Spectrum" Card:
//    - 2-Axis Political Compass:
//      * Economic Axis: Interventionist/Socialist (-100) <-> Free-Market/Corporatist (+100)
//      * Governance Axis: Technocratic/Libertarian (-100) <-> Authoritarian/Law & Order (+100)
//    - Dynamic Leader Title & 2-Sentence Editorial Blurb.
// 4. Fiscal, Political Capital Regeneration, Tension & Appointee Recap.
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";
import {
  HeatmapMetric,
  MonthlyHistorySnapshot,
  TensionKey,
} from "../types/simulation";

const PILLAR_ORDER: HeatmapMetric[] = [
  "crime",
  "pollution",
  "land_value",
  "traffic",
];

// ----------------------------------------------------------------------------
// Reusable SVG Sparkline Component (Last 12 Months Trajectory)
// ----------------------------------------------------------------------------

interface SparklineProps {
  values: number[];
  strokeColor: string;
  minDomain?: number;
  maxDomain?: number;
  unitSuffix?: string;
}

const MetricSparkline: React.FC<SparklineProps> = ({
  values,
  strokeColor,
  minDomain,
  maxDomain,
}) => {
  const slice = values.slice(-12);
  const w = 165;
  const h = 38;
  const pad = 4;

  if (slice.length === 0) return null;

  const minVal = minDomain ?? Math.min(...slice);
  const maxVal = maxDomain ?? Math.max(...slice);
  const span = Math.max(1, maxVal - minVal);

  const points = slice.map((val, idx) => {
    const x =
      slice.length === 1
        ? w / 2
        : pad + (idx / (slice.length - 1)) * (w - pad * 2);
    const normalized = Math.max(0, Math.min(1, (val - minVal) / span));
    const y = h - pad - normalized * (h - pad * 2);
    return { x, y, val };
  });

  const polylineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="gov-sparkline-svg"
      aria-label="12-month metric trend sparkline"
    >
      {/* Midline reference */}
      <line
        x1={0}
        y1={h / 2}
        x2={w}
        y2={h / 2}
        stroke="#1e2d47"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polylineStr}
        />
      )}
      {points.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={i === points.length - 1 ? 3.2 : 1.8}
          fill={i === points.length - 1 ? "#ffffff" : strokeColor}
          stroke={strokeColor}
          strokeWidth={1}
        />
      ))}
      {lastPoint && (
        <circle
          cx={lastPoint.x}
          cy={lastPoint.y}
          r={5}
          fill="none"
          stroke={strokeColor}
          strokeOpacity={0.45}
        />
      )}
    </svg>
  );
};

// ----------------------------------------------------------------------------
// 2-Axis Political Compass SVG Component (-100..+100 Economic x -100..+100 Governance)
// ----------------------------------------------------------------------------

interface CompassProps {
  economicAxis: number; // -100 (Socialist) .. +100 (Corporatist)
  governanceAxis: number; // -100 (Libertarian/Technocratic) .. +100 (Authoritarian)
}

const PoliticalCompassChart: React.FC<CompassProps> = ({
  economicAxis,
  governanceAxis,
}) => {
  const size = 148;
  const center = size / 2;
  const plotRadius = center - 16;

  // X: economicAxis (-100 left -> +100 right)
  const dotX = center + (economicAxis / 100) * plotRadius;
  // Y: governanceAxis (+100 top Authoritarian -> -100 bottom Technocratic/Libertarian)
  const dotY = center - (governanceAxis / 100) * plotRadius;

  return (
    <div className="gov-compass-widget">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Quadrant Backgrounds */}
        <rect
          x={14}
          y={14}
          width={plotRadius}
          height={plotRadius}
          fill="rgba(239, 68, 68, 0.12)"
        />
        <rect
          x={center}
          y={14}
          width={plotRadius}
          height={plotRadius}
          fill="rgba(59, 130, 246, 0.14)"
        />
        <rect
          x={14}
          y={center}
          width={plotRadius}
          height={plotRadius}
          fill="rgba(16, 185, 129, 0.14)"
        />
        <rect
          x={center}
          y={center}
          width={plotRadius}
          height={plotRadius}
          fill="rgba(245, 158, 11, 0.12)"
        />

        {/* Outer Border & Crosshairs */}
        <rect
          x={14}
          y={14}
          width={plotRadius * 2}
          height={plotRadius * 2}
          fill="none"
          stroke="#1e2d47"
          strokeWidth={1.5}
        />
        <line
          x1={center}
          y1={14}
          x2={center}
          y2={size - 14}
          stroke="#3b5275"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <line
          x1={14}
          y1={center}
          x2={size - 14}
          y2={center}
          stroke="#3b5275"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Axis Pole Labels */}
        <text
          x={center}
          y={10}
          textAnchor="middle"
          fill="#8ba3c7"
          fontSize="7.5"
          fontFamily="monospace"
        >
          AUTHORITARIAN (+100)
        </text>
        <text
          x={center}
          y={size - 3}
          textAnchor="middle"
          fill="#8ba3c7"
          fontSize="7.5"
          fontFamily="monospace"
        >
          TECHNOCRAT / LIB (-100)
        </text>

        {/* Player Coordinate Pulse & Marker */}
        <circle
          cx={dotX}
          cy={dotY}
          r={8}
          fill="rgba(0, 210, 255, 0.25)"
          stroke="#00d2ff"
          strokeWidth={1}
        />
        <circle
          cx={dotX}
          cy={dotY}
          r={4}
          fill="#00d2ff"
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      </svg>
      <div className="gov-compass-axis-caption">
        <span>&larr; SOCIALIST (-100)</span>
        <span>CORPORATIST (+100) &rarr;</span>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------------
// Main CityReportModal Component
// ----------------------------------------------------------------------------

export const CityReportModal: React.FC = () => {
  const showCityReportModal = useGameStore((s) => s.showCityReportModal);
  const cityReport = useGameStore((s) => s.cityReport);
  const monthlyHistory = useGameStore((s) => s.monthlyHistory);
  const politicalCompass = useGameStore((s) => s.politicalCompass);
  const setShowCityReportModal = useGameStore((s) => s.setShowCityReportModal);
  const setShowDocketModal = useGameStore((s) => s.setShowDocketModal);

  if (!showCityReportModal) return null;

  const recentHistory: MonthlyHistorySnapshot[] = monthlyHistory.slice(-12);

  const getPillarHistoryArray = (metric: HeatmapMetric): number[] => {
    return recentHistory.map((snap) => {
      if (metric === "crime") return snap.crimeAvg;
      if (metric === "pollution") return snap.pollutionAvg;
      if (metric === "land_value") return snap.landValueAvg;
      return snap.trafficAvg;
    });
  };

  const approvalHistory = recentHistory.map((s) => s.approval);
  const treasuryHistory = recentHistory.map((s) => s.treasury);

  const formatDelta = (metric: HeatmapMetric, delta: number) => {
    const sign = delta > 0 ? "+" : "";
    const text = `${sign}${delta} from last month`;

    if (delta === 0) {
      return <span className="gov-badge gov-badge-muted">0.0 (UNCHANGED)</span>;
    }

    const isGood = metric === "land_value" ? delta > 0 : delta < 0;

    return (
      <span
        className={`gov-badge ${
          isGood ? "gov-badge-emerald" : "gov-badge-crimson"
        }`}
      >
        {text}
      </span>
    );
  };

  return (
    <div
      className="gov-modal-backdrop"
      onClick={() => setShowCityReportModal(false)}
    >
      <div
        className="gov-modal-card gov-report-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gov-modal-header">
          <span className="gov-badge gov-badge-cyan">
            MONTHLY EXECUTIVE BRIEFING // MONTH {cityReport.turn} (
            {cityReport.month}/{cityReport.year})
          </span>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => setShowCityReportModal(false)}
          >
            CLOSE BRIEFING [X]
          </button>
        </div>

        <h2 className="gov-modal-title">
          STATE OF THE CITY REPORT — MONTH {cityReport.turn}
        </h2>

        {/* 1. Leadership Profile & 2-Axis Political Spectrum Card */}
        <div className="gov-leadership-profile-card">
          <PoliticalCompassChart
            economicAxis={politicalCompass.economicAxis}
            governanceAxis={politicalCompass.governanceAxis}
          />
          <div className="gov-leadership-info">
            <div className="gov-leadership-top-row">
              <span className="gov-eyebrow">
                LEADERSHIP PROFILE &amp; POLITICAL SPECTRUM
              </span>
              <div className="gov-modifier-chip-row">
                <span className="gov-chip gov-text-cyan">
                  Economic Axis:{" "}
                  {politicalCompass.economicAxis > 0
                    ? `+${politicalCompass.economicAxis} (Free-Market)`
                    : politicalCompass.economicAxis < 0
                    ? `${politicalCompass.economicAxis} (Interventionist)`
                    : "0 (Balanced)"}
                </span>
                <span className="gov-chip gov-text-amber">
                  Governance Axis:{" "}
                  {politicalCompass.governanceAxis > 0
                    ? `+${politicalCompass.governanceAxis} (Law & Order)`
                    : politicalCompass.governanceAxis < 0
                    ? `${politicalCompass.governanceAxis} (Technocratic)`
                    : "0 (Centrist)"}
                </span>
              </div>
            </div>

            <div className="gov-leadership-title">
              “{politicalCompass.leaderTitle}”
            </div>
            <p className="gov-leadership-blurb">
              {politicalCompass.editorialBlurb}
            </p>
          </div>
        </div>

        {/* 2. Macro Approval % & Treasury Balance 12-Month Trend Sparklines */}
        <div className="gov-macro-sparkline-bar">
          <div className="gov-macro-spark-item">
            <div>
              <span className="gov-eyebrow">
                APPROVAL TRAJECTORY ({recentHistory.length}M)
              </span>
              <div className="gov-macro-spark-val gov-text-emerald">
                {approvalHistory[approvalHistory.length - 1]?.toFixed(1) ??
                  "50.0"}
                %
              </div>
            </div>
            <MetricSparkline
              values={approvalHistory}
              strokeColor="#10b981"
              minDomain={0}
              maxDomain={100}
            />
          </div>

          <div className="gov-macro-spark-item">
            <div>
              <span className="gov-eyebrow">
                TREASURY TRAJECTORY ({recentHistory.length}M)
              </span>
              <div className="gov-macro-spark-val gov-text-cyan">
                $
                {(
                  (treasuryHistory[treasuryHistory.length - 1] ?? 0) / 1_000_000
                ).toFixed(2)}
                M
              </div>
            </div>
            <MetricSparkline values={treasuryHistory} strokeColor="#00d2ff" />
          </div>
        </div>

        {/* 3. 4 Core Pillars Breakdown + Individual 12-Month Trend Sparklines */}
        <div className="gov-report-pillars-grid">
          {PILLAR_ORDER.map((metric) => {
            const p = cityReport.pillars[metric];
            const historySeries = getPillarHistoryArray(metric);
            const sparkColor =
              metric === "land_value"
                ? "#10b981"
                : p.currentValue >= 70
                ? "#ef4444"
                : "#00d2ff";

            return (
              <div key={metric} className="gov-report-pillar-card">
                <div className="gov-report-pillar-top">
                  <span className="gov-eyebrow">{p.label.toUpperCase()}</span>
                  {formatDelta(metric, p.delta)}
                </div>

                <div className="gov-pillar-val-spark-row">
                  <div className="gov-report-pillar-val">
                    {Math.round(p.currentValue)}
                    <span className="gov-report-pillar-sub"> / 100</span>
                  </div>
                  <MetricSparkline
                    values={historySeries}
                    strokeColor={sparkColor}
                    minDomain={0}
                    maxDomain={100}
                  />
                </div>

                <p className="gov-report-pillar-desc">{p.assessment}</p>
              </div>
            );
          })}
        </div>

        {/* 4. Fiscal, Political Capital Regeneration, Tension & Appointee Recap */}
        <div className="gov-report-recap-grid">
          <div className="gov-report-recap-box">
            <div className="gov-section-title">
              FISCAL &amp; POLITICAL CAPITAL RECAP
            </div>
            <p className="gov-report-recap-text">
              {cityReport.fiscalRecap.summaryText}
            </p>
            <div className="gov-modifier-chip-row">
              <span className="gov-chip">
                Revenue: +${cityReport.fiscalRecap.revenue.toLocaleString()}/mo
              </span>
              <span className="gov-chip">
                Expenses: -${cityReport.fiscalRecap.expenses.toLocaleString()}/mo
              </span>
              <span className="gov-chip">
                Active Laws Net:{" "}
                {cityReport.fiscalRecap.policyRecurringNet >= 0 ? "+" : ""}$
                {cityReport.fiscalRecap.policyRecurringNet.toLocaleString()}/mo
              </span>
            </div>

            <div
              className="gov-section-title"
              style={{
                marginTop: "6px",
                paddingTop: "6px",
                borderTop: "1px solid var(--border-grid)",
              }}
            >
              MONTHLY POLITICAL CAPITAL REGENERATION
            </div>
            <p className="gov-report-recap-text">
              {cityReport.politicalCapitalRecap.summaryText}
            </p>
            <div className="gov-modifier-chip-row">
              <span className="gov-chip gov-text-emerald">
                Base Monthly Stipend: +
                {cityReport.politicalCapitalRecap.baseStipend} CAP
              </span>
              <span
                className={`gov-chip ${
                  cityReport.politicalCapitalRecap.mandateBonus > 0
                    ? "gov-text-emerald"
                    : "gov-text-amber"
                }`}
              >
                Mandate Bonus (&ge;50% Approval): +
                {cityReport.politicalCapitalRecap.mandateBonus} CAP
              </span>
              <span className="gov-chip gov-text-cyan">
                Available Capital:{" "}
                {Math.round(cityReport.politicalCapitalRecap.currentCapital)}/100
              </span>
            </div>
          </div>

          <div className="gov-report-recap-box">
            <div className="gov-section-title">
              TENSION TRAJECTORIES &amp; CABINET IMPACTS
            </div>
            <p className="gov-report-recap-text">
              {cityReport.tensionRecap.summaryText}
            </p>
            <div className="gov-modifier-chip-row">
              {(["Crime", "Transit", "Sanitation"] as TensionKey[]).map((tk) => {
                const val = Math.round(cityReport.tensionRecap.tensions[tk]);
                const d = cityReport.tensionRecap.tensionDeltas[tk];
                return (
                  <span key={tk} className="gov-chip">
                    {tk}: {val}/100 ({d >= 0 ? `+${d}` : d})
                  </span>
                );
              })}
            </div>
            <ul className="gov-report-staff-list">
              {cityReport.staffRecap.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="gov-briefing-footer">
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => setShowCityReportModal(false)}
          >
            RETURN TO MAP DASHBOARD
          </button>
          <button
            type="button"
            className="gov-btn-enact"
            onClick={() => {
              setShowCityReportModal(false);
              setShowDocketModal(true);
            }}
          >
            OPEN MONTHLY DOCKET (4 ISSUES) &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
