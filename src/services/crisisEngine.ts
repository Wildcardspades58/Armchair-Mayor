// ============================================================================
// GOVERNOR — Step 3: The Boiling Point Crisis Engine
// Listens to TensionMeters (Crime, Transit, Sanitation).
// When any meter hits 100 at the end of advanceTurn(), pauses the game loop and
// triggers generateCrisis(triggeredMeter, currentState).
// Enforces the exact AICrisisResponse JSON schema and clamps all choices:
// - budget_impact.monthly_change: Math.max(-250000, Math.min(250000, ...))
// - heatmap_modifiers[i].change: Math.max(-30, Math.min(30, ...))
// - demographic_approval[i].change: Math.max(-20, Math.min(20, ...))
// Resets the triggered TensionMeter to 0 after the player makes a choice.
// ============================================================================

import {
  AICrisisChoice,
  AICrisisResponse,
  AICrisisValidationResponse,
  GameState,
  TensionKey,
  VALID_DEMOGRAPHICS,
  VALID_HEATMAP_METRICS,
} from "../types/simulation";
import { useGameStore } from "../store/useGameStore";
import {
  extractJsonObjectString,
  normalizeDemographic,
  normalizeHeatmapMetric,
  parseFlexibleNumber,
  sanitizeAndExtractJsonObject,
} from "./aiGuardrails";
import { webLLMService } from "./webllmService";

// ----------------------------------------------------------------------------
// 1. Crisis Physical Clamping Guardrail Constants
// ----------------------------------------------------------------------------

export const CRISIS_GUARDRAIL_LIMITS = {
  BUDGET_MIN: -250_000,
  BUDGET_MAX: 250_000,
  HEATMAP_MIN: -30,
  HEATMAP_MAX: 30,
  DEMOGRAPHIC_MIN: -20,
  DEMOGRAPHIC_MAX: 20,
} as const;

// ----------------------------------------------------------------------------
// 2. Crisis Choice & Response Clamping Middleware
// ----------------------------------------------------------------------------

/**
 * Intercepts a single AICrisisChoice, verifies all HeatmapMetric and Demographic
 * enums (rejecting hallucinated keys), and physically clamps the math:
 * - Budget max impact: -$250k to +$250k
 * - Heatmap max impact: -30 to +30
 * - Approval max impact: -20 to +20
 */
export function clampCrisisChoice(rawChoice: unknown, index = 0): AICrisisChoice {
  if (typeof rawChoice !== "object" || rawChoice === null) {
    throw new Error(`Crisis Guardrail Violation: Choice #${index + 1} is not an object.`);
  }

  const c = rawChoice as Record<string, unknown>;

  const rawOptionLabel =
    typeof c.option_label === "string" && c.option_label.trim().length > 0
      ? c.option_label.trim()
      : typeof c.label === "string" && c.label.trim().length > 0
      ? c.label.trim()
      : `Executive Option #${index + 1}`;

  let rawBudgetVal: unknown = 0;
  if (typeof c.budget_impact === "object" && c.budget_impact !== null) {
    rawBudgetVal =
      (c.budget_impact as Record<string, unknown>).monthly_change ??
      (c.budget_impact as Record<string, unknown>).change ??
      0;
  } else if (
    typeof c.budget_impact === "number" ||
    typeof c.budget_impact === "string"
  ) {
    rawBudgetVal = c.budget_impact;
  } else if (c.monthly_change !== undefined) {
    rawBudgetVal = c.monthly_change;
  }

  const rawBudget = parseFlexibleNumber(rawBudgetVal, 0);
  // ENGINE ENFORCEMENT: Clamp between -$250k and +$250k
  const clampedMonthlyChange = Math.round(
    Math.max(-250000, Math.min(250000, rawBudget))
  );

  const clampedHeatmaps: AICrisisChoice["heatmap_modifiers"] = [];
  if (Array.isArray(c.heatmap_modifiers)) {
    for (let i = 0; i < c.heatmap_modifiers.length; i++) {
      const mod = c.heatmap_modifiers[i] as Record<string, unknown>;
      if (!mod || typeof mod !== "object") continue;
      const metric = normalizeHeatmapMetric(mod.metric ?? mod.name);
      if (!metric) continue;
      const rawChange = parseFlexibleNumber(mod.change ?? mod.value, 0);
      // ENGINE ENFORCEMENT: Clamp between -30 and +30
      clampedHeatmaps.push({
        metric,
        change: Math.round(Math.max(-30, Math.min(30, rawChange))),
      });
    }
  } else if (
    typeof c.heatmap_modifiers === "object" &&
    c.heatmap_modifiers !== null
  ) {
    for (const [k, v] of Object.entries(
      c.heatmap_modifiers as Record<string, unknown>
    )) {
      const metric = normalizeHeatmapMetric(k);
      if (!metric) continue;
      const rawChange = parseFlexibleNumber(v, 0);
      clampedHeatmaps.push({
        metric,
        change: Math.round(Math.max(-30, Math.min(30, rawChange))),
      });
    }
  }

  const clampedDemographics: AICrisisChoice["demographic_approval"] = [];
  if (Array.isArray(c.demographic_approval)) {
    for (let i = 0; i < c.demographic_approval.length; i++) {
      const dem = c.demographic_approval[i] as Record<string, unknown>;
      if (!dem || typeof dem !== "object") continue;
      const demographic = normalizeDemographic(
        dem.demographic ?? dem.group ?? dem.name
      );
      if (!demographic) continue;
      const rawChange = parseFlexibleNumber(dem.change ?? dem.value, 0);
      // ENGINE ENFORCEMENT: Clamp between -20 and +20
      clampedDemographics.push({
        demographic,
        change: Math.round(Math.max(-20, Math.min(20, rawChange))),
      });
    }
  } else if (
    typeof c.demographic_approval === "object" &&
    c.demographic_approval !== null
  ) {
    for (const [k, v] of Object.entries(
      c.demographic_approval as Record<string, unknown>
    )) {
      const demographic = normalizeDemographic(k);
      if (!demographic) continue;
      const rawChange = parseFlexibleNumber(v, 0);
      clampedDemographics.push({
        demographic,
        change: Math.round(Math.max(-20, Math.min(20, rawChange))),
      });
    }
  }

  return {
    option_label: rawOptionLabel.slice(0, 65),
    budget_impact: {
      monthly_change: clampedMonthlyChange,
    },
    heatmap_modifiers: clampedHeatmaps,
    demographic_approval: clampedDemographics,
  };
}

