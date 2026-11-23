// ============================================================================
// GOVERNOR — Step 2: Browser WebLLM Service & parseAndApplyCustomPolicy()
// Uses @mlc-ai/web-llm to run Llama-3-8B-Instruct-q4f32_1-MLC locally via WebGPU,
// tracks live weight download progress ("Downloading AI Weights..."), and
// passes LLM responses through the clamping middleware before touching Zustand.
// ============================================================================

import * as webllm from "@mlc-ai/web-llm";
import {
  AICustomPolicyResponse,
  CivicPillar,
  CustomCityScenarioPayload,
  DocketPresetOption,
  FrontPageBroadsheet,
  GameState,
  HallOfFameLawEntry,
  LegacyChronicleState,
  MonthlyDocketIssue,
  PublicHearingDebateEntry,
  SponsoredBillProposal,
  TownHallGrade,
  TownHallGradingResult,
  TownHallQuestion,
  VALID_CIVIC_PILLARS,
  VALID_DEMOGRAPHICS,
  VALID_HEATMAP_METRICS,
} from "../types/simulation";
import { useGameStore } from "../store/useGameStore";
import {
  AI_GUARDRAIL_LIMITS,
  buildGridlockedFallbackPolicy,
  normalizeCivicPillar,
  parseAndClampAIPolicyResponse,
  sanitizeAndExtractJsonObject,
} from "./aiGuardrails";

// ----------------------------------------------------------------------------
// 1. Model Configuration & UI Loading State Telemetry
// ----------------------------------------------------------------------------

export const DEFAULT_WEBLLM_MODEL_ID = "Llama-3-8B-Instruct-q4f32_1-MLC";
export const ESTIMATED_MODEL_TOTAL_BYTES = 2_800_000_000; // 2.8 GB

export interface WebLLMStatus {
  isReady: boolean;
  isLoading: boolean;
  progressPct: number;
  statusText: string;
  downloadedBytes: number;
  totalBytes: number;
  activeModelId: string | null;
  webGPUSupported: boolean;
  error: string | null;
}

/**
 * Extracts or computes downloadedBytes and totalBytes from a WebLLM InitProgressReport
 * so the terminal LoadingScreen can display exact byte progress (e.g., "1.2GB / 2.8GB").
 */
function parseBytesFromProgressReport(report: webllm.InitProgressReport): {
  downloadedBytes: number;
  totalBytes: number;
} {
  const ratio = Math.max(0, Math.min(1, report.progress ?? 0));
  const text = report.text || "";

  // Attempt to parse explicit MB/GB numbers if WebLLM embeds them in report.text
  const mbMatch = text.match(/(\d+(?:\.\d+)?)\s*MB\s*\/\s*(\d+(?:\.\d+)?)\s*MB/i);
  if (mbMatch) {
    return {
      downloadedBytes: Math.round(parseFloat(mbMatch[1]) * 1_000_000),
      totalBytes: Math.round(parseFloat(mbMatch[2]) * 1_000_000),
    };
  }

  const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*GB\s*\/\s*(\d+(?:\.\d+)?)\s*GB/i);
  if (gbMatch) {
    return {
      downloadedBytes: Math.round(parseFloat(gbMatch[1]) * 1_000_000_000),
      totalBytes: Math.round(parseFloat(gbMatch[2]) * 1_000_000_000),
    };
  }

  return {
    downloadedBytes: Math.round(ratio * ESTIMATED_MODEL_TOTAL_BYTES),
    totalBytes: ESTIMATED_MODEL_TOTAL_BYTES,
  };
}

export type WebLLMProgressListener = (status: WebLLMStatus) => void;

export interface PolicyTranslationResult {
  policy: AICustomPolicyResponse;
  attemptsUsed: number;
  usedFallback: boolean;
  validationWarnings: string[];
}

// ----------------------------------------------------------------------------
// 2. System Prompt Builder Injecting currentState (Budget & Heatmaps)
// ----------------------------------------------------------------------------

