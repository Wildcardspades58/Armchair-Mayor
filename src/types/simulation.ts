// ============================================================================
// GOVERNOR — Headless Simulation Core & AI Guardrail Type Definitions
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Strict Enums & Primitives (AI & Simulation Guardrails)
// ----------------------------------------------------------------------------

export type HeatmapMetric = "crime" | "pollution" | "land_value" | "traffic";
export type CivicPillar = HeatmapMetric | "education" | "health";
export type Demographic = "working_class" | "wealthy" | "business" | "environmentalists";

export const VALID_HEATMAP_METRICS: readonly HeatmapMetric[] = [
  "crime",
  "pollution",
  "land_value",
  "traffic",
] as const;

export const VALID_CIVIC_PILLARS: readonly CivicPillar[] = [
  "crime",
  "pollution",
  "land_value",
  "traffic",
  "education",
  "health",
] as const;

export const VALID_DEMOGRAPHICS: readonly Demographic[] = [
  "working_class",
  "wealthy",
  "business",
  "environmentalists",
] as const;

export type PoliticalOffice =
  | "City Mayor"
  | "County Executive"
  | "State Governor"
  | "Federal Senator";

export type LegacyArchetype =
  | "Unproven Incumbent"
  | "The Austerity Mayor"
  | "The Green Technocrat"
  | "The Industrial Populist"
  | "The Deficit Spender"
  | "Green Technocrat"
  | "Austerity Manager"
  | "Populist Firebrand"
  | "Corporate Broker"
  | "Law & Order Hawk";

/**
 * Step 5.2: Manager Culture Tracking (The Alignment Vector)
 * Tracks Austerity, Progressive, and Corporate points across policies, crises, and tax adjustments.
 */
export interface CulturePointsState {
  Austerity: number;
  Progressive: number;
  Corporate: number;
}

/**
 * Step 5.1: Hard Fail State Streak Trackers
 * - bankruptcyStreak: Increments each turn when Treasury < 0 AND monthlyNet < 0 (2 consecutive turns = State Takeover).
 * - recallStreak: Increments each turn when overallApproval < 25% (3 consecutive turns = Voter Recall Revolt).
 */
export interface FailStateTracking {
  bankruptcyConsecutiveTurns: number; // Game Over at 2
  recallConsecutiveTurns: number; // Game Over at 3
}

export type StartingArchetype =
  | "The Rust Belt Decay"
  | "The Silicon Boomtown"
  | "The Corrupt Machine";

export const STARTING_ARCHETYPES: readonly StartingArchetype[] = [
  "The Rust Belt Decay",
  "The Silicon Boomtown",
  "The Corrupt Machine",
] as const;

// ----------------------------------------------------------------------------
// 2. Strict AI Guardrail Schema (Clamped Before Entering Store)
// ----------------------------------------------------------------------------

export interface AICustomPolicyResponse {
  policy_name: string; // Max 40 chars
  vibe_feed_headline: string; // Max 80 chars
  budget_impact: {
    monthly_change: number; // ENGINE ENFORCEMENT: Clamp between -100,000 and +100,000
  };
  heatmap_modifiers: Array<{
    metric: CivicPillar; // MUST enforce enum matching
    change: number; // ENGINE ENFORCEMENT: Clamp between -20 and +20
  }>;
  demographic_approval: Array<{
    demographic: Demographic; // MUST enforce enum matching
    change: number; // ENGINE ENFORCEMENT: Clamp between -15 and +15
  }>;
  unintended_consequence_trigger: string | null;
  outcome_story?: string; // 2-3 satirical NationStates-style outcome paragraphs
}

export interface ActiveCustomPolicy extends AICustomPolicyResponse {
  id: string;
  enactedTurn: number;
  sourceLabel?: string; // e.g., "Month 2 — Pollution Docket" or "Month 1 — Executive Order"
  originalPromptText?: string; // Full untrucnated player prompt or chosen option text
  issueTitle?: string; // If resolved from a Monthly Docket Issue
}

// ----------------------------------------------------------------------------
// NationStates-Style Monthly Docket (4 Issues: Crime, Pollution, Land Value, Traffic)
// & Monthly "State of the City" Summary Report
// ----------------------------------------------------------------------------

