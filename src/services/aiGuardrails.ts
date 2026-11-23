// ============================================================================
// GOVERNOR — Step 2: Strict AI Guardrail Middleware & Clamping Pipeline
// Enforces the exact AICustomPolicyResponse JSON schema, normalizes common
// local-LLM key/enum variations, physically clamps every numeric modifier via
// Math.max() and Math.min(), and provides a safe fallback state.
// ============================================================================

import {
  AICustomPolicyResponse,
  CivicPillar,
  Demographic,
  HeatmapMetric,
  VALID_CIVIC_PILLARS,
  VALID_DEMOGRAPHICS,
  VALID_HEATMAP_METRICS,
} from "../types/simulation";

// ----------------------------------------------------------------------------
// 1. Strict Physical Clamping Constants
// ----------------------------------------------------------------------------

export const AI_GUARDRAIL_LIMITS = {
  POLICY_NAME_MAX_LEN: 40,
  HEADLINE_MAX_LEN: 80,
  CONSEQUENCE_MAX_LEN: 120,
  BUDGET_MIN: -100_000,
  BUDGET_MAX: 100_000,
  HEATMAP_MIN: -20,
  HEATMAP_MAX: 20,
  DEMOGRAPHIC_MIN: -15,
  DEMOGRAPHIC_MAX: 15,
} as const;

/**
 * Pure numeric clamp helper wrapping Math.max() and Math.min().
 */
export function strictClampNumber(raw: unknown, min: number, max: number): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, 0));
  }
  return Math.max(min, Math.min(max, parsed));
}

export function isValidHeatmapMetric(value: unknown): value is HeatmapMetric {
  return (
    typeof value === "string" &&
    (VALID_HEATMAP_METRICS as readonly string[]).includes(value)
  );
}

export function isValidDemographic(value: unknown): value is Demographic {
  return (
    typeof value === "string" &&
    (VALID_DEMOGRAPHICS as readonly string[]).includes(value)
  );
}

/**
 * Normalizes minor casing/whitespace/synonym variations from local 8B models
 * into the strict HeatmapMetric enum ("crime" | "pollution" | "land_value" | "traffic").
 * Returns null if the string cannot be mapped to a valid HeatmapMetric.
 */
export function normalizeHeatmapMetric(raw: unknown): HeatmapMetric | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isValidHeatmapMetric(cleaned)) return cleaned;

  if (cleaned.includes("crime") || cleaned.includes("safety") || cleaned.includes("police")) {
    return "crime";
  }
  if (cleaned.includes("pollut") || cleaned.includes("sanitation") || cleaned.includes("env") || cleaned.includes("smog")) {
    return "pollution";
  }
  if (cleaned.includes("land") || cleaned.includes("value") || cleaned.includes("property") || cleaned.includes("housing")) {
    return "land_value";
  }
  if (cleaned.includes("traffic") || cleaned.includes("transit") || cleaned.includes("congestion") || cleaned.includes("gridlock")) {
    return "traffic";
  }
  return null;
}

export function normalizeCivicPillar(raw: unknown): CivicPillar | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((VALID_CIVIC_PILLARS as readonly string[]).includes(cleaned)) {
    return cleaned as CivicPillar;
  }
  if (
    cleaned.includes("edu") ||
    cleaned.includes("school") ||
    cleaned.includes("youth") ||
    cleaned.includes("library")
  ) {
    return "education";
  }
  if (
    cleaned.includes("health") ||
    cleaned.includes("clinic") ||
    cleaned.includes("hospital") ||
    cleaned.includes("welfare")
  ) {
    return "health";
  }
  return normalizeHeatmapMetric(raw);
}

/**
 * Normalizes minor casing/whitespace/synonym variations from local 8B models
 * into the strict Demographic enum ("working_class" | "wealthy" | "business" | "environmentalists").
 * Returns null if the string cannot be mapped to a valid Demographic.
 */