export function buildCustomPolicySystemPrompt(
  currentState: Pick<
    GameState,
    "time" | "treasury" | "voterSentiment" | "legacy" | "grid"
  >
): string {
  return `You are the Legislative Simulation Compiler for the political management RPG "Governor".

CURRENT TERRITORY STATE:
- Office: ${currentState.time.currentOffice} (Turn ${currentState.time.turn}, Month ${currentState.time.month}/${currentState.time.year})
- Population: ${currentState.legacy.population.toLocaleString()} (Tier ${currentState.legacy.populationTier})
- Treasury Reserves: $${currentState.treasury.reserves.toLocaleString()}
- Monthly Revenue: $${currentState.treasury.monthlyRevenue.toLocaleString()} | Monthly Expenses: $${currentState.treasury.monthlyExpenses.toLocaleString()} | Monthly Net: $${currentState.treasury.monthlyNet.toLocaleString()}
- Overall Approval: ${currentState.voterSentiment.overallApproval}% (Political Capital: ${currentState.voterSentiment.politicalCapital}/100)
- Demographic Approvals: Working Class=${Math.round(currentState.voterSentiment.demographics.working_class.approval)}%, Wealthy=${Math.round(currentState.voterSentiment.demographics.wealthy.approval)}%, Business=${Math.round(currentState.voterSentiment.demographics.business.approval)}%, Environmentalists=${Math.round(currentState.voterSentiment.demographics.environmentalists.approval)}%
- Current Heatmaps (0-100): Crime=${currentState.grid.globalAverages.crime}, Pollution=${currentState.grid.globalAverages.pollution}, Land Value=${currentState.grid.globalAverages.land_value}, Traffic=${currentState.grid.globalAverages.traffic}

INSTRUCTIONS:
Evaluate the player's proposed policy and return STRICTLY a valid JSON object matching the AICustomPolicyResponse schema below. Do NOT include markdown fences or extra keys:

{
  "policy_name": "string (Max ${AI_GUARDRAIL_LIMITS.POLICY_NAME_MAX_LEN} chars)",
  "vibe_feed_headline": "string (Max ${AI_GUARDRAIL_LIMITS.HEADLINE_MAX_LEN} chars)",
  "budget_impact": {
    "monthly_change": number (integer between -100000 and 100000)
  },
  "heatmap_modifiers": [
    {
      "metric": "crime" | "pollution" | "land_value" | "traffic" | "education" | "health",
      "change": number (integer between -20 and 20)
    }
  ],
  "demographic_approval": [
    {
      "demographic": "working_class" | "wealthy" | "business" | "environmentalists",
      "change": number (integer between -15 and 15)
    }
  ],
  "unintended_consequence_trigger": "None" or a short 1-sentence realistic secondary side-effect description (NEVER output the literal word "string"),
  "outcome_story": "string (2-3 hilarious, satirical NationStates-style paragraphs highlighting absurd loopholes, ironic citizen behavior, and colorful local quotes resulting from this exact wording)"
}

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', a NEGATIVE change (e.g., -15) REDUCES the problem and helps the city, while a POSITIVE change (e.g., +15) WORSENS the problem. For 'land_value' and 'demographic_approval', a POSITIVE change (+15) improves value/approval, and a NEGATIVE change (-15) reduces it.
CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;
}

// ----------------------------------------------------------------------------
// 3. Singleton WebLLM Engine Service (CreateMLCEngine)
// ----------------------------------------------------------------------------

class WebLLMService {
  private engine: webllm.MLCEngineInterface | null = null;
  private status: WebLLMStatus = {
    isReady: false,
    isLoading: false,
    progressPct: 0,
    statusText: "WebGPU AI Engine Standby",
    downloadedBytes: 0,
    totalBytes: ESTIMATED_MODEL_TOTAL_BYTES,
    activeModelId: null,
    webGPUSupported: typeof navigator !== "undefined" && "gpu" in navigator,
    error: null,
  };
  private listeners = new Set<WebLLMProgressListener>();

  public getStatus(): WebLLMStatus {
    return { ...this.status };
  }

  public subscribe(listener: WebLLMProgressListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateStatus(
    partial: Partial<WebLLMStatus>,
    timeElapsedSec = 0
  ): void {
    this.status = { ...this.status, ...partial };
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }

    // Bonus Step 4: Synchronize progress directly into Zustand (text, downloadedBytes, totalBytes)
    useGameStore.getState().setWebLLMProgress({
      isReady: snapshot.isReady,
      isLoading: snapshot.isLoading,
      progressPct: snapshot.progressPct,
      text: snapshot.statusText,
      downloadedBytes: snapshot.downloadedBytes,
      totalBytes: snapshot.totalBytes,
      timeElapsedSec,
      webGPUSupported: snapshot.webGPUSupported,
      error: snapshot.error,
    });
  }

  /**
   * Initializes CreateMLCEngine with Llama-3-8B-Instruct-q4f32_1-MLC and passes
   * initProgressCallback to stream text, downloadedBytes, and totalBytes into Zustand.
   */
  public async initializeEngine(
    modelId: string = DEFAULT_WEBLLM_MODEL_ID
  ): Promise<boolean> {
    if (this.engine && this.status.isReady) {
      return true;
    }

    if (typeof navigator === "undefined" || !("gpu" in navigator)) {
      this.updateStatus({
        isReady: false,
        isLoading: false,
        progressPct: 100,
        downloadedBytes: ESTIMATED_MODEL_TOTAL_BYTES,
        totalBytes: ESTIMATED_MODEL_TOTAL_BYTES,
        webGPUSupported: false,
        statusText: "WebGPU unavailable — fallback council compiler active.",
        error: "WebGPU not supported in this browser.",
      });
      return false;
    }

    this.updateStatus({
      isLoading: true,
      error: null,
      progressPct: 1,
      downloadedBytes: 0,
      totalBytes: ESTIMATED_MODEL_TOTAL_BYTES,
      statusText: `Downloading Neural Weights (${modelId})...`,
    });

    try {
      const initConfig = {
        appConfig: {
          ...webllm.prebuiltAppConfig,
          useIndexedDBCache: true,
        },
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const pct = Math.round((report.progress ?? 0) * 100);
          const { downloadedBytes, totalBytes } =
            parseBytesFromProgressReport(report);

          this.updateStatus(
            {
              progressPct: pct,
              downloadedBytes,
              totalBytes,
              statusText:
                report.text || `Downloading Neural Weights... (${pct}%)`,
            },
            Math.round(report.timeElapsed ?? 0)
          );
        },
      };

      this.engine =
        typeof Worker !== "undefined"
          ? await webllm.CreateWebWorkerMLCEngine(
              new Worker(new URL("../workers/webllmWorker.ts", import.meta.url), {
                type: "module",
              }),
              modelId,
              initConfig
            )
          : await webllm.CreateMLCEngine(modelId, initConfig);

      this.updateStatus({
        isReady: true,
        isLoading: false,
        progressPct: 100,
        downloadedBytes: ESTIMATED_MODEL_TOTAL_BYTES,
        totalBytes: ESTIMATED_MODEL_TOTAL_BYTES,
        activeModelId: modelId,
        statusText: `WebLLM Active (${modelId})`,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.updateStatus({
        isReady: false,
        isLoading: false,
        progressPct: 100,
        error: message,
        statusText: "AI Weight Load Failed — fallback mode active.",
      });
      return false;
    }
  }

  public isEngineReady(): boolean {
    return Boolean(this.engine && this.status.isReady);
  }

  /**
   * Executes a low-temperature chat completion against the local WebGPU model.
   * NOTE: `response_format` is intentionally omitted to avoid the WebLLM XGrammar
   * WASM `GrammarMatcherInitError: Cannot pass non-string to std::string` crash on Llama-3-8B.
   * All callers enforce raw JSON output via system prompts and extract the first `{` to last `}`.
   */
  public async requestRawJsonCompletion(
    systemPrompt: string,
    userPrompt: string,
    temperature = 0.2,
    maxTokens = 1024
  ): Promise<string> {
    if (!this.engine || !this.status.isReady) {
      const ready = await this.initializeEngine();
      if (!ready || !this.engine) {
        throw new Error(
          `WebLLM engine could not be initialized (${
            this.status.error || "WebGPU model not ready"
          }).`
        );
      }
    }

    const response = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from WebLLM engine.");
    }
    return content;
  }

  /**
   * Wrapper method preserving the existing service interface while delegating
   * directly to parseAndApplyCustomPolicy().
   */
  public async translateAndApplyCustomPolicy(
    playerInput: string,
    autoApplyToStore = true
  ): Promise<PolicyTranslationResult> {
    const currentState = useGameStore.getState();
    return parseAndApplyCustomPolicy(playerInput, currentState, autoApplyToStore);
  }
}

export const webLLMService = new WebLLMService();

// ----------------------------------------------------------------------------
// 4. The Custom Policy Middleware: parseAndApplyCustomPolicy()
// ----------------------------------------------------------------------------

/**
 * Step 2 Core Function:
 * 1. Constructs a system prompt injecting `currentState` (budget, reserves, heatmaps, approval).
 * 2. Instructs WebLLM to return strictly the `AICustomPolicyResponse` JSON schema.
 * 3. Runs a 3-strike retry loop passing raw output through `parseAndClampAIPolicyResponse()`:
 *    - budget_impact.monthly_change = Math.max(-100000, Math.min(100000, response.budget_impact.monthly_change))
 *    - heatmap_modifiers[i].change = Math.max(-20, Math.min(20, response.heatmap_modifiers[i].change))
 *    - demographic_approval[i].change = Math.max(-15, Math.min(15, response.demographic_approval[i].change))
 * 4. Applies the verified, clamped numbers to the Zustand store.
 * 5. Fallback: If JSON.parse() fails or the LLM hallucinates keys across all strikes,
 *    catches the error without crashing and applies the safe "Policy gridlocked in City Council" state.
 */
export async function parseAndApplyCustomPolicy(
  playerInput: string,
  currentState: GameState = useGameStore.getState(),
  applyToStore = true,
  metadata?: {
    sourceLabel?: string;
    originalPromptText?: string;
    issueTitle?: string;
    capitalCostOverride?: number;
  }
): Promise<PolicyTranslationResult> {
  const MAX_STRIKES = 3;
  const validationWarnings: string[] = [];
  const systemPrompt = buildCustomPolicySystemPrompt(currentState);

  let lastError = "";
  let rawResponse = "";

  for (let strike = 1; strike <= MAX_STRIKES; strike++) {
    rawResponse = "";
    try {
      const userPrompt =
        strike === 1
          ? `Player Policy Proposal: "${playerInput}"\nReturn ONLY the AICustomPolicyResponse JSON object.`
          : `Player Policy Proposal: "${playerInput}"\nSTRIKE ${
              strike - 1
            } FAILED VALIDATION (${lastError}). Do NOT hallucinate keys. Use ONLY valid HeatmapMetric (${VALID_HEATMAP_METRICS.join(
              ", "
            )}) and Demographic (${VALID_DEMOGRAPHICS.join(", ")}) values.`;

      rawResponse = await webLLMService.requestRawJsonCompletion(
        systemPrompt,
        userPrompt,
        strike === 1 ? 0.2 : 0.1
      );

      // Sanitize (first '{' to last '}') and pass raw LLM response through the strict clamping middleware
      const clampedResponse = parseAndClampAIPolicyResponse(rawResponse);

      if (applyToStore) {
        useGameStore.getState().applyClampedCustomPolicy(clampedResponse, {
          ...metadata,
          originalPromptText: metadata?.originalPromptText ?? playerInput,
        });
      }

      return {
        policy: clampedResponse,
        attemptsUsed: strike,
        usedFallback: false,
        validationWarnings,
      };
    } catch (error) {
      console.error("LLM Policy Error:", error, rawResponse);
      const msg = error instanceof Error ? error.message : String(error);
      lastError = msg;
      validationWarnings.push(`Strike ${strike}/${MAX_STRIKES} failed: ${msg}`);
    }
  }

  // Fallback: Do not crash the game — return and apply "Policy gridlocked in City Council"
  const gridlockedFallback = buildGridlockedFallbackPolicy(playerInput);

  if (applyToStore) {
    useGameStore.getState().applyClampedCustomPolicy(gridlockedFallback, {
      ...metadata,
      originalPromptText: metadata?.originalPromptText ?? playerInput,
    });
  }

  return {
    policy: gridlockedFallback,
    attemptsUsed: MAX_STRIKES,
    usedFallback: true,
    validationWarnings,
  };
}

// ----------------------------------------------------------------------------
// 5. AI Docket Overhaul: Law-Interlocking Issues, 20+ Domains & Cross-Game Memory
// ----------------------------------------------------------------------------

export const CIVIC_DOMAIN_SEEDS = [
  "Zoning & Historic Preservation",
  "Nightlife & Noise Ordinances",
  "Gig Economy & Automation",
  "Public Transit & Micromobility",
  "Water & Energy Grid",
  "Port & Freight Logistics",
  "Parks & Urban Wildlife",
  "Small Business Licensing",
  "Public Health & Sanitation",
  "Arts & Tourism",
  "Municipal Debt & Bonds",
  "Surveillance & Data Privacy",
  "Street Vendors & Food Carts",
  "Short-Term Rentals & Housing",
  "AI & Municipal Bureaucracy",
  "Waste Recycling & Landfills",
  "Youth Curfews & Recreation",
  "Autonomous Delivery Drones",
  "Billboard & Signage Aesthetics",
  "Stormwater & Coastal Resilience",
  "Micro-Breweries & Alley Culture",
  "Parking Minimums & Curb Space",
] as const;

const CROSS_GAME_SEEN_TITLES_KEY = "governor_seen_issue_titles";
const CROSS_GAME_SEEN_KEYWORDS_KEY = "governor_seen_topic_keywords";

export function getCrossGameSeenIssueTitles(): string[] {
  try {
    const raw = localStorage.getItem(CROSS_GAME_SEEN_TITLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(-50)
      : [];
  } catch {
    return [];
  }
}

export function getCrossGameSeenTopicKeywords(): string[] {
  try {
    const raw = localStorage.getItem(CROSS_GAME_SEEN_KEYWORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(-60)
      : [];
  } catch {
    return [];
  }
}

export function recordCrossGameIssueTitles(titles: string[]): void {
  try {
    const existing = getCrossGameSeenIssueTitles();
    const merged = Array.from(new Set([...existing, ...titles])).slice(-50);
    localStorage.setItem(CROSS_GAME_SEEN_TITLES_KEY, JSON.stringify(merged));

    // Also extract core topic keywords (>4 chars) so premises/industries never repeat
    const stopWords = new Set([
      "about",
      "after",
      "before",
      "under",
      "over",
      "between",
      "during",
      "against",
      "without",
      "month",
      "docket",
      "issue",
      "ordinance",
      "bill",
      "policy",
      "municipal",
      "city",
    ]);
    const extractedWords = titles
      .flatMap((t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/))
      .filter((w) => w.length >= 5 && !stopWords.has(w));
    const existingKw = getCrossGameSeenTopicKeywords();
    const mergedKw = Array.from(new Set([...existingKw, ...extractedWords])).slice(-60);
    localStorage.setItem(CROSS_GAME_SEEN_KEYWORDS_KEY, JSON.stringify(mergedKw));
  } catch {
    // Ignore storage quota errors
  }
}

function sampleFourPillars(): CivicPillar[] {
  const pool = [...VALID_CIVIC_PILLARS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 4);
}

function sampleRandomCivicDomains(count = 4): string[] {
  const pool = [...CIVIC_DOMAIN_SEEDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function buildContextAwareDocketSystemPrompt(
  state: GameState,
  sampledDomains: string[],
  targetPillars: CivicPillar[],
  crossGameBlacklist: string[],
  crossGameKeywords: string[]
): string {
  const activeLaws = state.enactedPolicies;
  const pastTitles = Array.from(
    new Set([...crossGameBlacklist, ...state.pastIssueTitles])
  ).slice(-50);
  const seenKeywords = Array.from(
    new Set([...crossGameKeywords, ...(state.seenTopicKeywords ?? [])])
  ).slice(-60);

  // Identify lowest-performing metrics (highest crime/pollution/traffic or lowest land_value/edu/health)
  const avg = state.grid.globalAverages;
  const edu = state.civicServices?.education ?? 55;
  const health = state.civicServices?.health ?? 55;
  const metricStrains = [
    { pillar: "crime", strain: avg.crime, label: `Crime=${Math.round(avg.crime)}/100` },
    { pillar: "pollution", strain: avg.pollution, label: `Pollution=${Math.round(avg.pollution)}/100` },
    { pillar: "traffic", strain: avg.traffic, label: `Traffic=${Math.round(avg.traffic)}/100` },
    { pillar: "land_value", strain: 100 - avg.land_value, label: `Land Value=${Math.round(avg.land_value)}/100` },
    { pillar: "education", strain: 100 - edu, label: `Education=${Math.round(edu)}/100` },
    { pillar: "health", strain: 100 - health, label: `Public Health=${Math.round(health)}/100` },
  ].sort((a, b) => b.strain - a.strain);

  const activeLawsSummary =
    activeLaws.length === 0
      ? "None enacted yet (Turn 1 start)."
      : activeLaws
          .map(
            (l, i) =>
              `${i + 1}. "${l.policy_name}" (Turn ${l.enactedTurn}, Budget: ${
                l.budget_impact.monthly_change >= 0 ? "+" : ""
              }$${l.budget_impact.monthly_change}/mo): ${
                l.originalPromptText ?? l.vibe_feed_headline
              } | Fallout: ${l.unintended_consequence_trigger || "None"}`
          )
          .join("\n");

  return `You are the Dynamic Municipal Legislative Docket Generator for the satirical political RPG "Governor".

CURRENT CITY TELEMETRY (MONTH ${state.time.turn}):
- Inherited Archetype: ${state.grid.startingArchetype}
- Treasury Reserves: $${state.treasury.reserves.toLocaleString()} (Monthly Net: $${state.treasury.monthlyNet.toLocaleString()})
- Overall Approval: ${state.voterSentiment.overallApproval.toFixed(1)}%
- Taxes: Income=${state.treasury.taxRates.incomeTaxPct}%, Corporate=${state.treasury.taxRates.corporateTaxPct}%, Property=${state.treasury.taxRates.propertyTaxPct}%
- Highest-Strain Pillars First: ${metricStrains.map((m) => m.label).join(", ")}

REQUIRED 4 DISTINCT PILLARS & SAMPLED DOMAINS FOR THIS TURN:
1. "${targetPillars[0]}" pillar -> "${sampledDomains[0]}"
2. "${targetPillars[1]}" pillar -> "${sampledDomains[1]}"
3. "${targetPillars[2]}" pillar -> "${sampledDomains[2]}"
4. "${targetPillars[3]}" pillar -> "${sampledDomains[3]}"

FULL ACTIVE ENACTED LAWS (MUST INTERLOCK & COLLIDE WITH THESE):
${activeLawsSummary}

SEEN ISSUE TITLES BLACKLIST (seenIssueTitles):
${JSON.stringify(pastTitles)}

BANNED TOPIC KEYWORDS (seenTopicKeywords):
${JSON.stringify(seenKeywords)}

STRICT INSTRUCTIONS:
1. Generate 4 grounded, sharply written municipal legislative issues for Month ${state.time.turn}—EXACTLY 1 for each of the 4 distinct target pillars listed above ("${targetPillars.join('", "')}").
2. STRICT ANTI-REPETITION: DO NOT generate any dilemma involving topics, industries, or premises already covered in seenTopicKeywords or seenIssueTitles.
3. LAW-INTERLOCKING COLLISIONS: If active enacted laws exist, at least 2 of the 4 issues MUST explicitly collide with, build upon, or suffer absurd complications from those existing laws. Set "influenced_by_law": "<exact law name>" and scale impacts to reflect synergy or friction!
4. Each issue must include 3 bespoke preset choices (Option 1: Bold/Radical, Option 2: Populist/Compromise, Option 3: Moderate/Fiscal).

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', NEGATIVE (-15) REDUCES the problem and helps; POSITIVE (+15) WORSENS it. For 'land_value', 'education', 'health', and 'demographic_approval', POSITIVE (+15) improves them; NEGATIVE (-15) reduces them.

Return STRICTLY a valid raw JSON object matching this schema:
{
  "issues": [
    {
      "pillar": "${targetPillars.join('" | "')}",
      "domain_tag": "string",
      "title": "string (Fresh dilemma title)",
      "briefing": "string (2-3 witty sentences)",
      "is_follow_up_arc": boolean,
      "parent_law_title": "string or null",
      "influenced_by_law": "string or null",
      "presets": [
        {
          "stance_label": "string",
          "option_title": "string",
          "description": "string (1 crisp sentence)",
          "policy_effect": {
            "policy_name": "string (Max 40 chars)",
            "vibe_feed_headline": "string (Max 80 chars)",
            "budget_impact": { "monthly_change": number (-100000 to 100000) },
            "heatmap_modifiers": [{ "metric": "crime" | "pollution" | "land_value" | "traffic" | "education" | "health", "change": number (-20 to 20) }],
            "demographic_approval": [{ "demographic": "working_class" | "wealthy" | "business" | "environmentalists", "change": number (-15 to 15) }],
            "unintended_consequence_trigger": "None" or 1-sentence side effect,
            "outcome_story": "string (2 satirical sentences on what happens immediately if enacted)"
          }
        }
      ]
    }
  ]
}

CRITICAL: Respond ONLY with valid raw JSON.`;
}

function parseAndClampAIDocketPayload(
  rawText: string,
  turn: number,
  pastTitles: string[]
): MonthlyDocketIssue[] {
  const jsonStr = sanitizeAndExtractJsonObject(rawText);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];

  if (rawIssues.length === 0) {
    throw new Error("AI Docket payload did not contain an 'issues' array.");
  }

  const pastLower = new Set(pastTitles.map((t) => t.toLowerCase().trim()));
  const balancedCapitalCosts: [number, number, number] = [15, -5, 0];
  const validResults: MonthlyDocketIssue[] = [];

  for (const item of rawIssues) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const pillar = normalizeCivicPillar(rec.pillar);
    if (!pillar) continue;

    const title =
      typeof rec.title === "string" && rec.title.trim().length > 3
        ? rec.title.trim().slice(0, 75)
        : null;
    const briefing =
      typeof rec.briefing === "string" && rec.briefing.trim().length > 10
        ? rec.briefing.trim().slice(0, 320)
        : null;

    if (!title || !briefing) continue;
    // Enforce anti-repetition check against pastIssueTitles
    if (pastLower.has(title.toLowerCase())) continue;

    const rawPresets = Array.isArray(rec.presets) ? rec.presets : [];
    if (rawPresets.length < 3) continue;

    const clampedPresets = rawPresets.slice(0, 3).map((p, idx): DocketPresetOption => {
      const pr = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      const stanceLabel =
        typeof pr.stance_label === "string" && pr.stance_label.trim()
          ? pr.stance_label.trim().slice(0, 32)
          : `Stance #${idx + 1}`;
      const optionTitle =
        typeof pr.option_title === "string" && pr.option_title.trim()
          ? pr.option_title.trim().slice(0, 55)
          : `Execute Option #${idx + 1}`;
      const description =
        typeof pr.description === "string" && pr.description.trim()
          ? pr.description.trim().slice(0, 160)
          : optionTitle;

      const rawEffectObj =
        pr.policy_effect && typeof pr.policy_effect === "object"
          ? pr.policy_effect
          : {
              policy_name: optionTitle.slice(0, 40),
              vibe_feed_headline: `Mayor enacts "${optionTitle.slice(0, 40)}".`,
              budget_impact: { monthly_change: -20000 },
              heatmap_modifiers: [{ metric: pillar, change: pillar === "land_value" ? 8 : -10 }],
              demographic_approval: [{ demographic: "working_class", change: 6 }],
              unintended_consequence_trigger: "None",
            };

      return {
        id: `docket-ai-${turn}-${pillar}-opt-${idx + 1}`,
        stanceLabel,
        optionTitle,
        description,
        capitalCost: balancedCapitalCosts[idx] ?? 0,
        policyEffect: parseAndClampAIPolicyResponse(JSON.stringify(rawEffectObj)),
      };
    }) as [DocketPresetOption, DocketPresetOption, DocketPresetOption];

    const isFollowUpArc = Boolean(rec.is_follow_up_arc);
    const parentLawTitle =
      typeof rec.parent_law_title === "string" &&
      rec.parent_law_title.trim().length > 0 &&
      rec.parent_law_title.trim().toLowerCase() !== "null"
        ? rec.parent_law_title.trim().slice(0, 45)
        : undefined;
    const influencedByLawTitle =
      typeof rec.influenced_by_law === "string" &&
      rec.influenced_by_law.trim().length > 0 &&
      rec.influenced_by_law.trim().toLowerCase() !== "null"
        ? rec.influenced_by_law.trim().slice(0, 45)
        : parentLawTitle;
    const domainTag =
      typeof rec.domain_tag === "string" &&
      rec.domain_tag.trim().length > 0 &&
      rec.domain_tag.trim().toLowerCase() !== "null"
        ? rec.domain_tag.trim().slice(0, 40)
        : undefined;

    validResults.push({
      id: `issue-${turn}-${pillar}`,
      turn,
      pillar,
      title,
      briefing,
      status: "PENDING",
      isFollowUpArc,
      parentLawTitle,
      influencedByLawTitle,
      domainTag,
      isAIGenerated: true,
      presets: clampedPresets,
    });
  }

  return validResults;
}

