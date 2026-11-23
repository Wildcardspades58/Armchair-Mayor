// ============================================================================
// GOVERNOR — Headless Simulation Core (Zustand Store)
// Pure decision engine math. Includes Step 4.1: The Turn 1 Procedural Generator
// ("The Inherited Mess") via initializeCity() across a 10x10 GridSystem.
// ============================================================================

import { create } from "zustand";
import {
  AIChallengerState,
  AICrisisChoice,
  AICrisisResponse,
  AICustomPolicyResponse,
  ActiveCustomPolicy,
  AggregatedLawRecord,
  AppointeeAlignment,
  AppointeeNPC,
  AppointeeRoleKey,
  CampaignActionType,
  CampaignTermMode,
  CivicPillar,
  CulturePointsState,
  CustomCityScenarioPayload,
  Demographic,
  DepartmentBudgets,
  DepartmentHeadsState,
  DistrictNode,
  DistrictRuleType,
  ElectionCampaignState,
  FailStateTracking,
  FrontPageBroadsheet,
  GameState,
  GridSystemState,
  GridTile,
  HallOfFameLawEntry,
  HeatmapMetric,
  IdeologicalAxis,
  LegacyArchetype,
  LegacyChronicleState,
  LegacyMetricsState,
  MapFloatingPopup,
  MonthlyDocketIssue,
  MonthlyHistorySnapshot,
  PolicyDoctrinesState,
  PoliticalCompassProfile,
  PoliticalOffice,
  PressWireFlash,
  SaveSlotMetadata,
  SponsoredBillProposal,
  STARTING_ARCHETYPES,
  StartingArchetype,
  TaxRates,
  TensionKey,
  TensionMetersState,
  TimeState,
  TownHallGradingResult,
  TownHallQuestion,
  TownHallSessionState,
  TreasuryState,
  TurnProcessingState,
  VALID_APPOINTEE_ALIGNMENTS,
  VALID_CIVIC_PILLARS,
  VALID_DEMOGRAPHICS,
  VALID_HEATMAP_METRICS,
  VALID_TENSION_KEYS,
  VibeFeedEntry,
  VoterSentimentState,
  WebLLMProgressState,
} from "../types/simulation";
import {
  buildMonthlyCityReport,
  DOCKET_CUSTOM_CAPITAL_COST,
  evaluatePoliticalCompassProfile,
  generateMonthlyDocketForTurn,
  MONTHLY_BASE_CAPITAL_STIPEND,
  MONTHLY_MANDATE_CAPITAL_BONUS,
  PUBLIC_ADDRESS_CAPITAL_GAIN,
  PUBLIC_ADDRESS_TREASURY_COST,
  REPEAL_POLICY_CAPITAL_COST,
} from "../services/docketService";
import {
  buildDeterministicBroadsheet,
  evaluateSponsoredBillsDebate,
  generateBatchedTurnContent,
  generateHistoricalPostMortem,
  recordCrossGameIssueTitles,
} from "../services/webllmService";
import { soundEffects } from "../services/soundEffects";

export const AUTOSAVE_STORAGE_KEY = "governor_autosave";
export const MANUAL_SAVE_SLOT_KEYS = [
  "governor_slot_1",
  "governor_slot_2",
  "governor_slot_3",
] as const;

export interface SerializedCampaignSave {
  version: number;
  metadata: SaveSlotMetadata;
  state: {
    time: TimeState;
    treasury: TreasuryState;
    voterSentiment: VoterSentimentState;
    legacy: LegacyMetricsState;
    culturePoints: CulturePointsState;
    managerTitle: LegacyArchetype;
    failTrackers: FailStateTracking;
    wildcardCooldown: number;
    isElectionMode: boolean;
    electionCampaign: ElectionCampaignState;
    tensions: TensionMetersState;
    grid: GridSystemState;
    doctrines?: PolicyDoctrinesState;
    departmentHeads: DepartmentHeadsState;
    monthlyDocket: GameState["monthlyDocket"];
    cityReport: GameState["cityReport"];
    monthlyHistory: MonthlyHistorySnapshot[];
    politicalCompass: PoliticalCompassProfile;
    enactedPolicies: ActiveCustomPolicy[];
    news_ticker: VibeFeedEntry[];
    publicAddressUsedThisTurn: boolean;
  };
}

function serializeGameStateToSavePayload(
  state: GameState,
  slotId: string
): SerializedCampaignSave {
  return {
    version: 1,
    metadata: {
      slotId,
      savedAtIso: new Date().toISOString(),
      startingArchetype: state.grid.startingArchetype,
      turn: state.time.turn,
      month: state.time.month,
      year: state.time.year,
      currentOffice: state.time.currentOffice,
      overallApproval: state.voterSentiment.overallApproval,
      treasuryReserves: state.treasury.reserves,
      leaderTitle: state.politicalCompass.leaderTitle,
    },
    state: {
      time: state.time,
      treasury: state.treasury,
      voterSentiment: state.voterSentiment,
      legacy: state.legacy,
      culturePoints: state.culturePoints,
      managerTitle: state.managerTitle,
      failTrackers: state.failTrackers,
      wildcardCooldown: state.wildcardCooldown,
      isElectionMode: state.isElectionMode,
      electionCampaign: state.electionCampaign,
      tensions: state.tensions,
      grid: state.grid,
      doctrines: state.doctrines,
      departmentHeads: state.departmentHeads,
      monthlyDocket: state.monthlyDocket,
      cityReport: state.cityReport,
      monthlyHistory: state.monthlyHistory,
      politicalCompass: state.politicalCompass,
      enactedPolicies: state.enactedPolicies,
      news_ticker: state.news_ticker,
      publicAddressUsedThisTurn: state.publicAddressUsedThisTurn,
    },
  };
}

export function readSaveSlotMetadata(slotKey: string): SaveSlotMetadata | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(slotKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SerializedCampaignSave;
    if (!parsed || typeof parsed !== "object" || !parsed.metadata) return null;
    return parsed.metadata;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// 1. Strict Clamping & Pure RNG / Math Helpers
// ----------------------------------------------------------------------------

export const EXECUTIVE_ORDER_CAPITAL_COST = 25;
export const FIRE_APPOINTEE_CAPITAL_COST = 15;

export const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
};

export const clamp0to100 = (value: number): number =>
  clamp(Math.round(value * 10) / 10, 0, 100);

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const OFFICES_HIERARCHY: PoliticalOffice[] = [
  "City Mayor",
  "County Executive",
  "State Governor",
  "Federal Senator",
];

// ----------------------------------------------------------------------------
// Step 4.2: Appointee Engine Helpers (Upkeep Modifier & RNG Candidate Pool)
// ----------------------------------------------------------------------------

const CANDIDATE_FIRST_NAMES = [
  "Victor",
  "Elena",
  "Marcus",
  "Diana",
  "Hector",
  "Nadia",
  "Arthur",
  "Sonia",
  "Raymond",
  "Claire",
  "Julian",
  "Teresa",
];

const CANDIDATE_LAST_NAMES = [
  "Vance",
  "Sterling",
  "Solis",
  "Okafor",
  "Kowalski",
  "Mercer",
  "Chen",
  "Callahan",
  "Thorne",
  "Navarro",
  "Bellamy",
  "Sato",
];

export const APPOINTEE_ROLE_LABELS: Record<
  AppointeeRoleKey,
  { title: string; shortDept: string; budgetKey: keyof DepartmentBudgets }
> = {
  PoliceChief: {
    title: "Police Chief",
    shortDept: "Police",
    budgetKey: "publicSafety",
  },
  TransitDirector: {
    title: "Transit Director",
    shortDept: "Transit",
    budgetKey: "infrastructure",
  },
  SanitationHead: {
    title: "Sanitation Head",
    shortDept: "Sanitation",
    budgetKey: "environmental",
  },
  EducationDirector: {
    title: "Education Director",
    shortDept: "Education",
    budgetKey: "socialServices",
  },
  HealthDirector: {
    title: "Public Health Director",
    shortDept: "Health",
    budgetKey: "socialServices",
  },
};

/**
 * Generates a random AppointeeNPC candidate with RNG competence (0-100),
 * loyalty (0-100), and alignment ("Corporate" | "Labor" | "Law & Order").
 */
export function createRandomAppointeeCandidate(
  role: AppointeeRoleKey,
  seedIdx = 0
): AppointeeNPC {
  const first =
    CANDIDATE_FIRST_NAMES[randomInt(0, CANDIDATE_FIRST_NAMES.length - 1)];
  const last =
    CANDIDATE_LAST_NAMES[randomInt(0, CANDIDATE_LAST_NAMES.length - 1)];
  const alignment: AppointeeAlignment =
    VALID_APPOINTEE_ALIGNMENTS[
      randomInt(0, VALID_APPOINTEE_ALIGNMENTS.length - 1)
    ];

  return {
    id: `npc-${role}-${Date.now()}-${seedIdx}-${randomInt(100, 999)}`,
    name: `${first} ${last}`,
    competence: randomInt(18, 94),
    loyalty: randomInt(15, 95),
    alignment,
  };
}

/**
 * Step 4.2 Passive Upkeep Modifier:
 * For every point of competence above 50, applies a 0.5% discount to that
 * department's monthly upkeep. If below 50, applies a 0.5% penalty per point.
 * Multiplier = 1 - ((competence - 50) * 0.005).
 */
export function computeCompetenceUpkeepMultiplier(
  npc: AppointeeNPC | null
): number {
  if (!npc) return 1.0; // Empty slot = no discount or penalty
  const deltaFrom50 = npc.competence - 50;
  return clamp(1 - deltaFrom50 * 0.005, 0.5, 1.5);
}

/**
 * Calculates total monthly department upkeep after applying each DepartmentHead's
 * competence discount/penalty.
 */
export function computeModifiedDepartmentUpkeepTotal(
  departments: DepartmentBudgets,
  heads: DepartmentHeadsState
): number {
  const safetyCost = Math.round(
    departments.publicSafety * computeCompetenceUpkeepMultiplier(heads.PoliceChief)
  );
  const transitCost = Math.round(
    departments.infrastructure *
      computeCompetenceUpkeepMultiplier(heads.TransitDirector)
  );
  const sanitationCost = Math.round(
    departments.environmental *
      computeCompetenceUpkeepMultiplier(heads.SanitationHead)
  );
  const socialCost = departments.socialServices;

  return safetyCost + transitCost + sanitationCost + socialCost;
}

/**
 * Computes population tier (1-5) to drive 2D Blueprint footprint boundary expansion.
 */
export const computePopulationTier = (population: number): 1 | 2 | 3 | 4 | 5 => {
  if (population >= 1_200_000) return 5;
  if (population >= 750_000) return 4;
  if (population >= 450_000) return 3;
  if (population >= 250_000) return 2;
  return 1;
};

/**
 * Step 5.2: Evaluates the player's Manager Culture Title every 6 turns (or whenever triggered).
 * - If Treasury is highly negative (< -$500k) but Approval is high (>= 55%): "The Deficit Spender"
 * - If Austerity is highest: "The Austerity Mayor"
 * - If Progressive is highest: "The Green Technocrat"
 * - If Corporate is highest: "The Industrial Populist"
 */
export const evaluateManagerCultureTitle = (
  culturePoints: CulturePointsState,
  reserves: number,
  overallApproval: number
): LegacyArchetype => {
  if (reserves < -500_000 && overallApproval >= 55) {
    return "The Deficit Spender";
  }

  const { Austerity, Progressive, Corporate } = culturePoints;
  if (Austerity === 0 && Progressive === 0 && Corporate === 0) {
    return "Unproven Incumbent";
  }

  if (Austerity >= Progressive && Austerity >= Corporate) {
    return "The Austerity Mayor";
  }
  if (Progressive >= Austerity && Progressive >= Corporate) {
    return "The Green Technocrat";
  }
  return "The Industrial Populist";
};

/**
 * Step 5.2: Computes incremental culturePoints deltas from a Custom Policy or Crisis choice:
 * - Budget cut / positive monthly budget savings (monthly_change > 0): +1 to Austerity
 * - Boosts Environmental/Working Class approval or reduces pollution (change < 0): +1 to Progressive
 * - Boosts Business approval: +1 to Corporate
 */
export function computeCulturePointDeltasFromModifiers(
  monthlyBudgetChange: number,
  heatmapModifiers: Array<{ metric: HeatmapMetric; change: number }>,
  demographicModifiers: Array<{ demographic: Demographic; change: number }>,
  currentCulture: CulturePointsState
): CulturePointsState {
  let nextAusterity = currentCulture.Austerity;
  let nextProgressive = currentCulture.Progressive;
  let nextCorporate = currentCulture.Corporate;

  // Budget cut / fiscal savings -> +1 Austerity
  if (monthlyBudgetChange > 0) {
    nextAusterity += 1;
  }

  // Boosts Environmentalists or Working Class approval, or reduces pollution -> +1 Progressive
  const boostsEnvOrWorking = demographicModifiers.some(
    (d) =>
      (d.demographic === "environmentalists" ||
        d.demographic === "working_class") &&
      d.change > 0
  );
  const tightensPollutionRegs = heatmapModifiers.some(
    (h) => h.metric === "pollution" && h.change < 0
  );
  if (boostsEnvOrWorking || tightensPollutionRegs) {
    nextProgressive += 1;
  }

  // Boosts Business approval -> +1 Corporate
  const boostsBusiness = demographicModifiers.some(
    (d) => d.demographic === "business" && d.change > 0
  );
  if (boostsBusiness) {
    nextCorporate += 1;
  }

  return {
    Austerity: nextAusterity,
    Progressive: nextProgressive,
    Corporate: nextCorporate,
  };
}

/**
 * Step 5.3: Campaign Action Costs & Challenger Generator
 * Generates an AI_Challenger with a randomized base polling number (40% to 60%)
 * based inversely on the player's current Overall Approval.
 */
export const CAMPAIGN_ACTION_COSTS: Record<
  CampaignActionType,
  { label: string; cost: number; desc: string }
> = {
  grassroots_rally: {
    label: "Grassroots Rally (Low Cost)",
    cost: 40_000,
    desc: "+2% to +4% Polling swing (RNG)",
  },
  smear_campaign: {
    label: "Smear Campaign (Medium Cost)",
    cost: 90_000,
    desc: "+5% Polling swing, but adds +1 to Crime_Tension for the next term",
  },
  media_blitz: {
    label: "Media Blitz (High Cost)",
    cost: 160_000,
    desc: "Guaranteed +8% Polling swing",
  },
};

const CHALLENGER_POOL: Array<{ name: string; partyTag: string }> = [
  { name: "Senator Sterling Cross", partyTag: "Civic Reform Coalition" },
  { name: "Councilwoman Valeria Thorne", partyTag: "People's Accountability Front" },
  { name: "Judge Marcus Vance", partyTag: "Metropolitan Law & Order Slate" },
  { name: "CEO Julian Bellamy", partyTag: "Growth & Enterprise Alliance" },
];

export function generateAIChallenger(playerOverallApproval: number): AIChallengerState {
  const candidate =
    CHALLENGER_POOL[randomInt(0, CHALLENGER_POOL.length - 1)];

  // Inverse base polling (40% to 60%):
  // If player approval is high (e.g. 75%), challenger sits near 40-44%.
  // If player approval is low (e.g. 30%), challenger sits near 55-60%.
  const inverseFactor = (100 - clamp(playerOverallApproval, 20, 80)) / 60; // 0..1
  const deterministicBase = 40 + inverseFactor * 16; // 40..56
  const rngJitter = randomInt(-2, 4);
  const pollingPct = clamp(Math.round((deterministicBase + rngJitter) * 10) / 10, 40, 60);

  return {
    name: candidate.name,
    partyTag: candidate.partyTag,
    pollingPct,
  };
}

// ----------------------------------------------------------------------------
// Phase 2 (Step 2/4): 6-Way Hex Neighbor Spillover & District-Level Rules
// ----------------------------------------------------------------------------

export const DISTRICT_RULE_CAPITAL_COST = 10;

export const DISTRICT_RULE_METADATA: Record<
  DistrictRuleType,
  {
    shortBadge: string;
    summary: string;
    treasuryOneshot: number;
    monthlyBudgetDelta: number;
    localEffects: Partial<Record<HeatmapMetric, number>>;
    spilloverEffects: Partial<Record<HeatmapMetric, number>>;
    popupLabel: string;
    popupColor: string;
  }
> = {
  "Enterprise Tax Zone": {
    shortBadge: "ENT ZONE",
    summary: "+$150K Grant, +14 Land Value, +6 Traffic (50% 6-way spillover)",
    treasuryOneshot: 150_000,
    monthlyBudgetDelta: 20_000,
    localEffects: { land_value: 14, traffic: 6, pollution: 4 },
    spilloverEffects: { land_value: 7, traffic: 3 },
    popupLabel: "+$150K | +14 Land Value",
    popupColor: "#D4A359",
  },
  "Car-Free Boulevard": {
    shortBadge: "CAR-FREE",
    summary: "-15 Traffic, -12 Pollution, +8 Land Value, -$20K/mo (50% 6-way spillover)",
    treasuryOneshot: 0,
    monthlyBudgetDelta: -20_000,
    localEffects: { traffic: -15, pollution: -12, land_value: 8 },
    spilloverEffects: { traffic: -7, pollution: -6, land_value: 4 },
    popupLabel: "-12 Pollution | -15 Traffic",
    popupColor: "#3B7A57",
  },
  "24/7 Patrol Surge": {
    shortBadge: "PATROL+",
    summary: "-16 Crime, +5 Land Value, -$25K/mo (50% 6-way spillover)",
    treasuryOneshot: 0,
    monthlyBudgetDelta: -25_000,
    localEffects: { crime: -16, land_value: 5 },
    spilloverEffects: { crime: -8, land_value: 2 },
    popupLabel: "-16 Crime",
    popupColor: "#C85A32",
  },
};

/**
 * Returns the valid 6-way adjacent coordinates for a pointy-top odd-r offset hex grid (10x10).
 */