/**
 * Sanitizes raw LLM text (extracting first '{' to last '}') and clamps the full
 * AICrisisResponse JSON returned by WebLLM.
 */
export function parseAndClampAICrisisResponse(rawText: string): AICrisisResponse {
  const jsonString = sanitizeAndExtractJsonObject(rawText);
  const parsed: unknown = JSON.parse(jsonString);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Crisis Guardrail Violation: Root JSON payload must be an object.");
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.crisis_name !== "string" || record.crisis_name.trim().length === 0) {
    throw new Error("Crisis Guardrail Violation: Missing 'crisis_name'.");
  }

  if (typeof record.description !== "string" || record.description.trim().length === 0) {
    throw new Error("Crisis Guardrail Violation: Missing 'description'.");
  }

  if (!Array.isArray(record.choices) || record.choices.length !== 3) {
    throw new Error(
      "Crisis Guardrail Violation: 'choices' array MUST contain exactly 3 choices."
    );
  }

  const clampedChoices = record.choices.map((choice, idx) =>
    clampCrisisChoice(choice, idx)
  );

  return {
    crisis_name: record.crisis_name.trim().slice(0, 60),
    description: record.description.trim().slice(0, 260),
    choices: clampedChoices,
  };
}

/**
 * Middleware function that intercepts the player's selected choice from the
 * AICrisisResponse JSON, verifies the enums, clamps the math (-$250k..+$250k,
 * -30..+30 heatmaps, -20..+20 demographics), applies it to the Zustand store,
 * and resets the triggered TensionMeter to 0.
 */
export function clampAndApplyCrisisChoice(
  selectedChoice: AICrisisChoice,
  triggeredMeter: TensionKey | "Wildcard",
  crisisName = "Executive Crisis"
): AICrisisChoice {
  const verifiedClampedChoice = clampCrisisChoice(selectedChoice, 0);
  useGameStore
    .getState()
    .applyClampedCrisisChoice(verifiedClampedChoice, triggeredMeter, crisisName);
  return verifiedClampedChoice;
}

// ----------------------------------------------------------------------------
// 3. Deterministic Fallback Crisis Matrix (Crime, Transit, Sanitation & Wildcard)
// ----------------------------------------------------------------------------