export interface DocketPresetOption {
  id: string;
  stanceLabel: string; // e.g., "Tough on Crime", "Community Reform", "Privatized Enforcement"
  optionTitle: string;
  description: string;
  capitalCost: number; // Positive = costs Capital (e.g. 15..20); 0 = Free (0 CAP); Negative = GAINS Capital (e.g. -5 = +5 CAP GAIN)
  policyEffect: AICustomPolicyResponse; // Pre-clamped mathematical impact
}

export interface MonthlyDocketIssue {
  id: string;
  turn: number;
  pillar: CivicPillar; // "crime" | "pollution" | "land_value" | "traffic" | "education" | "health"
  title: string;
  briefing: string;
  status: "PENDING" | "RESOLVED";
  resolvedWithLabel?: string;
  isFollowUpArc?: boolean; // True when this issue is a direct sequel/consequence of a past enacted law
  parentLawTitle?: string; // Name of the enacted law this issue builds upon
  influencedByLawTitle?: string; // Active law that collides with or shapes this issue
  domainTag?: string; // Randomized civic domain seed label
  isSponsoredBill?: boolean; // True when promoted from Turn N-1 Sponsored Custom Bill
  isAIGenerated?: boolean; // True when synthesized by WebLLM
  presets: [DocketPresetOption, DocketPresetOption, DocketPresetOption];
}

export interface SponsoredBillProposal {
  id: string;
  introducedTurn: number;
  rawProposalText: string;
  formalTitle: string;
  targetPillar: CivicPillar;
  briefing: string;
  publicDebateSummary?: string;
  metroChronicleDebate?: string;
  streetlightDebate?: string;
  presets: [DocketPresetOption, DocketPresetOption, DocketPresetOption];
}

export interface PublicHearingDebateEntry {
  billTitle: string;
  analysis: string;
  metroChronicleTake: string;
  streetlightTake: string;
}

export interface TurnProcessingState {
  isOpen: boolean;
  pct: number;
  stepLabel: string;
  subLabel: string;
}

export interface PressWireFlash {
  id: string;
  title: string;
  story: string;
  budgetText: string;
}

export interface PillarReportEntry {
  metric: HeatmapMetric;
  label: string;
  currentValue: number;
  previousValue: number;
  delta: number; // currentValue - previousValue
  assessment: string; // 1-sentence status assessment
}

export interface MonthlyCityReport {
  turn: number;
  month: number;
  year: number;
  pillars: Record<HeatmapMetric, PillarReportEntry>;
  fiscalRecap: {
    lastMonthNet: number;
    reserves: number;
    revenue: number;
    expenses: number;
    policyRecurringNet: number;
    summaryText: string;
  };
  tensionRecap: {
    tensions: TensionMetersState;
    tensionDeltas: TensionMetersState;
    summaryText: string;
  };
  politicalCapitalRecap: {
    previousCapital: number;
    currentCapital: number;
    baseStipend: number; // +20 base monthly regeneration
    mandateBonus: number; // +10 if overallApproval >= 50%, else 0
    totalGained: number;
    summaryText: string;
  };
  staffRecap: string[];
}

export interface FrontPageBroadsheet {
  turn: number;
  month: number;
  year: number;
  leadHeadline: string;
  subhead: string;
  humanScaleRipple: string;
  falloutParagraphs: string[];
  crisesParagraphs: string[];
  residentQuote?: string;
  winnersBox: {
    group: string;
    summary: string;
    deltaText: string;
  };
  losersBox: {
    group: string;
    summary: string;
    deltaText: string;
  };
  metroChronicleTake: string;
  streetlightTake: string;
  onTheHorizonWarning: string;
  publicHearingsDebate?: PublicHearingDebateEntry[];
  isAIGenerated: boolean;
}

export interface AggregatedLawRecord {
  id: string;
  title: string;
  kind: "docket" | "executive_order" | "doctrine";
  sourceLabel: string;
  enactedTurn: number;
  repealedTurn: number | null;
  monthsActive: number;
  monthlyFiscalDelta: number;
  cumulativeFiscalNet: number;
  metricDeltasPerMonth: Partial<Record<CivicPillar, number>>;
  cumulativeMetricImpact: Partial<Record<CivicPillar, number>>;
  demographicDeltas: Array<{ demographic: Demographic; change: number }>;
  triggeredFallout: string[];
  triggeredFollowUpArcs: string[];
}

