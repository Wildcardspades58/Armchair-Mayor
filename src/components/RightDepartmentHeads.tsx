// ============================================================================
// GOVERNOR — Phase 2 (Step 1/4): Right Panel — Broad Governing Doctrines
// (Anti-Micromanagement Decree Stamps) & The Appointee Engine
// - Replaces granular tax sliders and department allocation sliders with 3 Broad
//   Governing Doctrines:
//   1. Fiscal Doctrine: Austerity & Tax Cuts | Balanced Budget | Public Investment
//   2. Justice & Order Doctrine: Broken Windows Enforcement | Community Diversion | Civil Liberties First
//   3. Urban & Climate Doctrine: Deregulated Growth | Smart Zoning | Aggressive Green Transition
// - Selecting a doctrine automatically scales underlying taxRates & department budgets.
// - Retains the Appointee Engine (PoliceChief, TransitDirector, SanitationHead)
//   with Competence upkeep modifiers, Scapegoat firing, and 3-candidate Interviews.
// ============================================================================

import React from "react";
import {
  computeCompetenceUpkeepMultiplier,
  FIRE_APPOINTEE_CAPITAL_COST,
  useGameStore,
} from "../store/useGameStore";
import {
  AppointeeRoleKey,
  DepartmentBudgets,
  FiscalDoctrine,
  JusticeDoctrine,
  PolicyDoctrinesState,
  UrbanDoctrine,
} from "../types/simulation";

interface AppointeeDepartmentConfig {
  budgetKey: keyof DepartmentBudgets;
  roleKey: AppointeeRoleKey;
  title: string;
  roleTitle: string;
  roleDesc: string;
}

const DEPARTMENTS: AppointeeDepartmentConfig[] = [
  {
    budgetKey: "publicSafety",
    roleKey: "PoliceChief",
    title: "Dept. of Public Safety",
    roleTitle: "Police Chief",
    roleDesc: "Suppresses Crime & Crime Tension",
  },
  {
    budgetKey: "infrastructure",
    roleKey: "TransitDirector",
    title: "Dept. of Transit & Works",
    roleTitle: "Transit Director",
    roleDesc: "Suppresses Traffic & Transit Tension",
  },
  {
    budgetKey: "environmental",
    roleKey: "SanitationHead",
    title: "Dept. of Sanitation & EPA",
    roleTitle: "Sanitation Head",
    roleDesc: "Suppresses Pollution & Sanitation Tension",
  },
  {
    budgetKey: "socialServices",
    roleKey: "EducationDirector",
    title: "Dept. of Education & Youth",
    roleTitle: "Education Director",
    roleDesc: "Boosts Schools, Libraries & Trade Academies",
  },
  {
    budgetKey: "socialServices",
    roleKey: "HealthDirector",
    title: "Dept. of Public Health & Welfare",
    roleTitle: "Public Health Director",
    roleDesc: "Boosts Clinics, Hospitals & Crisis Medics",
  },
];

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