const WILDCARD_FALLBACK_POOL: AICrisisResponse[] = [
  {
    crisis_name: "Federal Reserve Emergency Rate Hike (+225 bps)",
    description:
      "The Federal Reserve unexpectedly hiked benchmark interest rates to curb national inflation, freezing municipal bond markets and squeezing local business credit lines.",
    choices: [
      {
        option_label: "Enact Municipal Austerity & Refinance Debt",
        budget_impact: { monthly_change: 135_000 },
        heatmap_modifiers: [
          { metric: "crime", change: 10 },
          { metric: "land_value", change: -8 },
        ],
        demographic_approval: [
          { demographic: "wealthy", change: 12 },
          { demographic: "business", change: 8 },
          { demographic: "working_class", change: -16 },
        ],
      },
      {
        option_label: "Establish City-Backed Small Business Liquidity Fund",
        budget_impact: { monthly_change: -175_000 },
        heatmap_modifiers: [{ metric: "land_value", change: 14 }],
        demographic_approval: [
          { demographic: "business", change: 18 },
          { demographic: "working_class", change: 10 },
          { demographic: "wealthy", change: -9 },
        ],
      },
      {
        option_label: "Freeze Property Assessments & Subsidize Mortgages",
        budget_impact: { monthly_change: -150_000 },
        heatmap_modifiers: [
          { metric: "land_value", change: 10 },
          { metric: "crime", change: -8 },
        ],
        demographic_approval: [
          { demographic: "working_class", change: 17 },
          { demographic: "wealthy", change: 11 },
          { demographic: "business", change: -12 },
        ],
      },
    ],
  },
  {
    crisis_name: "Global Container Shipping & Supply Chain Crash",
    description:
      "An international maritime bottleneck has halted critical components and fuel deliveries, sending local freight costs soaring and idling factories.",
    choices: [
      {
        option_label: "Subsidize Emergency Air-Freight & Port Overtime",
        budget_impact: { monthly_change: -195_000 },
        heatmap_modifiers: [
          { metric: "traffic", change: 12 },
          { metric: "land_value", change: 11 },
        ],
        demographic_approval: [
          { demographic: "business", change: 19 },
          { demographic: "working_class", change: 12 },
          { demographic: "environmentalists", change: -14 },
        ],
      },
      {
        option_label: "Ration Commercial Fuel & Prioritize Public Transit",
        budget_impact: { monthly_change: 65_000 },
        heatmap_modifiers: [
          { metric: "traffic", change: -22 },
          { metric: "pollution", change: -18 },
        ],
        demographic_approval: [
          { demographic: "environmentalists", change: 19 },
          { demographic: "business", change: -18 },
          { demographic: "wealthy", change: -11 },
        ],
      },
      {
        option_label: "Waive Local Tariffs & Institute Price Gouging Fines",
        budget_impact: { monthly_change: -45_000 },
        heatmap_modifiers: [{ metric: "crime", change: -10 }],
        demographic_approval: [
          { demographic: "working_class", change: 16 },
          { demographic: "business", change: -14 },
        ],
      },
    ],
  },
  {
    crisis_name: "100-Year Atmospheric River & Flash Flood Surge",
    description:
      "A rare macro-climatic storm front has dumped record rainfall across the basin, inundating commuter tunnels and threatening industrial retaining walls.",
    choices: [
      {
        option_label: "Mobilize Full Emergency Corps & Floodwall Retrofit",
        budget_impact: { monthly_change: -220_000 },
        heatmap_modifiers: [
          { metric: "pollution", change: -20 },
          { metric: "land_value", change: 15 },
        ],
        demographic_approval: [
          { demographic: "environmentalists", change: 18 },
          { demographic: "working_class", change: 15 },
          { demographic: "wealthy", change: 9 },
        ],
      },
      {
        option_label: "Focus Sandbagging on Financial Core & Tech Corridors",
        budget_impact: { monthly_change: -80_000 },
        heatmap_modifiers: [
          { metric: "land_value", change: 12 },
          { metric: "crime", change: 14 },
        ],
        demographic_approval: [
          { demographic: "business", change: 16 },
          { demographic: "wealthy", change: 15 },
          { demographic: "working_class", change: -20 },
        ],
      },
      {
        option_label: "Declare Federal Disaster Zone & Mandate Green Drainage",
        budget_impact: { monthly_change: 90_000 },
        heatmap_modifiers: [
          { metric: "pollution", change: -16 },
          { metric: "traffic", change: 10 },
        ],
        demographic_approval: [
          { demographic: "environmentalists", change: 17 },
          { demographic: "business", change: -15 },
        ],
      },
    ],
  },
];

