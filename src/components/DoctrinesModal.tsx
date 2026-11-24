// ============================================================================
// ARMCHAIR MAYOR — Dedicated Slide-Out / Modal Governing Doctrines Chamber
// Displays the 3 Broad Governing Doctrines (Fiscal, Justice & Order, Urban &
// Climate) plus auto-scaled tax rates & department funding readouts.
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";
import {
  FiscalDoctrine,
  JusticeDoctrine,
  PolicyDoctrinesState,
  UrbanDoctrine,
} from "../types/simulation";
import { soundEffects } from "../services/soundEffects";

interface DoctrineOptionMeta<T extends string> {
  value: T;
  shortTag: string;
  effectHint: string;
}

const FISCAL_OPTIONS: DoctrineOptionMeta<FiscalDoctrine>[] = [
  {
    value: "Austerity & Tax Cuts",
    shortTag: "LOW TAX",
    effectHint: "4.5%–6% taxes, 0.76x dept spend",
  },
  {
    value: "Balanced Budget",
    shortTag: "BALANCED",
    effectHint: "6.5%–9% taxes, 1.0x dept spend",
  },
  {
    value: "Public Investment",
    shortTag: "HIGH SPEND",
    effectHint: "9%–12.5% taxes, 1.28x dept spend",
  },
];

const JUSTICE_OPTIONS: DoctrineOptionMeta<JusticeDoctrine>[] = [
  {
    value: "Broken Windows Enforcement",
    shortTag: "HARDLINE",
    effectHint: "1.38x Police, 0.78x Social",
  },
  {
    value: "Community Diversion",
    shortTag: "MODERATE",
    effectHint: "0.95x Police, 1.15x Social",
  },
  {
    value: "Civil Liberties First",
    shortTag: "REFORM",
    effectHint: "0.76x Police, 1.35x Social",
  },
];

const URBAN_OPTIONS: DoctrineOptionMeta<UrbanDoctrine>[] = [
  {
    value: "Deregulated Growth",
    shortTag: "PRO-GROWTH",
    effectHint: "1.2x Transit, 0.72x EPA, -0.2% Prop Tax",
  },
  {
    value: "Smart Zoning",
    shortTag: "MIXED-USE",
    effectHint: "1.05x Transit, 1.05x EPA",
  },
  {
    value: "Aggressive Green Transition",
    shortTag: "GREEN NEW",
    effectHint: "1.15x Transit, 1.45x EPA",
  },
];

export const DoctrinesModal: React.FC = () => {
  const showDoctrinesModal = useGameStore((s) => s.showDoctrinesModal);
  const setShowDoctrinesModal = useGameStore((s) => s.setShowDoctrinesModal);
  const doctrines = useGameStore((s) => s.doctrines);
  const treasury = useGameStore((s) => s.treasury);
  const setPolicyDoctrine = useGameStore((s) => s.setPolicyDoctrine);

  if (!showDoctrinesModal) return null;

  const renderDoctrineStampGroup = <K extends keyof PolicyDoctrinesState>(
    category: K,
    title: string,
    sealIcon: string,
    options: DoctrineOptionMeta<PolicyDoctrinesState[K]>[]
  ) => {
    const activeVal = doctrines[category];
    return (
      <div className="gov-doctrine-group">
        <div className="gov-doctrine-group-header">
          <span className="gov-doctrine-title" style={{ fontSize: "14px" }}>
            {sealIcon} {title}
          </span>
          <span className="gov-badge gov-badge-cyan">{activeVal}</span>
        </div>
        <div className="gov-doctrine-stamp-row">
          {options.map((opt) => {
            const isActive = activeVal === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`gov-doctrine-stamp ${isActive ? "active" : ""}`}
                style={{ padding: "12px 10px" }}
                onClick={() => {
                  soundEffects.playUiClick();
                  setPolicyDoctrine(category, opt.value);
                }}
              >
                <span className="gov-stamp-seal">
                  {isActive ? "★ DECREED" : opt.shortTag}
                </span>
                <span className="gov-stamp-name" style={{ fontSize: "12.5px" }}>
                  {opt.value}
                </span>
                <span className="gov-stamp-hint">{opt.effectHint}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="gov-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Governing Doctrines Chamber"
    >
      <div className="gov-modal-card gov-cabinet-modal">
        <div className="gov-modal-header">
          <div>
            <div className="gov-modal-eyebrow gov-text-emerald">
              STRATEGIC POLICY DECREES // MACRO GOVERNANCE
            </div>
            <h2 className="gov-modal-title">GOVERNING DOCTRINES CHAMBER</h2>
          </div>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => {
              soundEffects.playUiClick();
              setShowDoctrinesModal(false);
            }}
          >
            CLOSE CHAMBER
          </button>
        </div>

        <p className="gov-modal-desc">
          Broad Governing Doctrines automatically calibrate municipal tax rates,
          department allocations, and ideological compass drift without manual
          slider micromanagement.
        </p>

        <div className="gov-doctrines-stack" style={{ gap: "14px" }}>
          {renderDoctrineStampGroup(
            "fiscal",
            "Fiscal Doctrine",
            "⚖️",
            FISCAL_OPTIONS
          )}
          {renderDoctrineStampGroup(
            "justice",
            "Justice & Order Doctrine",
            "🛡️",
            JUSTICE_OPTIONS
          )}
          {renderDoctrineStampGroup(
            "urban",
            "Urban & Climate Doctrine",
            "🌿",
            URBAN_OPTIONS
          )}
        </div>

        <div className="gov-scaled-tax-bar" style={{ paddingTop: "8px" }}>
          <span className="gov-chip">
            Income Tax {treasury.taxRates.incomeTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Corp Tax {treasury.taxRates.corporateTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Property Tax {treasury.taxRates.propertyTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Public Safety ${Math.round(treasury.departments.publicSafety / 1000)}K
          </span>
          <span className="gov-chip">
            Transit ${Math.round(treasury.departments.infrastructure / 1000)}K
          </span>
          <span className="gov-chip">
            Environment ${Math.round(treasury.departments.environmental / 1000)}K
          </span>
          <span className="gov-chip">
            Social/Edu/Health ${Math.round(treasury.departments.socialServices / 1000)}K
          </span>
        </div>
      </div>
    </div>
  );
};
