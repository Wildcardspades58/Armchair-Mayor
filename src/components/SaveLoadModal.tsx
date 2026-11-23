// ============================================================================
// GOVERNOR — Local Save / Load System Drawer (localStorage + JSON Export/Import)
// Accessible via the SAVE / LOAD button in the Top Scoreboard next to NEW GAME.
// - Displays the Automatic Turn Save slot (`governor_autosave`) + 3 Manual Save
//   Slots (`governor_slot_1..3`), showing City Archetype, Current Month/Turn,
//   Approval %, Leader Title, and Treasury balance, with SAVE and LOAD buttons.
// - Includes Export (.json download) and Import (.json file upload) so campaign
//   saves survive browser cache clears.
// ============================================================================

import React, { useRef, useState } from "react";
import {
  AUTOSAVE_STORAGE_KEY,
  MANUAL_SAVE_SLOT_KEYS,
  readSaveSlotMetadata,
  useGameStore,
} from "../store/useGameStore";
import { SaveSlotMetadata } from "../types/simulation";

const SLOT_DEFINITIONS: Array<{ key: string; label: string; isAuto?: boolean }> = [
  { key: AUTOSAVE_STORAGE_KEY, label: "AUTOSAVE SLOT (ON MONTH ADVANCE)", isAuto: true },
  { key: MANUAL_SAVE_SLOT_KEYS[0], label: "MANUAL SAVE SLOT #1" },
  { key: MANUAL_SAVE_SLOT_KEYS[1], label: "MANUAL SAVE SLOT #2" },
  { key: MANUAL_SAVE_SLOT_KEYS[2], label: "MANUAL SAVE SLOT #3" },
];

export const SaveLoadModal: React.FC = () => {
  const showSaveLoadModal = useGameStore((s) => s.showSaveLoadModal);
  const setShowSaveLoadModal = useGameStore((s) => s.setShowSaveLoadModal);
  const saveGameToSlot = useGameStore((s) => s.saveGameToSlot);
  const loadGameFromSlot = useGameStore((s) => s.loadGameFromSlot);
  const exportSaveJsonString = useGameStore((s) => s.exportSaveJsonString);
  const importSaveJsonString = useGameStore((s) => s.importSaveJsonString);
  const currentTurn = useGameStore((s) => s.time.turn);

  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [, setRefreshTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!showSaveLoadModal) return null;

  const handleSaveSlot = (slotKey: string, label: string) => {
    const ok = saveGameToSlot(slotKey);
    setRefreshTick((t) => t + 1);
    setStatusBanner(
      ok
        ? `Saved Month ${currentTurn} campaign to ${label}.`
        : `Failed to write ${label} to localStorage.`
    );
  };

  const handleLoadSlot = (slotKey: string, label: string) => {
    const ok = loadGameFromSlot(slotKey);
    if (ok) {
      setStatusBanner(`Loaded campaign from ${label}.`);
      setTimeout(() => setShowSaveLoadModal(false), 350);
    } else {
      setStatusBanner(`Could not load ${label}.`);
    }
  };

  const handleExportJson = () => {
    const jsonString = exportSaveJsonString();
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `armchair-mayor-turn-${currentTurn}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusBanner(`Exported armchair-mayor-turn-${currentTurn}.json`);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      const ok = importSaveJsonString(content);
      if (ok) {
        setStatusBanner(`Successfully imported campaign from "${file.name}"!`);
        setTimeout(() => setShowSaveLoadModal(false), 450);
      } else {
        setStatusBanner(`Invalid campaign JSON file: "${file.name}".`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const renderSlotCard = (slotDef: {
    key: string;
    label: string;
    isAuto?: boolean;
  }) => {
    const meta: SaveSlotMetadata | null = readSaveSlotMetadata(slotDef.key);

    return (
      <div key={slotDef.key} className="gov-saveload-slot-card">
        <div className="gov-saveload-slot-top">
          <span className="gov-section-title">{slotDef.label}</span>
          {meta ? (
            <span className="gov-badge gov-badge-cyan">
              MONTH {meta.turn} ({meta.month}/{meta.year})
            </span>
          ) : (
            <span className="gov-badge gov-badge-muted">EMPTY SLOT</span>
          )}
        </div>

        {meta ? (
          <div className="gov-saveload-meta-grid">
            <div>
              <span className="gov-eyebrow">CITY ARCHETYPE</span>
              <strong>{meta.startingArchetype}</strong>
            </div>
            <div>
              <span className="gov-eyebrow">APPROVAL RATING</span>
              <strong
                className={
                  meta.overallApproval >= 50
                    ? "gov-text-emerald"
                    : "gov-text-crimson"
                }
              >
                {meta.overallApproval.toFixed(1)}%
              </strong>
            </div>
            <div>
              <span className="gov-eyebrow">TREASURY BALANCE</span>
              <strong
                className={
                  meta.treasuryReserves >= 0
                    ? "gov-text-cyan"
                    : "gov-text-crimson"
                }
              >
                ${meta.treasuryReserves.toLocaleString()}
              </strong>
            </div>
            <div>
              <span className="gov-eyebrow">LEADER PROFILE</span>
              <strong>{meta.leaderTitle || meta.currentOffice}</strong>
            </div>
          </div>
        ) : (
          <div className="gov-empty-state" style={{ padding: "8px 0" }}>
            No campaign saved in this slot yet.
          </div>
        )}

        <div className="gov-saveload-btn-row">
          <button
            type="button"
            className="gov-btn-enact"
            onClick={() => handleSaveSlot(slotDef.key, slotDef.label)}
          >
            {slotDef.isAuto ? "OVERWRITE AUTOSAVE" : "SAVE TO SLOT"}
          </button>
          <button
            type="button"
            className="gov-btn-choice-exec"
            disabled={!meta}
            onClick={() => handleLoadSlot(slotDef.key, slotDef.label)}
          >
            LOAD CAMPAIGN
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="gov-modal-backdrop"
      onClick={() => setShowSaveLoadModal(false)}
    >
      <div
        className="gov-modal-card gov-saveload-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gov-modal-header">
          <span className="gov-badge gov-badge-cyan">
            CAMPAIGN ARCHIVES // LOCALSTORAGE &amp; JSON EXPORT
          </span>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={() => setShowSaveLoadModal(false)}
          >
            CLOSE [X]
          </button>
        </div>

        <h2 className="gov-modal-title">SAVE / LOAD CAMPAIGN STATE</h2>
        <p className="gov-modal-desc">
          Your campaign auto-saves to <code>governor_autosave</code> at the end
          of every month. Use the 3 manual slots below to branch your political
          decisions, or export/import a <code>.json</code> file backup.
        </p>

        {statusBanner && (
          <div className="gov-saveload-status-banner">{statusBanner}</div>
        )}

        <div className="gov-saveload-slots-grid">
          {SLOT_DEFINITIONS.map(renderSlotCard)}
        </div>

        {/* JSON Export / Import Bar */}
        <div className="gov-saveload-export-bar">
          <div>
            <div className="gov-section-title">
              PORTABLE JSON CAMPAIGN BACKUP
            </div>
            <div className="gov-slider-hint">
              Download your full campaign state as a .json file or restore from
              disk.
            </div>
          </div>

          <div className="gov-saveload-btn-row">
            <button
              type="button"
              className="gov-btn-enact"
              onClick={handleExportJson}
            >
              EXPORT .JSON FILE
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleImportFileChange}
            />
            <button
              type="button"
              className="gov-btn-choice-exec"
              onClick={() => fileInputRef.current?.click()}
            >
              IMPORT .JSON FILE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