// ----------------------------------------------------------------------------
// 3. Core Simulation Domain Structures
// ----------------------------------------------------------------------------

/**
 * Step 5.3: The Turn 24 Election Phase (Campaign Mini-Game)
 */
export type CampaignActionType = "grassroots_rally" | "smear_campaign" | "media_blitz";

export interface AIChallengerState {
  name: string;
  partyTag: string;
  pollingPct: number; // Base 40% - 60% inversely correlated with player's Overall Approval
}

export interface ElectionCampaignState {
  termNumber: number; // Starts at 1, increments each time the player wins re-election
  warChest: number; // 10% of positive Treasury surplus + Corporate culture vector bonus ($25k per point)
  playerPollingPct: number; // Starts from player's Overall Approval
  challenger: AIChallengerState;
  actionLog: string[];
  showVictoryModal: boolean;
}

/**
 * Time & Election Cycle
 * 1 Turn = 1 Month.
 */
export type CampaignTermMode = "single_24" | "two_term_48" | "endless";

export interface HallOfFameLawEntry {
  lawName: string;
  verdictTag: "HALL OF FAME" | "HALL OF INFAMY" | "CURIOUS FOOTNOTE";
  cumulativeSummary: string;
  historianNote: string;
}

export interface LegacyChronicleState {
  isOpen: boolean;
  outcome: "victory" | "retirement" | "recall" | "bankruptcy" | "defeat";
  headlineTitle: string;
  toneCategory: "triumph" | "chaos" | "collapse" | "pragmatic";
  encyclopediaEntry: string;
  toneAdaptiveVerdict: string;
  hallOfFameAudit: HallOfFameLawEntry[];
  isGeneratingEntry: boolean;
}

export interface TimeState {
  turn: number; // 1-indexed monthly counter within current term (1..24)
  totalTurnsPlayed: number; // Cumulative months across all terms
  maxTurns: number | null; // 24 for single_24, 48 for two_term_48, null for endless
  month: number; // 1..12
  year: number; // e.g., 2026
  monthsUntilElection: number; // Counts down to 0 (24-month cycle)
  currentOffice: PoliticalOffice;
  campaignTermMode: CampaignTermMode;
}

/**
 * Treasury & Fiscal Sliders
 * Tracks cash reserves, tax rates, department budgets, and active policy costs.
 */
export interface DepartmentBudgets {
  publicSafety: number; // Monthly spend ($) - suppresses Crime
  infrastructure: number; // Monthly spend ($) - suppresses Traffic, boosts Land Value
  environmental: number; // Monthly spend ($) - suppresses Pollution
  socialServices: number; // Monthly spend ($) - boosts Working Class, reduces Unrest
}

export interface TaxRates {
  incomeTaxPct: number; // 0 - 15% (Impacts Working Class & Wealthy)
  corporateTaxPct: number; // 0 - 20% (Impacts Business & GDP growth)
  propertyTaxPct: number; // 0 - 5% (Impacts Wealthy & Land Value)
}

export interface TreasuryState {
  reserves: number; // Current cash on hand ($). Negative = Debt
  monthlyRevenue: number; // Calculated each turn from population, GDP, and tax rates
  monthlyExpenses: number; // Sum of department budgets + debt interest + custom policies
  monthlyNet: number; // monthlyRevenue - monthlyExpenses
  customPolicyRecurringNet: number; // Accumulated monthly_change from enacted custom policies
  taxRates: TaxRates;
  departments: DepartmentBudgets;
}

/**
 * Voter Sentiment
 * Tracks approval per demographic (0-100) and weighted aggregate approval (0-100).
 */
export interface DemographicBreakdown {
  approval: number; // Clamped 0 - 100
  populationShare: number; // Weights summing to 1.0 (e.g., 0.45, 0.15, 0.20, 0.20)
}