/**
 * Asynchronously pre-fetches/synthesizes the 4 Monthly Docket Issues via WebLLM
 * at temperature = 0.85 right after the player clicks Advance Month, injecting:
 * - `pastIssueTitles` (Anti-Repetition Blacklist)
 * - `recentLaws` (Last 3 enacted laws for Follow-Up Arc sequels)
 * - Lowest-performing city heatmap metrics
 *
 * Updates any still-PENDING issues in the Zustand store as soon as generation completes.
 */
export async function generateLawAwareMonthlyDocket(
  stateSnapshot: GameState
): Promise<MonthlyDocketIssue[]> {
  if (!webLLMService.isEngineReady()) {
    return [];
  }

  const targetTurn = stateSnapshot.time.turn;
  const sampledDomains = sampleRandomCivicDomains(4);
  const targetPillars = sampleFourPillars();
  const crossGameBlacklist = getCrossGameSeenIssueTitles();
  const crossGameKeywords = getCrossGameSeenTopicKeywords();
  const combinedBlacklist = Array.from(
    new Set([...crossGameBlacklist, ...stateSnapshot.pastIssueTitles])
  );

  const systemPrompt = buildContextAwareDocketSystemPrompt(
    stateSnapshot,
    sampledDomains,
    targetPillars,
    crossGameBlacklist,
    crossGameKeywords
  );
  const userPrompt = `Generate 4 fresh, law-interlocking Monthly Docket Issues for Month ${targetTurn} targeting the 4 distinct pillars (${targetPillars.join(
    ", "
  )}). Return ONLY valid raw JSON.`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const promptToSend =
        attempt === 1
          ? userPrompt
          : `CRITICAL: Your previous response failed JSON parsing. Return ONLY a single valid raw JSON object matching the exact schema with 4 issues (${targetPillars.join(
              ", "
            )}). No markdown fences, no commentary.`;
      const temp = attempt === 1 ? 0.85 : 0.65;

      const rawJson = await webLLMService.requestRawJsonCompletion(
        systemPrompt,
        promptToSend,
        temp,
        1650
      );

      const aiIssues = parseAndClampAIDocketPayload(
        rawJson,
        targetTurn,
        combinedBlacklist
      );

      if (aiIssues.length > 0) {
        recordCrossGameIssueTitles(aiIssues.map((i) => i.title));
        return aiIssues;
      }
      console.error(
        `WebLLM Docket Attempt ${attempt}/2 parsed 0 valid issues; ${
          attempt === 1 ? "retrying with stricter formatting..." : "using fallback."
        }`
      );
    } catch (error) {
      console.error(
        `WebLLM Law-Aware Docket JSON/Generation Error (Attempt ${attempt}/2):`,
        error
      );
    }
  }

  return [];
}

export async function prefetchContextAwareMonthlyDocket(): Promise<void> {
  if (!webLLMService.isEngineReady()) {
    return;
  }

  const stateSnapshot = useGameStore.getState();
  const targetTurn = stateSnapshot.time.turn;
  stateSnapshot.setIsGeneratingDocket(true);

  try {
    const aiIssues = await generateLawAwareMonthlyDocket(stateSnapshot);
    if (aiIssues.length > 0) {
      useGameStore.getState().setMonthlyDocketFromAI(aiIssues, targetTurn);
    }
  } finally {
    useGameStore.getState().setIsGeneratingDocket(false);
  }
}

// ----------------------------------------------------------------------------
// 6. Phase 2 (Step 3/4): Policy Devil's Advocate ("STRESS-TEST POLICY")
// ----------------------------------------------------------------------------

function buildDeterministicStressTestWarning(policyText: string): string {
  const lower = policyText.toLowerCase();
  if (/tax|levy|fee|fine|tariff/.test(lower)) {
    return "Devil's Advocate Warning: Commercial landlords and holding companies will reclassify revenues into out-of-city shell subsidiaries to dodge the assessment. Meanwhile, small storefront owners will pass the surcharge directly onto working-class consumers.";
  }
  if (/ban|curfew|patrol|police|restrict|moratorium/.test(lower)) {
    return "Devil's Advocate Warning: Informal street operators will simply shift their hours and routes two blocks outside the enforcement perimeter. Civil liberties watchdogs may also file an injunction if the wording lacks strict probable-cause guardrails.";
  }
  if (/subsid|grant|free|rebate|voucher/.test(lower)) {
    return "Devil's Advocate Warning: Opportunistic brokers will register shell applicants to capture the municipal subsidy before genuine residents can apply. Without an income cap, wealthy developers will pocket the bulk of the public rebate.";
  }
  return "Devil's Advocate Warning: Regulated firms will exploit vague compliance deadlines by filing endless administrative appeals while continuing business as usual. Neighborhood groups may also game the reporting hotline to target rival businesses.";
}

/**
 * Runs a fast Devil's Advocate check outputting a 2-sentence Unintended Loophole
 * Warning showing how citizens or businesses will game the wording before signing.
 */
export async function stressTestCustomPolicy(
  policyText: string,
  currentState: GameState = useGameStore.getState()
): Promise<string> {
  if (!webLLMService.isEngineReady()) {
    return buildDeterministicStressTestWarning(policyText);
  }

  const systemPrompt = `You are the cynical Policy Devil's Advocate & Municipal Loophole Auditor for "Governor".
Current City Context: Reserves=$${currentState.treasury.reserves.toLocaleString()}, Crime=${Math.round(
    currentState.grid.globalAverages.crime
  )}, Pollution=${Math.round(
    currentState.grid.globalAverages.pollution
  )}, Traffic=${Math.round(currentState.grid.globalAverages.traffic)}.

Analyze the Mayor's draft executive order and output a punchy, realistic 2-sentence "Unintended Loophole Warning" explaining specifically how local businesses, lobbyists, or citizens will game or exploit the wording before it is signed.

Return STRICTLY a valid raw JSON object:
{
  "loophole_warning": "string (Exactly 2 sentences)"
}

CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      `Draft Policy Text: "${policyText}"\nIdentify the biggest loophole in 2 sentences.`,
      0.5,
      320
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;
    if (
      typeof parsed.loophole_warning === "string" &&
      parsed.loophole_warning.trim().length > 15
    ) {
      return parsed.loophole_warning.trim().slice(0, 320);
    }
  } catch (err) {
    console.error("Devil's Advocate Stress-Test Error:", err);
  }

  return buildDeterministicStressTestWarning(policyText);
}

// ----------------------------------------------------------------------------
// 7. Phase 2 (Step 3/4): Live Press & Citizen Town Hall Q&A
// ----------------------------------------------------------------------------

function buildFallbackTownHallQuestions(
  state: GameState
): TownHallQuestion[] {
  const recentLaw = state.enactedPolicies[0];
  const avg = state.grid.globalAverages;
  const worstMetric = [
    { name: "Crime", val: avg.crime },
    { name: "Pollution", val: avg.pollution },
    { name: "Traffic", val: avg.traffic },
  ].sort((a, b) => b.val - a.val)[0];

  const q1: TownHallQuestion = recentLaw
    ? {
        id: `th-q1-${state.time.turn}`,
        speaker: "Elena Vance",
        role: "The Metro Chronicle Reporter",
        question: `Mayor, you signed "${recentLaw.policy_name}" (${
          recentLaw.budget_impact.monthly_change >= 0 ? "+" : ""
        }$${recentLaw.budget_impact.monthly_change.toLocaleString()}/mo), yet ${
          worstMetric.name
        } still sits at ${Math.round(
          worstMetric.val
        )}/100. Why should taxpayers trust your administration's priorities?`,
      }
    : {
        id: `th-q1-${state.time.turn}`,
        speaker: "Elena Vance",
        role: "The Metro Chronicle Reporter",
        question: `Mayor, ${worstMetric.name} is currently at ${Math.round(
          worstMetric.val
        )}/100 and city reserves stand at $${state.treasury.reserves.toLocaleString()}. What concrete steps will you take this month before conditions spiral?`,
      };

  const q2: TownHallQuestion = {
    id: `th-q2-${state.time.turn}`,
    speaker: "Marcus Rivera",
    role: "Local Union & Neighborhood Delegate",
    question: `Working families are feeling squeezed at ${Math.round(
      state.voterSentiment.demographics.working_class.approval
    )}% approval while ${worstMetric.name} Tension is at ${Math.round(
      state.tensions[
        worstMetric.name === "Pollution"
          ? "Sanitation"
          : worstMetric.name === "Traffic"
          ? "Transit"
          : "Crime"
      ]
    )}/100. Are you governing for downtown donors or the people who keep this city running?`,
  };

  return [q1, q2];
}