export function normalizeDemographic(raw: unknown): Demographic | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isValidDemographic(cleaned)) return cleaned;

  if (cleaned.includes("working") || cleaned.includes("labor") || cleaned.includes("union") || cleaned.includes("poor")) {
    return "working_class";
  }
  if (cleaned.includes("wealth") || cleaned.includes("rich") || cleaned.includes("elite") || cleaned.includes("upper")) {
    return "wealthy";
  }
  if (cleaned.includes("business") || cleaned.includes("corp") || cleaned.includes("industry") || cleaned.includes("commerce")) {
    return "business";
  }
  if (cleaned.includes("environ") || cleaned.includes("green") || cleaned.includes("eco") || cleaned.includes("climate")) {
    return "environmentalists";
  }
  return null;
}

// ----------------------------------------------------------------------------
// 2. JSON Sanitizer & Substring Extractor (First '{' to Last '}')
// ----------------------------------------------------------------------------

/**
 * Sanitizes raw LLM text before JSON.parse():
 * 1. Extracts from the first `{` to the last `}` (or end of string if truncated before the final `}`).
 * 2. Auto-closes any unclosed quotes, `[` arrays, or `{` objects in case a response ever hits the token limit.
 * 3. Removes illegal trailing commas before `}` or `]`.
 */