export interface VoterSentimentState {
  overallApproval: number; // Weighted sum of demographic approvals (0 - 100)
  politicalCapital: number; // Action currency (0 - 100), earned via high approval
  demographics: Record<Demographic, DemographicBreakdown>;
}

/**
 * Legacy & Growth Metrics
 * Tracks tangible territorial expansion and ideological scoring to categorize management style.
 */
export interface IdeologicalAxis {
  ecologyScore: number; // Accumulates from green spending & low pollution
  austerityScore: number; // Accumulates from budget surpluses & low taxes
  populistScore: number; // Accumulates from social spending & working_class approval
  corporatistScore: number; // Accumulates from business approval & land_value growth
  authorityScore: number; // Accumulates from public safety spending & low crime
}

export interface LegacyMetricsState {
  population: number; // Total citizens
  populationTier: 1 | 2 | 3 | 4 | 5; // Drives 2D Blueprint footprint boundary expansion
  gdpMillions: number; // Territory economic output ($M)
  archetype: LegacyArchetype; // Computed dominant management style
  ideology: IdeologicalAxis;
}

/**
 * Tension Meters (0 - 100 Limits)
 * When any tension meter (Crime, Transit, Sanitation) hits 100, advanceTurn()
 * pauses and triggers generateCrisis(triggeredMeter, currentState).
 */
export type TensionKey = "Crime" | "Transit" | "Sanitation";

export const VALID_TENSION_KEYS: readonly TensionKey[] = [
  "Crime",
  "Transit",
  "Sanitation",
] as const;

export type TensionMetersState = Record<TensionKey, number>; // Strictly clamped 0 - 100

/**
 * Grid System (Pure Visual Data Output)
 * Includes a 10x10 Tile Grid (`tiles[row][col]`) populated by `initializeCity()`
 * for procedural Turn 1 disasters ("The Inherited Mess"), plus polygonal district sectors.
 * No micro-building, no pathfinding, no player placement.
 */
export type DistrictRuleType =
  | "Enterprise Tax Zone"
  | "Car-Free Boulevard"
  | "24/7 Patrol Surge";

export interface MapFloatingPopup {
  id: string;
  row: number;
  col: number;
  text: string;
  color: string;
  createdAt: number;
}

export interface GridTile {
  row: number; // 0..9
  col: number; // 0..9
  id: string; // e.g., "tile-3-4"
  zoneLabel: string; // e.g., "Core Industrial [3,4]"
  unlockedAtTier: 1 | 2 | 3 | 4 | 5;
  metrics: Record<HeatmapMetric, number>; // Clamped 0 - 100
  activeWarning: TensionKey | null;
  activeRule?: DistrictRuleType | null;
}

export type DistrictProfile =
  | "downtown_core"
  | "industrial_corridor"
  | "residential_sprawl"
  | "waterfront_commiercial"
  | "greenbelt_periphery"
  | "civic_center";

export interface DistrictNode {
  id: string;
  name: string;
  profile: DistrictProfile;
  unlockedAtTier: 1 | 2 | 3 | 4 | 5; // Controls footprint boundary visibility on the canvas
  polygonPoints: number[]; // Flat [x1, y1, x2, y2, ...] vector coordinates for react-konva
  labelCenter: { x: number; y: number };
  // Sensitivity multipliers so global policy changes affect districts organically
  sensitivity: Record<HeatmapMetric, number>;
  // Current district heatmap values (Strictly clamped 0 - 100)
  metrics: Record<HeatmapMetric, number>;
  activeWarning: TensionKey | null; // Renders SVG warning overlay if district exceeds threshold
}

export interface GridSystemState {
  startingArchetype: StartingArchetype | string;
  startingBriefing: string;
  customDistrictLabels?: [string, string, string, string];
  tiles: GridTile[][]; // 10x10 2D array [row 0..9][col 0..9]
  globalAverages: Record<HeatmapMetric, number>; // Territory-wide 0 - 100 averages
  activeHeatmapLayer: HeatmapMetric; // Currently selected choropleth view
  districts: DistrictNode[];
}

/**
 * Step 4.2: The Appointee Engine (Staff Hiring & Scapegoats)
 * DepartmentHeads for PoliceChief, TransitDirector, and SanitationHead.
 */
