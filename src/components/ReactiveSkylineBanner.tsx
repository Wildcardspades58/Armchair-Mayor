// ============================================================================
// ARMCHAIR MAYOR — Animated 6-Pillar Vector City Diorama (~125px)
// Dynamically transforms sky, landmarks, transit & alerts from live city stats:
// - Approval >= 55: warm golden-azure sky | < 35: twilight slate
// - Pollution < 45: spinning wind turbines, rooftop solar & green trees | > 65: amber smog & heavy smoke
// - Housing (land_value) > 60: construction crane, sunlit towers & sailboats | < 35: boarded windows
// - Education > 58: illuminated University Observatory dome
// - Health > 58: Civic Medical Center tower with pulsing red-cross beacon
// - Traffic < 45: electric streetcar & cyclists | > 65: red brake-light gridlock
// - Crime > 65 or any Tension > 80: blinking beacons, protest banners & emergency lights
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";

export const ReactiveSkylineBanner: React.FC = () => {
  const avg = useGameStore((s) => s.grid.globalAverages);
  const civic = useGameStore((s) => s.civicServices);
  const overallApproval = useGameStore((s) => s.voterSentiment.overallApproval);
  const tensions = useGameStore((s) => s.tensions);
  const startingArchetype = useGameStore((s) => s.grid.startingArchetype);
  const time = useGameStore((s) => s.time);

  const edu = civic?.education ?? 55;
  const health = civic?.health ?? 55;

  const highPollution = avg.pollution > 65;
  const cleanAir = avg.pollution < 45;
  const highTraffic = avg.traffic > 65;
  const smoothTransit = avg.traffic < 45;
  const boomingHousing = avg.land_value > 60;
  const blightedHousing = avg.land_value < 35;
  const strongEdu = edu > 58;
  const strongHealth = health > 58;
  const highTensionOrCrime =
    avg.crime > 65 ||
    tensions.Crime > 80 ||
    tensions.Transit > 80 ||
    tensions.Sanitation > 80;

  // Dynamic sky gradient reflecting overall approval & pollution/blight mood
  const skyGradientTop =
    highPollution
      ? "#C98D4F"
      : blightedHousing || overallApproval < 35
      ? "#475569"
      : overallApproval >= 55
      ? "#7EC8E3"
      : "#9EC7D8";
  const skyGradientBottom =
    highPollution
      ? "#F0CEA0"
      : blightedHousing || overallApproval < 35
      ? "#94A3B8"
      : "#FCF5E5";

  return (
    <div className="gov-skyline-banner">
      <svg
        viewBox="0 0 960 124"
        preserveAspectRatio="xMidYMid slice"
        className="gov-skyline-svg"
        role="img"
        aria-label="Animated City Skyline reflecting live 6-pillar metrics and approval mood"
      >
        <defs>
          <linearGradient id="govSkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyGradientTop} />
            <stop offset="100%" stopColor={skyGradientBottom} />
          </linearGradient>
        </defs>

        {/* Sky Backdrop */}
        <rect x="0" y="0" width="960" height="124" fill="url(#govSkyGrad)" />

        {/* Sun / Twilight Moon Orb */}
        {!blightedHousing && (
          <circle
            cx="875"
            cy="26"
            r={boomingHousing ? 19 : 14}
            fill={
              overallApproval < 35
                ? "#E2E8F0"
                : highPollution
                ? "#E59846"
                : "#FACC15"
            }
            opacity={highPollution ? 0.65 : 0.92}
          />
        )}

        {/* Gentle Drifting Clouds */}
        <g
          className="gov-skyline-clouds"
          fill={blightedHousing || overallApproval < 35 ? "#64748B" : "#FFFFFF"}
          opacity={blightedHousing ? 0.5 : 0.72}
        >
          <ellipse cx="155" cy="22" rx="44" ry="10" />
          <ellipse cx="185" cy="24" rx="34" ry="8" />
          <ellipse cx="470" cy="18" rx="52" ry="11" />
          <ellipse cx="720" cy="24" rx="48" ry="10" />
        </g>

        {/* Heavy Amber Smog when Pollution > 65 */}
        {highPollution && (
          <g className="gov-skyline-smog" fill="#B46522" opacity="0.45">
            <ellipse cx="140" cy="34" rx="78" ry="15" />
            <ellipse cx="380" cy="26" rx="95" ry="16" />
            <ellipse cx="640" cy="33" rx="82" ry="14" />
          </g>
        )}

        {/* Ridge Silhouette + Spinning Wind Turbines when Pollution < 45 */}
        <path
          d="M0 98 L0 74 Q140 60 280 78 T560 72 T820 76 L960 68 L960 98 Z"
          fill={cleanAir ? "#8FB88D" : "#8B7D70"}
          opacity="0.45"
        />

        {cleanAir && (
          <g>
            {[770, 818].map((tx) => (
              <g key={tx}>
                <line
                  x1={tx}
                  y1={75}
                  x2={tx}
                  y2={42}
                  stroke="#F8FAFC"
                  strokeWidth="2.4"
                />
                <g
                  className="gov-skyline-turbine"
                  style={{ transformOrigin: `${tx}px 42px` }}
                >
                  <line x1={tx} y1={42} x2={tx} y2={25} stroke="#FFFFFF" strokeWidth="2" />
                  <line x1={tx} y1={42} x2={tx + 14} y2={50} stroke="#FFFFFF" strokeWidth="2" />
                  <line x1={tx} y1={42} x2={tx - 14} y2={50} stroke="#FFFFFF" strokeWidth="2" />
                </g>
              </g>
            ))}
          </g>
        )}

        {/* Harbor Water Strip + Sailboats when Housing > 60 */}
        <rect x="705" y="90" width="255" height="16" fill="#479BB5" opacity="0.88" />
        {boomingHousing && (
          <g className="gov-skyline-sailboat">
            <polygon points="785,90 801,90 797,95 787,95" fill="#8B5A2B" />
            <polygon points="793,72 793,89 803,89" fill="#FAF5EB" />
            <polygon points="865,90 879,90 876,95 867,95" fill="#C85A32" />
            <polygon points="872,75 872,89 881,89" fill="#FAF5EB" />
          </g>
        )}

        {/* Construction Crane when Housing > 60 */}
        {boomingHousing && (
          <g stroke="#D97706" strokeWidth="2" fill="none">
            <line x1="398" y1="98" x2="398" y2="14" />
            <line x1="378" y1="18" x2="438" y2="18" />
            <line x1="398" y1="14" x2="434" y2="18" strokeWidth="1.2" />
            <line x1="428" y1="18" x2="428" y2="33" stroke="#334155" strokeWidth="1.2" />
            <rect x="423" y="33" width="10" height="6" fill="#94A3B8" stroke="none" />
          </g>
        )}

        {/* Factory Smokestacks (Left Industrial Quarter) */}
        <g>
          <rect x="28" y="56" width="46" height="44" fill="#645349" rx="2" />
          <rect x="36" y="36" width="9" height="22" fill="#43362F" />
          <rect x="55" y="30" width="10" height="28" fill="#43362F" />
          {highPollution && (
            <g className="gov-skyline-smoke" fill="#8C6239" opacity="0.72">
              <circle cx="42" cy="24" r="7" />
              <circle cx="52" cy="16" r="9" />
              <circle cx="62" cy="18" r="8" />
              <circle cx="74" cy="10" r="11" />
            </g>
          )}
        </g>

        {/* University Observatory Dome when Education > 58 */}
        {strongEdu && (
          <g stroke="#1E293B" strokeWidth="1.4">
            <rect x="92" y="64" width="44" height="36" fill="#E6D5B8" rx="2" />
            <path d="M96 64 A18 18 0 0 1 132 64 Z" fill="#3B6E8C" />
            <line x1="114" y1="46" x2="114" y2="39" />
            <circle cx="114" cy="38" r="2" fill="#FACC15" stroke="none" />
          </g>
        )}

        {/* Downtown & Civic Skyline Buildings */}
        <g stroke="#2C221E" strokeWidth="1.4">
          <rect x="148" y="50" width="50" height="50" fill="#D8C3A5" rx="3" />
          <rect x="210" y="36" width="60" height="64" fill="#C9A87C" rx="3" />
          {/* City Hall Clock Spire */}
          <rect x="282" y="20" width="56" height="80" fill="#EFE4D2" rx="3" />
          <polygon points="292,20 310,6 328,20" fill="#C85A32" />
          <circle cx="310" cy="34" r="6" fill="#FFFDF9" />
          {/* Mid-Rise */}
          <rect x="350" y="42" width="62" height="58" fill="#BFA582" rx="3" />
          {/* Sunlit Glass Tower */}
          <rect
            x="426"
            y={boomingHousing ? 16 : 28}
            width="60"
            height={boomingHousing ? 84 : 72}
            fill={boomingHousing ? "#DCEFF5" : "#C4B49E"}
            rx="3"
          />
          {/* Civic Medical Center Tower when Health > 58 */}
          <rect
            x="502"
            y={strongHealth ? 30 : 42}
            width="58"
            height={strongHealth ? 70 : 58}
            fill={strongHealth ? "#F8FAFC" : "#D4B895"}
            rx="3"
          />
          {strongHealth && (
            <g stroke="none" fill="#DC2626">
              <rect x="528" y="38" width="6" height="16" rx="1" />
              <rect x="523" y="43" width="16" height="6" rx="1" />
            </g>
          )}
          <rect x="574" y="46" width="64" height="54" fill="#C8A985" rx="3" />
          <rect x="652" y="58" width="52" height="42" fill="#DECBB0" rx="3" />
        </g>

        {/* Blinking Rooftop Aviation / Medical Beacons */}
        <g className="gov-skyline-beacon">
          <circle cx="310" cy="6" r="2.6" fill="#EF4444" />
          <circle cx="456" cy={boomingHousing ? 14 : 26} r="2.4" fill="#EF4444" />
          {strongHealth && <circle cx="531" cy="28" r="2.6" fill="#EF4444" />}
        </g>

        {/* Rooftop Solar Panels & Park Trees when Pollution < 45 */}
        {cleanAir && (
          <g>
            {/* Solar Panels */}
            <polygon points="216,35 236,35 232,29 220,29" fill="#1E3A8A" stroke="#93C5FD" strokeWidth="0.8" />
            <polygon points="242,35 262,35 258,29 246,29" fill="#1E3A8A" stroke="#93C5FD" strokeWidth="0.8" />
            {/* Lush Street & Rooftop Trees */}
            <circle cx="140" cy="91" r="6" fill="#3B8249" />
            <circle cx="204" cy="92" r="5" fill="#4CA15B" />
            <circle cx="344" cy="91" r="6" fill="#3B8249" />
            <circle cx="494" cy="91" r="6" fill="#4CA15B" />
            <circle cx="645" cy="91" r="6" fill="#3B8249" />
          </g>
        )}

        {/* Boarded Windows vs Warm Lit Windows */}
        {blightedHousing ? (
          <g fill="#5C4433" stroke="#2C221E" strokeWidth="1">
            <rect x="158" y="60" width="12" height="10" />
            <rect x="176" y="60" width="12" height="10" />
            <rect x="220" y="48" width="14" height="10" />
            <rect x="244" y="66" width="14" height="10" />
            <rect x="588" y="60" width="14" height="10" />
          </g>
        ) : (
          <g fill="#FFF7DF" opacity="0.9">
            <rect x="158" y="58" width="10" height="10" rx="1" />
            <rect x="176" y="58" width="10" height="10" rx="1" />
            <rect x="220" y="46" width="12" height="10" rx="1" />
            <rect x="244" y="46" width="12" height="10" rx="1" />
            <rect x="295" y="48" width="11" height="12" rx="1" />
            <rect x="314" y="48" width="11" height="12" rx="1" />
            <rect x="440" y="34" width="12" height="14" rx="1" />
            <rect x="462" y="34" width="12" height="14" rx="1" />
            <rect x="588" y="58" width="11" height="11" rx="1" />
            <rect x="610" y="58" width="11" height="11" rx="1" />
          </g>
        )}

        {/* Foreground Avenue */}
        <rect x="0" y="99" width="960" height="25" fill="#3B3531" />
        <line
          x1="0"
          y1="111.5"
          x2="960"
          y2="111.5"
          stroke="#E8D8BE"
          strokeWidth="1.5"
          strokeDasharray="14 10"
          opacity="0.65"
        />

        {/* Rush-Hour Traffic vs Smooth Electric Streetcar & Cyclists */}
        {highTraffic ? (
          <g className="gov-skyline-gridlock">
            {[35, 95, 160, 225, 290, 360, 430, 500, 570, 640, 710, 780, 850].map(
              (xPos, idx) => (
                <g key={xPos}>
                  <rect
                    x={xPos}
                    y={idx % 2 === 0 ? 102 : 113}
                    width="24"
                    height="7"
                    rx="2"
                    fill={idx % 3 === 0 ? "#B93829" : "#64748B"}
                  />
                  <circle
                    cx={xPos + 2}
                    cy={idx % 2 === 0 ? 105 : 116}
                    r="2.3"
                    fill="#EF4444"
                  />
                </g>
              )
            )}
          </g>
        ) : (
          <g className="gov-skyline-streetcar">
            {smoothTransit && (
              <>
                <rect x="200" y="99" width="56" height="12" rx="3" fill="#C85A32" />
                <rect x="206" y="101" width="10" height="5" fill="#FAF5EB" />
                <rect x="220" y="101" width="10" height="5" fill="#FAF5EB" />
                <rect x="234" y="101" width="10" height="5" fill="#FAF5EB" />
                <circle cx="485" cy="116" r="3" fill="none" stroke="#FAF5EB" strokeWidth="1.5" />
                <circle cx="495" cy="116" r="3" fill="none" stroke="#FAF5EB" strokeWidth="1.5" />
                <circle cx="490" cy="109" r="2.2" fill="#E8A838" />
              </>
            )}
            <rect x="640" y="113" width="22" height="7" rx="2" fill="#3B82F6" />
          </g>
        )}

        {/* Protest Banners & Flashing Emergency Cruisers when Crime > 65 or Tension > 80 */}
        {highTensionOrCrime && (
          <g className="gov-skyline-protest">
            <rect x="278" y="87" width="20" height="10" rx="1" fill="#DC2626" />
            <line x1="288" y1="97" x2="288" y2="101" stroke="#FAF5EB" strokeWidth="1.5" />
            <rect x="556" y="88" width="22" height="10" rx="1" fill="#F59E0B" />
            <line x1="567" y1="98" x2="567" y2="101" stroke="#FAF5EB" strokeWidth="1.5" />
            <rect x="615" y="102" width="24" height="8" rx="2" fill="#F8FAFC" />
            <circle cx="624" cy="101" r="3" fill="#EF4444" />
            <circle cx="630" cy="101" r="3" fill="#3B82F6" />
          </g>
        )}
      </svg>

      {/* Compact Diorama Telemetry Strip */}
      <div className="gov-skyline-overlay-strip">
        <span className="gov-skyline-city-tag">
          {startingArchetype.toUpperCase()} — MONTH {time.turn}
        </span>
        <div className="gov-skyline-pills">
          {cleanAir && (
            <span className="gov-badge gov-badge-emerald">CLEAN TURBINES</span>
          )}
          {highPollution && (
            <span className="gov-badge gov-badge-amber">SMOG ALERT</span>
          )}
          {boomingHousing && (
            <span className="gov-badge gov-badge-emerald">HOUSING BOOM</span>
          )}
          {strongEdu && (
            <span className="gov-badge gov-badge-cyan">UNIVERSITY LIT</span>
          )}
          {strongHealth && (
            <span className="gov-badge gov-badge-emerald">CLINICS OPEN</span>
          )}
          {highTraffic && (
            <span className="gov-badge gov-badge-crimson">GRIDLOCK</span>
          )}
          {highTensionOrCrime && (
            <span className="gov-badge gov-badge-crimson">SIRENS ACTIVE</span>
          )}
        </div>
      </div>
    </div>
  );
};