export function getHexNeighbors(
  row: number,
  col: number
): Array<{ row: number; col: number }> {
  const isOddRow = row % 2 === 1;
  const offsets = isOddRow
    ? [
        [0, -1],
        [0, 1],
        [-1, 0],
        [-1, 1],
        [1, 0],
        [1, 1],
      ]
    : [
        [0, -1],
        [0, 1],
        [-1, -1],
        [-1, 0],
        [1, -1],
        [1, 0],
      ];

  const neighbors: Array<{ row: number; col: number }> = [];
  for (const [dr, dc] of offsets) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
      neighbors.push({ row: nr, col: nc });
    }
  }
  return neighbors;
}

/**
 * Step 5.3: WarChest Calculation
 * Converts 10% of current positive Treasury surplus, plus Corporate culture vector bonus ($25k per point),
 * with a minimum baseline of $40k if the player has positive reserves or Corporate donors.
 */
export function calculateCampaignWarChest(
  treasuryReserves: number,
  corporateCulturePoints: number
): number {
  const surplusConversion =
    treasuryReserves > 0 ? Math.round(treasuryReserves * 0.1) : 0;
  const corporatePacBonus = corporateCulturePoints * 25_000;
  return surplusConversion + corporatePacBonus;
}

/**
 * Evaluates accumulated ideological points to categorize the player's Legacy Archetype.
 */
export const computeLegacyArchetype = (
  turn: number,
  ideology: IdeologicalAxis
): LegacyArchetype => {
  if (turn < 4) return "Unproven Incumbent";

  const entries: Array<{ archetype: LegacyArchetype; score: number }> = [
    { archetype: "Green Technocrat", score: ideology.ecologyScore },
    { archetype: "Austerity Manager", score: ideology.austerityScore },
    { archetype: "Populist Firebrand", score: ideology.populistScore },
    { archetype: "Corporate Broker", score: ideology.corporatistScore },
    { archetype: "Law & Order Hawk", score: ideology.authorityScore },
  ];

  entries.sort((a, b) => b.score - a.score);
  return entries[0].score > 10 ? entries[0].archetype : "Unproven Incumbent";
};

/**
 * Calculates weighted overall approval from the 4 core demographics.
 */
export const calculateWeightedApproval = (
  demographics: VoterSentimentState["demographics"]
): number => {
  let weightedSum = 0;
  for (const demo of VALID_DEMOGRAPHICS) {
    const entry = demographics[demo];
    weightedSum += entry.approval * entry.populationShare;
  }
  return clamp0to100(weightedSum);
};

// ----------------------------------------------------------------------------
// 2. 10x10 GridSystem & Polygonal District Helpers
// ----------------------------------------------------------------------------

function computeTileWarning(metrics: Record<HeatmapMetric, number>): TensionKey | null {
  if (metrics.crime >= 78) return "Crime";
  if (metrics.traffic >= 78) return "Transit";
  if (metrics.pollution >= 78) return "Sanitation";
  return null;
}

/**
 * Computes the unlocked footprint tier (1..5) of a [row, col] cell based on its
 * distance from the 10x10 city center (4.5, 4.5), while keeping all 100 tiles visible
 * on the 10x10 blueprint grid.
 */
function getTileFootprintTier(row: number, col: number): 1 | 2 | 3 | 4 | 5 {
  const dist = Math.max(Math.abs(row - 4.5), Math.abs(col - 4.5));
  if (dist <= 1.6) return 1;
  if (dist <= 2.6) return 2;
  if (dist <= 3.6) return 3;
  if (dist <= 4.1) return 4;
  return 5;
}

/**
 * Builds the 10x10 GridSystem (`GridTile[][]`) according to the chosen StartingArchetype:
 * - Archetype 1 ("The Rust Belt Decay"): Center tiles [3,3]..[6,6] have extreme pollution (80-100) and low land_value (15-30).
 * - Archetype 2 ("The Silicon Boomtown"): High land_value (78-96) across the board, with intersecting horizontal (rows 4,5) and vertical (cols 4,5) arterial lines of extreme traffic (80-100).
 * - Archetype 3 ("The Corrupt Machine"): Moderate pollution/traffic, with high crime spikes (70-90) scattered around the outer ring (edges: row 0,1,8,9 or col 0,1,8,9).
 */
function buildProcedural10x10Grid(archetype: StartingArchetype): GridTile[][] {
  const grid: GridTile[][] = [];

  for (let r = 0; r < 10; r++) {
    const rowTiles: GridTile[] = [];
    for (let c = 0; c < 10; c++) {
      const isCenterCore = r >= 3 && r <= 6 && c >= 3 && c <= 6;
      const isOuterEdge = r <= 1 || r >= 8 || c <= 1 || c >= 8;
      const isIntersectingArterial = r === 4 || r === 5 || c === 4 || c === 5;

      let crime = randomInt(25, 42);
      let pollution = randomInt(24, 40);
      let land_value = randomInt(48, 65);
      let traffic = randomInt(28, 45);
      let zoneLabel = `Sector [${r},${c}]`;

      if (archetype === "The Rust Belt Decay") {
        if (isCenterCore) {
          pollution = randomInt(80, 100);
          land_value = randomInt(14, 28);
          crime = randomInt(45, 62);
          traffic = randomInt(35, 52);
          zoneLabel = `Rust Core Foundry [${r},${c}]`;
        } else {
          pollution = randomInt(38, 56);
          land_value = randomInt(32, 48);
          zoneLabel = `Mill Commons [${r},${c}]`;
        }
      } else if (archetype === "The Silicon Boomtown") {
        land_value = randomInt(78, 95);
        pollution = randomInt(18, 34);
        crime = randomInt(18, 35);
        if (isIntersectingArterial) {
          traffic = randomInt(80, 100);
          zoneLabel = `Gridlock Corridor [${r},${c}]`;
        } else {
          traffic = randomInt(42, 60);
          zoneLabel = `Tech Campus [${r},${c}]`;
        }
      } else if (archetype === "The Corrupt Machine") {
        pollution = randomInt(35, 52);
        traffic = randomInt(36, 54);
        land_value = randomInt(36, 56);
        if (isOuterEdge) {
          // Randomly scatter high crime spikes (70-90) across outer ring tiles
          const isSpikeTile = Math.random() < 0.78 || (r === 0 || r === 9 || c === 0 || c === 9);
          crime = isSpikeTile ? randomInt(70, 90) : randomInt(55, 68);
          land_value = randomInt(22, 38);
          zoneLabel = `Syndicate Rim [${r},${c}]`;
        } else {
          crime = randomInt(38, 54);
          zoneLabel = `Machine Ward [${r},${c}]`;
        }
      }

      const metrics: Record<HeatmapMetric, number> = {
        crime: clamp0to100(crime),
        pollution: clamp0to100(pollution),
        land_value: clamp0to100(land_value),
        traffic: clamp0to100(traffic),
      };

      rowTiles.push({
        row: r,
        col: c,
        id: `tile-${r}-${c}`,
        zoneLabel,
        unlockedAtTier: getTileFootprintTier(r, c),
        metrics,
        activeWarning: computeTileWarning(metrics),
      });
    }
    grid.push(rowTiles);
  }

  return grid;
}

const createInitialDistricts = (): DistrictNode[] => [
  {
    id: "dist-civic-core",
    name: "Capitol & Civic Plaza",
    profile: "civic_center",
    unlockedAtTier: 1,
    polygonPoints: [360, 220, 480, 210, 500, 310, 380, 330],
    labelCenter: { x: 430, y: 270 },
    sensitivity: { crime: 0.8, pollution: 0.6, land_value: 1.2, traffic: 1.3 },
    metrics: { crime: 28, pollution: 22, land_value: 68, traffic: 54 },
    activeWarning: null,
  },
  {
    id: "dist-downtown-central",
    name: "Founders Financial Core",
    profile: "downtown_core",
    unlockedAtTier: 1,
    polygonPoints: [480, 210, 610, 230, 590, 350, 500, 310],
    labelCenter: { x: 545, y: 275 },
    sensitivity: { crime: 1.0, pollution: 0.9, land_value: 1.5, traffic: 1.5 },
    metrics: { crime: 35, pollution: 38, land_value: 76, traffic: 66 },
    activeWarning: null,
  },
  {
    id: "dist-old-manufacturing",
    name: "Ironworks Industrial Belt",
    profile: "industrial_corridor",
    unlockedAtTier: 1,
    polygonPoints: [380, 330, 500, 310, 530, 430, 350, 420],
    labelCenter: { x: 440, y: 375 },
    sensitivity: { crime: 1.3, pollution: 1.6, land_value: 0.7, traffic: 1.1 },
    metrics: { crime: 48, pollution: 64, land_value: 34, traffic: 49 },
    activeWarning: null,
  },
  {
    id: "dist-westside-commons",
    name: "Westside Working Commons",
    profile: "residential_sprawl",
    unlockedAtTier: 2,
    polygonPoints: [230, 240, 360, 220, 380, 330, 350, 420, 220, 370],
    labelCenter: { x: 295, y: 315 },
    sensitivity: { crime: 1.2, pollution: 1.0, land_value: 0.9, traffic: 1.0 },
    metrics: { crime: 42, pollution: 35, land_value: 46, traffic: 45 },
    activeWarning: null,
  },
  {
    id: "dist-harbor-docks",
    name: "Meridian Harbor & Logistics",
    profile: "waterfront_commiercial",
    unlockedAtTier: 2,
    polygonPoints: [500, 310, 590, 350, 650, 460, 530, 430],
    labelCenter: { x: 570, y: 390 },
    sensitivity: { crime: 1.1, pollution: 1.3, land_value: 1.2, traffic: 1.3 },
    metrics: { crime: 39, pollution: 52, land_value: 62, traffic: 58 },
    activeWarning: null,
  },
  {
    id: "dist-northridge-heights",
    name: "Northridge Emerald Estates",
    profile: "greenbelt_periphery",
    unlockedAtTier: 3,
    polygonPoints: [340, 110, 540, 100, 610, 230, 480, 210, 360, 220],
    labelCenter: { x: 470, y: 160 },
    sensitivity: { crime: 0.6, pollution: 0.7, land_value: 1.4, traffic: 0.8 },
    metrics: { crime: 18, pollution: 16, land_value: 82, traffic: 32 },
    activeWarning: null,
  },
  {
    id: "dist-east-tech-corridor",
    name: "Silicon Annex & Innovation Park",
    profile: "downtown_core",
    unlockedAtTier: 4,
    polygonPoints: [610, 230, 760, 250, 740, 410, 650, 460, 590, 350],
    labelCenter: { x: 675, y: 335 },
    sensitivity: { crime: 0.7, pollution: 0.8, land_value: 1.6, traffic: 1.4 },
    metrics: { crime: 24, pollution: 28, land_value: 85, traffic: 62 },
    activeWarning: null,
  },
  {
    id: "dist-southern-greenbelt",
    name: "Southern Valley Biosphere",
    profile: "greenbelt_periphery",
    unlockedAtTier: 5,
    polygonPoints: [220, 370, 350, 420, 530, 430, 650, 460, 580, 560, 280, 540],
    labelCenter: { x: 440, y: 485 },
    sensitivity: { crime: 0.8, pollution: 1.2, land_value: 1.1, traffic: 0.9 },
    metrics: { crime: 26, pollution: 24, land_value: 64, traffic: 36 },
    activeWarning: null,
  },
];

/**
 * Computes territory-wide averages from the 10x10 GridSystem tiles.
 */
const computeGlobalAveragesFromTiles = (
  tiles: GridTile[][]
): Record<HeatmapMetric, number> => {
  const sums: Record<HeatmapMetric, number> = {
    crime: 0,
    pollution: 0,
    land_value: 0,
    traffic: 0,
  };
  let count = 0;

  for (const row of tiles) {
    for (const tile of row) {
      count++;
      for (const metric of VALID_HEATMAP_METRICS) {
        sums[metric] += tile.metrics[metric];
      }
    }
  }

  const divisor = count || 1;
  return {
    crime: clamp0to100(sums.crime / divisor),
    pollution: clamp0to100(sums.pollution / divisor),
    land_value: clamp0to100(sums.land_value / divisor),
    traffic: clamp0to100(sums.traffic / divisor),
  };
};

/**
 * Synchronizes the polygonal district nodes with the underlying 10x10 tile grid
 * so both representations reflect the exact same territorial math.
 */
function syncDistrictsWithTiles(
  districts: DistrictNode[],
  tiles: GridTile[][]
): DistrictNode[] {
  const avg = computeGlobalAveragesFromTiles(tiles);
  const centerCoreAvg = { crime: 0, pollution: 0, land_value: 0, traffic: 0 };
  const outerRimAvg = { crime: 0, pollution: 0, land_value: 0, traffic: 0 };
  let centerCount = 0;
  let outerCount = 0;

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const t = tiles[r][c];
      if (r >= 3 && r <= 6 && c >= 3 && c <= 6) {
        centerCount++;
        centerCoreAvg.crime += t.metrics.crime;
        centerCoreAvg.pollution += t.metrics.pollution;
        centerCoreAvg.land_value += t.metrics.land_value;
        centerCoreAvg.traffic += t.metrics.traffic;
      } else {
        outerCount++;
        outerRimAvg.crime += t.metrics.crime;
        outerRimAvg.pollution += t.metrics.pollution;
        outerRimAvg.land_value += t.metrics.land_value;
        outerRimAvg.traffic += t.metrics.traffic;
      }
    }
  }

  return districts.map((d) => {
    const isCoreDistrict = d.unlockedAtTier === 1;
    const source = isCoreDistrict ? centerCoreAvg : outerRimAvg;
    const count = (isCoreDistrict ? centerCount : outerCount) || 1;

    const metrics: Record<HeatmapMetric, number> = {
      crime: clamp0to100((source.crime / count + avg.crime) / 2),
      pollution: clamp0to100((source.pollution / count + avg.pollution) / 2),
      land_value: clamp0to100((source.land_value / count + avg.land_value) / 2),
      traffic: clamp0to100((source.traffic / count + avg.traffic) / 2),
    };

    return {
      ...d,
      metrics,
      activeWarning: computeTileWarning(metrics),
    };
  });
}

// ----------------------------------------------------------------------------
// 3. Step 4.1: Procedural Turn 1 Generator ("The Inherited Mess")
// ----------------------------------------------------------------------------