export type AppointeeRoleKey =
  | "PoliceChief"
  | "TransitDirector"
  | "SanitationHead"
  | "EducationDirector"
  | "HealthDirector";

export type AppointeeAlignment = "Corporate" | "Labor" | "Law & Order";

export const VALID_APPOINTEE_ALIGNMENTS: readonly AppointeeAlignment[] = [
  "Corporate",
  "Labor",
  "Law & Order",
] as const;

export interface AppointeeNPC {
  id: string;
  name: string;
  competence: number; // 0 - 100 (>50 gives 0.5% upkeep discount per point; <50 applies 0.5% penalty per point)
  loyalty: number; // 0 - 100 (>70 goes quietly when fired; <40 leaks to press for -10% overallApproval)
  alignment: AppointeeAlignment;
}

export type DepartmentHeadsState = Record<AppointeeRoleKey, AppointeeNPC | null>;

// ----------------------------------------------------------------------------
// 4. Vibe Feed & Crisis Stubs (Steps 2, 3, 4.3)
// ----------------------------------------------------------------------------

export type MediaOutlet = "The Metro Chronicle" | "The Streetlight";

export interface VibeFeedEntry {
  id: string;
  turn: number;
  headline: string;
  outlet?: MediaOutlet;
  chronicleSpin?: string; // Pro-business / establishment slant ("The Metro Chronicle")
  streetlightSpin?: string; // Labor / grassroots / populist slant ("The Streetlight")
  category: "policy" | "economy" | "tension" | "election" | "crisis" | "staff";
  unintendedConsequence?: string;
}

// ----------------------------------------------------------------------------
// Phase 2 (Step 3/4): Live Press & Citizen Town Hall Q&A + Custom City Scenario
// ----------------------------------------------------------------------------

export interface TownHallQuestion {
  id: string;
  speaker: string;
  role: string;
  question: string;
}

export type TownHallGrade = "Authentic" | "Inspiring" | "Evasive" | "Tone-Deaf";

export interface TownHallGradingResult {
  grade: TownHallGrade;
  commentary: string;
  approval_change: number; // Clamped [-8, +10]
  capital_change: number; // Clamped [-10, +15]
}

export interface TownHallSessionState {
  isOpen: boolean;
  isLoading: boolean;
  questions: TownHallQuestion[];
  usedThisTurn: boolean;
  lastResult: TownHallGradingResult | null;
}

export interface CustomCityScenarioPayload {
  scenario_title: string;
  starting_briefing: string;
  treasury_reserves: number; // Clamped [-3,000,000, +6,000,000]
  base_crime: number; // Clamped [15, 90]
  base_pollution: number; // Clamped [15, 90]
  base_land_value: number; // Clamped [15, 90]
  base_traffic: number; // Clamped [15, 90]
  crime_tension: number; // Clamped [10, 90]
  transit_tension: number; // Clamped [10, 90]
  sanitation_tension: number; // Clamped [10, 90]
  district_names: [string, string, string, string]; // 4 custom cluster names
}

// STRICT BOUNDARIES: The LLM must output EXACTLY this JSON structure for a Crisis.
export interface AICrisisChoice {
  option_label: string; // The text on the button the player clicks
  budget_impact: {
    monthly_change: number; // ENGINE ENFORCEMENT: Clamp between -$250k and +$250k
  };
  heatmap_modifiers: Array<{
    metric: HeatmapMetric; // MUST be from the existing HeatmapMetric enum
    change: number; // ENGINE ENFORCEMENT: Clamp between -30 and +30
  }>;
  demographic_approval: Array<{
    demographic: Demographic; // MUST be from the existing Demographic enum
    change: number; // ENGINE ENFORCEMENT: Clamp between -20 and +20
  }>;
}

export interface AICrisisResponse {
  crisis_name: string;
  description: string;
  choices: Array<AICrisisChoice>; // Array MUST contain exactly 3 choices
}

export type CrisisResolutionChoice = AICrisisChoice;
export type AICrisisEventResponse = AICrisisResponse;

// STRICT BOUNDARIES: The LLM must evaluate if the text actually attempts to solve the specific crisis.
export interface AICrisisValidationResponse {
  is_valid_solution: boolean; // False if the player types nonsense, magic, or something completely unrelated to the crisis.
  rejection_reason: string | null; // If false, a short, in-universe explanation of why the City Council/Reality rejected it (Max 100 chars).

