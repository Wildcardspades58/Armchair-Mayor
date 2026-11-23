// ============================================================================
// GOVERNOR — Pop-Out "Cabinet Chamber" Modal
// Full-screen modal showing all 5 Department Heads (Police, Transit, Sanitation,
// Education, Public Health) side-by-side with portraits, Competence/Loyalty bars,
// leak warnings when Loyalty < 35, and 3-Candidate Hiring Pool.
// ============================================================================

import React from "react";
import {
  computeCompetenceUpkeepMultiplier,
  FIRE_APPOINTEE_CAPITAL_COST,
  useGameStore,
} from "../store/useGameStore";
import { AppointeeRoleKey } from "../types/simulation";
import { soundEffects } from "../services/soundEffects";

interface CabinetDirectorMeta {
  roleKey: AppointeeRoleKey;
  deptName: string;
  roleTitle: string;
  portraitEmoji: string;
  mandateText: string;
}

const CABINET_DIRECTORS: CabinetDirectorMeta[] = [
  {
    roleKey: "PoliceChief",
    deptName: "Dept. of Public Safety",
    roleTitle: "Police Chief",
    portraitEmoji: "🛡️",
    mandateText: "Suppresses Crime & Crime Tension across all 100 blocks.",
  },
  {
    roleKey: "TransitDirector",
    deptName: "Dept. of Transit & Works",
    roleTitle: "Transit Director",
    portraitEmoji: "🚋",
    mandateText: "Manages Traffic flow, bridges, and Transit Tension.",
  },
  {
    roleKey: "SanitationHead",
    deptName: "Dept. of Sanitation & EPA",
    roleTitle: "Sanitation Head",
    portraitEmoji: "🌿",
    mandateText: "Controls industrial Pollution and Sanitation Tension.",
  },
  {
    roleKey: "EducationDirector",
    deptName: "Dept. of Education & Youth",
    roleTitle: "Education Director",
    portraitEmoji: "📚",
    mandateText: "Boosts public schools, libraries, and trade academies.",
  },
  {
    roleKey: "HealthDirector",
    deptName: "Dept. of Public Health & Welfare",
    roleTitle: "Public Health Director",
    portraitEmoji: "🏥",
    mandateText: "Maintains neighborhood clinics, hospitals, and crisis medics.",
  },
];

