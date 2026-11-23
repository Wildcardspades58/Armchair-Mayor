// ============================================================================
// GOVERNOR — Bonus Step 4: Terminal LoadingScreen Overlay for WebLLM Weights
// Appears when the player clicks "New Campaign" if the WebLLM model isn't ready/cached yet.
// Reads `webllmProgress` from Zustand (`text`, `downloadedBytes`, `totalBytes`, `progressPct`)
// and displays a sleek terminal-style progress bar:
// e.g., "Downloading Neural Weights: 45% (1.2GB / 2.8GB)".
// Automatically transitions to Turn 1 once loading reaches 100% (or if the user
// clicks "Boot Immediately with Local Fallback Compiler").
// ============================================================================

import React, { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { DEFAULT_WEBLLM_MODEL_ID } from "../services/webllmService";

export interface LoadingScreenProps {
  onComplete: () => void;
}

const formatGigabytes = (bytes: number): string => {
  const gb = bytes / 1_000_000_000;
  return `${gb.toFixed(1)}GB`;
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ onComplete }) => {
  const webllmProgress = useGameStore((s) => s.webllmProgress);

  const {
    isReady,
    isLoading,
    progressPct,
    text,
    downloadedBytes,
    totalBytes,
    timeElapsedSec,
    webGPUSupported,
    error,
  } = webllmProgress;

  // Automatically transition to Turn 1 once loading hits 100% / isReady (or if fallback triggered)
  useEffect(() => {
    if (isReady || (!isLoading && (progressPct >= 100 || !webGPUSupported || error))) {
      const timer = setTimeout(() => {
        onComplete();
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [isReady, isLoading, progressPct, webGPUSupported, error, onComplete]);

  const clampedPct = Math.max(0, Math.min(100, progressPct));
  const downloadedLabel = formatGigabytes(downloadedBytes);
  const totalLabel = formatGigabytes(totalBytes);

  // Build ASCII terminal block bar (25 segments)
  const filledBlocks = Math.round((clampedPct / 100) * 24);
  const asciiBar =
    "█".repeat(filledBlocks) + "░".repeat(Math.max(0, 24 - filledBlocks));

  return (
    <div className="gov-loading-overlay">
      <div className="gov-loading-terminal">
        <div className="gov-loading-header">
          <span className="gov-badge gov-badge-cyan">
            WEBGPU NEURAL WEIGHTS INITIALIZATION
          </span>
          <span className="gov-eyebrow">MODEL: {DEFAULT_WEBLLM_MODEL_ID}</span>
        </div>

        <h2 className="gov-loading-title">
          Downloading Neural Weights: {clampedPct}% ({downloadedLabel} /{" "}
          {totalLabel})
        </h2>

        {/* Sleek Visual Progress Bar */}
        <div className="gov-loading-bar-track">
          <div
            className="gov-loading-bar-fill"
            style={{ width: `${clampedPct}%` }}
          />
        </div>

        {/* Terminal Console Readout */}
        <div className="gov-loading-console">
          <div className="gov-console-line">
            <span className="gov-text-cyan">&gt; STATUS:</span> {text}
          </div>
          <div className="gov-console-line">
            <span className="gov-text-cyan">&gt; BUFFER:</span> [{asciiBar}]{" "}
            {clampedPct}% ({downloadedBytes.toLocaleString()} /{" "}
            {totalBytes.toLocaleString()} BYTES)
          </div>
          <div className="gov-console-line">
            <span className="gov-text-cyan">&gt; CACHE:</span> IndexedDB
            Persistent Browser Cache ({timeElapsedSec}s elapsed)
          </div>
          {error && (
            <div className="gov-console-line gov-text-amber">
              &gt; NOTICE: {error} — Switching to Deterministic Legislative
              Compiler.
            </div>
          )}
        </div>

        <div className="gov-loading-footer">
          <span className="gov-eyebrow">
            Weights are cached in IndexedDB for instant offline boot on future
            runs.
          </span>
          <button
            type="button"
            className="gov-btn-ghost"
            onClick={onComplete}
            title="Enter Turn 1 immediately while weights finish caching in background"
          >
            SKIP &amp; ENTER TURN 1 NOW
          </button>
        </div>
      </div>
    </div>
  );
};