  // If true, generate the clamped math just like the Custom Policy Engine:
  budget_impact?: {
    monthly_change: number; // ENGINE ENFORCEMENT: Clamp between -$250k and +$250k
  };
  heatmap_modifiers?: Array<{
    metric: HeatmapMetric;
    change: number; // ENGINE ENFORCEMENT: Clamp between -30 and +30
  }>;
  demographic_approval?: Array<{
    demographic: Demographic;
    change: number; // ENGINE ENFORCEMENT: Clamp between -20 and +20
  }>;
}

/**
 * Bonus Step 4: WebLLM Initialization & Weight Download Progress State (Stored in Zustand)
 */
export interface WebLLMProgressState {
  isReady: boolean;
  isLoading: boolean;
  progressPct: number; // 0 - 100
  text: string;
  downloadedBytes: number;
  totalBytes: number;
  timeElapsedSec: number;
  webGPUSupported: boolean;
  error: string | null;
}

// ----------------------------------------------------------------------------
// Feature Expansion: Month-to-Month Historical Metric Tracking,
// 2-Axis Political Compass & Save/Load Slots
// ----------------------------------------------------------------------------

export interface MonthlyHistorySnapshot {
  turn: number;
  month: number;
  year: number;
  treasury: number;
  approval: number;
  crimeAvg: number;
  pollutionAvg: number;
  landValueAvg: number;
  trafficAvg: number;
  crimeTension: number;
  transitTension: number;
  sanitationTension: number;
}

export interface PoliticalCompassProfile {
  economicAxis: number; // Clamped -100 (Interventionist/Socialist) to +100 (Free-Market/Corporatist)
  governanceAxis: number; // Clamped -100 (Technocratic/Libertarian) to +100 (Authoritarian/Law & Order)
  leaderTitle: string; // e.g., "Green Technocrat", "Iron-Fisted Populist", "Chamber of Commerce Darling", "Tax-and-Spend Reformer", "Pragmatic Centrist"
  editorialBlurb: string; // 2-sentence editorial blurb summarizing how local pundits view their governing style
}

export interface SaveSlotMetadata {
  slotId: string; // "governor_autosave" | "governor_slot_1" | "governor_slot_2" | "governor_slot_3"
  savedAtIso: string;
  startingArchetype: StartingArchetype | string;
  turn: number;
  month: number;
  year: number;
  currentOffice: PoliticalOffice;
  overallApproval: number;
  treasuryReserves: number;
  leaderTitle: string;
}

// ----------------------------------------------------------------------------
// Phase 2 (Step 1/4): Anti-Micromanagement Broad Governing Doctrines
// ----------------------------------------------------------------------------

export type FiscalDoctrine =
  | "Austerity & Tax Cuts"
  | "Balanced Budget"
  | "Public Investment";

export type JusticeDoctrine =
  | "Broken Windows Enforcement"
  | "Community Diversion"
  | "Civil Liberties First";

export type UrbanDoctrine =
  | "Deregulated Growth"
  | "Smart Zoning"
  | "Aggressive Green Transition";

export interface PolicyDoctrinesState {
  fiscal: FiscalDoctrine;
  justice: JusticeDoctrine;
  urban: UrbanDoctrine;
}

export interface ActiveCrisisModal {
  tensionTriggered: TensionKey | "Wildcard";
  isWildcard?: boolean;
  crisis_name: string;
  description: string;
  isGenerating: boolean;
  choices: AICrisisChoice[] | null;
}

// ----------------------------------------------------------------------------
// 5. Complete Headless Store Interface
// ----------------------------------------------------------------------------