export const CabinetChamberModal: React.FC = () => {
  const showCabinetModal = useGameStore((s) => s.showCabinetModal);
  const setShowCabinetModal = useGameStore((s) => s.setShowCabinetModal);
  const departmentHeads = useGameStore((s) => s.departmentHeads);
  const interviewPool = useGameStore((s) => s.interviewPool);
  const politicalCapital = useGameStore(
    (s) => s.voterSentiment.politicalCapital
  );
  const fireDepartmentHead = useGameStore((s) => s.fireDepartmentHead);
  const generateInterviewCandidates = useGameStore(
    (s) => s.generateInterviewCandidates
  );
  const hireDepartmentHead = useGameStore((s) => s.hireDepartmentHead);

  if (!showCabinetModal) return null;

  const canAffordFire = politicalCapital >= FIRE_APPOINTEE_CAPITAL_COST;

  return (
    <div
      className="gov-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Cabinet Chamber"
    >
      <div className="gov-modal-card gov-cabinet-modal">
        <div className="gov-modal-header">
          <div>
            <div className="gov-modal-eyebrow gov-text-cyan">
              EXECUTIVE CABINET CHAMBER // 5 MUNICIPAL DIRECTORS
            </div>
            <h2 className="gov-modal-title">
              CABINET ROSTER, LOYALTY &amp; INTERVIEWS
            </h2>
          </div>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => {
              soundEffects.playUiClick();
              setShowCabinetModal(false);
            }}
          >
            CLOSE CHAMBER
          </button>
        </div>

        <p className="gov-modal-desc">
          Directors with Competence &ge; 50 reduce upkeep and boost civic
          performance. Firing a director with Loyalty &lt; 35 triggers a
          damaging press leak (-10% Approval).
        </p>

        <div className="gov-cabinet-grid">
          {CABINET_DIRECTORS.map((dir) => {
            const npc = departmentHeads[dir.roleKey];
            const candidates = interviewPool[dir.roleKey];
            const upkeepMult = computeCompetenceUpkeepMultiplier(npc);
            const modifierPct = Math.round((1 - upkeepMult) * 100);
            const isLeakRisk = Boolean(npc && npc.loyalty < 35);

            return (
              <div
                key={dir.roleKey}
                className={`gov-cabinet-card ${isLeakRisk ? "is-leak-risk" : ""}`}
              >
                <div className="gov-cabinet-card-top">
                  <div className="gov-cabinet-portrait" aria-hidden="true">
                    {dir.portraitEmoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="gov-eyebrow">{dir.deptName}</div>
                    <strong style={{ fontSize: "14px" }}>
                      {npc ? npc.name : "VACANT SEAT"}
                    </strong>
                    <div className="gov-eyebrow" style={{ marginTop: "2px" }}>
                      {dir.roleTitle}
                    </div>
                  </div>
                  {npc && (
                    <span className="gov-badge gov-badge-cyan">
                      {npc.alignment.toUpperCase()}
                    </span>
                  )}
                </div>

                <p className="gov-choice-desc">{dir.mandateText}</p>

                {npc ? (
                  <>
                    <div className="gov-cabinet-bars">
                      <div className="gov-cabinet-bar-row">
                        <span>
                          Competence: <strong>{npc.competence}/100</strong> (
                          {modifierPct >= 0
                            ? `-${modifierPct}% upkeep`
                            : `+${Math.abs(modifierPct)}% cost`}
                          )
                        </span>
                        <div className="gov-progress-track">
                          <div
                            className={`gov-progress-fill ${
                              npc.competence >= 50
                                ? "gov-bar-emerald"
                                : "gov-bar-crimson"
                            }`}
                            style={{ width: `${npc.competence}%` }}
                          />
                        </div>
                      </div>

                      <div className="gov-cabinet-bar-row">
                        <span>
                          Loyalty: <strong>{npc.loyalty}/100</strong>
                        </span>
                        <div className="gov-progress-track">
                          <div
                            className={`gov-progress-fill ${
                              npc.loyalty >= 65
                                ? "gov-bar-emerald"
                                : npc.loyalty < 35
                                ? "gov-bar-crimson"
                                : "gov-bar-amber"
                            }`}
                            style={{ width: `${npc.loyalty}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {isLeakRisk && (
                      <div className="gov-badge gov-badge-crimson">
                        LEAK WARNING: LOYALTY &lt; 35 — WILL LEAK TO PRESS IF FIRED
                      </div>
                    )}

                    <button
                      type="button"
                      className="gov-btn-fire"
                      disabled={!canAffordFire}
                      onClick={() => {
                        soundEffects.playUiClick();
                        fireDepartmentHead(dir.roleKey);
                      }}
                    >
                      FIRE / SCAPEGOAT (-{FIRE_APPOINTEE_CAPITAL_COST} CAP)
                    </button>
                  </>
                ) : candidates ? (
                  <div className="gov-cabinet-candidates">
                    <div className="gov-eyebrow">3-CANDIDATE HIRING POOL</div>
                    {candidates.map((cand) => (
                      <div key={cand.id} className="gov-cabinet-cand-row">
                        <div>
                          <strong>{cand.name}</strong>
                          <div className="gov-eyebrow">
                            {cand.alignment} | COMP {cand.competence} | LOYAL{" "}
                            {cand.loyalty}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="gov-btn-enact"
                          onClick={() => {
                            soundEffects.playUiClick();
                            hireDepartmentHead(dir.roleKey, cand);
                          }}
                        >
                          HIRE
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="gov-btn-civic-teal"
                    onClick={() => {
                      soundEffects.playUiClick();
                      generateInterviewCandidates(dir.roleKey);
                    }}
                  >
                    CONVENE 3-CANDIDATE INTERVIEWS
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