export function sanitizeAndExtractJsonObject(rawOutput: string): string {
  if (typeof rawOutput !== "string" || rawOutput.trim().length === 0) {
    throw new Error("AI Guardrail Violation: Empty raw output from LLM.");
  }

  // Strip markdown code fence markers if present
  const withoutFences = rawOutput.replace(/```(?:json)?/gi, "").trim();

  const firstBrace = withoutFences.indexOf("{");
  if (firstBrace === -1) {
    throw new Error(
      "AI Guardrail Violation: Raw output does not contain an opening '{' JSON brace."
    );
  }

  let candidate = withoutFences.slice(firstBrace);

  // Track nesting balance of `{}` and `[]` outside of string literals
  let inString = false;
  let escapeNext = false;
  let lastBalancedRootEnd = -1;
  const stack: Array<"{" | "["> = [];

  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\") {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}") {
      if (stack.length > 0 && stack[stack.length - 1] === "{") {
        stack.pop();
        if (stack.length === 0) {
          lastBalancedRootEnd = i;
          break;
        }
      }
    } else if (ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === "[") {
        stack.pop();
      }
    }
  }

  if (lastBalancedRootEnd !== -1) {
    // The root JSON object closed cleanly; slice off any trailing chatter after it
    candidate = candidate.slice(0, lastBalancedRootEnd + 1);
  } else {
    // Auto-Closing Brace Safety Net: Output truncated before final `}`
    if (inString) {
      candidate += '"';
    }
    // Strip any dangling trailing comma or incomplete key-value separator before closing
    candidate = candidate.replace(/[,:\s]+$/, "");

    while (stack.length > 0) {
      const openChar = stack.pop();
      candidate += openChar === "{" ? "}" : "]";
    }
  }

  // 1. Strip illegal trailing commas before closing braces/brackets: e.g. `{"a": 1,}` -> `{"a": 1}`
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");
  // 2. Strip illegal leading `+` on positive numbers in JSON: e.g. `"change": +10` -> `"change": 10`
  candidate = candidate.replace(/([:,\[]\s*)\+(\d)/g, "$1$2");
  // 3. Quote unquoted JS-style object keys right after `{` or `,`: e.g. `{ change: 5 }` -> `{ "change": 5 }`
  candidate = candidate.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  return candidate;
}

// Preserve export alias used by crisisEngine.ts
export const extractJsonObjectString = sanitizeAndExtractJsonObject;

/**
 * Cleans `unintended_consequence_trigger` so literal schema placeholders
 * ("string", "null", "none", "n/a", "undefined", or empty strings) normalize to `null`.
 */
export function sanitizeUnintendedConsequence(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase().replace(/[.!?"']/g, "").trim();
  if (
    lower === "string" ||
    lower === "null" ||
    lower === "none" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "undefined" ||
    lower.startsWith("string (")
  ) {
    return null;
  }

  return trimmed.slice(0, AI_GUARDRAIL_LIMITS.CONSEQUENCE_MAX_LEN);
}

/**
 * Parses numeric strings that local models sometimes format with `$`, `+`, `,`, or `k`
 * (e.g., "-$45,000", "+12", "-50k").
 */
export function parseFlexibleNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : fallback;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    const hasK = trimmed.endsWith("k");
    const cleaned = trimmed.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    if (Number.isNaN(num) || !Number.isFinite(num)) return fallback;
    return hasK ? num * 1000 : num;
  }
  return fallback;
}

// ----------------------------------------------------------------------------
// 3. The Clamping Middleware: parseAndClampAIPolicyResponse()
// ----------------------------------------------------------------------------

/**
 * Sanitizes raw LLM output (extracting first `{` to last `}`), parses JSON,
 * normalizes and verifies enum membership, and strictly clamps all numerical values:
 * - budget_impact.monthly_change = Math.max(-100000, Math.min(100000, response.budget_impact.monthly_change))
 * - heatmap_modifiers[i].change = Math.max(-20, Math.min(20, response.heatmap_modifiers[i].change))
 * - demographic_approval[i].change = Math.max(-15, Math.min(15, response.demographic_approval[i].change))
 */
export function parseAndClampAIPolicyResponse(rawText: string): AICustomPolicyResponse {
  const jsonString = sanitizeAndExtractJsonObject(rawText);
  const response = JSON.parse(jsonString);

  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    throw new Error("AI Guardrail Violation: Root JSON payload must be an object.");
  }

  const rawPolicyName =
    typeof response.policy_name === "string" && response.policy_name.trim().length > 0
      ? response.policy_name.trim()
      : typeof response.name === "string" && response.name.trim().length > 0
      ? response.name.trim()
      : "Executive Order";

  const rawHeadline =
    typeof response.vibe_feed_headline === "string" &&
    response.vibe_feed_headline.trim().length > 0
      ? response.vibe_feed_headline.trim()
      : typeof response.headline === "string" && response.headline.trim().length > 0
      ? response.headline.trim()
      : `Mayor signs "${rawPolicyName}" into immediate effect.`;

  // Extract budget monthly_change (supports `{ budget_impact: { monthly_change } }` or `{ budget_impact: number }`)
  let rawBudgetValue: unknown = 0;
  if (typeof response.budget_impact === "object" && response.budget_impact !== null) {
    rawBudgetValue =
      (response.budget_impact as Record<string, unknown>).monthly_change ??
      (response.budget_impact as Record<string, unknown>).change ??
      0;
  } else if (
    typeof response.budget_impact === "number" ||
    typeof response.budget_impact === "string"
  ) {
    rawBudgetValue = response.budget_impact;
  } else if (response.monthly_change !== undefined) {
    rawBudgetValue = response.monthly_change;
  }

  // 1. ENGINE ENFORCEMENT: Clamp budget_impact.monthly_change between -$100k and +$100k
  const parsedBudget = parseFlexibleNumber(rawBudgetValue, 0);
  const clampedMonthlyChange = Math.round(
    Math.max(-100000, Math.min(100000, parsedBudget))
  );

  // 2. ENGINE ENFORCEMENT: Verify HeatmapMetric enum and clamp change between -20 and +20
  const clampedHeatmapModifiers: AICustomPolicyResponse["heatmap_modifiers"] = [];
  if (Array.isArray(response.heatmap_modifiers)) {
    for (let i = 0; i < response.heatmap_modifiers.length; i++) {
      const item = response.heatmap_modifiers[i];
      if (!item || typeof item !== "object") continue;
      const metric = normalizeCivicPillar(
        (item as Record<string, unknown>).metric ??
          (item as Record<string, unknown>).name
      );
      if (!metric) continue;
      const rawChange = parseFlexibleNumber(
        (item as Record<string, unknown>).change ??
          (item as Record<string, unknown>).value,
        0
      );
      clampedHeatmapModifiers.push({
        metric,
        change: Math.round(Math.max(-20, Math.min(20, rawChange))),
      });
    }
  } else if (
    typeof response.heatmap_modifiers === "object" &&
    response.heatmap_modifiers !== null
  ) {
    // Handle case where LLM returns an object map `{ "crime": -10, "pollution": 5 }`
    for (const [k, v] of Object.entries(
      response.heatmap_modifiers as Record<string, unknown>
    )) {
      const metric = normalizeCivicPillar(k);
      if (!metric) continue;
      const rawChange = parseFlexibleNumber(v, 0);
      clampedHeatmapModifiers.push({
        metric,
        change: Math.round(Math.max(-20, Math.min(20, rawChange))),
      });
    }
  }

  // 3. ENGINE ENFORCEMENT: Verify Demographic enum and clamp change between -15 and +15
  const clampedDemographicApproval: AICustomPolicyResponse["demographic_approval"] = [];
  if (Array.isArray(response.demographic_approval)) {
    for (let i = 0; i < response.demographic_approval.length; i++) {
      const item = response.demographic_approval[i];
      if (!item || typeof item !== "object") continue;
      const demographic = normalizeDemographic(
        (item as Record<string, unknown>).demographic ??
          (item as Record<string, unknown>).group ??
          (item as Record<string, unknown>).name
      );
      if (!demographic) continue;
      const rawChange = parseFlexibleNumber(
        (item as Record<string, unknown>).change ??
          (item as Record<string, unknown>).value,
        0
      );
      clampedDemographicApproval.push({
        demographic,
        change: Math.round(Math.max(-15, Math.min(15, rawChange))),
      });
    }
  } else if (
    typeof response.demographic_approval === "object" &&
    response.demographic_approval !== null
  ) {
    // Handle case where LLM returns an object map `{ "working_class": 10, "wealthy": -5 }`
    for (const [k, v] of Object.entries(
      response.demographic_approval as Record<string, unknown>
    )) {
      const demographic = normalizeDemographic(k);
      if (!demographic) continue;
      const rawChange = parseFlexibleNumber(v, 0);
      clampedDemographicApproval.push({
        demographic,
        change: Math.round(Math.max(-15, Math.min(15, rawChange))),
      });
    }
  }

  const sanitizedConsequence = sanitizeUnintendedConsequence(
    response.unintended_consequence_trigger ?? response.unintended_consequence
  );

  const rawOutcomeStory =
    typeof response.outcome_story === "string" &&
    response.outcome_story.trim().length > 15 &&
    response.outcome_story.trim().toLowerCase() !== "string"
      ? response.outcome_story.trim().slice(0, 1400)
      : undefined;

  return {
    policy_name: rawPolicyName.slice(0, AI_GUARDRAIL_LIMITS.POLICY_NAME_MAX_LEN),
    vibe_feed_headline: rawHeadline.slice(0, AI_GUARDRAIL_LIMITS.HEADLINE_MAX_LEN),
    budget_impact: {
      monthly_change: clampedMonthlyChange,
    },
    heatmap_modifiers: clampedHeatmapModifiers,
    demographic_approval: clampedDemographicApproval,
    unintended_consequence_trigger: sanitizedConsequence,
    outcome_story: rawOutcomeStory,
  };
}

// ----------------------------------------------------------------------------
// 4. Safe Default Gridlock Fallback ("Policy gridlocked in City Council")
// ----------------------------------------------------------------------------

/**
 * Safe default failed state returned when JSON.parse() fails across all retry
 * strikes. Never crashes the game.
 */
export function buildGridlockedFallbackPolicy(playerInput: string): AICustomPolicyResponse {
  const snippet = playerInput.trim().slice(0, 18) || "Directive";
  return {
    policy_name: `Gridlocked: ${snippet}`.slice(0, 40),
    vibe_feed_headline: "Policy gridlocked in City Council after committee deadlocks.",
    budget_impact: {
      monthly_change: 0,
    },
    heatmap_modifiers: [],
    demographic_approval: [],
    unintended_consequence_trigger:
      "Policy gridlocked in City Council — procedural filibuster prevents floor vote.",
  };
}

export const buildDeterministicFallbackPolicy = buildGridlockedFallbackPolicy;