export interface GameState {
  time: TimeState;
  treasury: TreasuryState;
  voterSentiment: VoterSentimentState;
  legacy: LegacyMetricsState;
  culturePoints: CulturePointsState; // Step 5.2: Alignment Vector (Austerity, Progressive, Corporate)
  managerTitle: LegacyArchetype; // Step 5.2: Evaluated Manager Title displayed in Top Scoreboard
  failTrackers: FailStateTracking; // Step 5.1: Consecutive turn counters for Bankruptcy & Recall
  wildcardCooldown: number; // Bonus Step: 6-turn cooldown counter for Exogenous Wildcard Events
  isElectionMode: boolean; // Step 5.3: Toggled true when Turn === 24
  electionCampaign: ElectionCampaignState; // Step 5.3: WarChest, AI_Challenger & Polling state
  tensions: TensionMetersState;
  grid: GridSystemState;
  mapPopups: MapFloatingPopup[]; // Phase 2 (Step 2/4): Floating animated map pop-up badges
  doctrines: PolicyDoctrinesState; // Phase 2: 3 Broad Governing Doctrines replacing granular sliders
  departmentHeads: DepartmentHeadsState;
  interviewPool: Record<AppointeeRoleKey, AppointeeNPC[] | null>;
  monthlyDocket: MonthlyDocketIssue[]; // 4 active Policy Issues (1 per HeatmapMetric pillar)
  pastIssueTitles: string[]; // Anti-repetition memory of all previously generated issue titles
  seenTopicKeywords: string[]; // Cross-campaign banned topic/industry keywords
  usedFallbackTemplateIds: string[]; // Tracks deterministic template IDs already shown so offline turns never repeat
  isGeneratingDocket: boolean; // True while WebLLM is asynchronously drafting/updating the 4 monthly issues
  civicServices: {
    education: number; // 0-100 (higher is better)
    health: number; // 0-100 (higher is better)
    educationDelta: number;
    healthDelta: number;
  };
  cityReport: MonthlyCityReport; // Structured "State of the City" Monthly Summary Report
  frontPageBroadsheet: FrontPageBroadsheet; // Center-stage Front-Page Monthly Broadsheet
  isGeneratingBroadsheet: boolean;
  monthlyHistory: MonthlyHistorySnapshot[]; // Month-to-month metric history for sparklines/trend charts
  politicalCompass: PoliticalCompassProfile; // 2-Axis Political Compass & Leadership Profile
  showCityReportModal: boolean;
  showDocketModal: boolean;
  showCabinetModal: boolean;
  showSaveLoadModal: boolean;
  centerDeskTab: "dispatch" | "docket";
  activeDocketPillar: CivicPillar;
  publicAddressUsedThisTurn: boolean; // Active "PUBLIC ADDRESS (+20 CAPITAL)" button usable once per month ($250K cost)
  townHall: TownHallSessionState; // Phase 2 (Step 3/4): Live Press & Citizen Town Hall Q&A
  legacyChronicle: LegacyChronicleState; // Phase 2 (Step 4/4): End-of-Term Historical Storybook Chronicle
  enactedPolicies: ActiveCustomPolicy[];
  enactedLawsHistory: AggregatedLawRecord[]; // Cumulative background law & doctrine aggregation across entire campaign
  pendingSponsoredBills: SponsoredBillProposal[]; // Turn N sponsored bills queued for Turn N+1 vote
  turnTransitionProgress: TurnProcessingState; // Synchronous between-turn AI overlay
  pressWireFlash: PressWireFlash | null; // Immediate satirical Press Wire Flash on policy enactment
  news_ticker: VibeFeedEntry[]; // Step 4.3: Primary Vibe Feed news_ticker array
  vibeFeed: VibeFeedEntry[]; // Synchronized alias for news_ticker
  isTurnPausedForCrisis: boolean;
  activeCrisis: ActiveCrisisModal | null;
  crisisAttemptsRemaining: number; // Bonus Step 2: Defaults to 2 per crisis; hitting 0 forces Option 3 Gridlock
  crisisRejectionReason: string | null; // Bonus Step 2: In-universe rejection reason (Max 100 chars)
  webllmProgress: WebLLMProgressState; // Bonus Step 4: Stored in Zustand for the terminal LoadingScreen
  gameOverReason: string | null;
  gameOverTitle: string | null;

