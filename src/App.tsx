// ============================================================================
// GOVERNOR — Main Application Shell + Bonus Step 3 & 4 (MainMenu + LoadingScreen)
// Player Flow:
// Landing Page (MainMenu over slow-pulsing 2D react-konva 10x10 Blueprint Grid)
//   → Reads "Classified Briefing (How to Play)"
//   → Clicks "New Campaign" (fires initializeCity())
//   → If WebLLM model isn't cached/ready yet, displays LoadingScreen
//     ("Downloading Neural Weights: 45% (1.2GB / 2.8GB)")
//   → Once loading hits 100%, transitions seamlessly to Turn 1 in the Executive HUD.
// ============================================================================

import React, { Suspense, lazy, useState } from "react";
import { TopScoreboard } from "./components/TopScoreboard";
import { LeftVibeFeed } from "./components/LeftVibeFeed";
import { RightDepartmentHeads } from "./components/RightDepartmentHeads";
import { BottomPolicyDesk } from "./components/BottomPolicyDesk";
import { CampaignDesk } from "./components/CampaignDesk";
import { CrisisModal } from "./components/CrisisModal";
import { TurnProcessingModal } from "./components/TurnProcessingModal";
import { CenterBroadsheetDesk } from "./components/CenterBroadsheetDesk";
import { MainMenu } from "./components/MainMenu";
import { LoadingScreen } from "./components/LoadingScreen";
import { useGameStore } from "./store/useGameStore";
import { webLLMService } from "./services/webllmService";
import "./services/crisisEngine";

const CityReportModal = lazy(() =>
  import("./components/CityReportModal").then((m) => ({
    default: m.CityReportModal,
  }))
);
const SaveLoadModal = lazy(() =>
  import("./components/SaveLoadModal").then((m) => ({
    default: m.SaveLoadModal,
  }))
);
const TownHallModal = lazy(() =>
  import("./components/TownHallModal").then((m) => ({
    default: m.TownHallModal,
  }))
);
const CabinetChamberModal = lazy(() =>
  import("./components/CabinetChamberModal").then((m) => ({
    default: m.CabinetChamberModal,
  }))
);
const DoctrinesModal = lazy(() =>
  import("./components/DoctrinesModal").then((m) => ({
    default: m.DoctrinesModal,
  }))
);
const LegacyChronicleModal = lazy(() =>
  import("./components/LegacyChronicleModal").then((m) => ({
    default: m.LegacyChronicleModal,
  }))
);

export interface GovernorHudShellProps {
  mapViewport?: React.ReactNode;
}

export const App: React.FC<GovernorHudShellProps> = ({ mapViewport }) => {
  const isElectionMode = useGameStore((s) => s.isElectionMode);
  const isModelReady = useGameStore((s) => s.webllmProgress.isReady);

  const [showMainMenu, setShowMainMenu] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);

  const handleStartCampaign = () => {
    setShowMainMenu(false);

    // If the WebLLM model is already loaded/cached in memory, jump directly to Turn 1
    if (isModelReady) {
      setShowLoadingScreen(false);
      return;
    }

    // Otherwise display the Terminal LoadingScreen and start WebLLM weight initialization
    setShowLoadingScreen(true);
    void webLLMService.initializeEngine();
  };

  return (
    <div className="gov-app-shell">
      {/* Landing Screen Overlay */}
      {showMainMenu && (
        <div className="gov-landing-wrapper">
          <MainMenu onStartCampaign={handleStartCampaign} />
        </div>
      )}

      {/* Bonus Step 4: WebLLM Weight Download Progress Bar Overlay */}
      {showLoadingScreen && (
        <LoadingScreen
          onComplete={() => {
            setShowLoadingScreen(false);
          }}
        />
      )}

      {/* TOP BAR: Scoreboard (Approval Rating, Dynamic Manager Title, Treasury, Turn/Month) */}
      <TopScoreboard />

      {/* MIDDLE WORKSPACE: Hides Left Vibe Feed / Inbox during Turn 24 Election Mode */}
      <main
        className={`gov-workspace-grid ${
          isElectionMode ? "gov-election-workspace" : ""
        }`}
      >
        {!isElectionMode && <LeftVibeFeed />}

        <section
          id="gov-central-map-viewport"
          className="gov-center-viewport"
          aria-label="Central Editorial Broadsheet & Legislative Desk"
        >
          {mapViewport ?? <CenterBroadsheetDesk />}
        </section>

        <RightDepartmentHeads />
      </main>

      {/* BOTTOM PANEL: Replaces Policy Desk with Campaign Desk during Turn 24 Election Mode */}
      {isElectionMode ? <CampaignDesk /> : <BottomPolicyDesk />}

      {/* MODAL OVERLAYS: Lazy-loaded Secondary Modals & Turn Processing */}
      {!showMainMenu && !showLoadingScreen && (
        <>
          <TurnProcessingModal />
          <CrisisModal />
          <Suspense fallback={null}>
            <CityReportModal />
            <SaveLoadModal />
            <TownHallModal />
            <CabinetChamberModal />
            <DoctrinesModal />
            <LegacyChronicleModal />
          </Suspense>
        </>
      )}
    </div>
  );
};

export default App;