export function buildDeterministicCrisisEvent(
  triggeredMeter: TensionKey | "Wildcard"
): AICrisisResponse {
  if (triggeredMeter === "Wildcard") {
    const picked =
      WILDCARD_FALLBACK_POOL[
        Math.floor(Math.random() * WILDCARD_FALLBACK_POOL.length)
      ];
    return parseAndClampAICrisisResponse(JSON.stringify(picked));
  }

  const templates: Record<TensionKey, AICrisisResponse> = {
    Crime: {
      crisis_name: "Citywide Syndicate Riots & Precinct Siege",
      description:
        "The Crime Tension Meter hit 100/100. Organized syndicates and rioters have overwhelmed outer precincts, demanding immediate executive intervention.",
      choices: [
        {
          option_label: "Deploy Tactical National Guard Taskforce",
          budget_impact: { monthly_change: -145_000 },
          heatmap_modifiers: [
            { metric: "crime", change: -28 },
            { metric: "traffic", change: -10 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 16 },
            { demographic: "business", change: 14 },
            { demographic: "working_class", change: -15 },
          ],
        },
        {
          option_label: "Enact Emergency Youth Jobs & Community Accord",
          budget_impact: { monthly_change: -190_000 },
          heatmap_modifiers: [
            { metric: "crime", change: -18 },
            { metric: "land_value", change: 10 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 19 },
            { demographic: "environmentalists", change: 8 },
            { demographic: "wealthy", change: -12 },
          ],
        },
        {
          option_label: "Deputize Private Corporate Security Consortia",
          budget_impact: { monthly_change: 45_000 },
          heatmap_modifiers: [
            { metric: "crime", change: -15 },
            { metric: "land_value", change: 12 },
          ],
          demographic_approval: [
            { demographic: "business", change: 18 },
            { demographic: "working_class", change: -19 },
            { demographic: "environmentalists", change: -10 },
          ],
        },
      ],
    },
    Transit: {
      crisis_name: "Total Arterial Gridlock & Freight Port Lockout",
      description:
        "The Transit Tension Meter hit 100/100. Commuter highways and harbor freight terminals have collapsed into a 9-hour standstill, paralyzing territorial commerce.",
      choices: [
        {
          option_label: "Launch 24/7 Fare-Free Express Rail & Bus Blitz",
          budget_impact: { monthly_change: -210_000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -28 },
            { metric: "pollution", change: -14 },
            { metric: "land_value", change: 12 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 18 },
            { demographic: "environmentalists", change: 16 },
            { demographic: "wealthy", change: -10 },
          ],
        },
        {
          option_label: "Institute Automated Downtown Congestion Toll Ring",
          budget_impact: { monthly_change: 165_000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -24 },
            { metric: "pollution", change: -12 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 15 },
            { demographic: "wealthy", change: 10 },
            { demographic: "working_class", change: -18 },
          ],
        },
        {
          option_label: "Deregulate Parkways for 24/7 Heavy Commercial Freight",
          budget_impact: { monthly_change: -60_000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -18 },
            { metric: "pollution", change: 16 },
          ],
          demographic_approval: [
            { demographic: "business", change: 19 },
            { demographic: "environmentalists", change: -20 },
          ],
        },
      ],
    },
    Sanitation: {
      crisis_name: "Toxic Smog Inversion & Watershed Contamination",
      description:
        "The Sanitation Tension Meter hit 100/100. Unchecked industrial effluent and hazardous air particulates have triggered an emergency public health lockdown.",
      choices: [
        {
          option_label: "Mandate Immediate Industrial Scrubber Moratorium",
          budget_impact: { monthly_change: -130_000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -29 },
            { metric: "land_value", change: 11 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 20 },
            { demographic: "business", change: -19 },
            { demographic: "working_class", change: -8 },
          ],
        },
        {
          option_label: "Deploy $240K/mo Clean Watershed Superfund",
          budget_impact: { monthly_change: -240_000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -24 },
            { metric: "land_value", change: 15 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 18 },
            { demographic: "working_class", change: 14 },
            { demographic: "wealthy", change: -11 },
          ],
        },
        {
          option_label: "Levy Punitive Polluter Tariffs & Carbon Caps",
          budget_impact: { monthly_change: 150_000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -18 },
            { metric: "traffic", change: -8 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 14 },
            { demographic: "business", change: -18 },
          ],
        },
      ],
    },
  };

  return parseAndClampAICrisisResponse(JSON.stringify(templates[triggeredMeter]));
}

// ----------------------------------------------------------------------------
// 4. Core Functions: generateCrisis() & generateWildcardCrisis()
// ----------------------------------------------------------------------------