  // Actions
  initializeCity: (
    forcedArchetype?: StartingArchetype,
    termMode?: CampaignTermMode
  ) => void;
  initializeCustomCityScenario: (
    scenario: CustomCityScenarioPayload,
    termMode?: CampaignTermMode
  ) => void;
  retireAndReviewLegacy: () => void;
  setLegacyChronicleEntry: (entryText: string) => void;
  setLegacyChroniclePostMortem: (payload: {
    toneCategory: LegacyChronicleState["toneCategory"];
    encyclopediaEntry: string;
    toneAdaptiveVerdict: string;
    hallOfFameAudit: HallOfFameLawEntry[];
  }) => void;
  closeLegacyChronicle: () => void;
  setFrontPageBroadsheet: (broadsheet: FrontPageBroadsheet, turn: number) => void;
  openTownHallSession: () => void;
  closeTownHallSession: () => void;
  setTownHallQuestions: (questions: TownHallQuestion[]) => void;
  applyTownHallGradingResult: (
    result: TownHallGradingResult,
    questionText: string,
    playerAnswer: string
  ) => void;
  setWebLLMProgress: (partial: Partial<WebLLMProgressState>) => void;
  advanceTurn: () => Promise<void> | void;
  sponsorCustomBill: (proposal: SponsoredBillProposal) => boolean;
  dismissPressWireFlash: () => void;
  setShowCityReportModal: (visible: boolean) => void;
  setShowDocketModal: (visible: boolean, focusPillar?: CivicPillar) => void;
  setShowCabinetModal: (visible: boolean) => void;
  setCenterDeskTab: (tab: "dispatch" | "docket", focusPillar?: CivicPillar) => void;
  setShowSaveLoadModal: (visible: boolean) => void;
  saveGameToSlot: (slotKey: string) => boolean;
  loadGameFromSlot: (slotKey: string) => boolean;
  exportSaveJsonString: () => string;
  importSaveJsonString: (jsonStr: string) => boolean;
  resolveDocketIssuePreset: (issueId: string, presetIndex: 0 | 1 | 2) => void;
  resolveDocketIssueCustom: (
    issueId: string,
    clampedPolicy: AICustomPolicyResponse,
    rawPlayerText: string
  ) => void;
  replaceDocketIssueWithAI: (issue: MonthlyDocketIssue) => void;
  setMonthlyDocketFromAI: (issues: MonthlyDocketIssue[], turn: number) => void;
  setIsGeneratingDocket: (isGenerating: boolean) => void;
  repealEnactedPolicy: (policyId: string) => void;
  holdPublicAddress: () => void;
  executeCampaignAction: (actionType: CampaignActionType) => void;
  holdElection: () => void;
  dismissElectionVictoryModal: () => void;
  setTaxRate: (taxType: keyof TaxRates, percentage: number) => void;
  setDepartmentBudget: (dept: keyof DepartmentBudgets, amount: number) => void;
  setPolicyDoctrine: <K extends keyof PolicyDoctrinesState>(
    category: K,
    stance: PolicyDoctrinesState[K]
  ) => void;
  enactDistrictRule: (row: number, col: number, rule: DistrictRuleType) => void;
  setActiveHeatmapLayer: (metric: HeatmapMetric) => void;
  fireDepartmentHead: (department: AppointeeRoleKey) => void;
  generateInterviewCandidates: (department: AppointeeRoleKey) => void;
  hireDepartmentHead: (department: AppointeeRoleKey, candidate: AppointeeNPC) => void;
  pushNewsTickerHeadline: (
    headline: string,
    category?: VibeFeedEntry["category"],
    unintendedConsequence?: string
  ) => void;
  applyClampedCustomPolicy: (
    policy: AICustomPolicyResponse,
    metadata?: {
      sourceLabel?: string;
      originalPromptText?: string;
      issueTitle?: string;
      capitalCostOverride?: number;
      isExecutiveOrder?: boolean;
    }
  ) => void;
  setGeneratedCrisisEvent: (crisisEvent: AICrisisResponse) => void;
  applyClampedCrisisChoice: (
    clampedChoice: AICrisisChoice,
    triggeredMeter: TensionKey | "Wildcard",
    crisisName: string
  ) => void;
  recordFailedCustomCrisisAttempt: (rejectionReason: string) => void;
  resolveCrisisChoice: (choiceIndex: 0 | 1 | 2) => void;
  clearCrisisPause: () => void;
  resetGame: () => void;
}