export async function generateTownHallQuestions(
  state: GameState = useGameStore.getState()
): Promise<TownHallQuestion[]> {
  if (!webLLMService.isEngineReady()) {
    return buildFallbackTownHallQuestions(state);
  }

  const recentLaws = state.enactedPolicies
    .slice(0, 3)
    .map((l) => `"${l.policy_name}" (${l.vibe_feed_headline})`)
    .join("; ");
  const avg = state.grid.globalAverages;

  const systemPrompt = `You are the Town Hall Moderator for the political RPG "Governor".
CITY CONTEXT (Month ${state.time.turn}):
- Reserves: $${state.treasury.reserves.toLocaleString()} (Net: $${state.treasury.monthlyNet.toLocaleString()}/mo)
- Approval: ${state.voterSentiment.overallApproval.toFixed(1)}%
- Heatmaps: Crime=${Math.round(avg.crime)}, Pollution=${Math.round(
    avg.pollution
  )}, LandValue=${Math.round(avg.land_value)}, Traffic=${Math.round(
    avg.traffic
  )}
- Recent Laws Enacted: ${recentLaws || "None yet"}

Generate 2 sharp, specific Town Hall questions referencing the Mayor's actual enacted laws and struggling city metrics (1 from a sharp investigative reporter, 1 from an angry/concerned neighborhood resident).

Return STRICTLY a valid raw JSON object:
{
  "questions": [
    { "speaker": "string", "role": "string", "question": "string" },
    { "speaker": "string", "role": "string", "question": "string" }
  ]
}

CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Generate the 2 sharp Town Hall questions now.",
      0.7,
      512
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;
    const rawQs = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (rawQs.length >= 2) {
      return rawQs.slice(0, 2).map((q, idx) => {
        const qr = q as Record<string, unknown>;
        return {
          id: `th-ai-q${idx + 1}-${state.time.turn}`,
          speaker:
            typeof qr.speaker === "string" && qr.speaker.trim()
              ? qr.speaker.trim()
              : idx === 0
              ? "Elena Vance"
              : "Marcus Rivera",
          role:
            typeof qr.role === "string" && qr.role.trim()
              ? qr.role.trim()
              : idx === 0
              ? "Investigative Reporter"
              : "Neighborhood Resident",
          question:
            typeof qr.question === "string" && qr.question.trim()
              ? qr.question.trim()
              : buildFallbackTownHallQuestions(state)[idx].question,
        };
      });
    }
  } catch (err) {
    console.error("Town Hall Question Generation Error:", err);
  }

  return buildFallbackTownHallQuestions(state);
}

function clampTownHallResult(raw: Partial<TownHallGradingResult>): TownHallGradingResult {
  const validGrades: TownHallGrade[] = [
    "Authentic",
    "Inspiring",
    "Evasive",
    "Tone-Deaf",
  ];
  const grade = validGrades.includes(raw.grade as TownHallGrade)
    ? (raw.grade as TownHallGrade)
    : "Evasive";
  return {
    grade,
    commentary:
      typeof raw.commentary === "string" && raw.commentary.trim()
        ? raw.commentary.trim().slice(0, 220)
        : "Observers note a calculated political response.",
    approval_change: Math.round(
      Math.max(-8, Math.min(10, Number(raw.approval_change ?? 0)))
    ),
    capital_change: Math.round(
      Math.max(-10, Math.min(15, Number(raw.capital_change ?? 0)))
    ),
  };
}

export async function gradeTownHallResponse(
  question: TownHallQuestion,
  playerAnswer: string,
  state: GameState = useGameStore.getState()
): Promise<TownHallGradingResult> {
  if (!webLLMService.isEngineReady()) {
    const lower = playerAnswer.toLowerCase();
    if (playerAnswer.trim().length < 10) {
      return clampTownHallResult({
        grade: "Tone-Deaf",
        commentary:
          "Crowd jeers at the curt, dismissive non-answer during a tense Town Hall.",
        approval_change: -5,
        capital_change: -6,
      });
    }
    if (
      /sorry|accountab|plan|invest|protect|families|clean|safe|fix|commit|together/.test(
        lower
      )
    ) {
      return clampTownHallResult({
        grade: "Inspiring",
        commentary:
          "Voters applaud your direct accountability and clear action plan.",
        approval_change: 6,
        capital_change: 10,
      });
    }
    if (/lol|magic|whatever|shut up|blame/.test(lower)) {
      return clampTownHallResult({
        grade: "Tone-Deaf",
        commentary:
          "Clips of your tone-deaf remark go viral across both local newspapers.",
        approval_change: -7,
        capital_change: -8,
      });
    }
    return clampTownHallResult({
      grade: "Authentic",
      commentary:
        "Citizens appreciate a candid, grounded explanation of the city's trade-offs.",
      approval_change: 4,
      capital_change: 6,
    });
  }

  const systemPrompt = `You are the Live Press & Citizen Town Hall Spin Judge for "Governor".
Question asked by ${question.speaker} (${question.role}): "${question.question}"
City Approval: ${state.voterSentiment.overallApproval.toFixed(1)}%, Reserves: $${state.treasury.reserves.toLocaleString()}.

Grade the Mayor's open-ended response as ONE of: "Authentic", "Inspiring", "Evasive", or "Tone-Deaf".
- "Inspiring" or "Authentic": positive approval (+3 to +10) and capital (+5 to +15).
- "Evasive": slight negative approval (-3 to -1) and capital (-3 to 0).
- "Tone-Deaf" (rude, nonsensical, dismissive): harsh penalty (-8 to -4 approval, -10 to -5 capital).

Return STRICTLY a valid raw JSON object:
{
  "grade": "Authentic" | "Inspiring" | "Evasive" | "Tone-Deaf",
  "commentary": "string (1-sentence press reaction)",
  "approval_change": number (integer -8 to 10),
  "capital_change": number (integer -10 to 15)
}

CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      `Mayor's Spoken Response: "${playerAnswer}"\nGrade this response now.`,
      0.35,
      320
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Partial<TownHallGradingResult>;
    return clampTownHallResult(parsed);
  } catch (err) {
    console.error("Town Hall Grading Error:", err);
    return clampTownHallResult({
      grade: "Authentic",
      commentary:
        "Town Hall attendees nod along with your pragmatic explanation.",
      approval_change: 3,
      capital_change: 5,
    });
  }
}

// ----------------------------------------------------------------------------
// 8. Phase 2 (Step 3/4): Custom City Scenario Generator (From User Prompt)
// ----------------------------------------------------------------------------

function buildDeterministicCustomScenario(
  prompt: string
): CustomCityScenarioPayload {
  const clean = prompt.trim();
  const lower = clean.toLowerCase();

  const isFlooded = /flood|water|port|harbor|rain|coast|ocean/.test(lower);
  const isCrime = /crime|gang|corrupt|syndicate|cartel|mob|riot/.test(lower);
  const isTech = /cyber|tech|ai|boom|silicon|neon|future/.test(lower);
  const isGreen = /eco|forest|green|solar|desert|drought|smog/.test(lower);

  const title =
    clean.length > 0
      ? clean.slice(0, 34).toUpperCase()
      : "CUSTOM METROPOLIS";

  return {
    scenario_title: title,
    starting_briefing: `CUSTOM SCENARIO [${title}]: ${clean.slice(
      0,
      140
    )}. You inherit a restless territory shaped by these exact conditions.`,
    treasury_reserves: isCrime ? -1_200_000 : isTech ? 1_400_000 : 850_000,
    base_crime: isCrime ? 78 : isTech ? 34 : 44,
    base_pollution: isGreen || isFlooded ? 76 : 42,
    base_land_value: isTech ? 80 : isCrime ? 30 : 52,
    base_traffic: isTech ? 82 : isFlooded ? 68 : 45,
    crime_tension: isCrime ? 78 : 30,
    transit_tension: isTech ? 82 : 35,
    sanitation_tension: isGreen || isFlooded ? 80 : 32,
    district_names: isFlooded
      ? [
          "SUBMERGED OLD TOWN",
          "TIDAL DOCKLANDS",
          "HIGHGROUND TERRACE",
          "SEAWALL CORRIDOR",
        ]
      : isTech
      ? [
          "NEON DATA CORE",
          "SERVER FOUNDRY",
          "SKYLINE ESTATES",
          "AUTONOMOUS BELT",
        ]
      : [
          "CAPITOL CITADEL",
          "IRONWORKS WARD",
          "MEADOW SUBURBS",
          "EASTERN ARTERIAL",
        ],
  };
}

export async function generateCustomCityScenario(
  userPrompt: string
): Promise<CustomCityScenarioPayload> {
  if (!webLLMService.isEngineReady()) {
    return buildDeterministicCustomScenario(userPrompt);
  }

  const systemPrompt = `You are the Procedural City Scenario Architect for "Governor".
Given the player's custom city premise, generate starting municipal stats and 4 uppercase district names.

Return STRICTLY a valid raw JSON object:
{
  "scenario_title": "string (Max 34 chars)",
  "starting_briefing": "string (1-2 sentences)",
  "treasury_reserves": number (integer -3000000 to 6000000),
  "base_crime": number (15 to 90),
  "base_pollution": number (15 to 90),
  "base_land_value": number (15 to 90),
  "base_traffic": number (15 to 90),
  "crime_tension": number (10 to 90),
  "transit_tension": number (10 to 90),
  "sanitation_tension": number (10 to 90),
  "district_names": ["NAME 1", "NAME 2", "NAME 3", "NAME 4"]
}

CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      `Custom City Premise: "${userPrompt}"\nGenerate the CustomCityScenarioPayload JSON now.`,
      0.7,
      512
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const p = JSON.parse(extracted) as Record<string, unknown>;

    const clampStat = (v: unknown, min: number, max: number, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fb;
    };

    const rawNames = Array.isArray(p.district_names) ? p.district_names : [];
    const districtNames: [string, string, string, string] = [
      String(rawNames[0] || "NORTHSIDE SUBURBS").toUpperCase().slice(0, 24),
      String(rawNames[1] || "DOWNTOWN CORE").toUpperCase().slice(0, 24),
      String(rawNames[2] || "TECH CORRIDOR").toUpperCase().slice(0, 24),
      String(rawNames[3] || "INDUSTRIAL HARBOR").toUpperCase().slice(0, 24),
    ];

    return {
      scenario_title:
        typeof p.scenario_title === "string" && p.scenario_title.trim()
          ? p.scenario_title.trim().slice(0, 34)
          : userPrompt.slice(0, 34).toUpperCase(),
      starting_briefing:
        typeof p.starting_briefing === "string" && p.starting_briefing.trim()
          ? p.starting_briefing.trim().slice(0, 220)
          : buildDeterministicCustomScenario(userPrompt).starting_briefing,
      treasury_reserves: clampStat(p.treasury_reserves, -3_000_000, 6_000_000, 750_000),
      base_crime: clampStat(p.base_crime, 15, 90, 45),
      base_pollution: clampStat(p.base_pollution, 15, 90, 45),
      base_land_value: clampStat(p.base_land_value, 15, 90, 50),
      base_traffic: clampStat(p.base_traffic, 15, 90, 45),
      crime_tension: clampStat(p.crime_tension, 10, 90, 35),
      transit_tension: clampStat(p.transit_tension, 10, 90, 35),
      sanitation_tension: clampStat(p.sanitation_tension, 10, 90, 35),
      district_names: districtNames,
    };
  } catch (err) {
    console.error("Custom City Scenario Generator Error:", err);
    return buildDeterministicCustomScenario(userPrompt);
  }
}

// ----------------------------------------------------------------------------
// 9. Phase 2 (Step 4/4): Wikipedia-Style Historical Encyclopedia Entry Generator
// ----------------------------------------------------------------------------

function buildDeterministicEncyclopediaEntry(
  state: GameState,
  outcome: "victory" | "retirement" | "recall" | "bankruptcy" | "defeat"
): string {
  const title = state.politicalCompass.leaderTitle;
  const office = state.time.currentOffice;
  const arch = state.grid.startingArchetype;
  const turns = state.time.totalTurnsPlayed;
  const approval = state.voterSentiment.overallApproval.toFixed(1);
  const reserves = state.treasury.reserves.toLocaleString();
  const topLaw = state.enactedPolicies[0]?.policy_name;

  const outcomePhrase =
    outcome === "victory"
      ? `concluded a triumphant ${turns}-month tenure with a decisive electoral victory`
      : outcome === "retirement"
      ? `voluntarily retired from office after ${turns} months of stewardship`
      : outcome === "bankruptcy"
      ? `ended abruptly after ${turns} months when municipal insolvency triggered a State Government receivership`
      : outcome === "recall"
      ? `collapsed after ${turns} months in a historic citizen-led special recall election`
      : `ended after ${turns} months when voters narrowly chose a challenger at the ballot box`;

  const lawClause = topLaw
    ? `Historians frequently cite signature legislation such as "${topLaw}" as defining the administration's legacy.`
    : `The administration relied primarily on broad executive doctrines rather than sweeping legislative packages.`;

  return `The ${office} Administration (2026–${state.time.year}), widely categorized by political scientists as a "${title}" era, ${outcomePhrase}. Inheriting the "${arch}" crisis, the administration left office with ${approval}% public approval and municipal reserves of $${reserves}. ${lawClause} Today, civic archives remember the era as a pivotal chapter in the territory's modern governance.`;
}