const buildProceduralCityState = (
  forcedArchetype?: StartingArchetype,
  termMode: CampaignTermMode = "two_term_48"
) => {
  const chosenArchetype: StartingArchetype =
    forcedArchetype ??
    STARTING_ARCHETYPES[Math.floor(Math.random() * STARTING_ARCHETYPES.length)];

  const tiles = buildProcedural10x10Grid(chosenArchetype);
  const globalAverages = computeGlobalAveragesFromTiles(tiles);
  const districts = syncDistrictsWithTiles(createInitialDistricts(), tiles);

  const time: TimeState = {
    turn: 1,
    totalTurnsPlayed: 1,
    maxTurns:
      termMode === "single_24" ? 24 : termMode === "two_term_48" ? 48 : null,
    month: 1,
    year: 2026,
    monthsUntilElection: 24,
    currentOffice: "City Mayor",
    campaignTermMode: termMode,
  };

  let reserves = 1_000_000;
  let taxRates: TaxRates = {
    incomeTaxPct: 6.0,
    corporateTaxPct: 8.5,
    propertyTaxPct: 1.8,
  };
  let departments: DepartmentBudgets = {
    publicSafety: 150_000,
    infrastructure: 150_000,
    environmental: 120_000,
    socialServices: 140_000,
  };
  let initialPopulation = 210_000;
  let initialGdpMillions = 450;
  let tensions: TensionMetersState = {
    Crime: 25,
    Transit: 25,
    Sanitation: 25,
  };
  let demographics: VoterSentimentState["demographics"] = {
    working_class: { approval: 50, populationShare: 0.35 },
    wealthy: { approval: 50, populationShare: 0.25 },
    business: { approval: 50, populationShare: 0.2 },
    environmentalists: { approval: 50, populationShare: 0.2 },
  };
  let defaultHeatmapLayer: HeatmapMetric = "pollution";
  let startingBriefing = "";

  // --------------------------------------------------------------------------
  // Archetype 1: The Rust Belt Decay
  // --------------------------------------------------------------------------
  if (chosenArchetype === "The Rust Belt Decay") {
    reserves = 5_000_000; // Massive surplus ($5,000,000)
    tensions = {
      Sanitation: 85, // Sanitation_Tension starts at 85
      Crime: 38,
      Transit: 32,
    };
    // Business: 80%, Working Class: 15%, Environmentalists: 15% (Overall average ~35%)
    demographics = {
      business: { approval: 80, populationShare: 0.3 },
      working_class: { approval: 15, populationShare: 0.35 },
      environmentalists: { approval: 15, populationShare: 0.25 },
      wealthy: { approval: 35, populationShare: 0.1 },
    };
    defaultHeatmapLayer = "pollution";
    startingBriefing =
      "INHERITED MESS [The Rust Belt Decay]: Outgoing Mayor deregulated heavy foundries in the center core ([3,3]–[6,6]). You inherit a $5.0M surplus, 85/100 Sanitation Tension, and toxic inner-city pollution.";
  }

  // --------------------------------------------------------------------------
  // Archetype 2: The Silicon Boomtown
  // --------------------------------------------------------------------------
  else if (chosenArchetype === "The Silicon Boomtown") {
    reserves = 500_000; // Moderate ($500,000), but very high baseline monthly tax revenue
    initialPopulation = 310_000;
    initialGdpMillions = 920; // High GDP + high tax base drives very high monthly revenue
    taxRates = {
      incomeTaxPct: 8.5,
      corporateTaxPct: 12.0,
      propertyTaxPct: 2.8,
    };
    tensions = {
      Transit: 90, // Transit_Tension starts at 90
      Crime: 24,
      Sanitation: 28,
    };
    // Wealthy: 90%, Working Class: 10% (Overall average ~50%)
    demographics = {
      wealthy: { approval: 90, populationShare: 0.35 },
      working_class: { approval: 10, populationShare: 0.35 },
      business: { approval: 65, populationShare: 0.15 },
      environmentalists: { approval: 35, populationShare: 0.15 },
    };
    defaultHeatmapLayer = "traffic";
    startingBriefing =
      "INHERITED MESS [The Silicon Boomtown]: Skyrocketing land values and tech revenue, but intersecting arterial corridors are paralyzed at 80–100 gridlock. Transit Tension is at 90/100!";
  }

  // --------------------------------------------------------------------------
  // Archetype 3: The Corrupt Machine
  // --------------------------------------------------------------------------
  else {
    reserves = -2_000_000; // -$2,000,000 (Bankrupt/Debt) & losing money on Turn 1
    taxRates = {
      incomeTaxPct: 4.5,
      corporateTaxPct: 5.5,
      propertyTaxPct: 1.2,
    };
    departments = {
      publicSafety: 190_000,
      infrastructure: 180_000,
      environmental: 150_000,
      socialServices: 170_000,
    };
    tensions = {
      Crime: 75, // Crime_Tension starts at 75
      Transit: 42,
      Sanitation: 40,
    };
    // Flat 35% across all demographics
    demographics = {
      working_class: { approval: 35, populationShare: 0.4 },
      wealthy: { approval: 35, populationShare: 0.2 },
      business: { approval: 35, populationShare: 0.2 },
      environmentalists: { approval: 35, populationShare: 0.2 },
    };
    defaultHeatmapLayer = "crime";
    startingBriefing =
      "INHERITED MESS [The Corrupt Machine]: The previous machine looted the treasury into -$2.0M debt and left outer-ring wards overrun with 70–90 Crime spikes. Crime Tension starts at 75/100.";
  }

  // Step 4.2: Initial DepartmentHeads inherited from the previous administration
  const departmentHeads: DepartmentHeadsState = {
    PoliceChief: {
      id: "npc-init-police",
      name: "Commissioner V. Vance",
      competence: chosenArchetype === "The Corrupt Machine" ? 32 : 58,
      loyalty: chosenArchetype === "The Corrupt Machine" ? 28 : 74,
      alignment: "Law & Order",
    },
    TransitDirector: {
      id: "npc-init-transit",
      name: "Director M. Sterling",
      competence: chosenArchetype === "The Silicon Boomtown" ? 34 : 62,
      loyalty: 65,
      alignment: "Corporate",
    },
    SanitationHead: {
      id: "npc-init-sanitation",
      name: "Dr. A. Solis",
      competence: chosenArchetype === "The Rust Belt Decay" ? 30 : 64,
      loyalty: 35,
      alignment: "Labor",
    },
    EducationDirector: {
      id: "npc-init-edu",
      name: "Supt. E. Cho",
      competence: chosenArchetype === "The Silicon Boomtown" ? 68 : 54,
      loyalty: 68,
      alignment: "Labor",
    },
    HealthDirector: {
      id: "npc-init-health",
      name: "Dr. R. Kapoor",
      competence: chosenArchetype === "The Rust Belt Decay" ? 42 : 60,
      loyalty: 62,
      alignment: "Labor",
    },
  };

  const interviewPool: Record<AppointeeRoleKey, AppointeeNPC[] | null> = {
    PoliceChief: null,
    TransitDirector: null,
    SanitationHead: null,
    EducationDirector: null,
    HealthDirector: null,
  };

  // Calculate Turn 1 Revenue & Expenses (incorporating competence upkeep modifier)
  const popFactor = initialPopulation / 100_000;
  const gdpFactor = initialGdpMillions / 100;
  const landValueFactor = globalAverages.land_value / 50;

  const incomeRev = taxRates.incomeTaxPct * 34_000 * popFactor;
  const corpRev = taxRates.corporateTaxPct * 14_500 * gdpFactor;
  const propRev = taxRates.propertyTaxPct * 42_000 * landValueFactor;
  const monthlyRevenue = Math.round(incomeRev + corpRev + propRev);

  const deptTotal = computeModifiedDepartmentUpkeepTotal(
    departments,
    departmentHeads
  );
  const debtInterest = reserves < 0 ? Math.round(Math.abs(reserves) * 0.025) : 0;
  const monthlyExpenses = deptTotal + debtInterest;

  const treasury: TreasuryState = {
    reserves,
    monthlyRevenue,
    monthlyExpenses,
    monthlyNet: monthlyRevenue - monthlyExpenses,
    customPolicyRecurringNet: 0,
    taxRates,
    departments,
  };

  const voterSentiment: VoterSentimentState = {
    overallApproval: calculateWeightedApproval(demographics),
    politicalCapital: 60,
    demographics,
  };

  const initialTier = computePopulationTier(initialPopulation);
  const legacy: LegacyMetricsState = {
    population: initialPopulation,
    populationTier: initialTier,
    gdpMillions: initialGdpMillions,
    archetype: "Unproven Incumbent",
    ideology: {
      ecologyScore: 0,
      austerityScore: 0,
      populistScore: 0,
      corporatistScore: 0,
      authorityScore: 0,
    },
  };

  const grid: GridSystemState = {
    startingArchetype: chosenArchetype,
    startingBriefing,
    tiles,
    globalAverages,
    activeHeatmapLayer: defaultHeatmapLayer,
    districts,
  };

  const initialFeed: VibeFeedEntry[] = [
    {
      id: `vibe-init-${Date.now()}`,
      turn: 1,
      headline: startingBriefing,
      category: "crisis",
    },
  ];

  const culturePoints: CulturePointsState = {
    Austerity: 0,
    Progressive: 0,
    Corporate: 0,
  };

  const failTrackers: FailStateTracking = {
    bankruptcyConsecutiveTurns: 0,
    recallConsecutiveTurns: 0,
  };

  const electionCampaign: ElectionCampaignState = {
    termNumber: 1,
    warChest: calculateCampaignWarChest(reserves, 0),
    playerPollingPct: voterSentiment.overallApproval,
    challenger: generateAIChallenger(voterSentiment.overallApproval),
    actionLog: [],
    showVictoryModal: false,
  };

  const webllmProgress: WebLLMProgressState = {
    isReady: false,
    isLoading: false,
    progressPct: 0,
    text: "WebGPU Neural Weights Standby",
    downloadedBytes: 0,
    totalBytes: 2_800_000_000, // ~2.8 GB estimated weight footprint for Llama-3-8B q4f32_1
    timeElapsedSec: 0,
    webGPUSupported: typeof navigator !== "undefined" && "gpu" in navigator,
    error: null,
  };

  const initialDocketBundle = generateMonthlyDocketForTurn(1, {
    pastIssueTitles: [],
    usedFallbackTemplateIds: [],
    recentLaws: [],
  });
  const monthlyDocket = initialDocketBundle.issues;
  const cityReport = buildMonthlyCityReport({
    turn: 1,
    month: 1,
    year: 2026,
    currentAverages: globalAverages,
    previousAverages: globalAverages,
    treasury,
    currentTensions: tensions,
    previousTensions: tensions,
    departmentHeads,
  });

  const initialHistorySnapshot: MonthlyHistorySnapshot = {
    turn: 1,
    month: 1,
    year: 2026,
    treasury: treasury.reserves,
    approval: voterSentiment.overallApproval,
    crimeAvg: globalAverages.crime,
    pollutionAvg: globalAverages.pollution,
    landValueAvg: globalAverages.land_value,
    trafficAvg: globalAverages.traffic,
    crimeTension: tensions.Crime,
    transitTension: tensions.Transit,
    sanitationTension: tensions.Sanitation,
  };

  const initialCompass = evaluatePoliticalCompassProfile({
    turn: 1,
    treasury,
    voterSentiment,
    culturePoints,
    currentAverages: globalAverages,
    enactedPoliciesCount: 0,
  });

  const doctrines: PolicyDoctrinesState = {
    fiscal: "Balanced Budget",
    justice: "Community Diversion",
    urban: "Smart Zoning",
  };

  const townHall: TownHallSessionState = {
    isOpen: false,
    isLoading: false,
    questions: [],
    usedThisTurn: false,
    lastResult: null,
  };

  const legacyChronicle: LegacyChronicleState = {
    isOpen: false,
    outcome: "retirement",
    headlineTitle: "",
    toneCategory: "pragmatic",
    encyclopediaEntry: "",
    toneAdaptiveVerdict: "",
    hallOfFameAudit: [],
    isGeneratingEntry: false,
  };

  const baseState = {
    time,
    treasury,
    voterSentiment,
    legacy,
    culturePoints,
    managerTitle: "Unproven Incumbent" as LegacyArchetype,
    failTrackers,
    wildcardCooldown: 0,
    isElectionMode: false,
    electionCampaign,
    tensions,
    grid,
    mapPopups: [] as MapFloatingPopup[],
    doctrines,
    departmentHeads,
    interviewPool,
    monthlyDocket,
    pastIssueTitles: initialDocketBundle.newTitles,
    seenTopicKeywords: [] as string[],
    usedFallbackTemplateIds: initialDocketBundle.newlyUsedTemplateIds,
    isGeneratingDocket: false,
    civicServices: {
      education:
        chosenArchetype === "The Silicon Boomtown"
          ? 64
          : chosenArchetype === "The Rust Belt Decay"
          ? 44
          : 52,
      health:
        chosenArchetype === "The Silicon Boomtown"
          ? 60
          : chosenArchetype === "The Corrupt Machine"
          ? 43
          : 50,
      educationDelta: 0,
      healthDelta: 0,
    },
    cityReport,
    isGeneratingBroadsheet: false,
    monthlyHistory: [initialHistorySnapshot],
    politicalCompass: initialCompass,
    showCityReportModal: false,
    showDocketModal: false,
    showCabinetModal: false,
    showSaveLoadModal: false,
    centerDeskTab: "dispatch" as const,
    activeDocketPillar: defaultHeatmapLayer as CivicPillar,
    publicAddressUsedThisTurn: false,
    townHall,
    legacyChronicle,
    enactedPolicies: [] as ActiveCustomPolicy[],
    enactedLawsHistory: [] as AggregatedLawRecord[],
    pendingSponsoredBills: [] as SponsoredBillProposal[],
    turnTransitionProgress: {
      isOpen: false,
      pct: 0,
      stepLabel: "",
      subLabel: "",
    } as TurnProcessingState,
    pressWireFlash: null as PressWireFlash | null,
    docketFallbackNotice: null as string | null,
    news_ticker: initialFeed,
    vibeFeed: initialFeed,
    isTurnPausedForCrisis: false,
    activeCrisis: null,
    crisisAttemptsRemaining: 2,
    crisisRejectionReason: null,
    webllmProgress,
    gameOverReason: null,
    gameOverTitle: null,
  };

  const frontPageBroadsheet = buildDeterministicBroadsheet(
    baseState as unknown as GameState
  );

  return {
    ...baseState,
    frontPageBroadsheet,
  };
};

// ----------------------------------------------------------------------------
// 4. Headless Zustand Store Implementation
// ----------------------------------------------------------------------------

