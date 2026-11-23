// ============================================================================
// GOVERNOR — Reactive City Skyline Banner (~120px Vector Diorama)
// Visually transforms in real time based on live city metrics:
// - Pollution > 65: Drifting amber smog clouds & heavy factory smokestack puffs
// - Traffic > 65: Red brake-light gridlock; Traffic < 35: Streetcars & bikes
// - Land Value > 65: Lush rooftop parks, sunlit towers & sailboats
// - Land Value < 35: Boarded windows & overcast skies
// - Any Tension > 80: Animated street protest banners & flashing emergency lights
// ============================================================================

import React from "react";
import { useGameStore } from "../store/useGameStore";

export const ReactiveSkylineBanner: React.FC = () => {
  const avg = useGameStore((s) => s.grid.globalAverages);
  const tensions = useGameStore((s) => s.tensions);
  const startingArchetype = useGameStore((s) => s.grid.startingArchetype);
  const time = useGameStore((s) => s.time);

  const highPollution = avg.pollution > 65;
  const highTraffic = avg.traffic > 65;
  const lowTraffic = avg.traffic < 35;
  const highLandValue = avg.land_value > 65;
  const lowLandValue = avg.land_value < 35;
  const highTension =
    tensions.Crime > 80 || tensions.Transit > 80 || tensions.Sanitation > 80;

  const skyGradientTop = lowLandValue
    ? "#94A3B8"
    : highPollution
    ? "#D9A86C"
    : "#9ED4E8";
  const skyGradientBottom = lowLandValue
    ? "#CBD5E1"
    : highPollution
    ? "#F2D2A2"
    : "#FAF5EB";

  return (
    <div className="gov-skyline-banner">
      <svg
        viewBox="0 0 960 120"
        preserveAspectRatio="xMidYMid slice"
        className="gov-skyline-svg"
        role="img"
        aria-label="Reactive City Skyline reflecting live pollution, traffic, land value, and civic tension"
      >
        <defs>
          <linearGradient id="govSkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyGradientTop} />
            <stop offset="100%" stopColor={skyGradientBottom} />
          </linearGradient>
        </defs>

        {/* Sky Backdrop */}
        <rect x="0" y="0" width="960" height="120" fill="url(#govSkyGrad)" />

        {/* Sunlit Warm Orb (hidden when overcast) */}
        {!lowLandValue && (
          <circle
            cx="860"
            cy="28"
            r={highLandValue ? 20 : 15}
            fill={highPollution ? "#E59846" : "#F6C957"}
            opacity={highPollution ? 0.65 : 0.92}
          />
        )}

        {/* Overcast Clouds when Land Value < 35 */}
        {lowLandValue && (
          <g fill="#64748B" opacity="0.45">
            <ellipse cx="180" cy="24" rx="58" ry="13" />
            <ellipse cx="440" cy="18" rx="74" ry="15" />
            <ellipse cx="740" cy="26" rx="64" ry="13" />
          </g>
        )}

        {/* Drifting Amber Smog Clouds when Pollution > 65 */}
        {highPollution && (
          <g className="gov-skyline-smog" fill="#C77D32" opacity="0.42">
            <ellipse cx="140" cy="30" rx="68" ry="14" />
            <ellipse cx="360" cy="22" rx="85" ry="16" />
            <ellipse cx="620" cy="29" rx="78" ry="15" />
            <ellipse cx="830" cy="24" rx="64" ry="13" />
          </g>
        )}

        {/* Harbor Water Strip (Right Side) + Sailboats when Land Value > 65 */}
        <rect x="700" y="88" width="260" height="16" fill="#5BA4B8" opacity="0.85" />
        {highLandValue && (
          <g className="gov-skyline-sailboat">
            <polygon points="780,88 796,88 792,93 782,93" fill="#8B5A2B" />
            <polygon points="788,71 788,87 798,87" fill="#FAF5EB" />
            <polygon points="860,88 874,88 871,93 862,93" fill="#C85A32" />
            <polygon points="867,74 867,87 876,87" fill="#FAF5EB" />
          </g>
        )}

        {/* Factory Smokestacks (Left Industrial Quarter) */}
        <g>
          <rect x="34" y="54" width="46" height="44" fill="#6E5A4F" rx="2" />
          <rect x="42" y="34" width="9" height="22" fill="#4A3C35" />
          <rect x="61" y="28" width="10" height="28" fill="#4A3C35" />
          {highPollution && (
            <g className="gov-skyline-smoke" fill="#8C6239" opacity="0.65">
              <circle cx="48" cy="24" r="7" />
              <circle cx="57" cy="16" r="9" />
              <circle cx="67" cy="18" r="8" />
              <circle cx="79" cy="10" r="11" />
            </g>
          )}
        </g>

        {/* Mid-Rise & Downtown Towers */}
        <g stroke="#3D2B1F" strokeWidth="1.5">
          {/* Building 1 */}
          <rect x="112" y="48" width="54" height="50" fill="#D8C3A5" rx="3" />
          {/* Building 2 */}
          <rect x="180" y="34" width="64" height="64" fill="#C9A87C" rx="3" />
          {/* Tall Civic Spire */}
          <rect x="262" y="20" width="58" height="78" fill="#E8D8BE" rx="3" />
          <polygon points="274,20 291,7 308,20" fill="#C85A32" />
          {/* Building 4 */}
          <rect x="336" y="40" width="66" height="58" fill="#BFA582" rx="3" />
          {/* Sunlit / Tech Tower */}
          <rect
            x="420"
            y={highLandValue ? 16 : 28}
            width="62"
            height={highLandValue ? 82 : 70}
            fill={highLandValue ? "#E5F0EC" : "#C4B49E"}
            rx="3"
          />
          {/* Building 6 */}
          <rect x="500" y="38" width="56" height="60" fill="#D4B895" rx="3" />
          {/* Building 7 */}
          <rect x="572" y="46" width="68" height="52" fill="#C8A985" rx="3" />
          {/* Waterfront Pavilion */}
          <rect x="652" y="56" width="52" height="42" fill="#DECBB0" rx="3" />
        </g>

        {/* Rooftop Green Parks when Land Value > 65 */}
        {highLandValue && (
          <g>
            <rect x="182" y="30" width="60" height="5" fill="#4D8B55" rx="2" />
            <circle cx="196" cy="27" r="5" fill="#3B7A43" />
            <circle cx="228" cy="27" r="5" fill="#5CA063" />
            <rect x="338" y="36" width="62" height="5" fill="#4D8B55" rx="2" />
            <circle cx="355" cy="33" r="5" fill="#3B7A43" />
            <rect x="502" y="34" width="52" height="5" fill="#4D8B55" rx="2" />
            <circle cx="526" cy="31" r="5" fill="#5CA063" />
          </g>
        )}

        {/* Boarded Windows when Land Value < 35 */}
        {lowLandValue ? (
          <g fill="#5C4433" stroke="#3D2B1F" strokeWidth="1">
            <rect x="122" y="58" width="12" height="10" />
            <rect x="142" y="58" width="12" height="10" />
            <rect x="192" y="46" width="14" height="10" />
            <rect x="216" y="64" width="14" height="10" />
            <rect x="348" y="52" width="14" height="10" />
            <rect x="586" y="58" width="14" height="10" />
          </g>
        ) : (
          <g fill="#FFF7DF" opacity="0.88">
            <rect x="122" y="56" width="10" height="10" rx="1" />
            <rect x="142" y="56" width="10" height="10" rx="1" />
            <rect x="192" y="44" width="12" height="11" rx="1" />
            <rect x="216" y="44" width="12" height="11" rx="1" />
            <rect x="275" y="32" width="11" height="12" rx="1" />
            <rect x="296" y="32" width="11" height="12" rx="1" />
            <rect x="434" y="36" width="12" height="14" rx="1" />
            <rect x="456" y="36" width="12" height="14" rx="1" />
            <rect x="512" y="48" width="10" height="10" rx="1" />
            <rect x="532" y="48" width="10" height="10" rx="1" />
          </g>
        )}

        {/* Foreground Avenue */}
        <rect x="0" y="96" width="960" height="24" fill="#4B423B" />
        <line
          x1="0"
          y1="108"
          x2="960"
          y2="108"
          stroke="#E8D8BE"
          strokeWidth="1.5"
          strokeDasharray="14 10"
          opacity="0.65"
        />

        {/* Traffic > 65: Red Brake-Light Gridlock */}
        {highTraffic && (
          <g className="gov-skyline-gridlock">
            {[40, 105, 175, 245, 315, 390, 465, 540, 615, 690, 765, 840].map(
              (xPos, idx) => (
                <g key={xPos}>
                  <rect
                    x={xPos}
                    y={idx % 2 === 0 ? 99 : 110}
                    width="24"
                    height="7"
                    rx="2"
                    fill={idx % 3 === 0 ? "#8B5A2B" : "#7F6D5E"}
                  />
                  <circle
                    cx={xPos + 2}
                    cy={idx % 2 === 0 ? 102 : 113}
                    r="2.3"
                    fill="#EF4444"
                  />
                </g>
              )
            )}
          </g>
        )}

        {/* Traffic < 35: Smooth Streetcar & Bikes */}
        {lowTraffic && !highTraffic && (
          <g className="gov-skyline-streetcar">
            <rect x="210" y="96" width="54" height="12" rx="3" fill="#C85A32" />
            <rect x="216" y="98" width="10" height="5" fill="#FAF5EB" />
            <rect x="230" y="98" width="10" height="5" fill="#FAF5EB" />
            <rect x="244" y="98" width="10" height="5" fill="#FAF5EB" />
            {/* Cyclist */}
            <circle cx="480" cy="113" r="3" fill="none" stroke="#FAF5EB" strokeWidth="1.5" />
            <circle cx="490" cy="113" r="3" fill="none" stroke="#FAF5EB" strokeWidth="1.5" />
            <circle cx="485" cy="106" r="2.2" fill="#E8A838" />
          </g>
        )}

        {/* Any Tension > 80: Protest Banners & Flashing Emergency Lights */}
        {highTension && (
          <g className="gov-skyline-protest">
            <rect x="282" y="84" width="20" height="10" rx="1" fill="#DC2626" />
            <line x1="292" y1="94" x2="292" y2="99" stroke="#FAF5EB" strokeWidth="1.5" />
            <rect x="526" y="85" width="22" height="10" rx="1" fill="#F59E0B" />
            <line x1="537" y1="95" x2="537" y2="99" stroke="#FAF5EB" strokeWidth="1.5" />
            {/* Flashing Emergency Car */}
            <rect x="618" y="99" width="24" height="8" rx="2" fill="#F8FAFC" />
            <circle cx="628" cy="98" r="3" fill="#EF4444" />
            <circle cx="633" cy="98" r="3" fill="#3B82F6" />
          </g>
        )}
      </svg>

      {/* Compact Overlay Status Pill Strip */}
      <div className="gov-skyline-overlay-strip">
        <span className="gov-skyline-city-tag">
          {startingArchetype.toUpperCase()} — MONTH {time.turn}
        </span>
        <div className="gov-skyline-pills">
          {highPollution && (
            <span className="gov-badge gov-badge-amber">SMOG ADVISORY</span>
          )}
          {highTraffic && (
            <span className="gov-badge gov-badge-crimson">GRIDLOCK</span>
          )}
          {lowTraffic && (
            <span className="gov-badge gov-badge-emerald">CLEAR TRANSIT</span>
          )}
          {highLandValue && (
            <span className="gov-badge gov-badge-emerald">BLOOMING PARKS</span>
          )}
          {lowLandValue && (
            <span className="gov-badge gov-badge-muted">BLIGHT &amp; OVERCAST</span>
          )}
          {highTension && (
            <span className="gov-badge gov-badge-crimson">STREET UNREST</span>
          )}
        </div>
      </div>
    </div>
  );
};