export async function generateHistoricalEncyclopediaEntry(
  state: GameState,
  outcome: "victory" | "retirement" | "recall" | "bankruptcy" | "defeat"
): Promise<string> {
  if (!webLLMService.isEngineReady()) {
    return buildDeterministicEncyclopediaEntry(state, outcome);
  }

  const topLaws = state.enactedPolicies
    .slice(0, 3)
    .map((l) => `"${l.policy_name}"`)
    .join(", ");

  const systemPrompt = `You are the Chief Editor of the Municipal Historical Encyclopedia.
Write a 3-sentence, objective, Wikipedia-style encyclopedia entry judging this Mayor/Governor's completed administration.
- Outcome: ${outcome.toUpperCase()} after ${state.time.totalTurnsPlayed} total months
- Inherited City: ${state.grid.startingArchetype}
- Final Office: ${state.time.currentOffice}
- Political Compass Title: "${state.politicalCompass.leaderTitle}" (Economic=${state.politicalCompass.economicAxis}, Governance=${state.politicalCompass.governanceAxis})
- Final Approval: ${state.voterSentiment.overallApproval.toFixed(1)}%, Reserves: $${state.treasury.reserves.toLocaleString()}
- Key Laws: ${topLaws || "Broad Governing Doctrines"}

Return STRICTLY a valid raw JSON object:
{
  "encyclopedia_entry": "string (3 sentences, neutral Wikipedia encyclopedia tone)"
}

CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Write the 3-sentence Wikipedia-style historical encyclopedia entry now.",
      0.55,
      360
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;
    if (
      typeof parsed.encyclopedia_entry === "string" &&
      parsed.encyclopedia_entry.trim().length > 25
    ) {
      return parsed.encyclopedia_entry.trim().slice(0, 650);
    }
  } catch (err) {
    console.error("Encyclopedia Entry Generation Error:", err);
  }

  return buildDeterministicEncyclopediaEntry(state, outcome);
}

// ----------------------------------------------------------------------------
// 8. Front-Page Monthly Broadsheet ("THE MUNICIPAL DISPATCH")
// ----------------------------------------------------------------------------

function formatDeltaSign(val: number, suffix = ""): string {
  const rounded = Math.round(val);
  return `${rounded >= 0 ? "+" : ""}${rounded}${suffix}`;
}

export function buildDeterministicBroadsheet(
  state: GameState
): FrontPageBroadsheet {
  const { time, grid, treasury, voterSentiment, tensions, cityReport } = state;
  const recentLaws = state.enactedPolicies.filter(
    (p) => p.enactedTurn >= Math.max(1, time.turn - 1)
  );
  const newestLaw = recentLaws[0] ?? state.enactedPolicies[0] ?? null;

  const sortedDemos = Object.entries(voterSentiment.demographics)
    .map(([demographic, data]) => ({
      demographic,
      approval: data.approval,
    }))
    .sort((a, b) => b.approval - a.approval);
  const topDemo = sortedDemos[0];
  const bottomDemo = sortedDemos[sortedDemos.length - 1];

  const demoLabels: Record<string, string> = {
    working_class: "Working Class Households",
    wealthy: "Upper-Bracket Landowners",
    business: "Chamber of Commerce",
    environmentalists: "Green Civic Coalition",
  };

  const leadHeadline = newestLaw
    ? `CITY REELS & ADAPTS AS "${newestLaw.policy_name.toUpperCase()}" TAKES EFFECT`
    : time.turn === 1
    ? `INAUGURAL DISPATCH: NEW ADMINISTRATION INHERITS "${grid.startingArchetype.toUpperCase()}"`
    : `MONTH ${time.turn} LEDGER: TREASURY AT $${(treasury.reserves / 1_000_000).toFixed(2)}M AS APPROVAL HITS ${voterSentiment.overallApproval.toFixed(0)}%`;

  const subhead = newestLaw
    ? `${newestLaw.vibe_feed_headline} — City Hall's latest decree ripples across all 100 blocks while voters weigh the monthly balance sheet.`
    : `Comptrollers report ${treasury.monthlyNet >= 0 ? "a monthly surplus" : "an active monthly deficit"} of ${treasury.monthlyNet >= 0 ? "+" : "-"}$${Math.abs(treasury.monthlyNet).toLocaleString()}/mo across ${grid.startingArchetype}.`;

  const humanScaleRipple = newestLaw
    ? `Residents along Market & Harbor wasted no time testing the edges of "${newestLaw.policy_name}." Corner bodegas and mid-rise landlords alike were spotted reclassifying delivery bikes as "micro-transit hubs" to skirt new paperwork, prompting baffled inspectors to request a bigger clipboard budget.`
    : `At the downtown commuter plaza, coffee cart vendors have begun quoting bond yields alongside espresso prices as citizens watch whether City Hall can steady ${grid.startingArchetype} without raising fares or cutting streetlamps.`;

  const tensionKeys: Array<keyof typeof tensions> = ["Crime", "Transit", "Sanitation"];
  const highestTension = tensionKeys.sort(
    (a, b) => tensions[b] - tensions[a]
  )[0];
  const highestTensionVal = tensions[highestTension];

  const onTheHorizonWarning =
    treasury.reserves < 0
      ? `COMPTROLLER ALERT: Reserves are underwater ($${treasury.reserves.toLocaleString()}). Two consecutive deficit months will trigger State Receivership.`
      : highestTensionVal >= 75
      ? `ANALYST WARNING: ${highestTension} Tension has climbed to ${Math.round(highestTensionVal)}/100—one more bad month risks a Boiling Point street crisis.`
      : voterSentiment.overallApproval < 32
      ? `POLITICAL ALERT: Overall Approval (${voterSentiment.overallApproval.toFixed(1)}%) is dangerously close to the 25% Recall Election threshold.`
      : `OUTLOOK STEADY: Core pillars are holding, with Crime at ${Math.round(cityReport.pillars.crime.currentValue)} (${formatDeltaSign(cityReport.pillars.crime.delta)}) and Land Value at ${Math.round(cityReport.pillars.land_value.currentValue)} (${formatDeltaSign(cityReport.pillars.land_value.delta)}).`;

  const docketTitles = state.monthlyDocket
    .map((d) => `"${d.title}" (${d.pillar.replace("_", " ")})`)
    .join(", ");

  const falloutParagraphs: string[] = newestLaw
    ? [
        `City Hall’s ink had barely dried on "${newestLaw.policy_name}" before residents of ${grid.startingArchetype} began treating the new ordinance less like civic law and more like an improv prompt. Within hours, downtown shopkeepers were seen frantically printing laminated signs declaring their back alleys "sovereign micro-freight sanctuaries" to dodge municipal inspectors.`,
        humanScaleRipple,
        `Even the Bureau of Paperwork & Permits confessed it was caught off guard by the sheer creativity on display. While ${demoLabels[topDemo.demographic] ?? topDemo.demographic} toasted the administration at neighborhood diners, ${demoLabels[bottomDemo.demographic] ?? bottomDemo.demographic} organizers spent all afternoon composing passive-aggressive open letters on recycled cardboard.`,
      ]
    : [
        `With no fresh statutory decrees signed last month, ${grid.startingArchetype} hummed along under the administration’s "${state.doctrines.fiscal}" and "${state.doctrines.urban}" doctrines while residents invented their own entertainment. Commuters on the main avenue spent Tuesday morning cheering on a rogue tuba quartet protesting pothole placement outside City Hall.`,
        humanScaleRipple,
        `Neighborhood cafés have quietly launched a thriving side hustle selling laminated "I Survived Another Council Subcommittee" coasters, as ${demoLabels[topDemo.demographic] ?? topDemo.demographic} and ${demoLabels[bottomDemo.demographic] ?? bottomDemo.demographic} trade sharp barbs over the city’s direction.`,
      ];

  const crisesParagraphs: string[] = [
    `Attention now pivots to City Hall’s Month ${time.turn} Legislative Docket, where four urgent municipal dilemmas await a binding vote: ${docketTitles || "core neighborhood reforms"}. Neighborhood associations have packed the council gallery since dawn with thermoses of burnt coffee and three-ring binders of grievances.`,
    `Meanwhile, rumblings around ${highestTension.toLowerCase()} services have commuters, small-business owners, and union stewards trading pointed accusations in the press. Both The Metro Chronicle and The Streetlight are demanding decisive leadership before the city’s patience snaps.`,
  ];

  const residentQuote = newestLaw
    ? `“Honestly, once '${newestLaw.policy_name}' took effect, my neighbor started registering his porch swing as a municipal transit shelter just to beat the paperwork,” laughed Harbor District baker Mara Vance.`
    : `“We just want the potholes filled and the clinics open before winter,” remarked Northside machinist Devon Ortiz outside City Hall.`;

  return {
    turn: time.turn,
    month: time.month,
    year: time.year,
    leadHeadline,
    subhead,
    humanScaleRipple,
    falloutParagraphs,
    crisesParagraphs,
    residentQuote,
    winnersBox: {
      group: demoLabels[topDemo.demographic] ?? topDemo.demographic,
      summary: `Currently the administration's warmest bloc at ${topDemo.approval.toFixed(1)}% approval.`,
      deltaText: `${topDemo.approval.toFixed(1)}% APPROVAL`,
    },
    losersBox: {
      group: demoLabels[bottomDemo.demographic] ?? bottomDemo.demographic,
      summary: `Loudest critics on the street at ${bottomDemo.approval.toFixed(1)}% approval.`,
      deltaText: `${bottomDemo.approval.toFixed(1)}% APPROVAL`,
    },
    metroChronicleTake:
      treasury.monthlyNet >= 0
        ? `"Fiscal discipline is finally visible on the municipal ledger, though businesses still demand predictable permitting."`
        : `"City Hall's red ink is an open invitation for capital flight unless spending doctrines tighten next month."`,
    streetlightTake:
      grid.globalAverages.pollution > 60 || grid.globalAverages.crime > 60
        ? `"Working neighborhoods are still breathing the fallout—glossy press releases won't pave over dirty air or unsafe blocks."`
        : `"Grassroots organizers note cautious progress on the avenues, but warn City Hall not to sideline neighborhood voices."`,
    onTheHorizonWarning,
    publicHearingsDebate:
      state.pendingSponsoredBills?.length > 0
        ? state.pendingSponsoredBills.map((b) => ({
            billTitle: b.formalTitle,
            analysis:
              b.publicDebateSummary ??
              `Committee hearings erupted over "${b.formalTitle}" as neighborhood advocates and business lobbyists clashed over who would pay for enforcement.`,
            metroChronicleTake:
              b.metroChronicleDebate ??
              `The Metro Chronicle: "City Hall must clarify compliance costs before forcing '${b.formalTitle}' to a floor vote."`,
            streetlightTake:
              b.streetlightDebate ??
              `The Streetlight: "Residents packed the chamber demanding '${b.formalTitle}' protect working wards without loopholes."`,
          }))
        : undefined,
    isAIGenerated: false,
  };
}