export const useGameStore = create<GameState>((set, get) => ({
  ...buildProceduralCityState(),

  /**
   * Step 4.1: The Turn 1 Procedural Generator ("The Inherited Mess")
   * Randomly selects one of the 3 StartingArchetypes (or uses `forcedArchetype` if passed)
   * and populates the 10x10 GridSystem, Treasury, TensionMeters, and VoterSentiment using pure math & RNG.
   */
  initializeCity: (
    forcedArchetype?: StartingArchetype,
    termMode: CampaignTermMode = "two_term_48"
  ) => {
    set((state) => ({
      ...buildProceduralCityState(forcedArchetype, termMode),
      // Preserve live WebLLM progress/ready state across new campaigns
      webllmProgress: state.webllmProgress,
    }));
  },

  /**
   * Phase 2 (Step 3/4): Custom City Scenario Generator
   * Procedurally populates starting 10x10 hex values, tensions, treasury, and
   * custom district names from a user-provided scenario prompt.
   */
  initializeCustomCityScenario: (
    scenario: CustomCityScenarioPayload,
    termMode: CampaignTermMode = "two_term_48"
  ) => {
    set((state) => {
      const base = buildProceduralCityState(undefined, termMode);
      const customTiles = base.grid.tiles.map((rowTiles, r) =>
        rowTiles.map((tile, c) => {
          const jitter = () => randomInt(-9, 9);
          const metrics: Record<HeatmapMetric, number> = {
            crime: clamp0to100(scenario.base_crime + jitter()),
            pollution: clamp0to100(scenario.base_pollution + jitter()),
            land_value: clamp0to100(scenario.base_land_value + jitter()),
            traffic: clamp0to100(scenario.base_traffic + jitter()),
          };
          const clusterLabel =
            r <= 2
              ? scenario.district_names[0]
              : r >= 7 && c >= 4
              ? scenario.district_names[3]
              : c >= 7 && r >= 3 && r <= 6
              ? scenario.district_names[2]
              : scenario.district_names[1];

          return {
            ...tile,
            zoneLabel: `${clusterLabel} [${r},${c}]`,
            metrics,
            activeWarning: computeTileWarning(metrics),
          };
        })
      );

      const nextAverages = computeGlobalAveragesFromTiles(customTiles);
      const nextTensions: TensionMetersState = {
        Crime: clamp0to100(scenario.crime_tension),
        Transit: clamp0to100(scenario.transit_tension),
        Sanitation: clamp0to100(scenario.sanitation_tension),
      };

      const nextTreasury: TreasuryState = {
        ...base.treasury,
        reserves: scenario.treasury_reserves,
        monthlyNet: base.treasury.monthlyRevenue - base.treasury.monthlyExpenses,
      };

      const initEntry: VibeFeedEntry = {
        id: `vibe-custom-init-${Date.now()}`,
        turn: 1,
        headline: scenario.starting_briefing,
        category: "crisis",
      };

      const nextCityReport = buildMonthlyCityReport({
        turn: 1,
        month: 1,
        year: 2026,
        currentAverages: nextAverages,
        previousAverages: nextAverages,
        treasury: nextTreasury,
        currentTensions: nextTensions,
        previousTensions: nextTensions,
        departmentHeads: base.departmentHeads,
      });

      return {
        ...base,
        webllmProgress: state.webllmProgress,
        treasury: nextTreasury,
        tensions: nextTensions,
        grid: {
          ...base.grid,
          startingArchetype: scenario.scenario_title,
          startingBriefing: scenario.starting_briefing,
          customDistrictLabels: scenario.district_names,
          tiles: customTiles,
          globalAverages: nextAverages,
          districts: syncDistrictsWithTiles(base.grid.districts, customTiles),
        },
        cityReport: nextCityReport,
        news_ticker: [initEntry],
        vibeFeed: [initEntry],
      };
    });
  },

  /**
   * Phase 2 (Step 3/4): Live Press & Citizen Town Hall Q&A Actions
   */
  openTownHallSession: () => {
    set((state) => ({
      townHall: {
        ...state.townHall,
        isOpen: true,
        isLoading: true,
        lastResult: null,
      },
    }));
  },

  closeTownHallSession: () => {
    set((state) => ({
      townHall: {
        ...state.townHall,
        isOpen: false,
        isLoading: false,
      },
    }));
  },

  setTownHallQuestions: (questions: TownHallQuestion[]) => {
    set((state) => ({
      townHall: {
        ...state.townHall,
        isLoading: false,
        questions,
      },
    }));
  },

  applyTownHallGradingResult: (
    result: TownHallGradingResult,
    questionText: string,
    playerAnswer: string
  ) => {
    set((state) => {
      const clampedApproval = clamp(result.approval_change, -8, 10);
      const clampedCapital = clamp(result.capital_change, -10, 15);

      const updatedDemographics = { ...state.voterSentiment.demographics };
      for (const demo of VALID_DEMOGRAPHICS) {
        updatedDemographics[demo] = {
          ...updatedDemographics[demo],
          approval: clamp0to100(
            updatedDemographics[demo].approval + clampedApproval
          ),
        };
      }
      const nextOverallApproval = calculateWeightedApproval(updatedDemographics);
      const nextCapital = clamp0to100(
        state.voterSentiment.politicalCapital + clampedCapital
      );

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-townhall-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: `TOWN HALL [${result.grade.toUpperCase()}]: ${result.commentary}`,
        category: "election",
        unintendedConsequence: `Q: "${questionText.slice(0, 60)}..." | Spin: "${playerAnswer.slice(
          0,
          60
        )}" (${clampedApproval >= 0 ? "+" : ""}${clampedApproval}% Approval, ${
          clampedCapital >= 0 ? "+" : ""
        }${clampedCapital} Capital)`,
      };
      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      return {
        voterSentiment: {
          ...state.voterSentiment,
          demographics: updatedDemographics,
          overallApproval: nextOverallApproval,
          politicalCapital: nextCapital,
        },
        townHall: {
          ...state.townHall,
          usedThisTurn: true,
          lastResult: result,
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Phase 2 (Step 4/4): Retire & Review Legacy (Manual end-of-campaign for Endless or any mode)
   * Opens the End-of-Term Legacy Chronicle modal and generates the Wikipedia-style
   * historical encyclopedia entry via WebLLM (or deterministic fallback).
   */
  retireAndReviewLegacy: () => {
    soundEffects.playVictoryFanfare();
    const snapshot = get();
    set({
      legacyChronicle: {
        isOpen: true,
        outcome: "retirement",
        headlineTitle: `RETIREMENT OF ${snapshot.time.currentOffice.toUpperCase()} ADMINISTRATION`,
        toneCategory: "pragmatic",
        encyclopediaEntry: "Compiling Municipal Historical Encyclopedia entry...",
        toneAdaptiveVerdict: "Synthesizing historical post-mortem verdict...",
        hallOfFameAudit: [],
        isGeneratingEntry: true,
      },
    });
    void generateHistoricalPostMortem(snapshot, "retirement").then(
      (postMortem) => {
        get().setLegacyChroniclePostMortem(postMortem);
      }
    );
  },

  setLegacyChronicleEntry: (entryText: string) => {
    set((state) => ({
      legacyChronicle: {
        ...state.legacyChronicle,
        encyclopediaEntry: entryText,
        isGeneratingEntry: false,
      },
    }));
  },

  setLegacyChroniclePostMortem: (payload: {
    toneCategory: LegacyChronicleState["toneCategory"];
    encyclopediaEntry: string;
    toneAdaptiveVerdict: string;
    hallOfFameAudit: HallOfFameLawEntry[];
  }) => {
    set((state) => ({
      legacyChronicle: {
        ...state.legacyChronicle,
        toneCategory: payload.toneCategory,
        encyclopediaEntry: payload.encyclopediaEntry,
        toneAdaptiveVerdict: payload.toneAdaptiveVerdict,
        hallOfFameAudit: payload.hallOfFameAudit,
        isGeneratingEntry: false,
      },
    }));
  },

  setFrontPageBroadsheet: (broadsheet: FrontPageBroadsheet, turn: number) => {
    set((state) => {
      if (state.time.turn !== turn) return {};
      return {
        frontPageBroadsheet: broadsheet,
        isGeneratingBroadsheet: false,
      };
    });
  },

  closeLegacyChronicle: () => {
    set((state) => ({
      legacyChronicle: {
        ...state.legacyChronicle,
        isOpen: false,
      },
    }));
  },

  /**
   * Bonus Step 4: Updates WebLLM weight download progress (text, downloadedBytes, totalBytes, progressPct) in Zustand.
   */
  setWebLLMProgress: (partial: Partial<WebLLMProgressState>) => {
    set((state) => ({
      webllmProgress: {
        ...state.webllmProgress,
        ...partial,
      },
    }));
  },

  /**
   * Adjusts tax rate sliders with strict bounds and recalculates projected monthly revenue.
   * Step 5.2: Cutting corporate taxes adds +1 to Corporate culturePoints.
   */
  setTaxRate: (taxType, percentage) => {
    set((state) => {
      const bounds: Record<keyof TaxRates, [number, number]> = {
        incomeTaxPct: [0, 15],
        corporateTaxPct: [0, 20],
        propertyTaxPct: [0, 5],
      };
      const [min, max] = bounds[taxType];
      const clampedPct = Math.round(clamp(percentage, min, max) * 10) / 10;
      const previousPct = state.treasury.taxRates[taxType];

      const updatedTaxRates: TaxRates = {
        ...state.treasury.taxRates,
        [taxType]: clampedPct,
      };

      const popFactor = state.legacy.population / 100_000;
      const gdpFactor = state.legacy.gdpMillions / 100;
      const landValueFactor = state.grid.globalAverages.land_value / 50;

      const incomeRev = updatedTaxRates.incomeTaxPct * 34_000 * popFactor;
      const corpRev = updatedTaxRates.corporateTaxPct * 14_500 * gdpFactor;
      const propRev = updatedTaxRates.propertyTaxPct * 42_000 * landValueFactor;

      const monthlyRevenue = Math.round(incomeRev + corpRev + propRev);
      const monthlyNet = monthlyRevenue - state.treasury.monthlyExpenses;

      const nextCulturePoints: CulturePointsState = {
        ...state.culturePoints,
        Corporate:
          taxType === "corporateTaxPct" && clampedPct < previousPct
            ? state.culturePoints.Corporate + 1
            : state.culturePoints.Corporate,
      };

      return {
        culturePoints: nextCulturePoints,
        treasury: {
          ...state.treasury,
          taxRates: updatedTaxRates,
          monthlyRevenue,
          monthlyNet,
        },
      };
    });
  },

  /**
   * Adjusts monthly department budgets ($0 to $500,000 per department).
   * Applies each DepartmentHead's competence upkeep discount/penalty (0.5% per point above/below 50).
   */
  setDepartmentBudget: (dept, amount) => {
    set((state) => {
      const clampedAmount = Math.round(clamp(amount, 0, 500_000));
      const updatedDepartments: DepartmentBudgets = {
        ...state.treasury.departments,
        [dept]: clampedAmount,
      };

      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        updatedDepartments,
        state.departmentHeads
      );

      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;

      const monthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - state.treasury.customPolicyRecurringNet
      );
      const monthlyNet = state.treasury.monthlyRevenue - monthlyExpenses;

      return {
        treasury: {
          ...state.treasury,
          departments: updatedDepartments,
          monthlyExpenses,
          monthlyNet,
        },
      };
    });
  },

  /**
   * Phase 2 (Step 1/4): Anti-Micromanagement Broad Governing Doctrines
   * Replaces granular tax & department sliders with 3 broad decrees:
   * - Fiscal Doctrine: Austerity & Tax Cuts | Balanced Budget | Public Investment
   * - Justice & Order Doctrine: Broken Windows Enforcement | Community Diversion | Civil Liberties First
   * - Urban & Climate Doctrine: Deregulated Growth | Smart Zoning | Aggressive Green Transition
   * Automatically scales underlying taxRates and department budgets in Zustand.
   */
  setPolicyDoctrine: (category, stance) => {
    set((state) => {
      if (state.doctrines[category] === stance) return {};

      const nextDoctrines: PolicyDoctrinesState = {
        ...state.doctrines,
        [category]: stance,
      };

      const popFactor = Math.max(1, state.legacy.population / 100_000);
      const baseDeptUnit = 75_000 * popFactor;

      // 1. Fiscal Doctrine -> Tax Rates & Overall Spending Multiplier
      let fiscalSpendMult = 1.0;
      let updatedTaxRates: TaxRates = {
        incomeTaxPct: 6.5,
        corporateTaxPct: 9.0,
        propertyTaxPct: 1.9,
      };
      if (nextDoctrines.fiscal === "Austerity & Tax Cuts") {
        fiscalSpendMult = 0.76;
        updatedTaxRates = {
          incomeTaxPct: 4.5,
          corporateTaxPct: 6.0,
          propertyTaxPct: 1.4,
        };
      } else if (nextDoctrines.fiscal === "Public Investment") {
        fiscalSpendMult = 1.28;
        updatedTaxRates = {
          incomeTaxPct: 9.0,
          corporateTaxPct: 12.5,
          propertyTaxPct: 2.5,
        };
      }

      // 2. Justice & Order Doctrine -> Public Safety vs. Social Services
      let safetyMult = 0.95;
      let socialMult = 1.15;
      if (nextDoctrines.justice === "Broken Windows Enforcement") {
        safetyMult = 1.38;
        socialMult = 0.78;
      } else if (nextDoctrines.justice === "Civil Liberties First") {
        safetyMult = 0.76;
        socialMult = 1.35;
      }

      // 3. Urban & Climate Doctrine -> Infrastructure vs. Environmental & Property Tax
      let infraMult = 1.05;
      let envMult = 1.05;
      if (nextDoctrines.urban === "Deregulated Growth") {
        infraMult = 1.2;
        envMult = 0.72;
        updatedTaxRates.propertyTaxPct = Math.max(
          0.8,
          Math.round((updatedTaxRates.propertyTaxPct - 0.2) * 10) / 10
        );
      } else if (nextDoctrines.urban === "Aggressive Green Transition") {
        infraMult = 1.15;
        envMult = 1.45;
      }

      const updatedDepartments: DepartmentBudgets = {
        publicSafety: Math.round(clamp(baseDeptUnit * fiscalSpendMult * safetyMult, 30_000, 500_000)),
        infrastructure: Math.round(clamp(baseDeptUnit * fiscalSpendMult * infraMult, 30_000, 500_000)),
        environmental: Math.round(clamp(baseDeptUnit * fiscalSpendMult * envMult, 30_000, 500_000)),
        socialServices: Math.round(clamp(baseDeptUnit * fiscalSpendMult * socialMult, 30_000, 500_000)),
      };

      const gdpFactor = state.legacy.gdpMillions / 100;
      const landValueFactor = state.grid.globalAverages.land_value / 50;
      const monthlyRevenue = Math.round(
        updatedTaxRates.incomeTaxPct * 34_000 * popFactor +
          updatedTaxRates.corporateTaxPct * 14_500 * gdpFactor +
          updatedTaxRates.propertyTaxPct * 42_000 * landValueFactor
      );

      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        updatedDepartments,
        state.departmentHeads
      );
      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;
      const monthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - state.treasury.customPolicyRecurringNet
      );
      const monthlyNet = monthlyRevenue - monthlyExpenses;

      // Update Culture & Political Compass nudges
      const nextCulture: CulturePointsState = { ...state.culturePoints };
      let econNudge = 0;
      let govNudge = 0;

      if (category === "fiscal") {
        if (stance === "Austerity & Tax Cuts") {
          nextCulture.Austerity += 1;
          nextCulture.Corporate += 1;
          econNudge = 8;
        } else if (stance === "Public Investment") {
          nextCulture.Progressive += 1;
          econNudge = -8;
        }
      } else if (category === "justice") {
        if (stance === "Broken Windows Enforcement") {
          govNudge = 10;
        } else if (stance === "Civil Liberties First") {
          nextCulture.Progressive += 1;
          govNudge = -10;
        }
      } else if (category === "urban") {
        if (stance === "Deregulated Growth") {
          nextCulture.Corporate += 1;
          econNudge = 6;
        } else if (stance === "Aggressive Green Transition") {
          nextCulture.Progressive += 1;
          econNudge = -6;
        }
      }

      const nextTreasury: TreasuryState = {
        ...state.treasury,
        taxRates: updatedTaxRates,
        departments: updatedDepartments,
        monthlyRevenue,
        monthlyExpenses,
        monthlyNet,
      };

      const updatedCompass = evaluatePoliticalCompassProfile({
        turn: state.time.turn,
        treasury: nextTreasury,
        voterSentiment: state.voterSentiment,
        culturePoints: nextCulture,
        currentAverages: state.grid.globalAverages,
        enactedPoliciesCount: state.enactedPolicies.length,
        previousCompass: state.politicalCompass,
        economicNudge: econNudge,
        governanceNudge: govNudge,
      });

      const categoryLabel =
        category === "fiscal"
          ? "Fiscal Doctrine"
          : category === "justice"
          ? "Justice & Order Doctrine"
          : "Urban & Climate Doctrine";

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-doctrine-${category}-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: `GOVERNING DECREE: ${categoryLabel} shifted to "${stance}".`,
        category: "policy",
      };
      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);

      soundEffects.playGavelStamp();

      const doctrineLawRecord: AggregatedLawRecord = {
        id: `doctrine-${category}-${state.time.turn}-${Date.now()}`,
        title: `${categoryLabel}: ${stance}`,
        kind: "doctrine",
        sourceLabel: `Month ${state.time.turn} — Governing Doctrine`,
        enactedTurn: state.time.turn,
        repealedTurn: null,
        monthsActive: 1,
        monthlyFiscalDelta: nextTreasury.monthlyNet - state.treasury.monthlyNet,
        cumulativeFiscalNet: nextTreasury.monthlyNet - state.treasury.monthlyNet,
        metricDeltasPerMonth: {},
        cumulativeMetricImpact: {},
        demographicDeltas: [],
        triggeredFallout: [],
        triggeredFollowUpArcs: [],
      };

      return {
        doctrines: nextDoctrines,
        treasury: nextTreasury,
        culturePoints: nextCulture,
        politicalCompass: updatedCompass,
        enactedLawsHistory: [doctrineLawRecord, ...state.enactedLawsHistory],
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Phase 2 (Step 2/4): District-Level Policy Targeting & 6-Way Neighbor Spillover
   * Enacts a targeted neighborhood rule (Enterprise Tax Zone, Car-Free Boulevard,
   * or 24/7 Patrol Surge) on hex (row, col), applies 50% spillover math to its
   * 6 adjacent hex neighbors, stamps `activeRule`, and spawns floating map popups.
   */
  enactDistrictRule: (row: number, col: number, rule: DistrictRuleType) => {
    set((state) => {
      if (state.voterSentiment.politicalCapital < DISTRICT_RULE_CAPITAL_COST) {
        return {};
      }
      const targetTile = state.grid.tiles[row]?.[col];
      if (!targetTile) return {};

      const meta = DISTRICT_RULE_METADATA[rule];
      const neighbors = getHexNeighbors(row, col);
      const neighborSet = new Set(neighbors.map((n) => `${n.row}-${n.col}`));

      const updatedTiles = state.grid.tiles.map((rTiles, rIdx) =>
        rTiles.map((tile, cIdx) => {
          const isTarget = rIdx === row && cIdx === col;
          const isNeighbor = neighborSet.has(`${rIdx}-${cIdx}`);
          if (!isTarget && !isNeighbor) return tile;

          const effects = isTarget ? meta.localEffects : meta.spilloverEffects;
          const nextMetrics = { ...tile.metrics };
          for (const metricKey of VALID_HEATMAP_METRICS) {
            const delta = effects[metricKey] ?? 0;
            nextMetrics[metricKey] = clamp0to100(nextMetrics[metricKey] + delta);
          }

          return {
            ...tile,
            metrics: nextMetrics,
            activeWarning: computeTileWarning(nextMetrics),
            activeRule: isTarget ? rule : tile.activeRule,
          };
        })
      );

      const updatedGlobalAverages = computeGlobalAveragesFromTiles(updatedTiles);
      const updatedDistricts = syncDistrictsWithTiles(
        state.grid.districts,
        updatedTiles
      );

      const newCustomPolicyRecurringNet =
        state.treasury.customPolicyRecurringNet + meta.monthlyBudgetDelta;
      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        state.departmentHeads
      );
      const debtInterest =
        state.treasury.reserves < 0
          ? Math.round(Math.abs(state.treasury.reserves) * 0.025)
          : 0;
      const updatedMonthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - newCustomPolicyRecurringNet
      );
      const updatedMonthlyNet =
        state.treasury.monthlyRevenue - updatedMonthlyExpenses;

      const now = Date.now();
      const newPopups: MapFloatingPopup[] = [
        {
          id: `pop-${now}-${row}-${col}`,
          row,
          col,
          text: meta.popupLabel,
          color: meta.popupColor,
          createdAt: now,
        },
        ...neighbors.slice(0, 2).map((n, idx) => ({
          id: `pop-${now}-sp-${idx}-${n.row}-${n.col}`,
          row: n.row,
          col: n.col,
          text: "Spillover!",
          color: "#D4A359",
          createdAt: now + idx * 80,
        })),
      ];

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-dist-${row}-${col}-${now}`,
        turn: state.time.turn,
        headline: `DISTRICT DIRECTIVE [${row},${col}]: Enacted "${rule}" (${meta.popupLabel}) with 6-way neighbor spillover.`,
        category: "policy",
      };
      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      return {
        treasury: {
          ...state.treasury,
          reserves: state.treasury.reserves + meta.treasuryOneshot,
          customPolicyRecurringNet: newCustomPolicyRecurringNet,
          monthlyExpenses: updatedMonthlyExpenses,
          monthlyNet: updatedMonthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - DISTRICT_RULE_CAPITAL_COST
          ),
        },
        grid: {
          ...state.grid,
          tiles: updatedTiles,
          districts: updatedDistricts,
          globalAverages: updatedGlobalAverages,
        },
        mapPopups: [...state.mapPopups.filter((p) => now - p.createdAt < 2600), ...newPopups],
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Step 4.2: The Scapegoat Mechanic (Firing a Department Head)
   * - If the fired NPC's loyalty > 70, they go quietly.
   * - If their loyalty < 40, they leak to the press: triggers an immediate -10% drop to
   *   overallApproval (and across demographics) and pushes:
   *   "Fired [Department] Head blasts Mayor's incompetence on way out." to `news_ticker`.
   */
  fireDepartmentHead: (department: AppointeeRoleKey) => {
    set((state) => {
      const firedNpc = state.departmentHeads[department];
      if (!firedNpc) return {};

      const roleMeta = APPOINTEE_ROLE_LABELS[department];
      const updatedHeads: DepartmentHeadsState = {
        ...state.departmentHeads,
        [department]: null,
      };

      // Recalculate upkeep without this head's competence modifier
      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        updatedHeads
      );
      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;
      const monthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - state.treasury.customPolicyRecurringNet
      );
      const monthlyNet = state.treasury.monthlyRevenue - monthlyExpenses;

      let updatedDemographics = { ...state.voterSentiment.demographics };
      let updatedOverallApproval = state.voterSentiment.overallApproval;
      let headline = "";
      let consequence: string | undefined;

      if (firedNpc.loyalty < 40) {
        // Low loyalty (<40): Leaks to press -> immediate -10% drop to overall ApprovalRating
        for (const demo of VALID_DEMOGRAPHICS) {
          updatedDemographics[demo] = {
            ...updatedDemographics[demo],
            approval: clamp0to100(updatedDemographics[demo].approval - 10),
          };
        }
        updatedOverallApproval = clamp0to100(state.voterSentiment.overallApproval - 10);
        headline = `Fired ${roleMeta.shortDept} Head blasts Mayor's incompetence on way out.`;
        consequence = `Disgruntled ex-${roleMeta.title} ${firedNpc.name} (Loyalty ${firedNpc.loyalty}) leaked internal memos to the press (-10% Approval).`;
      } else if (firedNpc.loyalty > 70) {
        // High loyalty (>70): Goes quietly
        headline = `${roleMeta.title} ${firedNpc.name} steps down quietly in cabinet reshuffle.`;
        consequence = `High loyalty (${firedNpc.loyalty}/100) prevented press leaks during transition.`;
      } else {
        // Moderate loyalty (40-70): Standard dismissal
        headline = `Mayor dismisses ${roleMeta.title} ${firedNpc.name} amid departmental review.`;
      }

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-fire-${department}-${Date.now()}`,
        turn: state.time.turn,
        headline,
        category: "staff",
        unintendedConsequence: consequence,
      };

      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      return {
        departmentHeads: updatedHeads,
        treasury: {
          ...state.treasury,
          monthlyExpenses,
          monthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          demographics: updatedDemographics,
          overallApproval: updatedOverallApproval,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - FIRE_APPOINTEE_CAPITAL_COST
          ),
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Step 4.2: Generates 3 random candidates (RNG stats) when the player clicks "Interview"
   * on an empty Department Head slot.
   */
  generateInterviewCandidates: (department: AppointeeRoleKey) => {
    set((state) => {
      const candidates: AppointeeNPC[] = [
        createRandomAppointeeCandidate(department, 1),
        createRandomAppointeeCandidate(department, 2),
        createRandomAppointeeCandidate(department, 3),
      ];
      return {
        interviewPool: {
          ...state.interviewPool,
          [department]: candidates,
        },
      };
    });
  },

  /**
   * Step 4.2: Hires one of the 3 interviewed candidates into the empty Department Head slot
   * and recalculates the department's monthly upkeep modifier.
   */
  hireDepartmentHead: (department: AppointeeRoleKey, candidate: AppointeeNPC) => {
    set((state) => {
      const roleMeta = APPOINTEE_ROLE_LABELS[department];
      const updatedHeads: DepartmentHeadsState = {
        ...state.departmentHeads,
        [department]: candidate,
      };

      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        updatedHeads
      );
      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;
      const monthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - state.treasury.customPolicyRecurringNet
      );
      const monthlyNet = state.treasury.monthlyRevenue - monthlyExpenses;

      const diffPct = ((candidate.competence - 50) * 0.5).toFixed(1);
      const modifierDesc =
        candidate.competence >= 50
          ? `${diffPct}% upkeep discount`
          : `${Math.abs(Number(diffPct)).toFixed(1)}% upkeep penalty`;

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-hire-${department}-${Date.now()}`,
        turn: state.time.turn,
        headline: `Administration appoints ${candidate.name} (${candidate.alignment}) as new ${roleMeta.title}.`,
        category: "staff",
        unintendedConsequence: `Competence ${candidate.competence}/100 applies a ${modifierDesc} to ${roleMeta.shortDept} budget.`,
      };

      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      return {
        departmentHeads: updatedHeads,
        interviewPool: {
          ...state.interviewPool,
          [department]: null,
        },
        treasury: {
          ...state.treasury,
          monthlyExpenses,
          monthlyNet,
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Step 4.3: Directly pushes a narrative headline to the `news_ticker` array in Zustand.
   */
  pushNewsTickerHeadline: (
    headline,
    category = "policy",
    unintendedConsequence
  ) => {
    set((state) => {
      const entry: VibeFeedEntry = {
        id: `vibe-manual-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline,
        category,
        unintendedConsequence,
      };
      const nextTicker = [entry, ...state.news_ticker].slice(0, 40);
      return {
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Switches which choropleth metric the 2D Blueprint Map renders.
   */
  setActiveHeatmapLayer: (metric) => {
    if (!VALID_HEATMAP_METRICS.includes(metric)) return;
    set((state) => ({
      grid: {
        ...state.grid,
        activeHeatmapLayer: metric,
      },
    }));
  },

  /**
   * Applies an AI-generated or Docket Preset Policy response to the 10x10 GridSystem,
   * Treasury, and VoterSentiment, and records the full untruncated legislative entry.
   */
  applyClampedCustomPolicy: (
    rawPolicy: AICustomPolicyResponse,
    metadata?: {
      sourceLabel?: string;
      originalPromptText?: string;
      issueTitle?: string;
      capitalCostOverride?: number;
      isExecutiveOrder?: boolean;
    }
  ) => {
    set((state) => {
      const safeName = (rawPolicy.policy_name || "Executive Directive").slice(0, 40).trim();
      const safeHeadline = (
        rawPolicy.vibe_feed_headline || `Governor signs "${safeName}" into immediate effect.`
      )
        .slice(0, 80)
        .trim();

      const clampedMonthlyBudgetDelta = Math.round(
        clamp(rawPolicy.budget_impact?.monthly_change ?? 0, -100_000, 100_000)
      );

      const safeHeatmapModifiers = (rawPolicy.heatmap_modifiers || [])
        .filter((mod) => (VALID_CIVIC_PILLARS as readonly string[]).includes(mod.metric))
        .map((mod) => ({
          metric: mod.metric,
          change: clamp(mod.change, -20, 20),
        }));

      const safeDemographicModifiers = (rawPolicy.demographic_approval || [])
        .filter((dem) => VALID_DEMOGRAPHICS.includes(dem.demographic))
        .map((dem) => ({
          demographic: dem.demographic,
          change: clamp(dem.change, -15, 15),
        }));

      const gridModifiers = safeHeatmapModifiers.filter(
        (mod): mod is { metric: HeatmapMetric; change: number } =>
          (VALID_HEATMAP_METRICS as readonly string[]).includes(mod.metric)
      );

      // Apply heatmap deltas across the 10x10 tile grid
      const updatedTiles = state.grid.tiles.map((row) =>
        row.map((tile) => {
          const updatedMetrics = { ...tile.metrics };
          for (const mod of gridModifiers) {
            updatedMetrics[mod.metric] = clamp0to100(
              updatedMetrics[mod.metric] + mod.change
            );
          }
          return {
            ...tile,
            metrics: updatedMetrics,
            activeWarning: computeTileWarning(updatedMetrics),
          };
        })
      );

      let nextEdu = state.civicServices?.education ?? 55;
      let nextHealth = state.civicServices?.health ?? 55;
      for (const mod of safeHeatmapModifiers) {
        if (mod.metric === "education") {
          nextEdu = clamp0to100(nextEdu + mod.change);
        } else if (mod.metric === "health") {
          nextHealth = clamp0to100(nextHealth + mod.change);
        }
      }

      const updatedGlobalAverages = computeGlobalAveragesFromTiles(updatedTiles);
      const updatedDistricts = syncDistrictsWithTiles(state.grid.districts, updatedTiles);

      const updatedDemographics = { ...state.voterSentiment.demographics };
      for (const mod of safeDemographicModifiers) {
        const current = updatedDemographics[mod.demographic];
        updatedDemographics[mod.demographic] = {
          ...current,
          approval: clamp0to100(current.approval + mod.change),
        };
      }

      // Unilateral Executive Order Bypass Backlash (-5% Institutional Backlash)
      const isExecutiveOrderBypass = Boolean(metadata?.isExecutiveOrder);
      if (isExecutiveOrderBypass) {
        for (const demo of VALID_DEMOGRAPHICS) {
          updatedDemographics[demo] = {
            ...updatedDemographics[demo],
            approval: clamp0to100(updatedDemographics[demo].approval - 5),
          };
        }
      }

      const updatedOverallApproval = calculateWeightedApproval(updatedDemographics);

      const newCustomPolicyRecurringNet =
        state.treasury.customPolicyRecurringNet + clampedMonthlyBudgetDelta;
      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        state.departmentHeads
      );
      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;

      const updatedMonthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - newCustomPolicyRecurringNet
      );
      const updatedMonthlyNet = state.treasury.monthlyRevenue - updatedMonthlyExpenses;

      const rawTrigger = rawPolicy.unintended_consequence_trigger;
      const cleanedTrigger =
        typeof rawTrigger === "string" &&
        rawTrigger.trim().length > 0 &&
        !["string", "null", "none", "n/a", "undefined"].includes(
          rawTrigger.trim().toLowerCase().replace(/[.!?"']/g, "")
        )
          ? rawTrigger.trim().slice(0, 120)
          : null;

      const enactedRecord: ActiveCustomPolicy = {
        policy_name: safeName,
        vibe_feed_headline: safeHeadline,
        budget_impact: { monthly_change: clampedMonthlyBudgetDelta },
        heatmap_modifiers: safeHeatmapModifiers,
        demographic_approval: safeDemographicModifiers,
        unintended_consequence_trigger: cleanedTrigger,
        id: `policy-${state.time.turn}-${Date.now()}`,
        enactedTurn: state.time.turn,
        sourceLabel:
          metadata?.sourceLabel || `Month ${state.time.turn} — Executive Order`,
        originalPromptText: metadata?.originalPromptText || safeHeadline,
        issueTitle: metadata?.issueTitle,
      };

      const newFeedEntry: VibeFeedEntry = {
        id: `vibe-pol-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: safeHeadline,
        category: "policy",
        unintendedConsequence: cleanedTrigger ?? undefined,
      };

      const backlashEntry: VibeFeedEntry | null = isExecutiveOrderBypass
        ? {
            id: `vibe-eo-backlash-${state.time.turn}-${Date.now()}`,
            turn: state.time.turn,
            headline: `INSTITUTIONAL BACKLASH (-5% APPROVAL): Rival papers accuse Mayor of ruling by unilateral decree with "${safeName}".`,
            category: "tension",
          }
        : null;

      const nextTicker = [
        ...(backlashEntry ? [backlashEntry] : []),
        newFeedEntry,
        ...state.news_ticker,
      ].slice(0, 40);
      soundEffects.playGavelStamp();

      // Step 5.2: Update Culture Alignment Vector (Austerity, Progressive, Corporate)
      const nextCulturePoints = computeCulturePointDeltasFromModifiers(
        clampedMonthlyBudgetDelta,
        gridModifiers,
        safeDemographicModifiers,
        state.culturePoints
      );

      const capitalDeduction =
        metadata?.capitalCostOverride ?? EXECUTIVE_ORDER_CAPITAL_COST;

      const updatedEnactedPolicies = [enactedRecord, ...state.enactedPolicies];

      // Update 2-Axis Political Compass immediately when a law is enacted
      const econNudge =
        clampedMonthlyBudgetDelta > 0
          ? 6
          : safeDemographicModifiers.some(
              (d) => d.demographic === "business" && d.change > 0
            )
          ? 5
          : -5;
      const govNudge = isExecutiveOrderBypass
        ? 12
        : capitalDeduction >= 15
        ? 6
        : capitalDeduction < 0
        ? -5
        : 0;

      const updatedCompass = evaluatePoliticalCompassProfile({
        turn: state.time.turn,
        treasury: {
          ...state.treasury,
          customPolicyRecurringNet: newCustomPolicyRecurringNet,
          monthlyExpenses: updatedMonthlyExpenses,
          monthlyNet: updatedMonthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          demographics: updatedDemographics,
          overallApproval: updatedOverallApproval,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - capitalDeduction
          ),
        },
        culturePoints: nextCulturePoints,
        currentAverages: updatedGlobalAverages,
        enactedPoliciesCount: updatedEnactedPolicies.length,
        previousCompass: state.politicalCompass,
        economicNudge: econNudge,
        governanceNudge: govNudge,
      });

      const now = Date.now();
      const policyPopups: MapFloatingPopup[] = safeHeatmapModifiers
        .slice(0, 3)
        .map((mod, idx) => {
          const sampleRow = 3 + (idx % 3);
          const sampleCol = 3 + ((idx * 2) % 4);
          const sign = mod.change > 0 ? "+" : "";
          const prettyMetric =
            mod.metric === "land_value"
              ? "Land Value"
              : mod.metric.charAt(0).toUpperCase() + mod.metric.slice(1);
          const isGood =
            mod.metric === "land_value" ? mod.change > 0 : mod.change < 0;
          return {
            id: `pol-pop-${now}-${idx}`,
            row: sampleRow,
            col: sampleCol,
            text: `${sign}${mod.change} ${prettyMetric}`,
            color: isGood ? "#3B7A57" : "#C85A32",
            createdAt: now + idx * 140,
          };
        });

      const metricDeltasPerMonth: Partial<Record<CivicPillar, number>> = {};
      for (const hm of safeHeatmapModifiers) {
        metricDeltasPerMonth[hm.metric] =
          (metricDeltasPerMonth[hm.metric] ?? 0) + hm.change;
      }

      const aggregatedLaw: AggregatedLawRecord = {
        id: enactedRecord.id,
        title: enactedRecord.policy_name,
        kind: enactedRecord.issueTitle ? "docket" : "executive_order",
        sourceLabel:
          enactedRecord.sourceLabel ?? `Month ${state.time.turn} — Decree`,
        enactedTurn: state.time.turn,
        repealedTurn: null,
        monthsActive: 1,
        monthlyFiscalDelta: clampedMonthlyBudgetDelta,
        cumulativeFiscalNet: clampedMonthlyBudgetDelta,
        metricDeltasPerMonth,
        cumulativeMetricImpact: { ...metricDeltasPerMonth },
        demographicDeltas: safeDemographicModifiers,
        triggeredFallout: cleanedTrigger ? [cleanedTrigger] : [],
        triggeredFollowUpArcs: [],
      };

      const flashStory =
        rawPolicy.outcome_story ??
        `${safeHeadline} ${
          cleanedTrigger
            ? `Almost immediately, street-level observers noted: ${cleanedTrigger}`
            : "Local merchants and neighborhood captains wasted no time testing the fine print."
        }`;

      const nextFlash: PressWireFlash = {
        id: `flash-${Date.now()}`,
        title: enactedRecord.policy_name,
        story: flashStory,
        budgetText: `${
          clampedMonthlyBudgetDelta >= 0 ? "+" : "-"
        }$${Math.abs(clampedMonthlyBudgetDelta).toLocaleString()}/mo`,
      };

      return {
        culturePoints: nextCulturePoints,
        politicalCompass: updatedCompass,
        civicServices: {
          education: nextEdu,
          health: nextHealth,
          educationDelta: nextEdu - (state.civicServices?.education ?? 55),
          healthDelta: nextHealth - (state.civicServices?.health ?? 55),
        },
        pressWireFlash: nextFlash,
        treasury: {
          ...state.treasury,
          customPolicyRecurringNet: newCustomPolicyRecurringNet,
          monthlyExpenses: updatedMonthlyExpenses,
          monthlyNet: updatedMonthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          demographics: updatedDemographics,
          overallApproval: updatedOverallApproval,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - capitalDeduction
          ),
        },
        grid: {
          ...state.grid,
          tiles: updatedTiles,
          districts: updatedDistricts,
          globalAverages: updatedGlobalAverages,
        },
        mapPopups: [
          ...state.mapPopups.filter((p) => now - p.createdAt < 2600),
          ...policyPopups,
        ],
        enactedPolicies: updatedEnactedPolicies,
        enactedLawsHistory: [aggregatedLaw, ...state.enactedLawsHistory],
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Toggles the Monthly "State of the City" Report Modal.
   */
  setShowCityReportModal: (visible: boolean) => {
    set({ showCityReportModal: visible });
  },

  /**
   * Toggles the NationStates-Style Monthly Docket (4 Issues) Modal.
   */
  setShowDocketModal: (visible: boolean, focusPillar?: CivicPillar) => {
    set((state) => ({
      showDocketModal: visible,
      activeDocketPillar: focusPillar ?? state.activeDocketPillar,
    }));
  },

  setShowCabinetModal: (visible: boolean) => {
    set({ showCabinetModal: visible });
  },

  setCenterDeskTab: (tab: "dispatch" | "docket", focusPillar?: CivicPillar) => {
    set((state) => ({
      centerDeskTab: tab,
      activeDocketPillar: focusPillar ?? state.activeDocketPillar,
    }));
  },

  sponsorCustomBill: (proposal: SponsoredBillProposal): boolean => {
    const current = get();
    if (current.voterSentiment.politicalCapital < 10) {
      return false;
    }
    soundEffects.playGavelStamp();
    set((state) => {
      const headline: VibeFeedEntry = {
        id: `vibe-sponsor-${Date.now()}`,
        turn: state.time.turn,
        headline: `BILL INTRODUCED: "${proposal.formalTitle}" queued for public hearings & next month's floor vote.`,
        category: "policy",
      };
      const nextTicker = [headline, ...state.news_ticker].slice(0, 40);
      return {
        pendingSponsoredBills: [...state.pendingSponsoredBills, proposal],
        voterSentiment: {
          ...state.voterSentiment,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - 10
          ),
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
    return true;
  },

  dismissPressWireFlash: () => {
    set({ pressWireFlash: null });
  },

  dismissDocketFallbackNotice: () => {
    set({ docketFallbackNotice: null });
  },

  /**
   * Toggles the Manual Save / Load & JSON Export/Import Drawer Modal.
   */
  setShowSaveLoadModal: (visible: boolean) => {
    set({ showSaveLoadModal: visible });
  },

  /**
   * Serializes the active campaign state to localStorage under `slotKey`
   * ("governor_autosave", "governor_slot_1", "governor_slot_2", "governor_slot_3").
   */
  saveGameToSlot: (slotKey: string) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      const currentState = get();
      const payload = serializeGameStateToSavePayload(currentState, slotKey);
      window.localStorage.setItem(slotKey, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error("Failed to save campaign to localStorage:", err);
      return false;
    }
  },

  /**
   * Loads a saved campaign state from localStorage under `slotKey`.
   */
  loadGameFromSlot: (slotKey: string) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return false;
      const raw = window.localStorage.getItem(slotKey);
      if (!raw) return false;
      return get().importSaveJsonString(raw);
    } catch (err) {
      console.error("Failed to load campaign from localStorage:", err);
      return false;
    }
  },

  /**
   * Returns a pretty-printed JSON string of the active campaign save state
   * for downloading as a `.json` file.
   */
  exportSaveJsonString: () => {
    const currentState = get();
    const payload = serializeGameStateToSavePayload(
      currentState,
      "governor_export"
    );
    return JSON.stringify(payload, null, 2);
  },

  /**
   * Restores a campaign from a serialized JSON string (from localStorage or uploaded `.json` file).
   */
  importSaveJsonString: (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr) as SerializedCampaignSave;
      if (!parsed || typeof parsed !== "object" || !parsed.state) {
        return false;
      }

      const s = parsed.state;
      set((current) => ({
        ...current,
        time: s.time,
        treasury: s.treasury,
        voterSentiment: s.voterSentiment,
        legacy: s.legacy,
        culturePoints: s.culturePoints,
        managerTitle: s.managerTitle,
        failTrackers: s.failTrackers,
        wildcardCooldown: s.wildcardCooldown ?? 0,
        isElectionMode: s.isElectionMode ?? false,
        electionCampaign: s.electionCampaign,
        tensions: s.tensions,
        grid: s.grid,
        doctrines: s.doctrines ?? current.doctrines,
        departmentHeads: s.departmentHeads,
        monthlyDocket:
          s.monthlyDocket ??
          generateMonthlyDocketForTurn(s.time.turn).issues,
        cityReport: s.cityReport ?? current.cityReport,
        monthlyHistory: s.monthlyHistory ?? current.monthlyHistory,
        politicalCompass: s.politicalCompass ?? current.politicalCompass,
        enactedPolicies: s.enactedPolicies ?? [],
        enactedLawsHistory:
          (s as unknown as { enactedLawsHistory?: AggregatedLawRecord[] })
            .enactedLawsHistory ?? [],
        frontPageBroadsheet:
          (s as unknown as { frontPageBroadsheet?: FrontPageBroadsheet })
            .frontPageBroadsheet ?? current.frontPageBroadsheet,
        news_ticker: s.news_ticker ?? [],
        vibeFeed: s.news_ticker ?? [],
        publicAddressUsedThisTurn: s.publicAddressUsedThisTurn ?? false,
        isTurnPausedForCrisis: false,
        activeCrisis: null,
        gameOverReason: null,
        gameOverTitle: null,
      }));
      return true;
    } catch (err) {
      console.error("Failed to import campaign JSON:", err);
      return false;
    }
  },

  /**
   * Resolves one of the 4 Monthly Docket Issues using one of its 3 Preset Options.
   * Supports:
   * - Radical Preset (capitalCost > 0, e.g. 15 CAP)
   * - Moderate Preset (capitalCost === 0, 0 CAP)
   * - Populist Compromise Preset (capitalCost < 0, e.g. -5 = +5 CAP GAIN)
   */
  resolveDocketIssuePreset: (issueId: string, presetIndex: 0 | 1 | 2) => {
    const currentState = get();
    const issue = currentState.monthlyDocket.find((i) => i.id === issueId);
    if (!issue || issue.status === "RESOLVED") return;

    const chosenPreset = issue.presets[presetIndex];
    if (!chosenPreset) return;

    if (
      chosenPreset.capitalCost > 0 &&
      currentState.voterSentiment.politicalCapital < chosenPreset.capitalCost
    ) {
      return;
    }

    const pillarLabel = issue.pillar.replace("_", " ").toUpperCase();
    currentState.applyClampedCustomPolicy(chosenPreset.policyEffect, {
      sourceLabel: `Month ${currentState.time.turn} — ${pillarLabel} Docket (${chosenPreset.stanceLabel})`,
      originalPromptText: `${chosenPreset.optionTitle}: ${chosenPreset.description}`,
      issueTitle: issue.title,
      capitalCostOverride: chosenPreset.capitalCost,
    });

    set((state) => ({
      monthlyDocket: state.monthlyDocket.map((item) =>
        item.id === issueId
          ? {
              ...item,
              status: "RESOLVED",
              resolvedWithLabel: `${chosenPreset.stanceLabel}: ${chosenPreset.optionTitle}`,
            }
          : item
      ),
    }));
  },

  /**
   * Resolves one of the 4 Monthly Docket Issues using Option 4 (Custom Executive Override).
   */
  resolveDocketIssueCustom: (
    issueId: string,
    clampedPolicy: AICustomPolicyResponse,
    rawPlayerText: string
  ) => {
    const currentState = get();
    const issue = currentState.monthlyDocket.find((i) => i.id === issueId);
    if (!issue || issue.status === "RESOLVED") return;

    const pillarLabel = issue.pillar.replace("_", " ").toUpperCase();
    currentState.applyClampedCustomPolicy(clampedPolicy, {
      sourceLabel: `Month ${currentState.time.turn} — ${pillarLabel} Docket (Custom Override)`,
      originalPromptText: rawPlayerText,
      issueTitle: issue.title,
      capitalCostOverride: DOCKET_CUSTOM_CAPITAL_COST,
    });

    set((state) => ({
      monthlyDocket: state.monthlyDocket.map((item) =>
        item.id === issueId
          ? {
              ...item,
              status: "RESOLVED",
              resolvedWithLabel: `Custom Override: "${rawPlayerText.slice(0, 48)}"`,
            }
          : item
      ),
    }));
  },

  /**
   * Replaces a pending template Docket Issue with a freshly generated WebLLM Docket Issue.
   */
  replaceDocketIssueWithAI: (issue: MonthlyDocketIssue) => {
    set((state) => ({
      monthlyDocket: state.monthlyDocket.map((item) =>
        item.pillar === issue.pillar &&
        item.turn === issue.turn &&
        item.status === "PENDING"
          ? issue
          : item
      ),
      pastIssueTitles: state.pastIssueTitles.includes(issue.title)
        ? state.pastIssueTitles
        : [...state.pastIssueTitles, issue.title],
    }));
  },

  /**
   * Merges an array of WebLLM-generated MonthlyDocketIssues into the current turn's docket
   * (updating any still-PENDING pillar issues) and records their titles in `pastIssueTitles`.
   */
  setMonthlyDocketFromAI: (issues, turn) => {
    set((state) => {
      if (state.time.turn !== turn) return {};
      const byPillar = new Map(issues.map((i) => [i.pillar, i]));
      const updatedDocket = state.monthlyDocket.map((existing) => {
        if (existing.status === "RESOLVED") return existing;
        const aiReplacement = byPillar.get(existing.pillar);
        return aiReplacement ?? existing;
      });

      const addedTitles = issues.map((i) => i.title);
      const nextPastTitles = Array.from(
        new Set([...state.pastIssueTitles, ...addedTitles])
      );

      return {
        monthlyDocket: updatedDocket,
        pastIssueTitles: nextPastTitles,
        isGeneratingDocket: false,
      };
    });
  },

  setIsGeneratingDocket: (isGenerating) => {
    set({ isGeneratingDocket: isGenerating });
  },

  /**
   * Strategic Repeal Option: Repeals an active enacted law from the Enacted Laws Ledger
   * for a 10 Political Capital fee, reversing its recurring monthly budget impact.
   */
  repealEnactedPolicy: (policyId: string) => {
    set((state) => {
      const target = state.enactedPolicies.find((p) => p.id === policyId);
      if (!target) return {};
      if (state.voterSentiment.politicalCapital < REPEAL_POLICY_CAPITAL_COST) {
        return {};
      }

      const newCustomPolicyRecurringNet =
        state.treasury.customPolicyRecurringNet -
        target.budget_impact.monthly_change;

      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        state.departmentHeads
      );
      const debtInterest =
        state.treasury.reserves < 0
          ? Math.round(Math.abs(state.treasury.reserves) * 0.025)
          : 0;

      const updatedMonthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - newCustomPolicyRecurringNet
      );
      const updatedMonthlyNet =
        state.treasury.monthlyRevenue - updatedMonthlyExpenses;

      const repealEntry: VibeFeedEntry = {
        id: `vibe-repeal-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: `LAW REPEALED: Mayor repeals "${target.policy_name}", reversing its ${
          target.budget_impact.monthly_change >= 0 ? "+" : ""
        }$${target.budget_impact.monthly_change.toLocaleString()}/mo budget impact.`,
        category: "policy",
      };

      const nextTicker = [repealEntry, ...state.news_ticker].slice(0, 40);

      return {
        treasury: {
          ...state.treasury,
          customPolicyRecurringNet: newCustomPolicyRecurringNet,
          monthlyExpenses: updatedMonthlyExpenses,
          monthlyNet: updatedMonthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          politicalCapital: clamp0to100(
            state.voterSentiment.politicalCapital - REPEAL_POLICY_CAPITAL_COST
          ),
        },
        enactedPolicies: state.enactedPolicies.filter((p) => p.id !== policyId),
        enactedLawsHistory: state.enactedLawsHistory.map((law) =>
          law.id === policyId
            ? { ...law, repealedTurn: state.time.turn }
            : law
        ),
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Active "PUBLIC ADDRESS (+20 CAPITAL)" Button on the Policy Desk (usable once per month):
   * Spends $250,000 from the Treasury for a city-wide media/PR address to immediately grant
   * +20 Political Capital mid-turn.
   */
  holdPublicAddress: () => {
    set((state) => {
      if (state.publicAddressUsedThisTurn) return {};
      if (state.treasury.reserves < PUBLIC_ADDRESS_TREASURY_COST) return {};

      const nextCapital = clamp0to100(
        state.voterSentiment.politicalCapital + PUBLIC_ADDRESS_CAPITAL_GAIN
      );
      const nextReserves =
        state.treasury.reserves - PUBLIC_ADDRESS_TREASURY_COST;

      const tickerEntry: VibeFeedEntry = {
        id: `vibe-pr-address-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: `PUBLIC ADDRESS & PR BLITZ (-$250K): Mayor rallies public support in prime-time broadcast (+${PUBLIC_ADDRESS_CAPITAL_GAIN} Political Capital).`,
        category: "policy",
      };

      const nextTicker = [tickerEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      return {
        publicAddressUsedThisTurn: true,
        treasury: {
          ...state.treasury,
          reserves: nextReserves,
        },
        voterSentiment: {
          ...state.voterSentiment,
          politicalCapital: nextCapital,
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });
  },

  /**
   * Core Turn-Based Simulation Step (1 Turn = 1 Month).
   * Runs a synchronous 4-step End-of-Month Simulation & Press Briefing pipeline
   * with live progress bar before revealing the new month.
   */
  advanceTurn: async () => {
    const currentState = get();

    if (
      currentState.isTurnPausedForCrisis ||
      currentState.isElectionMode ||
      currentState.gameOverReason ||
      currentState.turnTransitionProgress.isOpen
    ) {
      return;
    }

    const sleepStep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    // Step 1 (25%): Calculating Fiscal & District Spillover...
    set({
      turnTransitionProgress: {
        isOpen: true,
        pct: 25,
        stepLabel: "Calculating Fiscal & District Spillover...",
        subLabel:
          "Aggregating 100-block neighborhood metrics, revenues, and active law drift",
      },
      pressWireFlash: null,
    });
    await sleepStep(120);

    set((state) => {
      // A. Fiscal Math (with Step 4.2 Appointee Competence Upkeep Discount / Penalty)
      const { taxRates, departments, customPolicyRecurringNet } = state.treasury;
      const popFactor = state.legacy.population / 100_000;
      const gdpFactor = state.legacy.gdpMillions / 100;
      const landValueFactor = state.grid.globalAverages.land_value / 50;

      const incomeRev = taxRates.incomeTaxPct * 34_000 * popFactor;
      const corpRev = taxRates.corporateTaxPct * 14_500 * gdpFactor;
      const propRev = taxRates.propertyTaxPct * 42_000 * landValueFactor;

      const monthlyRevenue = Math.round(incomeRev + corpRev + propRev);

      // Step 4.2: Every point of competence above 50 applies a 0.5% discount to upkeep;
      // below 50 applies a 0.5% penalty.
      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        departments,
        state.departmentHeads
      );

      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;

      const monthlyExpenses = Math.max(0, deptTotal + debtInterest - customPolicyRecurringNet);
      const monthlyNet = monthlyRevenue - monthlyExpenses;
      const newReserves = state.treasury.reserves + monthlyNet;

      // B. 10x10 Tile Grid Heatmap Decay & Growth
      const baselineSpendPerDept = 85_000 * popFactor;
      const safetyRatio = (departments.publicSafety - baselineSpendPerDept) / 50_000;
      const infraRatio = (departments.infrastructure - baselineSpendPerDept) / 50_000;
      const envRatio = (departments.environmental - baselineSpendPerDept) / 50_000;
      const socialRatio = (departments.socialServices - baselineSpendPerDept) / 50_000;

      const isTerm2OrLater = state.electionCampaign.termNumber >= 2;
      const agingInfraDrift = isTerm2OrLater ? 0.6 : 0; // Term 2+ aging infrastructure strain

      const globalCrimeDrift = 1.6 - safetyRatio * 2.2 - socialRatio * 0.8;
      const globalPollutionDrift =
        1.4 + agingInfraDrift + gdpFactor * 0.25 - envRatio * 2.6;
      const globalTrafficDrift =
        1.5 + agingInfraDrift + popFactor * 0.35 - infraRatio * 2.4;
      const globalLandValueDrift =
        infraRatio * 1.6 -
        (taxRates.propertyTaxPct - 2.0) * 0.9 -
        (state.grid.globalAverages.crime > 60 ? 1.2 : 0);

      const updatedTiles = state.grid.tiles.map((row) =>
        row.map((tile) => {
          const nextMetrics: Record<HeatmapMetric, number> = {
            crime: clamp0to100(tile.metrics.crime + globalCrimeDrift),
            pollution: clamp0to100(tile.metrics.pollution + globalPollutionDrift),
            traffic: clamp0to100(tile.metrics.traffic + globalTrafficDrift),
            land_value: clamp0to100(tile.metrics.land_value + globalLandValueDrift),
          };
          return {
            ...tile,
            metrics: nextMetrics,
            activeWarning: computeTileWarning(nextMetrics),
          };
        })
      );

      const nextGlobalAverages = computeGlobalAveragesFromTiles(updatedTiles);
      const updatedDistricts = syncDistrictsWithTiles(state.grid.districts, updatedTiles);

      // C. Voter Sentiment (includes rising voter expectations in Term 2+)
      const term2ExpectationPenalty = isTerm2OrLater ? 0.35 : 0;

      const workingClassDelta =
        socialRatio * 1.8 -
        (taxRates.incomeTaxPct - 6.5) * 0.7 -
        (nextGlobalAverages.crime - 45) * 0.05 -
        term2ExpectationPenalty;

      const wealthyDelta =
        (nextGlobalAverages.land_value - 55) * 0.06 -
        (taxRates.propertyTaxPct - 2.0) * 1.4 -
        (taxRates.incomeTaxPct - 7.0) * 0.5 -
        (nextGlobalAverages.crime - 40) * 0.05 -
        term2ExpectationPenalty;

      const businessDelta =
        infraRatio * 1.3 -
        (taxRates.corporateTaxPct - 9.0) * 0.85 -
        (nextGlobalAverages.traffic - 50) * 0.06 -
        term2ExpectationPenalty;

      const envDelta =
        envRatio * 2.1 -
        (nextGlobalAverages.pollution - 38) * 0.08 -
        term2ExpectationPenalty;

      const nextDemographics: Record<
        Demographic,
        VoterSentimentState["demographics"][Demographic]
      > = {
        working_class: {
          ...state.voterSentiment.demographics.working_class,
          approval: clamp0to100(
            state.voterSentiment.demographics.working_class.approval + workingClassDelta
          ),
        },
        wealthy: {
          ...state.voterSentiment.demographics.wealthy,
          approval: clamp0to100(
            state.voterSentiment.demographics.wealthy.approval + wealthyDelta
          ),
        },
        business: {
          ...state.voterSentiment.demographics.business,
          approval: clamp0to100(
            state.voterSentiment.demographics.business.approval + businessDelta
          ),
        },
        environmentalists: {
          ...state.voterSentiment.demographics.environmentalists,
          approval: clamp0to100(
            state.voterSentiment.demographics.environmentalists.approval + envDelta
          ),
        },
      };

      const nextOverallApproval = calculateWeightedApproval(nextDemographics);

      // Monthly Political Capital Regeneration (Approval-Scaled):
      // +20 Base Monthly Stipend + 10 Mandate Bonus if nextOverallApproval >= 50% (capped at 100)
      const baseStipend = MONTHLY_BASE_CAPITAL_STIPEND;
      const mandateBonus =
        nextOverallApproval >= 50 ? MONTHLY_MANDATE_CAPITAL_BONUS : 0;
      const capitalDelta = baseStipend + mandateBonus;
      const nextPoliticalCapital = clamp0to100(
        state.voterSentiment.politicalCapital + capitalDelta
      );

      // D. Legacy Growth
      const qualityOfLifeIndex =
        (nextOverallApproval - 45) * 0.0004 +
        (nextGlobalAverages.land_value - 50) * 0.0003 -
        (nextGlobalAverages.crime - 50) * 0.0003;

      const monthlyPopGrowthRate = clamp(0.004 + qualityOfLifeIndex, -0.015, 0.035);
      const nextPopulation = Math.max(
        50_000,
        Math.round(state.legacy.population * (1 + monthlyPopGrowthRate))
      );
      const nextPopulationTier = computePopulationTier(nextPopulation);

      const businessConfidence =
        (nextDemographics.business.approval - 50) * 0.0005 -
        (taxRates.corporateTaxPct - 10) * 0.0008;
      const nextGdpMillions = Math.max(
        100,
        Math.round(state.legacy.gdpMillions * (1 + 0.003 + businessConfidence) * 10) / 10
      );

      const nextIdeology: IdeologicalAxis = {
        ecologyScore:
          state.legacy.ideology.ecologyScore +
          (envRatio > 0.3 && nextGlobalAverages.pollution < 40 ? 3 : 0),
        austerityScore:
          state.legacy.ideology.austerityScore +
          (monthlyNet > 25_000 && taxRates.incomeTaxPct <= 6.5 ? 3 : 0),
        populistScore:
          state.legacy.ideology.populistScore +
          (socialRatio > 0.3 && nextDemographics.working_class.approval > 60 ? 3 : 0),
        corporatistScore:
          state.legacy.ideology.corporatistScore +
          (nextDemographics.business.approval > 65 && nextGlobalAverages.land_value > 65 ? 3 : 0),
        authorityScore:
          state.legacy.ideology.authorityScore +
          (safetyRatio > 0.3 && nextGlobalAverages.crime < 35 ? 3 : 0),
      };

      const nextTurnNumber = state.time.turn + 1;

      // Step 5.2: Evaluate Manager Culture Title every 6 turns
      const shouldEvaluateCultureTitle = nextTurnNumber % 6 === 0;
      const nextManagerTitle: LegacyArchetype = shouldEvaluateCultureTitle
        ? evaluateManagerCultureTitle(
            state.culturePoints,
            newReserves,
            nextOverallApproval
          )
        : state.managerTitle;
      const nextArchetype = nextManagerTitle;

      // E. Tension Meters (Crime, Transit, Sanitation: 0 - 100) & Boiling Point Check
      const crimeTensionDelta =
        (nextGlobalAverages.crime > 48 ? (nextGlobalAverages.crime - 48) * 0.45 : -2.5) +
        (safetyRatio < 0 ? Math.abs(safetyRatio) * 4.5 : -1.5);

      const transitTensionDelta =
        (nextGlobalAverages.traffic > 50 ? (nextGlobalAverages.traffic - 50) * 0.45 : -2.5) +
        (infraRatio < 0 ? Math.abs(infraRatio) * 4.5 : -1.5);

      const sanitationTensionDelta =
        (nextGlobalAverages.pollution > 45 ? (nextGlobalAverages.pollution - 45) * 0.48 : -2.5) +
        (envRatio < 0 ? Math.abs(envRatio) * 4.5 : -1.5);

      const nextTensions: TensionMetersState = {
        Crime: clamp0to100(state.tensions.Crime + crimeTensionDelta),
        Transit: clamp0to100(state.tensions.Transit + transitTensionDelta),
        Sanitation: clamp0to100(state.tensions.Sanitation + sanitationTensionDelta),
      };

      let boilingPointKey: TensionKey | null = null;
      for (const key of VALID_TENSION_KEYS) {
        if (nextTensions[key] >= 100) {
          boilingPointKey = key;
          break;
        }
      }

      // F. Time, Hard Fail States (Step 5.1) & Election Cycle
      const nextMonth = (state.time.month % 12) + 1;
      const nextYear = state.time.month === 12 ? state.time.year + 1 : state.time.year;
      let nextMonthsUntilElection = state.time.monthsUntilElection - 1;
      let nextOffice = state.time.currentOffice;
      let gameOverReason: string | null = null;
      let gameOverTitle: string | null = null;

      const updatedFeed = [...state.news_ticker];

      // Log 6-turn Manager Title evaluation change
      if (shouldEvaluateCultureTitle && nextManagerTitle !== state.managerTitle) {
        updatedFeed.unshift({
          id: `vibe-title-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline: `POLITICAL REPUTATION: Commentators now label your administration "${nextManagerTitle}".`,
          category: "election",
        });
      }

      if (nextPopulationTier > state.legacy.populationTier) {
        updatedFeed.unshift({
          id: `vibe-tier-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline: `URBAN EXPANSION: Population surged past ${nextPopulation.toLocaleString()}! Blueprint footprint expanded to Tier ${nextPopulationTier}.`,
          category: "economy",
        });
      }

      // ----------------------------------------------------------------------
      // Step 5.1: Hard Fail State #1 — Bankruptcy (The State Takeover)
      // Condition: Treasury < 0 AND monthly deficit is negative (monthlyNet < 0)
      // for 2 consecutive turns.
      // ----------------------------------------------------------------------
      const isBankruptTurn = newReserves < 0 && monthlyNet < 0;
      const nextBankruptcyStreak = isBankruptTurn
        ? state.failTrackers.bankruptcyConsecutiveTurns + 1
        : 0;

      // ----------------------------------------------------------------------
      // Step 5.1: Hard Fail State #2 — The Recall Election (The Voter Revolt)
      // Condition: Overall Approval drops below 25% for 3 consecutive turns.
      // ----------------------------------------------------------------------
      const isRecallTurn = nextOverallApproval < 25;
      const nextRecallStreak = isRecallTurn
        ? state.failTrackers.recallConsecutiveTurns + 1
        : 0;

      // ----------------------------------------------------------------------
      // Step 5.3: The Turn 24 Election Phase Trigger
      // When Turn reaches 24 (end of the 2-year term), pause the standard game loop,
      // toggle isElectionMode: true, generate the AI_Challenger (40%-60% base polling
      // inversely correlated with player's Overall Approval), and compute the WarChest.
      // ----------------------------------------------------------------------
      let triggerElectionMode = false;
      let nextElectionCampaign: ElectionCampaignState = state.electionCampaign;

      if (nextBankruptcyStreak >= 2) {
        gameOverTitle = "BANKRUPTCY: THE STATE TAKEOVER";
        gameOverReason =
          "Treasury remained below $0 with a negative monthly deficit for 2 consecutive turns. The State Government has placed the city into emergency financial receivership and removed you from office.";
        updatedFeed.unshift({
          id: `vibe-fail-bankrupt-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline:
            "STATE TAKEOVER: Governor places bankrupt city in receivership; Mayor fired.",
          category: "crisis",
        });
      } else if (nextRecallStreak >= 3) {
        gameOverTitle = "THE RECALL ELECTION: VOTER REVOLT";
        gameOverReason =
          "Overall Approval remained below 25% for 3 consecutive turns. Citizens organized a massive recall petition and ousted you from office in a special election.";
        updatedFeed.unshift({
          id: `vibe-fail-recall-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline:
            "VOTER REVOLT: Citizens oust Mayor in landslide special recall election.",
          category: "election",
        });
      } else if (nextTurnNumber === 24) {
        triggerElectionMode = true;
        const generatedChallenger = generateAIChallenger(nextOverallApproval);
        const computedWarChest = calculateCampaignWarChest(
          newReserves,
          state.culturePoints.Corporate
        );

        nextElectionCampaign = {
          termNumber: state.electionCampaign.termNumber,
          warChest: computedWarChest,
          playerPollingPct: nextOverallApproval,
          challenger: generatedChallenger,
          actionLog: [
            `Campaign Season Opens! ${generatedChallenger.name} (${generatedChallenger.partyTag}) enters the race polling at ${generatedChallenger.pollingPct.toFixed(1)}%.`,
          ],
          showVictoryModal: false,
        };

        updatedFeed.unshift({
          id: `vibe-elec-mode-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline: `ELECTION SEASON (TURN 24): ${generatedChallenger.name} challenges your administration (${nextOverallApproval.toFixed(1)}% vs ${generatedChallenger.pollingPct.toFixed(1)}%). War Chest: $${computedWarChest.toLocaleString()}.`,
          category: "election",
        });
      }

      // ----------------------------------------------------------------------
      // Bonus Step: The Exogenous Wildcard Engine (Real-World Scenarios)
      // Every turn, if no Boiling Point Crisis or Election/Game-Over is active,
      // and wildcardCooldown === 0, roll a hidden 10% RNG check (Math.random() < 0.10).
      // When triggered, set wildcardCooldown = 6 so it cannot happen more than once
      // every 6 turns, pause advanceTurn(), and invoke the Wildcard LLM pipeline.
      // ----------------------------------------------------------------------
      const decrementedCooldown = Math.max(0, state.wildcardCooldown - 1);
      const canRollWildcard =
        !gameOverReason &&
        !triggerElectionMode &&
        boilingPointKey === null &&
        decrementedCooldown === 0;

      const didTriggerWildcard = canRollWildcard && Math.random() < 0.1;
      const nextWildcardCooldown = didTriggerWildcard ? 6 : decrementedCooldown;

      const isTurnPausedForCrisis =
        (boilingPointKey !== null || didTriggerWildcard) &&
        !gameOverReason &&
        !triggerElectionMode;

      const activeCrisis =
        boilingPointKey && !gameOverReason && !triggerElectionMode
          ? {
              tensionTriggered: boilingPointKey,
              isWildcard: false,
              crisis_name: `BOILING POINT: ${boilingPointKey.toUpperCase()} CRISIS`,
              description: `The ${boilingPointKey} Tension Meter has reached 100/100. Simulation paused while generating executive crisis options...`,
              isGenerating: true,
              choices: null,
            }
          : didTriggerWildcard
          ? {
              tensionTriggered: "Wildcard" as const,
              isWildcard: true,
              crisis_name: "EXOGENOUS WILDCARD: MACRO SHOCK",
              description:
                "An unexpected national/global shock wave has hit the territory. Synthesizing emergency response options...",
              isGenerating: true,
              choices: null,
            }
          : null;

      if (boilingPointKey && !gameOverReason && !triggerElectionMode) {
        updatedFeed.unshift({
          id: `vibe-crisis-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline: `CRISIS ALERT: ${boilingPointKey} Tension Meter has reached Boiling Point (100/100)!`,
          category: "crisis",
        });
      } else if (didTriggerWildcard) {
        updatedFeed.unshift({
          id: `vibe-wildcard-${nextTurnNumber}`,
          turn: nextTurnNumber,
          headline:
            "MACRO SHOCKWAVE: An exogenous real-world crisis is impacting the city!",
          category: "crisis",
        });
      }

      const slicedTicker = updatedFeed.slice(0, 40);

      // Generate the new Month's 4 NationStates Docket Issues (with anti-repetition memory & Follow-Up Arc sequels)
      const docketBundle = generateMonthlyDocketForTurn(nextTurnNumber, {
        pastIssueTitles: state.pastIssueTitles,
        usedFallbackTemplateIds: state.usedFallbackTemplateIds,
        recentLaws: state.enactedPolicies.slice(0, 3),
      });
      const nextMonthlyDocket = docketBundle.issues;
      const nextPastIssueTitles = Array.from(
        new Set([...state.pastIssueTitles, ...docketBundle.newTitles])
      );
      const nextUsedTemplateIds = Array.from(
        new Set([
          ...state.usedFallbackTemplateIds,
          ...docketBundle.newlyUsedTemplateIds,
        ])
      );

      const nextTreasurySnapshot: TreasuryState = {
        ...state.treasury,
        reserves: newReserves,
        monthlyRevenue,
        monthlyExpenses,
        monthlyNet,
      };
      const nextCityReport = buildMonthlyCityReport({
        turn: nextTurnNumber,
        month: nextMonth,
        year: nextYear,
        currentAverages: nextGlobalAverages,
        previousAverages: state.grid.globalAverages,
        treasury: nextTreasurySnapshot,
        currentTensions: nextTensions,
        previousTensions: state.tensions,
        departmentHeads: state.departmentHeads,
        previousCapital: state.voterSentiment.politicalCapital,
        currentCapital: nextPoliticalCapital,
        baseStipend,
        mandateBonus,
      });

      // 2. Append Month-to-Month Historical Metric Snapshot for Trend Sparklines
      const newHistoryEntry: MonthlyHistorySnapshot = {
        turn: nextTurnNumber,
        month: nextMonth,
        year: nextYear,
        treasury: newReserves,
        approval: nextOverallApproval,
        crimeAvg: nextGlobalAverages.crime,
        pollutionAvg: nextGlobalAverages.pollution,
        landValueAvg: nextGlobalAverages.land_value,
        trafficAvg: nextGlobalAverages.traffic,
        crimeTension: nextTensions.Crime,
        transitTension: nextTensions.Transit,
        sanitationTension: nextTensions.Sanitation,
      };
      const nextMonthlyHistory = [...state.monthlyHistory, newHistoryEntry];

      // 3. Re-evaluate 2-Axis Political Compass & Leadership Archetype Summary
      const nextVoterSentimentSnapshot: VoterSentimentState = {
        overallApproval: nextOverallApproval,
        politicalCapital: nextPoliticalCapital,
        demographics: nextDemographics,
      };
      const nextPoliticalCompass = evaluatePoliticalCompassProfile({
        turn: nextTurnNumber,
        treasury: nextTreasurySnapshot,
        voterSentiment: nextVoterSentimentSnapshot,
        culturePoints: state.culturePoints,
        currentAverages: nextGlobalAverages,
        enactedPoliciesCount: state.enactedPolicies.length,
        previousCompass: state.politicalCompass,
      });

      // Trigger Web Audio Tension Alert Chime when any Tension meter exceeds 90
      if (
        nextTensions.Crime > 90 ||
        nextTensions.Transit > 90 ||
        nextTensions.Sanitation > 90
      ) {
        soundEffects.playTensionAlertChime();
      }

      const failOutcome: "bankruptcy" | "recall" | null =
        nextBankruptcyStreak >= 2
          ? "bankruptcy"
          : nextRecallStreak >= 3
          ? "recall"
          : null;

      const nextLegacyChronicle: LegacyChronicleState = failOutcome
        ? {
            isOpen: true,
            outcome: failOutcome,
            headlineTitle:
              gameOverTitle || "ADMINISTRATION TERMINATED",
            toneCategory: "collapse",
            encyclopediaEntry:
              "Compiling Municipal Historical Encyclopedia entry...",
            toneAdaptiveVerdict: "Synthesizing historical post-mortem verdict...",
            hallOfFameAudit: [],
            isGeneratingEntry: true,
          }
        : state.legacyChronicle;

      // 4. Aggregate cumulative fiscal & metric impacts for all active laws in enactedLawsHistory
      const followUpTitlesByParent = new Map<string, string[]>();
      for (const issue of nextMonthlyDocket) {
        if (issue.isFollowUpArc && issue.parentLawTitle) {
          const key = issue.parentLawTitle.toLowerCase();
          const existing = followUpTitlesByParent.get(key) ?? [];
          existing.push(issue.title);
          followUpTitlesByParent.set(key, existing);
        }
      }

      const nextEnactedLawsHistory: AggregatedLawRecord[] =
        state.enactedLawsHistory.map((law) => {
          if (law.repealedTurn !== null) return law;
          const nextCumImpact: Partial<Record<CivicPillar, number>> = {
            ...law.cumulativeMetricImpact,
          };
          for (const [mKey, delta] of Object.entries(
            law.metricDeltasPerMonth
          )) {
            const metric = mKey as CivicPillar;
            if (typeof delta === "number") {
              nextCumImpact[metric] = (nextCumImpact[metric] ?? 0) + delta;
            }
          }
          const newFollowUps =
            followUpTitlesByParent.get(law.title.toLowerCase()) ?? [];
          const mergedFollowUps =
            newFollowUps.length > 0
              ? Array.from(
                  new Set([...law.triggeredFollowUpArcs, ...newFollowUps])
                )
              : law.triggeredFollowUpArcs;

          return {
            ...law,
            monthsActive: law.monthsActive + 1,
            cumulativeFiscalNet:
              law.cumulativeFiscalNet + law.monthlyFiscalDelta,
            cumulativeMetricImpact: nextCumImpact,
            triggeredFollowUpArcs: mergedFollowUps,
          };
        });

      const nextBroadsheet = buildDeterministicBroadsheet({
        ...state,
        time: {
          ...state.time,
          turn: nextTurnNumber,
          totalTurnsPlayed: state.time.totalTurnsPlayed + 1,
          month: nextMonth,
          year: nextYear,
          monthsUntilElection: Math.max(0, nextMonthsUntilElection),
          currentOffice: nextOffice,
        },
        treasury: nextTreasurySnapshot,
        voterSentiment: nextVoterSentimentSnapshot,
        tensions: nextTensions,
        grid: {
          ...state.grid,
          globalAverages: nextGlobalAverages,
        },
        cityReport: nextCityReport,
      } as GameState);

      const eduDirectorBonus =
        state.departmentHeads.EducationDirector &&
        state.departmentHeads.EducationDirector.competence >= 50
          ? 0.4
          : -0.3;
      const healthDirectorBonus =
        state.departmentHeads.HealthDirector &&
        state.departmentHeads.HealthDirector.competence >= 50
          ? 0.4
          : -0.3;
      const prevEdu = state.civicServices?.education ?? 55;
      const prevHealth = state.civicServices?.health ?? 55;
      const nextEdu = clamp0to100(
        prevEdu + (socialRatio - 1) * 1.6 + eduDirectorBonus - (isTerm2OrLater ? 0.25 : 0)
      );
      const nextHealth = clamp0to100(
        prevHealth + (socialRatio - 1) * 1.6 + healthDirectorBonus - (isTerm2OrLater ? 0.25 : 0)
      );

      return {
        time: {
          ...state.time,
          turn: nextTurnNumber,
          totalTurnsPlayed: state.time.totalTurnsPlayed + 1,
          month: nextMonth,
          year: nextYear,
          monthsUntilElection: Math.max(0, nextMonthsUntilElection),
          currentOffice: nextOffice,
        },
        civicServices: {
          education: nextEdu,
          health: nextHealth,
          educationDelta: nextEdu - prevEdu,
          healthDelta: nextHealth - prevHealth,
        },
        legacyChronicle: nextLegacyChronicle,
        enactedLawsHistory: nextEnactedLawsHistory,
        frontPageBroadsheet: nextBroadsheet,
        isGeneratingBroadsheet: true,
        centerDeskTab: "dispatch" as const,
        treasury: nextTreasurySnapshot,
        voterSentiment: nextVoterSentimentSnapshot,
        legacy: {
          population: nextPopulation,
          populationTier: nextPopulationTier,
          gdpMillions: nextGdpMillions,
          archetype: nextArchetype,
          ideology: nextIdeology,
        },
        managerTitle: nextManagerTitle,
        failTrackers: {
          bankruptcyConsecutiveTurns: nextBankruptcyStreak,
          recallConsecutiveTurns: nextRecallStreak,
        },
        wildcardCooldown: nextWildcardCooldown,
        isElectionMode: triggerElectionMode,
        electionCampaign: nextElectionCampaign,
        tensions: nextTensions,
        grid: {
          ...state.grid,
          tiles: updatedTiles,
          districts: updatedDistricts,
          globalAverages: nextGlobalAverages,
        },
        monthlyDocket: nextMonthlyDocket,
        pastIssueTitles: nextPastIssueTitles,
        usedFallbackTemplateIds: nextUsedTemplateIds,
        cityReport: nextCityReport,
        monthlyHistory: nextMonthlyHistory,
        politicalCompass: nextPoliticalCompass,
        showCityReportModal: false,
        publicAddressUsedThisTurn: false,
        townHall: {
          ...state.townHall,
          usedThisTurn: false,
          lastResult: null,
        },
        news_ticker: slicedTicker,
        vibeFeed: slicedTicker,
        isTurnPausedForCrisis,
        activeCrisis,
        crisisAttemptsRemaining: 2,
        crisisRejectionReason: null,
        gameOverReason,
        gameOverTitle,
      };
    });

    // 1. Auto-Save on Month Advance to localStorage under "governor_autosave"
    get().saveGameToSlot(AUTOSAVE_STORAGE_KEY);

    const postTurnState = get();

    // If Bankruptcy or Recall triggered the Legacy Chronicle, synthesize the Post-Mortem
    if (
      postTurnState.legacyChronicle.isOpen &&
      postTurnState.legacyChronicle.isGeneratingEntry
    ) {
      void generateHistoricalPostMortem(
        postTurnState,
        postTurnState.legacyChronicle.outcome
      ).then((postMortem) => {
        get().setLegacyChroniclePostMortem(postMortem);
      });
    }

    try {
      // Step 2 (55%): Evaluating Public Debate on Sponsored Bills & Active Laws...
      set({
        turnTransitionProgress: {
          isOpen: true,
          pct: 55,
          stepLabel:
            "Evaluating Public Debate on Sponsored Bills & Active Laws...",
          subLabel:
            postTurnState.pendingSponsoredBills.length > 0
              ? `Dissecting ${postTurnState.pendingSponsoredBills.length} sponsored bill(s) in committee hearings`
              : "Cross-referencing active municipal decrees against neighborhood sentiment",
        },
      });
      const { evaluatedBills, hearings } = await evaluateSponsoredBillsDebate(
        postTurnState.pendingSponsoredBills,
        postTurnState
      );
      if (evaluatedBills.length === 0) {
        await sleepStep(120);
      }

      // Step 3 (80%): Writing The Municipal Dispatch & Drafting Law-Aware Docket (Batched)...
      set({
        turnTransitionProgress: {
          isOpen: true,
          pct: 80,
          stepLabel: "Writing The Municipal Dispatch Front-Page Fallout...",
          subLabel:
            "Synthesizing broadsheet satire, rival op-eds & law-aware docket in one batched pass",
        },
      });
      const latestState = get();
      const {
        broadsheet: broadsheetWithHearings,
        docketIssues: aiDocketIssues,
        usedDocketFallback,
      } = await generateBatchedTurnContent(latestState, hearings);

      // Step 4 (100%): Finalizing Next Month's Law-Aware Legislative Docket...
      set({
        turnTransitionProgress: {
          isOpen: true,
          pct: 100,
          stepLabel: "Drafting Next Month's Law-Aware Legislative Docket...",
          subLabel:
            "Promoting sponsored bills & locking in 4 cross-pillar dilemmas",
        },
      });
      if (!broadsheetWithHearings.isAIGenerated) {
        await sleepStep(100);
      }

      // Merge AI docket issues with fallback, and promote evaluated Sponsored Bills to the top!
      const mergedBaseDocket = latestState.monthlyDocket.map((existing) => {
        const aiMatch = aiDocketIssues.find(
          (a) => a.pillar === existing.pillar
        );
        return aiMatch ?? existing;
      });

      const promotedSponsoredIssues: MonthlyDocketIssue[] = evaluatedBills.map(
        (bill) => ({
          id: bill.id,
          turn: latestState.time.turn,
          pillar: bill.targetPillar,
          title: bill.formalTitle,
          briefing: bill.briefing,
          status: "PENDING",
          isSponsoredBill: true,
          isAIGenerated: true,
          domainTag: "Sponsored Ordinance",
          presets: bill.presets,
        })
      );

      const finalDocket = [...promotedSponsoredIssues, ...mergedBaseDocket];
      recordCrossGameIssueTitles(finalDocket.map((i) => i.title));

      set((s) => ({
        frontPageBroadsheet: broadsheetWithHearings,
        isGeneratingBroadsheet: false,
        monthlyDocket: finalDocket,
        pendingSponsoredBills: [],
        pastIssueTitles: Array.from(
          new Set([...s.pastIssueTitles, ...finalDocket.map((i) => i.title)])
        ),
        activeDocketPillar:
          promotedSponsoredIssues[0]?.pillar ?? s.activeDocketPillar,
        centerDeskTab: "dispatch",
        docketFallbackNotice: usedDocketFallback
          ? "WebLLM returned malformed JSON twice; fallback docket issues were loaded for this month."
          : null,
        turnTransitionProgress: {
          isOpen: false,
          pct: 100,
          stepLabel: "",
          subLabel: "",
        },
      }));
    } catch (err) {
      console.error("Turn Transition Pipeline Error:", err);
      set({
        isGeneratingBroadsheet: false,
        turnTransitionProgress: {
          isOpen: false,
          pct: 0,
          stepLabel: "",
          subLabel: "",
        },
      });
    }
  },

  setGeneratedCrisisEvent: (crisisEvent: AICrisisResponse) => {
    set((state) => {
      if (!state.activeCrisis) return {};
      return {
        activeCrisis: {
          ...state.activeCrisis,
          crisis_name: crisisEvent.crisis_name.slice(0, 60).trim(),
          description: crisisEvent.description.slice(0, 260).trim(),
          isGenerating: false,
          choices: crisisEvent.choices.slice(0, 3),
        },
      };
    });
  },

  applyClampedCrisisChoice: (
    clampedChoice: AICrisisChoice,
    triggeredMeter: TensionKey | "Wildcard",
    crisisName: string
  ) => {
    set((state) => {
      const monthlyBudgetDelta = Math.round(
        clamp(clampedChoice.budget_impact?.monthly_change ?? 0, -250_000, 250_000)
      );

      const safeHeatmapModifiers = (clampedChoice.heatmap_modifiers || [])
        .filter((mod) => VALID_HEATMAP_METRICS.includes(mod.metric))
        .map((mod) => ({
          metric: mod.metric,
          change: Math.round(clamp(mod.change, -30, 30)),
        }));

      const safeDemographicModifiers = (clampedChoice.demographic_approval || [])
        .filter((dem) => VALID_DEMOGRAPHICS.includes(dem.demographic))
        .map((dem) => ({
          demographic: dem.demographic,
          change: Math.round(clamp(dem.change, -20, 20)),
        }));

      const updatedTiles = state.grid.tiles.map((row) =>
        row.map((tile) => {
          const updatedMetrics = { ...tile.metrics };
          for (const mod of safeHeatmapModifiers) {
            updatedMetrics[mod.metric] = clamp0to100(
              updatedMetrics[mod.metric] + mod.change
            );
          }
          return {
            ...tile,
            metrics: updatedMetrics,
            activeWarning: computeTileWarning(updatedMetrics),
          };
        })
      );

      const updatedGlobalAverages = computeGlobalAveragesFromTiles(updatedTiles);
      const updatedDistricts = syncDistrictsWithTiles(state.grid.districts, updatedTiles);

      const updatedDemographics = { ...state.voterSentiment.demographics };
      for (const mod of safeDemographicModifiers) {
        const current = updatedDemographics[mod.demographic];
        updatedDemographics[mod.demographic] = {
          ...current,
          approval: clamp0to100(current.approval + mod.change),
        };
      }

      const updatedOverallApproval = calculateWeightedApproval(updatedDemographics);

      const newCustomPolicyRecurringNet =
        state.treasury.customPolicyRecurringNet + monthlyBudgetDelta;
      const deptTotal = computeModifiedDepartmentUpkeepTotal(
        state.treasury.departments,
        state.departmentHeads
      );
      const debtInterest =
        state.treasury.reserves < 0 ? Math.round(Math.abs(state.treasury.reserves) * 0.025) : 0;

      const updatedMonthlyExpenses = Math.max(
        0,
        deptTotal + debtInterest - newCustomPolicyRecurringNet
      );
      const updatedMonthlyNet = state.treasury.monthlyRevenue - updatedMonthlyExpenses;

      const newFeedEntry: VibeFeedEntry = {
        id: `vibe-crisis-res-${state.time.turn}-${Date.now()}`,
        turn: state.time.turn,
        headline: `CRISIS RESOLVED [${crisisName}]: Governor selects "${clampedChoice.option_label}".`,
        category: "crisis",
      };

      const nextTicker = [newFeedEntry, ...state.news_ticker].slice(0, 40);
      soundEffects.playGavelStamp();

      // Step 5.2: Update Culture Alignment Vector (Austerity, Progressive, Corporate)
      const nextCulturePoints = computeCulturePointDeltasFromModifiers(
        monthlyBudgetDelta,
        safeHeatmapModifiers,
        safeDemographicModifiers,
        state.culturePoints
      );

      const nextTensions: TensionMetersState =
        triggeredMeter === "Wildcard"
          ? state.tensions
          : {
              ...state.tensions,
              [triggeredMeter]: 0,
            };

      return {
        culturePoints: nextCulturePoints,
        treasury: {
          ...state.treasury,
          customPolicyRecurringNet: newCustomPolicyRecurringNet,
          monthlyExpenses: updatedMonthlyExpenses,
          monthlyNet: updatedMonthlyNet,
        },
        voterSentiment: {
          ...state.voterSentiment,
          demographics: updatedDemographics,
          overallApproval: updatedOverallApproval,
        },
        grid: {
          ...state.grid,
          tiles: updatedTiles,
          districts: updatedDistricts,
          globalAverages: updatedGlobalAverages,
        },
        tensions: nextTensions,
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
        isTurnPausedForCrisis: false,
        activeCrisis: null,
        crisisAttemptsRemaining: 2,
        crisisRejectionReason: null,
      };
    });
  },

  /**
   * Bonus Step 2: The Gridlock Penalty (Failure to Act)
   * Called when `is_valid_solution` is FALSE:
   * - Sets `crisisRejectionReason` (Max 100 chars) and decrements `crisisAttemptsRemaining` by 1.
   * - If `crisisAttemptsRemaining` hits 0, forces Gridlock: closes the modal, discards the
   *   custom text, and automatically applies the mathematical consequences of Option 3
   *   (choices[2], the "Band-aid / Do Nothing / Worst Consequences" option).
   */
  recordFailedCustomCrisisAttempt: (rejectionReason: string) => {
    const currentState = get();
    if (!currentState.activeCrisis) return;

    const cleanReason =
      rejectionReason.trim().slice(0, 100) ||
      "The City Attorney blocks this action as unconstitutional.";
    const nextAttempts = currentState.crisisAttemptsRemaining - 1;

    if (nextAttempts <= 0 && currentState.activeCrisis.choices) {
      const option3Fallback =
        currentState.activeCrisis.choices[2] ??
        currentState.activeCrisis.choices[currentState.activeCrisis.choices.length - 1];

      if (option3Fallback) {
        currentState.applyClampedCrisisChoice(
          {
            ...option3Fallback,
            option_label: `GRIDLOCK DEFAULT (Option 3): ${option3Fallback.option_label}`,
          },
          currentState.activeCrisis.tensionTriggered,
          currentState.activeCrisis.crisis_name
        );
        return;
      }
    }

    set({
      crisisAttemptsRemaining: Math.max(0, nextAttempts),
      crisisRejectionReason: cleanReason,
    });
  },

  resolveCrisisChoice: (choiceIndex: 0 | 1 | 2) => {
    const currentState = get();
    if (!currentState.activeCrisis || !currentState.activeCrisis.choices) {
      return;
    }

    const selectedChoice = currentState.activeCrisis.choices[choiceIndex];
    if (!selectedChoice) return;

    currentState.applyClampedCrisisChoice(
      selectedChoice,
      currentState.activeCrisis.tensionTriggered,
      currentState.activeCrisis.crisis_name
    );
  },

  clearCrisisPause: () => {
    set((state) => {
      if (!state.activeCrisis) {
        return { isTurnPausedForCrisis: false };
      }
      const triggeredKey = state.activeCrisis.tensionTriggered;
      return {
        isTurnPausedForCrisis: false,
        activeCrisis: null,
        tensions:
          triggeredKey === "Wildcard"
            ? state.tensions
            : {
                ...state.tensions,
                [triggeredKey]: 0,
              },
      };
    });
  },

  /**
   * Step 5.3: Executes one of the 3 Campaign Actions (Spending the War Chest):
   * - Grassroots Rally (Low Cost $40k): +2% to +4% Polling swing (RNG)
   * - Smear Campaign (Medium Cost $90k): +5% Polling swing, adds +1 to Crime_Tension
   * - Media Blitz (High Cost $160k): Guaranteed +8% Polling swing
   */
  executeCampaignAction: (actionType: CampaignActionType) => {
    set((state) => {
      if (!state.isElectionMode) return {};

      const meta = CAMPAIGN_ACTION_COSTS[actionType];
      if (state.electionCampaign.warChest < meta.cost) {
        return {};
      }

      let pollingSwing = 0;
      let nextCrimeTension = state.tensions.Crime;
      let logNote = "";

      if (actionType === "grassroots_rally") {
        pollingSwing = randomInt(2, 4);
        logNote = `Grassroots Rally (-$${meta.cost.toLocaleString()}): +${pollingSwing}% Polling surge across working wards!`;
      } else if (actionType === "smear_campaign") {
        pollingSwing = 5;
        nextCrimeTension = clamp0to100(state.tensions.Crime + 1);
        logNote = `Smear Campaign (-$${meta.cost.toLocaleString()}): +5% Polling swing! Political division adds +1 to Crime Tension.`;
      } else if (actionType === "media_blitz") {
        pollingSwing = 8;
        logNote = `Media Blitz (-$${meta.cost.toLocaleString()}): Guaranteed +8% airwave polling surge!`;
      }

      const nextPlayerPolling = clamp0to100(
        state.electionCampaign.playerPollingPct + pollingSwing
      );
      const nextWarChest = state.electionCampaign.warChest - meta.cost;

      // Sync overallApproval so the 2D Red/Blue polling map updates live
      const nextDemographics = { ...state.voterSentiment.demographics };
      for (const demo of VALID_DEMOGRAPHICS) {
        nextDemographics[demo] = {
          ...nextDemographics[demo],
          approval: clamp0to100(nextDemographics[demo].approval + pollingSwing),
        };
      }

      return {
        electionCampaign: {
          ...state.electionCampaign,
          warChest: nextWarChest,
          playerPollingPct: nextPlayerPolling,
          actionLog: [logNote, ...state.electionCampaign.actionLog],
        },
        voterSentiment: {
          ...state.voterSentiment,
          overallApproval: nextPlayerPolling,
          demographics: nextDemographics,
        },
        tensions: {
          ...state.tensions,
          Crime: nextCrimeTension,
        },
      };
    });
  },

  /**
   * Step 5.3: Election Day Resolution ("Hold Election")
   * Compares Player's Polling vs. Challenger's Polling:
   * - If Win (playerPollingPct >= challenger.pollingPct): Trigger Victory Modal,
   *   reset Turn to 1 (starting Term 2+), keep the 10x10 city grid and treasury
   *   exactly as they are, and toggle isElectionMode: false.
   * - If Lose: Trigger Game Over Modal: "The voters have spoken. You have been voted out of office."
   */
  holdElection: () => {
    set((state) => {
      if (!state.isElectionMode) return {};

      const { playerPollingPct, challenger, termNumber } = state.electionCampaign;
      const playerWins = playerPollingPct >= challenger.pollingPct;
      const mode = state.time.campaignTermMode;

      if (playerWins) {
        soundEffects.playVictoryFanfare();
        const currentOfficeIndex = OFFICES_HIERARCHY.indexOf(
          state.time.currentOffice
        );
        const promotedOffice =
          OFFICES_HIERARCHY[
            Math.min(OFFICES_HIERARCHY.length - 1, currentOfficeIndex + 1)
          ];
        const nextTermNumber = termNumber + 1;

        const isFinalTermComplete =
          mode === "single_24" || (mode === "two_term_48" && termNumber >= 2);

        const winEntry: VibeFeedEntry = {
          id: `vibe-elec-victory-${Date.now()}`,
          turn: 1,
          headline: isFinalTermComplete
            ? `CAMPAIGN VICTORY: Completed ${
                mode === "single_24" ? "24-Month Single Term" : "48-Month Two-Term Legacy"
              } defeating ${challenger.name} (${playerPollingPct.toFixed(1)}%)!`
            : `RE-ELECTION VICTORY (Term ${nextTermNumber}): Defeated ${challenger.name} (${playerPollingPct.toFixed(
                1
              )}% to ${challenger.pollingPct.toFixed(1)}%)!`,
          category: "election",
        };
        const nextTicker = [winEntry, ...state.news_ticker].slice(0, 40);

        if (isFinalTermComplete) {
          return {
            isElectionMode: false,
            time: {
              ...state.time,
              currentOffice: promotedOffice,
            },
            legacyChronicle: {
              isOpen: true,
              outcome: "victory",
              headlineTitle: `HISTORIC VICTORY — ${promotedOffice.toUpperCase()} LEGACY COMPLETE`,
              toneCategory: "triumph",
              encyclopediaEntry:
                "Compiling Municipal Historical Encyclopedia entry...",
              toneAdaptiveVerdict:
                "Synthesizing historical post-mortem verdict...",
              hallOfFameAudit: [],
              isGeneratingEntry: true,
            },
            news_ticker: nextTicker,
            vibeFeed: nextTicker,
          };
        }

        return {
          isElectionMode: false,
          time: {
            ...state.time,
            turn: 1, // Reset Turn to 1 (starting next 24-month term)
            monthsUntilElection: 24,
            currentOffice: promotedOffice,
          },
          // Keep the city grid and treasury exactly as they are
          electionCampaign: {
            ...state.electionCampaign,
            termNumber: nextTermNumber,
            showVictoryModal: true,
          },
          news_ticker: nextTicker,
          vibeFeed: nextTicker,
        };
      }

      // Lose: Trigger Legacy Chronicle (defeat)
      const lossEntry: VibeFeedEntry = {
        id: `vibe-elec-defeat-${Date.now()}`,
        turn: state.time.turn,
        headline: `ELECTION DEFEAT: ${challenger.name} ousts administration (${challenger.pollingPct.toFixed(
          1
        )}% to ${playerPollingPct.toFixed(1)}%).`,
        category: "election",
      };
      const nextTicker = [lossEntry, ...state.news_ticker].slice(0, 40);

      return {
        isElectionMode: false,
        gameOverTitle: "ELECTION DAY DEFEAT",
        gameOverReason: `The voters have spoken. You have been voted out of office. (${challenger.name}: ${challenger.pollingPct.toFixed(
          1
        )}% vs. Your Campaign: ${playerPollingPct.toFixed(1)}%)`,
        legacyChronicle: {
          isOpen: true,
          outcome: "defeat",
          headlineTitle: "ELECTION DAY DEFEAT — TERM CONCLUDED",
          toneCategory: "collapse",
          encyclopediaEntry:
            "Compiling Municipal Historical Encyclopedia entry...",
          toneAdaptiveVerdict:
            "Synthesizing historical post-mortem verdict...",
          hallOfFameAudit: [],
          isGeneratingEntry: true,
        },
        news_ticker: nextTicker,
        vibeFeed: nextTicker,
      };
    });

    const postState = get();
    if (
      postState.legacyChronicle.isOpen &&
      postState.legacyChronicle.isGeneratingEntry
    ) {
      void generateHistoricalPostMortem(
        postState,
        postState.legacyChronicle.outcome
      ).then((postMortem) => {
        get().setLegacyChroniclePostMortem(postMortem);
      });
    }
  },

  /**
   * Dismisses the Term Victory Modal so the player can continue their legacy in Term 2+.
   */
  dismissElectionVictoryModal: () => {
    set((state) => ({
      electionCampaign: {
        ...state.electionCampaign,
        showVictoryModal: false,
      },
    }));
  },

  resetGame: () => {
    set(buildProceduralCityState());
  },
}));