function buildCrisisSystemPrompt(
  triggeredMeter: TensionKey | "Wildcard",
  currentState: Pick<
    GameState,
    "time" | "treasury" | "voterSentiment" | "legacy" | "grid" | "tensions"
  >
): string {
  const schemaBlock = `{
  "crisis_name": "string",
  "description": "string",
  "choices": [
    {
      "option_label": "string",
      "budget_impact": {
        "monthly_change": number (integer between -250000 and 250000)
      },
      "heatmap_modifiers": [
        {
          "metric": one of ${JSON.stringify(VALID_HEATMAP_METRICS)},
          "change": number (integer between -30 and 30)
        }
      ],
      "demographic_approval": [
        {
          "demographic": one of ${JSON.stringify(VALID_DEMOGRAPHICS)},
          "change": number (integer between -20 and 20)
        }
      ]
    }
  ]
}`;

  const stateContextBlock = `CURRENT TERRITORY STATE:
- Office: ${currentState.time.currentOffice} (Turn ${currentState.time.turn}, Month ${currentState.time.month}/${currentState.time.year})
- Treasury Reserves: $${currentState.treasury.reserves.toLocaleString()} (Monthly Net: $${currentState.treasury.monthlyNet.toLocaleString()})
- Overall Approval: ${currentState.voterSentiment.overallApproval}%
- Heatmaps (0-100): Crime=${currentState.grid.globalAverages.crime}, Pollution=${currentState.grid.globalAverages.pollution}, Land Value=${currentState.grid.globalAverages.land_value}, Traffic=${currentState.grid.globalAverages.traffic}
- Tension Meters (0-100): Crime=${currentState.tensions.Crime}, Transit=${currentState.tensions.Transit}, Sanitation=${currentState.tensions.Sanitation}`;

  // Bonus Step: Exogenous Wildcard System Prompt Override
  if (triggeredMeter === "Wildcard") {
    return `You are the Game Master. Generate a random, macro real-world scenario that suddenly impacts this local city. Examples: A sudden Federal Interest Rate hike, a global supply chain crash, a rare natural disaster, or a national political scandal. Force the Mayor to react to this external pressure. Output using the strict AICrisisResponse JSON schema.

${stateContextBlock}

${schemaBlock}

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', a NEGATIVE change (e.g., -15) REDUCES the problem and helps the city, while a POSITIVE change (e.g., +15) WORSENS the problem. For 'land_value' and 'demographic_approval', a POSITIVE change (+15) improves value/approval, and a NEGATIVE change (-15) reduces it.
CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;
  }

  return `You are the Boiling Point Crisis Generator for the political RPG "Governor".
The "${triggeredMeter}" Tension Meter has reached 100/100!

${stateContextBlock}

${schemaBlock}

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', a NEGATIVE change (e.g., -15) REDUCES the problem and helps the city, while a POSITIVE change (e.g., +15) WORSENS the problem. For 'land_value' and 'demographic_approval', a POSITIVE change (+15) improves value/approval, and a NEGATIVE change (-15) reduces it.
CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;
}

/**
 * Step 3 & Bonus Step Core Function: generateCrisis(triggeredMeter, currentState)
 * Supports both Boiling Point Tension crises ("Crime" | "Transit" | "Sanitation")
 * and Exogenous Wildcard macro scenarios ("Wildcard").
 * Reuses the exact same 3-strike parseAndClampAICrisisResponse() middleware and CrisisModal UI.
 */
export async function generateCrisis(
  triggeredMeter: TensionKey | "Wildcard",
  currentState: GameState = useGameStore.getState()
): Promise<AICrisisResponse> {
  const MAX_STRIKES = 3;
  const systemPrompt = buildCrisisSystemPrompt(triggeredMeter, currentState);
  let lastError = "";
  let rawJson = "";

  for (let strike = 1; strike <= MAX_STRIKES; strike++) {
    rawJson = "";
    try {
      const userPrompt =
        strike === 1
          ? triggeredMeter === "Wildcard"
            ? "Generate a random macro real-world Exogenous Wildcard crisis event with 3 choices in AICrisisResponse JSON format now."
            : `The "${triggeredMeter}" Tension Meter hit 100. Generate the 3-choice AICrisisResponse JSON now.`
          : `STRIKE ${
              strike - 1
            } FAILED VALIDATION (${lastError}). Return ONLY valid JSON with EXACTLY 3 choices using valid HeatmapMetric (${VALID_HEATMAP_METRICS.join(
              ", "
            )}) and Demographic (${VALID_DEMOGRAPHICS.join(", ")}) values.`;

      rawJson = await webLLMService.requestRawJsonCompletion(
        systemPrompt,
        userPrompt,
        0.35
      );

      const clampedCrisis = parseAndClampAICrisisResponse(rawJson);
      useGameStore.getState().setGeneratedCrisisEvent(clampedCrisis);
      return clampedCrisis;
    } catch (error) {
      console.error("LLM Crisis Generation Error:", error, rawJson);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  // Fallback: Guaranteed valid, clamped 3-choice AICrisisResponse
  const fallbackCrisis = buildDeterministicCrisisEvent(triggeredMeter);
  useGameStore.getState().setGeneratedCrisisEvent(fallbackCrisis);
  return fallbackCrisis;
}

// ----------------------------------------------------------------------------
// 5. Bonus Step 2: The Custom Crisis Resolution & Validation Engine
// ----------------------------------------------------------------------------

/**
 * Parses and physically clamps an AICrisisValidationResponse JSON object:
 * - If `is_valid_solution` is false: ensures `rejection_reason` is a string (Max 100 chars).
 * - If `is_valid_solution` is true: verifies all enums and clamps:
 *   * budget_impact.monthly_change: [-250,000, +250,000]
 *   * heatmap_modifiers[i].change: [-30, +30]
 *   * demographic_approval[i].change: [-20, +20]
 */
export function parseAndClampAICrisisValidationResponse(
  rawText: string
): AICrisisValidationResponse {
  const jsonString = extractJsonObjectString(rawText);
  const parsed: unknown = JSON.parse(jsonString);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "Validation Guardrail Violation: Root JSON payload must be an object."
    );
  }

  const record = parsed as Record<string, unknown>;

  if (typeof record.is_valid_solution !== "boolean") {
    throw new Error(
      "Validation Guardrail Violation: 'is_valid_solution' must be a boolean."
    );
  }

  if (!record.is_valid_solution) {
    const rawReason =
      typeof record.rejection_reason === "string" &&
      record.rejection_reason.trim().length > 0
        ? record.rejection_reason.trim()
        : "The City Attorney blocks this proposal as unresponsive to the emergency.";

    return {
      is_valid_solution: false,
      rejection_reason: rawReason.slice(0, 100),
    };
  }

  // When is_valid_solution === true, validate and clamp the mathematical fields
  const clampedChoice = clampCrisisChoice(
    {
      option_label: "Custom Executive Crisis Solution",
      budget_impact: record.budget_impact ?? { monthly_change: 0 },
      heatmap_modifiers: Array.isArray(record.heatmap_modifiers)
        ? record.heatmap_modifiers
        : [],
      demographic_approval: Array.isArray(record.demographic_approval)
        ? record.demographic_approval
        : [],
    },
    0
  );

  return {
    is_valid_solution: true,
    rejection_reason: null,
    budget_impact: clampedChoice.budget_impact,
    heatmap_modifiers: clampedChoice.heatmap_modifiers,
    demographic_approval: clampedChoice.demographic_approval,
  };
}

/**
 * Deterministic Relevance Heuristic Fallback (used if WebGPU is offline or fails 3 JSON strikes):
 * Checks whether the player's text is gibberish, magic/sci-fi nonsense, or completely unrelated
 * to civic governance and the active crisis context.
 */
export function evaluateDeterministicCustomCrisisValidation(
  playerInput: string,
  crisisName: string,
  crisisDescription: string,
  triggeredMeter: TensionKey | "Wildcard"
): AICrisisValidationResponse {
  const clean = playerInput.trim();
  const lower = clean.toLowerCase();

  // 1. Reject too short / single-word gibberish
  if (clean.length < 8 || !/\s/.test(clean)) {
    return {
      is_valid_solution: false,
      rejection_reason:
        "City Council rejects vague, unactionable one-word directive.",
    };
  }

  // 2. Reject magic, fantasy, sci-fi, or absurd non-civic commands
  const magicOrNonsensePattern =
    /\b(magic|wizard|dragon|spell|alien|ufo|time travel|teleport|superhero|batman|unicorn|wish|pray away|dance party|pizza party|nuke|laser|zombie|vampire|asdf|qwerty|lol|lmao|poop|banana)\b/i;
  if (magicOrNonsensePattern.test(lower)) {
    return {
      is_valid_solution: false,
      rejection_reason:
        "The City Attorney blocks this action as fantastical and unconstitutional.",
    };
  }

  // 3. Check contextual relevance against the specific crisis or civic policy levers
  const contextText = `${crisisName} ${crisisDescription}`.toLowerCase();
  const crimeKeywords =
    /police|patrol|crime|arrest|security|curfew|guard|precinct|court|jail|gang|riot|law|safety|community|youth|officer|union|strike|de-escalat/;
  const transitKeywords =
    /transit|traffic|bus|rail|train|subway|toll|road|highway|freight|port|lane|commut|bridge|congestion|shuttle|ferry|carpool|gridlock/;
  const sanitationKeywords =
    /pollut|smog|trash|waste|sanitation|water|clean|air|carbon|scrubber|filter|epa|green|factory|emission|sewer|runoff|recycle|toxic|flood|drain/;
  const macroEconomicKeywords =
    /fund|budget|tax|bond|subsid|loan|rate|credit|relief|aid|tariff|audit|price|emergency|reserve|grant|contract|freeze|cut|invest|deploy|hire|mandate/;

  let isRelevant = false;
  if (triggeredMeter === "Crime") {
    isRelevant = crimeKeywords.test(lower) || macroEconomicKeywords.test(lower);
  } else if (triggeredMeter === "Transit") {
    isRelevant = transitKeywords.test(lower) || macroEconomicKeywords.test(lower);
  } else if (triggeredMeter === "Sanitation") {
    isRelevant =
      sanitationKeywords.test(lower) || macroEconomicKeywords.test(lower);
  } else {
    // Wildcard macro scenario: check overlap with crisis text or civic levers
    isRelevant =
      macroEconomicKeywords.test(lower) ||
      crimeKeywords.test(lower) ||
      transitKeywords.test(lower) ||
      sanitationKeywords.test(lower) ||
      contextText
        .split(/\W+/)
        .filter((w) => w.length > 4)
        .some((word) => lower.includes(word));
  }

  if (!isRelevant) {
    return {
      is_valid_solution: false,
      rejection_reason: `City Council rejects proposal as unrelated to the ${crisisName} emergency.`,
    };
  }

  // Valid civic solution: compute clamped mathematical consequences tailored to the crisis
  let monthlyChange = -125_000;
  if (/tax|toll|fine|tariff|cut|austerity|fee/.test(lower)) {
    monthlyChange = 95_000;
  }

  const heatmapModifiers: AICrisisChoice["heatmap_modifiers"] = [];
  if (triggeredMeter === "Crime" || crimeKeywords.test(lower)) {
    heatmapModifiers.push({ metric: "crime", change: -22 });
  }
  if (triggeredMeter === "Transit" || transitKeywords.test(lower)) {
    heatmapModifiers.push({ metric: "traffic", change: -22 });
  }
  if (triggeredMeter === "Sanitation" || sanitationKeywords.test(lower)) {
    heatmapModifiers.push({ metric: "pollution", change: -24 });
  }
  if (heatmapModifiers.length === 0) {
    heatmapModifiers.push({ metric: "land_value", change: 12 });
  }

  const demographicApproval: AICrisisChoice["demographic_approval"] = [
    { demographic: "working_class", change: 12 },
    { demographic: "business", change: 8 },
  ];

  return parseAndClampAICrisisValidationResponse(
    JSON.stringify({
      is_valid_solution: true,
      rejection_reason: null,
      budget_impact: { monthly_change: monthlyChange },
      heatmap_modifiers: heatmapModifiers,
      demographic_approval: demographicApproval,
    })
  );
}

/**
 * Bonus Step 2 Core Pipeline: validateAndApplyCustomCrisisSolution(playerInput)
 * Sends the active Crisis Context and Player Input to WebLLM using the strict
 * AICrisisValidationResponse JSON schema.
 * - If `is_valid_solution` is TRUE: Clamps the math, applies the state changes, and closes the Crisis Modal.
 * - If `is_valid_solution` is FALSE: Displays `rejection_reason` (Max 100 chars), decrements
 *   `crisisAttemptsRemaining` by 1, and if `crisisAttemptsRemaining` hits 0, forces Gridlock
 *   by automatically applying Option 3.
 */
export async function validateAndApplyCustomCrisisSolution(
  playerInput: string
): Promise<AICrisisValidationResponse> {
  const state = useGameStore.getState();
  const activeCrisis = state.activeCrisis;
  if (!activeCrisis) {
    throw new Error("No active crisis to validate.");
  }

  const systemPrompt = `You are the Legislative & Constitutional Crisis Arbiter for the political management RPG "Governor".

ACTIVE CRISIS CONTEXT:
- Crisis Name: "${activeCrisis.crisis_name}"
- Crisis Description: "${activeCrisis.description}"
- Triggered Category: "${activeCrisis.tensionTriggered}"
- Current Treasury Reserves: $${state.treasury.reserves.toLocaleString()} (Monthly Net: $${state.treasury.monthlyNet.toLocaleString()})

EVALUATION RULES:
Evaluate if the Mayor's proposed custom text actually attempts a realistic, in-universe civic solution to this specific crisis.
- Set "is_valid_solution": false if the player types nonsense, gibberish, magic, sci-fi, jokes, or something completely unrelated to solving "${activeCrisis.crisis_name}". Provide a punchy in-universe "rejection_reason" (Max 100 chars, e.g., "The City Attorney blocks this action as unconstitutional.").
- Set "is_valid_solution": true if it is a plausible policy response, and generate the mathematical impacts.

Output STRICTLY a valid JSON object matching this exact AICrisisValidationResponse schema:
{
  "is_valid_solution": boolean,
  "rejection_reason": string | null (Max 100 chars if false, null if true),
  "budget_impact": {
    "monthly_change": number (integer between -250000 and 250000)
  },
  "heatmap_modifiers": [
    {
      "metric": one of ${JSON.stringify(VALID_HEATMAP_METRICS)},
      "change": number (integer between -30 and 30)
    }
  ],
  "demographic_approval": [
    {
      "demographic": one of ${JSON.stringify(VALID_DEMOGRAPHICS)},
      "change": number (integer between -20 and 20)
    }
  ]
}

CRITICAL MATH RULE: For 'pollution', 'crime', and 'traffic', a NEGATIVE change (e.g., -15) REDUCES the problem and helps the city, while a POSITIVE change (e.g., +15) WORSENS the problem. For 'land_value' and 'demographic_approval', a POSITIVE change (+15) improves value/approval, and a NEGATIVE change (-15) reduces it.
CRITICAL: Respond ONLY with a valid raw JSON object matching the exact schema. Do not include markdown fences or conversational text.`;

  const MAX_STRIKES = 3;
  let validationResult: AICrisisValidationResponse | null = null;
  let lastError = "";
  let rawJson = "";

  for (let strike = 1; strike <= MAX_STRIKES; strike++) {
    rawJson = "";
    try {
      const userPrompt =
        strike === 1
          ? `Mayor's Proposed Custom Solution: "${playerInput}"\nReturn ONLY the AICrisisValidationResponse JSON object.`
          : `Mayor's Proposed Custom Solution: "${playerInput}"\nSTRIKE ${
              strike - 1
            } FAILED SCHEMA VALIDATION (${lastError}). Return ONLY valid JSON matching AICrisisValidationResponse.`;

      rawJson = await webLLMService.requestRawJsonCompletion(
        systemPrompt,
        userPrompt,
        0.2
      );
      validationResult = parseAndClampAICrisisValidationResponse(rawJson);
      break;
    } catch (error) {
      console.error("LLM Crisis Validation Error:", error, rawJson);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (!validationResult) {
    validationResult = evaluateDeterministicCustomCrisisValidation(
      playerInput,
      activeCrisis.crisis_name,
      activeCrisis.description,
      activeCrisis.tensionTriggered
    );
  }

  if (validationResult.is_valid_solution) {
    const customChoice: AICrisisChoice = {
      option_label: `Custom Order: ${playerInput.trim().slice(0, 42)}`,
      budget_impact: validationResult.budget_impact ?? { monthly_change: 0 },
      heatmap_modifiers: validationResult.heatmap_modifiers ?? [],
      demographic_approval: validationResult.demographic_approval ?? [],
    };

    clampAndApplyCrisisChoice(
      customChoice,
      activeCrisis.tensionTriggered,
      activeCrisis.crisis_name
    );
  } else {
    useGameStore
      .getState()
      .recordFailedCustomCrisisAttempt(
        validationResult.rejection_reason ||
          "The City Attorney blocks this action as unconstitutional."
      );
  }

  return validationResult;
}

// ----------------------------------------------------------------------------
// 6. Automatic Store Subscription Listener
// ----------------------------------------------------------------------------

class BoilingPointCrisisEngine {
  private unsubscribeStore: (() => void) | null = null;
  private activeGenerationLock = false;

  public startListening(): () => void {
    if (this.unsubscribeStore) {
      return this.unsubscribeStore;
    }

    this.unsubscribeStore = useGameStore.subscribe((state, prevState) => {
      const justTriggeredCrisis =
        state.isTurnPausedForCrisis &&
        state.activeCrisis !== null &&
        state.activeCrisis.isGenerating &&
        state.activeCrisis.choices === null &&
        (!prevState.isTurnPausedForCrisis || prevState.activeCrisis?.choices === null);

      if (justTriggeredCrisis && !this.activeGenerationLock && state.activeCrisis) {
        this.activeGenerationLock = true;
        void generateCrisis(state.activeCrisis.tensionTriggered, state).finally(() => {
          this.activeGenerationLock = false;
        });
      }
    });

    return () => {
      if (this.unsubscribeStore) {
        this.unsubscribeStore();
        this.unsubscribeStore = null;
      }
    };
  }
}

export const crisisEngine = new BoilingPointCrisisEngine();
crisisEngine.startListening();