export async function generateMonthlyBroadsheet(
  state: GameState
): Promise<FrontPageBroadsheet> {
  const fallback = buildDeterministicBroadsheet(state);
  if (!webLLMService.isEngineReady()) {
    return fallback;
  }

  const recentLaws = state.enactedPolicies
    .filter((p) => p.enactedTurn >= Math.max(1, state.time.turn - 1))
    .slice(0, 4);
  const lawsPrompt =
    recentLaws.length > 0
      ? recentLaws
          .map(
            (l) =>
              `- "${l.policy_name}" (Prompt: "${l.originalPromptText ?? l.vibe_feed_headline}"; Budget: ${l.budget_impact.monthly_change >= 0 ? "+" : ""}$${l.budget_impact.monthly_change}/mo)`
          )
          .join("\n")
      : "- No new statutory decrees enacted last month; governing via existing doctrines.";

  const { cityReport, treasury, voterSentiment, time, grid } = state;

  const docketPrompt =
    state.monthlyDocket
      .map((d) => `- [${d.pillar.toUpperCase()}] "${d.title}": ${d.briefing}`)
      .join("\n") || "- Four municipal dilemmas awaiting council vote.";

  const systemPrompt = `You are the satirical, razor-sharp editorial desk of "THE MUNICIPAL DISPATCH", a NationStates-meets-Fabledom city newspaper.
Write the Month ${time.turn} front-page broadsheet reacting DIRECTLY to the exact policies and doctrines active in ${grid.startingArchetype} AND introducing this month's 4 docket crises.

ACTIVE GOVERNING DOCTRINES:
- Fiscal: ${state.doctrines.fiscal} | Justice: ${state.doctrines.justice} | Urban: ${state.doctrines.urban}

CITY MOOD CONTEXT (FOR TONE ONLY — DO NOT QUOTE RAW NUMBERS IN PROSE):
- Overall Mood: ${voterSentiment.overallApproval >= 55 ? "Buoyant" : voterSentiment.overallApproval < 35 ? "Mutinous" : "Restless"} | Treasury: ${treasury.monthlyNet >= 0 ? "Surplus" : "Deficit"}
- Strain Areas: Crime=${Math.round(cityReport.pillars.crime.currentValue)}, Pollution=${Math.round(cityReport.pillars.pollution.currentValue)}, Housing=${Math.round(cityReport.pillars.land_value.currentValue)}, Traffic=${Math.round(cityReport.pillars.traffic.currentValue)}

LAWS PASSED RECENTLY:
${lawsPrompt}

THIS MONTH'S 4 DOCKET CRISES:
${docketPrompt}

STRICT WRITING RULES:
1. NEVER list raw metric numbers or numeric deltas inside the newspaper paragraphs (e.g., do NOT write "Crime stands at 66 (+0)" or "Approval is 52%"—the sidebar already shows numbers).
2. Write 3-4 hilarious, vivid, character-driven paragraphs focusing on bizarre unintended consequences, bureaucratic absurdity, eccentric local business schemes, and deadpan reactions to the exact policies and doctrines active in the city.

Return STRICTLY a valid raw JSON object matching this exact schema:
{
  "lead_headline": "string (punchy satirical newspaper headline, max 95 chars)",
  "subhead": "string (1 crisp deck sentence, max 160 chars)",
  "fallout_paragraphs": [
    "string (Paragraph 1: vivid street-level consequences of last month's specific laws/doctrines—NO raw stats)",
    "string (Paragraph 2: absurd loophole exploited by eccentric citizens or local businesses)",
    "string (Paragraph 3: bureaucratic comedy, unexpected cultural fad, or neighborhood winners vs. losers)",
    "string (Paragraph 4: colorful closing vignette from the avenues)"
  ],
  "resident_quote": "string (1 deadpan fictional resident quote with name & neighborhood reacting to active laws)",
  "crises_paragraphs": [
    "string (Paragraph 1: investigative reporting introducing the 4 new dilemmas on this month's docket)",
    "string (Paragraph 2: why citizens, unions, and businesses are demanding immediate action before tensions boil over)"
  ],
  "winners_group": "string (who benefited most)",
  "winners_summary": "string (1 short sentence why they won)",
  "losers_group": "string (who is furious)",
  "losers_summary": "string (1 short sentence why they are furious)",
  "metro_chronicle_take": "string (1-sentence pro-business/establishment editorial quote)",
  "streetlight_take": "string (1-sentence grassroots/labor/green editorial quote)",
  "on_the_horizon_warning": "string (1 bold Comptroller/Analyst warning foreshadowing looming risks)"
}

CRITICAL: Respond ONLY with valid raw JSON. Never output the literal word "string".`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Publish this month's multi-paragraph front-page broadsheet JSON now.",
      0.82,
      1200
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;

    const str = (key: string, fb: string, maxLen = 420): string => {
      const v = parsed[key];
      if (typeof v !== "string") return fb;
      const t = v.trim();
      if (!t || t.toLowerCase() === "string") return fb;
      return t.slice(0, maxLen);
    };

    const strArr = (key: string, fb: string[], minItems = 2): string[] => {
      const v = parsed[key];
      if (!Array.isArray(v)) return fb;
      const cleaned = v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => x.length > 20 && x.toLowerCase() !== "string")
        .map((x) => x.slice(0, 520));
      return cleaned.length >= minItems ? cleaned.slice(0, 4) : fb;
    };

    const falloutParagraphs = strArr(
      "fallout_paragraphs",
      fallback.falloutParagraphs,
      3
    );
    const crisesParagraphs = strArr(
      "crises_paragraphs",
      fallback.crisesParagraphs,
      2
    );

    return {
      ...fallback,
      leadHeadline: str("lead_headline", fallback.leadHeadline, 110),
      subhead: str("subhead", fallback.subhead, 200),
      humanScaleRipple: falloutParagraphs[1] ?? falloutParagraphs[0] ?? fallback.humanScaleRipple,
      falloutParagraphs,
      crisesParagraphs,
      residentQuote: str("resident_quote", fallback.residentQuote ?? "", 260) || fallback.residentQuote,
      winnersBox: {
        group: str("winners_group", fallback.winnersBox.group, 60),
        summary: str("winners_summary", fallback.winnersBox.summary, 160),
        deltaText: fallback.winnersBox.deltaText,
      },
      losersBox: {
        group: str("losers_group", fallback.losersBox.group, 60),
        summary: str("losers_summary", fallback.losersBox.summary, 160),
        deltaText: fallback.losersBox.deltaText,
      },
      metroChronicleTake: str("metro_chronicle_take", fallback.metroChronicleTake, 200),
      streetlightTake: str("streetlight_take", fallback.streetlightTake, 200),
      onTheHorizonWarning: str("on_the_horizon_warning", fallback.onTheHorizonWarning, 220),
      isAIGenerated: true,
    };
  } catch (err) {
    console.error("Broadsheet Generation Error:", err);
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// 9. Rich End-of-Term Historical Post-Mortem (Tone-Adaptive + Hall of Fame/Infamy)
// ----------------------------------------------------------------------------

export interface HistoricalPostMortemResult {
  toneCategory: LegacyChronicleState["toneCategory"];
  encyclopediaEntry: string;
  toneAdaptiveVerdict: string;
  hallOfFameAudit: HallOfFameLawEntry[];
}

function classifyToneCategory(
  state: GameState,
  outcome: LegacyChronicleState["outcome"]
): LegacyChronicleState["toneCategory"] {
  if (outcome === "bankruptcy" || outcome === "recall" || outcome === "defeat") {
    return "collapse";
  }
  const avgApproval = state.voterSentiment.overallApproval;
  const maxTension = Math.max(
    state.tensions.Crime,
    state.tensions.Transit,
    state.tensions.Sanitation
  );
  if (avgApproval >= 62 && state.treasury.reserves > 0 && maxTension < 65) {
    return "triumph";
  }
  if (maxTension >= 75 || state.politicalCompass.governanceAxis >= 35) {
    return "chaos";
  }
  return "pragmatic";
}

function buildDeterministicPostMortem(
  state: GameState,
  outcome: LegacyChronicleState["outcome"]
): HistoricalPostMortemResult {
  const toneCategory = classifyToneCategory(state, outcome);
  const encyclopediaEntry = buildDeterministicEncyclopediaEntry(state, outcome);

  const verdictByTone: Record<LegacyChronicleState["toneCategory"], string> = {
    triumph: `TRIUMPHANT GOLDEN AGE: Against steep odds in ${state.grid.startingArchetype}, your administration leaves office with ${state.voterSentiment.overallApproval.toFixed(1)}% approval and $${state.treasury.reserves.toLocaleString()} in the vault. Future mayors will study your playbook for decades.`,
    chaos: `IRON-FISTED PANDEMONIUM: You kept the seat of power moving, but streets simmered under heavy-handed decrees and sky-high tensions. Historians still argue whether it was bold leadership or municipal theater.`,
    collapse: `SPECTACULAR CIVIC WRECKAGE: Between emptied coffers and furious voters, the administration became a cautionary tale taught in every public-finance seminar—mostly as a "what not to sign" slide deck.`,
    pragmatic: `SURVIVOR'S COMPROMISE: Neither utopia nor disaster, your term was defined by hard-nosed triage, late-night council horse-trading, and keeping the streetlights on through ${state.time.totalTurnsPlayed} turbulent months.`,
  };

  const sortedHistory = [...state.enactedLawsHistory].sort((a, b) => {
    const scoreA =
      Math.abs(a.cumulativeFiscalNet) / 5_000 +
      Object.values(a.cumulativeMetricImpact).reduce(
        (s, v) => s + Math.abs(v ?? 0),
        0
      );
    const scoreB =
      Math.abs(b.cumulativeFiscalNet) / 5_000 +
      Object.values(b.cumulativeMetricImpact).reduce(
        (s, v) => s + Math.abs(v ?? 0),
        0
      );
    return scoreB - scoreA;
  });

  const hallOfFameAudit: HallOfFameLawEntry[] = sortedHistory
    .slice(0, 5)
    .map((law) => {
      const metricSum = Object.entries(law.cumulativeMetricImpact)
        .filter(([, v]) => typeof v === "number" && Math.abs(v) > 0)
        .map(
          ([k, v]) =>
            `${k.replace("_", " ")}: ${(v ?? 0) > 0 ? `+${Math.round(v ?? 0)}` : Math.round(v ?? 0)}`
        )
        .join(", ");
      const fiscalText = `${law.cumulativeFiscalNet >= 0 ? "+" : "-"}$${Math.abs(
        Math.round(law.cumulativeFiscalNet)
      ).toLocaleString()} cumulative fiscal`;
      const isGoodFiscal = law.cumulativeFiscalNet >= 0;
      const verdictTag: HallOfFameLawEntry["verdictTag"] =
        isGoodFiscal && law.triggeredFallout.length === 0
          ? "HALL OF FAME"
          : law.triggeredFallout.length > 0 || law.cumulativeFiscalNet < -200_000
          ? "HALL OF INFAMY"
          : "CURIOUS FOOTNOTE";

      return {
        lawName: law.title,
        verdictTag,
        cumulativeSummary: `${law.monthsActive} mo active | ${fiscalText}${
          metricSum ? ` | ${metricSum}` : ""
        }`,
        historianNote:
          law.triggeredFallout.length > 0
            ? `Remembered in local folklore for sparking: "${law.triggeredFallout[0]}".`
            : law.repealedTurn !== null
            ? `Enacted in Month ${law.enactedTurn} and quietly repealed in Month ${law.repealedTurn} after intense street debate.`
            : `Remained on the books for ${law.monthsActive} months, shaping daily life across ${state.grid.startingArchetype}.`,
      };
    });

  return {
    toneCategory,
    encyclopediaEntry,
    toneAdaptiveVerdict: verdictByTone[toneCategory],
    hallOfFameAudit,
  };
}

export async function generateHistoricalPostMortem(
  state: GameState,
  outcome: LegacyChronicleState["outcome"]
): Promise<HistoricalPostMortemResult> {
  const fallback = buildDeterministicPostMortem(state, outcome);
  if (!webLLMService.isEngineReady()) {
    return fallback;
  }

  const day1 = state.monthlyHistory[0];
  const lawDigest =
    state.enactedLawsHistory
      .slice(0, 12)
      .map(
        (l) =>
          `- "${l.title}" (${l.kind}, ${l.monthsActive}mo, CumFiscal: $${Math.round(
            l.cumulativeFiscalNet
          )}, Metrics: ${JSON.stringify(l.cumulativeMetricImpact)}${
            l.triggeredFallout.length > 0
              ? `, Fallout: "${l.triggeredFallout[0]}"`
              : ""
          })`
      )
      .join("\n") || "- Governed strictly via broad executive doctrines.";

  const systemPrompt = `You are a witty, perceptive Municipal Historian writing the definitive Post-Mortem for a completed Governor/Mayor campaign.
Adapt your tone sharply to the outcome:
- If triumphant (high approval, healthy treasury): celebratory yet sharp.
- If chaotic (high tensions or authoritarian): darkly hilarious and dramatic.
- If collapse (bankruptcy/recall/defeat): brutally satirical and incisive.

CAMPAIGN RECORD:
- Outcome: ${outcome.toUpperCase()} after ${state.time.totalTurnsPlayed} months in ${state.grid.startingArchetype}
- Political Compass: "${state.politicalCompass.leaderTitle}" (Econ=${state.politicalCompass.economicAxis}, Gov=${state.politicalCompass.governanceAxis})
- Day 1 vs Final: Approval ${day1 ? day1.approval.toFixed(1) : "?"}% -> ${state.voterSentiment.overallApproval.toFixed(1)}%, Reserves $${day1 ? day1.treasury.toLocaleString() : "?"} -> $${state.treasury.reserves.toLocaleString()}
- Final Pillars: Crime ${Math.round(state.grid.globalAverages.crime)}, Pollution ${Math.round(state.grid.globalAverages.pollution)}, Land Value ${Math.round(state.grid.globalAverages.land_value)}, Traffic ${Math.round(state.grid.globalAverages.traffic)}

AGGREGATED LEGISLATIVE RECORD:
${lawDigest}

Return STRICTLY a valid raw JSON object:
{
  "encyclopedia_entry": "string (3 sentences, crisp Wikipedia-style summary)",
  "tone_adaptive_verdict": "string (2-3 sentences judging the administration in a tone matching the outcome)",
  "hall_of_fame_audit": [
    {
      "law_name": "string (exact law name from record)",
      "verdict_tag": "HALL OF FAME | HALL OF INFAMY | CURIOUS FOOTNOTE",
      "historian_note": "string (1 punchy sentence on how historians or local folklore remember this decree)"
    }
  ]
}

CRITICAL: Respond ONLY with valid raw JSON.`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Write the complete Historical Post-Mortem JSON now.",
      0.7,
      850
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;

    const entry =
      typeof parsed.encyclopedia_entry === "string" &&
      parsed.encyclopedia_entry.trim().length > 20
        ? parsed.encyclopedia_entry.trim().slice(0, 650)
        : fallback.encyclopediaEntry;

    const verdict =
      typeof parsed.tone_adaptive_verdict === "string" &&
      parsed.tone_adaptive_verdict.trim().length > 20
        ? parsed.tone_adaptive_verdict.trim().slice(0, 480)
        : fallback.toneAdaptiveVerdict;

    const rawAudit = Array.isArray(parsed.hall_of_fame_audit)
      ? parsed.hall_of_fame_audit
      : [];

    const mergedAudit: HallOfFameLawEntry[] =
      rawAudit.length > 0
        ? rawAudit.slice(0, 5).map((item, idx) => {
            const obj = (item ?? {}) as Record<string, unknown>;
            const name =
              typeof obj.law_name === "string" && obj.law_name.trim()
                ? obj.law_name.trim().slice(0, 80)
                : fallback.hallOfFameAudit[idx]?.lawName ?? "Executive Decree";
            const matchedFallback =
              fallback.hallOfFameAudit.find(
                (f) => f.lawName.toLowerCase() === name.toLowerCase()
              ) ?? fallback.hallOfFameAudit[idx];
            const tagRaw =
              typeof obj.verdict_tag === "string"
                ? obj.verdict_tag.toUpperCase()
                : "";
            const verdictTag: HallOfFameLawEntry["verdictTag"] =
              tagRaw.includes("FAME")
                ? "HALL OF FAME"
                : tagRaw.includes("INFAMY")
                ? "HALL OF INFAMY"
                : "CURIOUS FOOTNOTE";
            const note =
              typeof obj.historian_note === "string" &&
              obj.historian_note.trim().length > 10
                ? obj.historian_note.trim().slice(0, 220)
                : matchedFallback?.historianNote ??
                  "Debated in municipal archives for years to come.";
            return {
              lawName: name,
              verdictTag,
              cumulativeSummary:
                matchedFallback?.cumulativeSummary ?? "Enacted during term",
              historianNote: note,
            };
          })
        : fallback.hallOfFameAudit;

    return {
      toneCategory: fallback.toneCategory,
      encyclopediaEntry: entry,
      toneAdaptiveVerdict: verdict,
      hallOfFameAudit: mergedAudit,
    };
  } catch (err) {
    console.error("Historical Post-Mortem Error:", err);
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// 10. Two-Turn "Sponsor Custom Bill" Pipeline (Step 1 Draft & Step 2 Debate)
// ----------------------------------------------------------------------------

function inferPillarFromText(text: string): CivicPillar {
  const lower = text.toLowerCase();
  if (/school|edu|library|teacher|youth|literacy|academy|student/.test(lower)) {
    return "education";
  }
  if (/health|clinic|hospital|medic|nurse|mental|welfare|doctor/.test(lower)) {
    return "health";
  }
  if (/police|crime|curfew|safety|patrol|theft|gang|security/.test(lower)) {
    return "crime";
  }
  if (/pollut|smog|green|solar|carbon|waste|recycl|park|tree|water|air/.test(lower)) {
    return "pollution";
  }
  if (/traffic|bus|rail|bike|road|toll|freight|drone|transit|parking|street/.test(lower)) {
    return "traffic";
  }
  return "land_value";
}

function buildDeterministicSponsoredBillDraft(
  rawProposalText: string,
  currentState: GameState
): SponsoredBillProposal {
  const clean = rawProposalText.trim();
  const pillar = inferPillarFromText(clean);
  const shortTitle =
    clean.length > 36 ? `${clean.slice(0, 33).trim()} Act` : `${clean} Act`;
  const idBase = `sponsored-${currentState.time.turn}-${Date.now()}`;

  const passAsWrittenEffect = parseAndClampAIPolicyResponse(
    JSON.stringify({
      policy_name: shortTitle.slice(0, 40),
      vibe_feed_headline: `Council passes "${shortTitle.slice(0, 38)}" as written.`,
      budget_impact: { monthly_change: -22000 },
      heatmap_modifiers: [
        { metric: pillar, change: pillar === "land_value" ? 10 : -12 },
      ],
      demographic_approval: [
        { demographic: "working_class", change: 5 },
        { demographic: "business", change: -3 },
      ],
      unintended_consequence_trigger:
        "Opportunistic residents immediately invent creative workarounds to test enforcement.",
      outcome_story: `Within 48 hours of passing "${shortTitle}" as written, City Hall's hotline was flooded with baffled inquiries. Corner shopkeepers immediately found a semantic loophole in Section 2, while neighborhood watch captains printed laminated pocket guides to enforce it themselves.\n\n"Look, I read the ordinance twice and it technically lets me register my espresso cart as a civic landmark," joked one downtown vendor to cheering commuters.`,
    })
  );

  const compromiseEffect = parseAndClampAIPolicyResponse(
    JSON.stringify({
      policy_name: `${shortTitle.slice(0, 28)} (Amended)`,
      vibe_feed_headline: `Council passes amended "${shortTitle.slice(0, 32)}".`,
      budget_impact: { monthly_change: -10000 },
      heatmap_modifiers: [
        { metric: pillar, change: pillar === "land_value" ? 6 : -7 },
      ],
      demographic_approval: [
        { demographic: "working_class", change: 4 },
        { demographic: "business", change: 3 },
      ],
      unintended_consequence_trigger: "None",
      outcome_story: `After a marathon committee markup, City Hall enacted a watered-down version of "${shortTitle}" with generous phase-in exemptions. Both union stewards and Chamber lobbyists claimed partial victory while quietly grumbling in the hallway.\n\n"It's half the teeth and twice the paperwork, which means it's peak municipal democracy," sighed a veteran city clerk.`,
    })
  );

  const withdrawEffect = parseAndClampAIPolicyResponse(
    JSON.stringify({
      policy_name: `Tabled: ${shortTitle.slice(0, 30)}`,
      vibe_feed_headline: `Mayor tables "${shortTitle.slice(0, 36)}" after hearings.`,
      budget_impact: { monthly_change: 0 },
      heatmap_modifiers: [],
      demographic_approval: [{ demographic: "business", change: 2 }],
      unintended_consequence_trigger: "None",
      outcome_story: `Citing fierce committee testimony, the administration quietly shelved "${shortTitle}" before the floor vote. Relief rippled through business owners, though grassroots organizers vowed to return next month with louder megaphones.`,
    })
  );

  return {
    id: idBase,
    introducedTurn: currentState.time.turn,
    rawProposalText: clean,
    formalTitle: shortTitle,
    targetPillar: pillar,
    briefing: `Sponsored by your administration last month: "${clean}". After 30 days of heated public hearings, the bill now comes up for a binding floor vote.`,
    presets: [
      {
        id: `${idBase}-opt-1`,
        stanceLabel: "Pass as Written",
        optionTitle: `Enact "${shortTitle}" Unamended`,
        description: "Push the full original ordinance through with maximum impact.",
        capitalCost: 10,
        policyEffect: passAsWrittenEffect,
      },
      {
        id: `${idBase}-opt-2`,
        stanceLabel: "Compromise Amendments",
        optionTitle: `Pass "${shortTitle}" with Amendments`,
        description: "Soften enforcement & add small-business exemptions to win consensus.",
        capitalCost: 0,
        policyEffect: compromiseEffect,
      },
      {
        id: `${idBase}-opt-3`,
        stanceLabel: "Table / Withdraw Bill",
        optionTitle: `Withdraw "${shortTitle}"`,
        description: "Shelve the proposal after public pushback; zero fiscal cost.",
        capitalCost: 0,
        policyEffect: withdrawEffect,
      },
    ],
  };
}

export async function generateSponsoredBillDraft(
  rawProposalText: string,
  currentState: GameState
): Promise<SponsoredBillProposal> {
  const fallback = buildDeterministicSponsoredBillDraft(
    rawProposalText,
    currentState
  );
  if (!webLLMService.isEngineReady()) {
    return fallback;
  }

  const systemPrompt = `You are the Legislative Counsel for "Governor".
The player wants to sponsor a Custom Bill for NEXT MONTH's Docket vote:
Proposal: "${rawProposalText.trim()}"
City Archetype: ${currentState.grid.startingArchetype}
Active Laws: ${currentState.enactedPolicies.map((l) => l.policy_name).join(", ") || "None"}

Generate a formal bill title, target pillar, and 3 legislative paths:
1. "Pass as Written" (Bold, full effect)
2. "Pass with Compromise Amendments" (Balanced, lower cost)
3. "Table / Withdraw Bill" (0 budget, minimal approval shift)

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', negative change (-15) REDUCES the problem; positive (+15) WORSENS it. For 'land_value' and 'demographic_approval', positive (+15) helps.

Return STRICTLY valid raw JSON:
{
  "formal_title": "string (Max 55 chars)",
  "target_pillar": "crime" | "pollution" | "land_value" | "traffic",
  "briefing": "string (2-sentence summary of the bill)",
  "presets": [
    {
      "stance_label": "Pass as Written" | "Compromise Amendments" | "Table / Withdraw Bill",
      "option_title": "string",
      "description": "string",
      "policy_effect": {
        "policy_name": "string (Max 40 chars)",
        "vibe_feed_headline": "string (Max 80 chars)",
        "budget_impact": { "monthly_change": number (-100000 to 100000) },
        "heatmap_modifiers": [{ "metric": "crime" | "pollution" | "land_value" | "traffic", "change": number (-20 to 20) }],
        "demographic_approval": [{ "demographic": "working_class" | "wealthy" | "business" | "environmentalists", "change": number (-15 to 15) }],
        "unintended_consequence_trigger": "None" or 1-sentence side effect,
        "outcome_story": "string (2 satirical paragraphs with local quotes & loopholes)"
      }
    }
  ]
}`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Draft the Sponsored Bill JSON now.",
      0.7,
      1100
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;
    const pillar =
      normalizeCivicPillar(parsed.target_pillar) ?? fallback.targetPillar;
    const formalTitle =
      typeof parsed.formal_title === "string" && parsed.formal_title.trim()
        ? parsed.formal_title.trim().slice(0, 55)
        : fallback.formalTitle;
    const briefing =
      typeof parsed.briefing === "string" && parsed.briefing.trim()
        ? parsed.briefing.trim().slice(0, 260)
        : fallback.briefing;

    const rawPresets = Array.isArray(parsed.presets) ? parsed.presets : [];
    const costs: [number, number, number] = [10, 0, 0];
    const presets = ([0, 1, 2] as const).map((idx) => {
      const pr =
        rawPresets[idx] && typeof rawPresets[idx] === "object"
          ? (rawPresets[idx] as Record<string, unknown>)
          : null;
      if (!pr) return fallback.presets[idx];
      return {
        id: `${fallback.id}-opt-${idx + 1}`,
        stanceLabel:
          typeof pr.stance_label === "string" && pr.stance_label.trim()
            ? pr.stance_label.trim().slice(0, 32)
            : fallback.presets[idx].stanceLabel,
        optionTitle:
          typeof pr.option_title === "string" && pr.option_title.trim()
            ? pr.option_title.trim().slice(0, 55)
            : fallback.presets[idx].optionTitle,
        description:
          typeof pr.description === "string" && pr.description.trim()
            ? pr.description.trim().slice(0, 160)
            : fallback.presets[idx].description,
        capitalCost: costs[idx],
        policyEffect: pr.policy_effect
          ? parseAndClampAIPolicyResponse(JSON.stringify(pr.policy_effect))
          : fallback.presets[idx].policyEffect,
      };
    }) as [DocketPresetOption, DocketPresetOption, DocketPresetOption];

    return {
      ...fallback,
      formalTitle,
      targetPillar: pillar,
      briefing,
      presets,
    };
  } catch (err) {
    console.error("Sponsored Bill Draft Error:", err);
    return fallback;
  }
}

export async function evaluateSponsoredBillsDebate(
  bills: SponsoredBillProposal[],
  state: GameState
): Promise<{
  evaluatedBills: SponsoredBillProposal[];
  hearings: PublicHearingDebateEntry[];
}> {
  if (bills.length === 0) {
    return { evaluatedBills: [], hearings: [] };
  }

  const fallbackHearings: PublicHearingDebateEntry[] = bills.map((b) => ({
    billTitle: b.formalTitle,
    analysis: `Public hearings over "${b.formalTitle}" drew standing-room crowds as citizens argued how it would collide with ${
      state.enactedPolicies[0]?.policy_name
        ? `existing "${state.enactedPolicies[0].policy_name}" rules`
        : "current city ordinances"
    }. Lobbyists warned of hilarious compliance bottlenecks while supporters cheered the bold swing.`,
    metroChronicleTake: `The Metro Chronicle: "Unless amended, '${b.formalTitle}' risks tying small storefronts in bureaucratic knots."`,
    streetlightTake: `The Streetlight: "Working neighborhoods showed up in force—now City Hall must vote with backbone."`,
  }));

  if (!webLLMService.isEngineReady()) {
    return {
      evaluatedBills: bills.map((b, i) => ({
        ...b,
        publicDebateSummary: fallbackHearings[i].analysis,
        metroChronicleDebate: fallbackHearings[i].metroChronicleTake,
        streetlightDebate: fallbackHearings[i].streetlightTake,
        briefing: `${b.briefing} Public Hearings Verdict: ${fallbackHearings[i].analysis}`,
      })),
      hearings: fallbackHearings,
    };
  }

  const systemPrompt = `You are the Municipal Press & Public Hearings Desk.
Evaluate how these Sponsored Bills collided with existing laws and public mood during 30 days of citywide debate:
BILLS:
${bills.map((b, i) => `${i + 1}. "${b.formalTitle}": "${b.rawProposalText}"`).join("\n")}

EXISTING ACTIVE LAWS:
${state.enactedPolicies.map((l) => `- ${l.policy_name}`).join("\n") || "None"}

Return STRICTLY valid raw JSON:
{
  "hearings": [
    {
      "bill_title": "string",
      "analysis": "string (2 hilarious, sharp sentences predicting unintended consequences or backlash before the vote)",
      "metro_chronicle_take": "string (1-sentence pro-business take)",
      "streetlight_take": "string (1-sentence grassroots/labor take)"
    }
  ]
}`;

  try {
    const rawJson = await webLLMService.requestRawJsonCompletion(
      systemPrompt,
      "Write the Public Hearings & Debate JSON now.",
      0.8,
      700
    );
    const extracted = sanitizeAndExtractJsonObject(rawJson);
    const parsed = JSON.parse(extracted) as Record<string, unknown>;
    const rawHearings = Array.isArray(parsed.hearings) ? parsed.hearings : [];

    const hearings: PublicHearingDebateEntry[] = bills.map((b, idx) => {
      const h =
        rawHearings[idx] && typeof rawHearings[idx] === "object"
          ? (rawHearings[idx] as Record<string, unknown>)
          : null;
      const fb = fallbackHearings[idx];
      return {
        billTitle: b.formalTitle,
        analysis:
          h && typeof h.analysis === "string" && h.analysis.trim().length > 15
            ? h.analysis.trim().slice(0, 360)
            : fb.analysis,
        metroChronicleTake:
          h &&
          typeof h.metro_chronicle_take === "string" &&
          h.metro_chronicle_take.trim().length > 10
            ? h.metro_chronicle_take.trim().slice(0, 200)
            : fb.metroChronicleTake,
        streetlightTake:
          h &&
          typeof h.streetlight_take === "string" &&
          h.streetlight_take.trim().length > 10
            ? h.streetlight_take.trim().slice(0, 200)
            : fb.streetlightTake,
      };
    });

    const evaluatedBills = bills.map((b, i) => ({
      ...b,
      publicDebateSummary: hearings[i].analysis,
      metroChronicleDebate: hearings[i].metroChronicleTake,
      streetlightDebate: hearings[i].streetlightTake,
      briefing: `${b.briefing} Public Hearings Verdict: ${hearings[i].analysis}`,
    }));

    return { evaluatedBills, hearings };
  } catch (err) {
    console.error("Sponsored Bill Debate Evaluation Error:", err);
    return { evaluatedBills: bills, hearings: fallbackHearings };
  }
}

// ----------------------------------------------------------------------------
// 11. Performance Pass: Batched Single-Call Between-Turn AI Inference
// Consolidates Monthly Broadsheet + Rival Op-Eds + Next Month's 4 Docket Issues
// into ONE structured JSON call (max_tokens: 1100, last 8 laws, compact keywords).
// ----------------------------------------------------------------------------

export async function generateBatchedTurnContent(
  stateSnapshot: GameState,
  hearings: PublicHearingDebateEntry[] = []
): Promise<{
  broadsheet: FrontPageBroadsheet;
  docketIssues: MonthlyDocketIssue[];
}> {
  const fallbackBroadsheet = buildDeterministicBroadsheet(stateSnapshot);
  const fallbackWithHearings: FrontPageBroadsheet = {
    ...fallbackBroadsheet,
    publicHearingsDebate:
      hearings.length > 0
        ? hearings
        : fallbackBroadsheet.publicHearingsDebate,
  };

  if (!webLLMService.isEngineReady()) {
    return { broadsheet: fallbackWithHearings, docketIssues: [] };
  }

  const targetTurn = stateSnapshot.time.turn;
  const targetPillars = sampleFourPillars();
  const sampledDomains = sampleRandomCivicDomains(4);
  const last8Laws = stateSnapshot.enactedPolicies.slice(0, 8);
  const compactKeywords = Array.from(
    new Set([
      ...getCrossGameSeenTopicKeywords(),
      ...(stateSnapshot.seenTopicKeywords ?? []),
    ])
  ).slice(-25);
  const blacklistTitles = Array.from(
    new Set([...getCrossGameSeenIssueTitles(), ...stateSnapshot.pastIssueTitles])
  ).slice(-25);

  const lawsDigest =
    last8Laws.length === 0
      ? "None yet."
      : last8Laws
          .map(
            (l) =>
              `- "${l.policy_name}" (${l.budget_impact.monthly_change >= 0 ? "+" : ""}$${l.budget_impact.monthly_change}/mo)`
          )
          .join("\n");

  const systemPrompt = `You are the satirical press & legislative engine for "Armchair Mayor" (${stateSnapshot.grid.startingArchetype}, Month ${targetTurn}).
Doctrines: Fiscal=${stateSnapshot.doctrines.fiscal}, Justice=${stateSnapshot.doctrines.justice}, Urban=${stateSnapshot.doctrines.urban}.
Mood: ${stateSnapshot.voterSentiment.overallApproval >= 55 ? "Buoyant" : stateSnapshot.voterSentiment.overallApproval < 35 ? "Mutinous" : "Restless"}, Net=${stateSnapshot.treasury.monthlyNet >= 0 ? "Surplus" : "Deficit"}.

LAST 8 ACTIVE LAWS:
${lawsDigest}

BANNED KEYWORDS/TITLES (DO NOT REPEAT):
${JSON.stringify(compactKeywords)} | ${JSON.stringify(blacklistTitles)}

REQUIRED 4 DISTINCT PILLARS & DOMAINS:
1. ${targetPillars[0]} (${sampledDomains[0]})
2. ${targetPillars[1]} (${sampledDomains[1]})
3. ${targetPillars[2]} (${sampledDomains[2]})
4. ${targetPillars[3]} (${sampledDomains[3]})

RULES:
- Newspaper prose must NEVER quote raw metric numbers or deltas; write 3 witty NationStates-style satirical paragraphs + 1 deadpan resident quote + rival quotes (The Metro Chronicle vs The Streetlight).
- Docket issues must interlock with active laws when present. For crime/pollution/traffic, negative (-15) helps; for land_value/education/health/approval, positive (+15) helps.

Return STRICTLY raw JSON:
{
  "broadsheet": {
    "lead_headline": "string",
    "subhead": "string",
    "fallout_paragraphs": ["string", "string", "string"],
    "resident_quote": "string",
    "crises_paragraphs": ["string", "string"],
    "metro_chronicle_take": "string",
    "streetlight_take": "string",
    "on_the_horizon_warning": "string"
  },
  "issues": [
    {
      "pillar": "${targetPillars.join('" | "')}",
      "domain_tag": "string",
      "title": "string",
      "briefing": "string",
      "is_follow_up_arc": boolean,
      "influenced_by_law": "string or null",
      "presets": [
        {
          "stance_label": "string",
          "option_title": "string",
          "description": "string",
          "policy_effect": {
            "policy_name": "string",
            "vibe_feed_headline": "string",
            "budget_impact": { "monthly_change": number },
            "heatmap_modifiers": [{ "metric": "crime"|"pollution"|"land_value"|"traffic"|"education"|"health", "change": number }],
            "demographic_approval": [{ "demographic": "working_class"|"wealthy"|"business"|"environmentalists", "change": number }],
            "unintended_consequence_trigger": "None" or "string"
          }
        }
      ]
    }
  ]
}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const rawJson = await webLLMService.requestRawJsonCompletion(
        systemPrompt,
        attempt === 1
          ? `Generate Month ${targetTurn} batched broadsheet and 4-issue docket JSON now.`
          : `CRITICAL: Previous output was invalid JSON. Return ONLY valid raw JSON matching the exact schema.`,
        attempt === 1 ? 0.82 : 0.65,
        1100
      );

      const extracted = sanitizeAndExtractJsonObject(rawJson);
      const parsed = JSON.parse(extracted) as Record<string, unknown>;
      const bObj = (parsed.broadsheet ?? {}) as Record<string, unknown>;

      const str = (v: unknown, fb: string, maxLen = 400): string =>
        typeof v === "string" &&
        v.trim().length > 5 &&
        v.trim().toLowerCase() !== "string"
          ? v.trim().slice(0, maxLen)
          : fb;

      const strArr = (v: unknown, fb: string[], minLen = 2): string[] => {
        if (!Array.isArray(v)) return fb;
        const cleaned = v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter((x) => x.length > 18 && x.toLowerCase() !== "string")
          .map((x) => x.slice(0, 480));
        return cleaned.length >= minLen ? cleaned.slice(0, 4) : fb;
      };

      const falloutParagraphs = strArr(
        bObj.fallout_paragraphs,
        fallbackWithHearings.falloutParagraphs,
        2
      );
      const crisesParagraphs = strArr(
        bObj.crises_paragraphs,
        fallbackWithHearings.crisesParagraphs,
        2
      );

      const broadsheet: FrontPageBroadsheet = {
        ...fallbackWithHearings,
        leadHeadline: str(bObj.lead_headline, fallbackWithHearings.leadHeadline, 110),
        subhead: str(bObj.subhead, fallbackWithHearings.subhead, 200),
        humanScaleRipple:
          falloutParagraphs[1] ??
          falloutParagraphs[0] ??
          fallbackWithHearings.humanScaleRipple,
        falloutParagraphs,
        crisesParagraphs,
        residentQuote: str(
          bObj.resident_quote,
          fallbackWithHearings.residentQuote ?? "",
          260
        ),
        metroChronicleTake: str(
          bObj.metro_chronicle_take,
          fallbackWithHearings.metroChronicleTake,
          200
        ),
        streetlightTake: str(
          bObj.streetlight_take,
          fallbackWithHearings.streetlightTake,
          200
        ),
        onTheHorizonWarning: str(
          bObj.on_the_horizon_warning,
          fallbackWithHearings.onTheHorizonWarning,
          220
        ),
        isAIGenerated: true,
      };

      const docketIssues = parseAndClampAIDocketPayload(
        JSON.stringify({ issues: parsed.issues }),
        targetTurn,
        blacklistTitles
      );

      if (docketIssues.length > 0) {
        recordCrossGameIssueTitles(docketIssues.map((i) => i.title));
      }

      return { broadsheet, docketIssues };
    } catch (err) {
      console.error(
        `Batched Turn Content Error (Attempt ${attempt}/2):`,
        err
      );
    }
  }

  return { broadsheet: fallbackWithHearings, docketIssues: [] };
}