export const RightDepartmentHeads: React.FC = () => {
  const treasury = useGameStore((s) => s.treasury);
  const doctrines = useGameStore((s) => s.doctrines);
  const politicalCapital = useGameStore(
    (s) => s.voterSentiment.politicalCapital
  );
  const departmentHeads = useGameStore((s) => s.departmentHeads);
  const interviewPool = useGameStore((s) => s.interviewPool);
  const setPolicyDoctrine = useGameStore((s) => s.setPolicyDoctrine);
  const fireDepartmentHead = useGameStore((s) => s.fireDepartmentHead);
  const generateInterviewCandidates = useGameStore(
    (s) => s.generateInterviewCandidates
  );
  const hireDepartmentHead = useGameStore((s) => s.hireDepartmentHead);
  const setShowCabinetModal = useGameStore((s) => s.setShowCabinetModal);

  const canAffordFire = politicalCapital >= FIRE_APPOINTEE_CAPITAL_COST;

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
          <span className="gov-doctrine-title">
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
                title={`${opt.value}: ${opt.effectHint}`}
                onClick={() => setPolicyDoctrine(category, opt.value)}
              >
                <span className="gov-stamp-seal">
                  {isActive ? "★ DECREED" : opt.shortTag}
                </span>
                <span className="gov-stamp-name">{opt.value}</span>
                <span className="gov-stamp-hint">{opt.effectHint}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside className="gov-right-panel">
      {/* 1. Phase 2: 3 Broad Governing Doctrines (Illustrated Decree Stamps) */}
      <section className="gov-panel-section gov-doctrines-panel">
        <div className="gov-section-header">
          <span className="gov-section-title">GOVERNING DOCTRINES</span>
          <span className="gov-section-sub">
            REV +${Math.round(treasury.monthlyRevenue / 1000)}K | EXP -$
            {Math.round(treasury.monthlyExpenses / 1000)}K
          </span>
        </div>

        <div className="gov-doctrines-stack">
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

        {/* Auto-scaled tax summary chip bar */}
        <div className="gov-scaled-tax-bar">
          <span className="gov-chip">
            Income {treasury.taxRates.incomeTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Corp {treasury.taxRates.corporateTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Prop {treasury.taxRates.propertyTaxPct.toFixed(1)}%
          </span>
          <span className="gov-chip">
            Social ${Math.round(treasury.departments.socialServices / 1000)}K
          </span>
        </div>
      </section>

      {/* 2. The Appointee Engine (Staff Hiring, Upkeep Modifiers & Scapegoats) */}
      <section className="gov-panel-section gov-dept-section">
        <div className="gov-section-header">
          <span className="gov-section-title">CABINET APPOINTEES (5)</span>
          <button
            type="button"
            className="gov-btn-micro gov-text-cyan"
            onClick={() => setShowCabinetModal(true)}
          >
            EXPAND CABINET CHAMBER
          </button>
        </div>

        <div className="gov-dept-stack">
          {DEPARTMENTS.map((dept) => {
            const baseSpend = treasury.departments[dept.budgetKey];
            const npc = departmentHeads[dept.roleKey];
            const candidates = interviewPool[dept.roleKey];
            const multiplier = computeCompetenceUpkeepMultiplier(npc);
            const effectiveUpkeep = Math.round(baseSpend * multiplier);
            const modifierPct = npc ? (npc.competence - 50) * 0.5 : 0;

            return (
              <div key={dept.budgetKey} className="gov-dept-card">
                <div className="gov-dept-header">
                  <div>
                    <div className="gov-dept-title">{dept.title}</div>
                    <div className="gov-slider-hint">{dept.roleDesc}</div>
                  </div>
                  <span className="gov-slider-readout gov-text-cyan">
                    ${Math.round(effectiveUpkeep / 1000)}K/mo
                  </span>
                </div>

                {/* Appointee Slot (PoliceChief, TransitDirector, SanitationHead) */}
                <div className="gov-appointee-box">
                  {npc ? (
                    <>
                      <div className="gov-appointee-top">
                        <div>
                          <span className="gov-eyebrow">{dept.roleTitle}: </span>
                          <strong className="gov-text-white">{npc.name}</strong>
                        </div>
                        <span className="gov-badge gov-badge-cyan">
                          {npc.alignment.toUpperCase()}
                        </span>
                      </div>

                      <div className="gov-appointee-stats">
                        <span
                          className={
                            npc.competence >= 50
                              ? "gov-text-emerald"
                              : "gov-text-crimson"
                          }
                        >
                          COMP: {npc.competence} (
                          {modifierPct >= 0
                            ? `-${modifierPct.toFixed(1)}% Upkeep`
                            : `+${Math.abs(modifierPct).toFixed(1)}% Penalty`}
                          )
                        </span>
                        <span
                          className={
                            npc.loyalty > 70
                              ? "gov-text-emerald"
                              : npc.loyalty < 40
                              ? "gov-text-crimson"
                              : "gov-text-amber"
                          }
                          title={
                            npc.loyalty < 40
                              ? "Low Loyalty (<40): Will leak to press (-10% Approval) if fired!"
                              : npc.loyalty > 70
                              ? "High Loyalty (>70): Will step down quietly if fired."
                              : "Moderate Loyalty"
                          }
                        >
                          LOYALTY: {npc.loyalty}
                          {npc.loyalty < 40 ? " (LEAK RISK)" : ""}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="gov-btn-fire"
                        disabled={!canAffordFire}
                        title={
                          !canAffordFire
                            ? `Insufficient Political Capital (${Math.round(
                                politicalCapital
                              )}/100 available, ${FIRE_APPOINTEE_CAPITAL_COST} required).`
                            : npc.loyalty < 40
                            ? `Costs ${FIRE_APPOINTEE_CAPITAL_COST} Political Capital. WARNING: Low Loyalty (${npc.loyalty}) will trigger a press leak (-10% Approval)!`
                            : `Costs ${FIRE_APPOINTEE_CAPITAL_COST} Political Capital to dismiss ${npc.name}.`
                        }
                        onClick={() => fireDepartmentHead(dept.roleKey)}
                      >
                        FIRE {dept.roleTitle.toUpperCase()} (-
                        {FIRE_APPOINTEE_CAPITAL_COST} CAP
                        {npc.loyalty < 40 ? " | -10% APPR LEAK" : ""})
                      </button>
                    </>
                  ) : (
                    <div className="gov-appointee-vacant">
                      <div className="gov-vacant-header">
                        <span className="gov-badge gov-badge-amber">
                          {dept.roleTitle.toUpperCase()} VACANT
                        </span>
                        <button
                          type="button"
                          className="gov-btn-interview"
                          onClick={() =>
                            generateInterviewCandidates(dept.roleKey)
                          }
                        >
                          {candidates ? "RE-ROLL CANDIDATES" : "INTERVIEW"}
                        </button>
                      </div>

                      {candidates && (
                        <div className="gov-candidate-list">
                          {candidates.map((cand) => {
                            const candModPct = (cand.competence - 50) * 0.5;
                            return (
                              <div key={cand.id} className="gov-candidate-card">
                                <div className="gov-cand-row">
                                  <strong>{cand.name}</strong>
                                  <span className="gov-badge gov-badge-muted">
                                    {cand.alignment}
                                  </span>
                                </div>
                                <div className="gov-cand-stats">
                                  <span
                                    className={
                                      cand.competence >= 50
                                        ? "gov-text-emerald"
                                        : "gov-text-crimson"
                                    }
                                  >
                                    COMP {cand.competence} (
                                    {candModPct >= 0
                                      ? `-${candModPct.toFixed(1)}%`
                                      : `+${Math.abs(candModPct).toFixed(1)}%`}
                                    )
                                  </span>
                                  <span
                                    className={
                                      cand.loyalty > 70
                                        ? "gov-text-emerald"
                                        : cand.loyalty < 40
                                        ? "gov-text-crimson"
                                        : "gov-text-amber"
                                    }
                                  >
                                    LOY {cand.loyalty}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="gov-btn-hire"
                                  onClick={() =>
                                    hireDepartmentHead(dept.roleKey, cand)
                                  }
                                >
                                  HIRE {cand.name.split(" ")[1].toUpperCase()}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
};
