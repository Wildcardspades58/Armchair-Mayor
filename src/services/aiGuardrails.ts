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
// 2. Resilient JSON Extractor & Repair Pipeline (First '{' to Balanced '}')
// ----------------------------------------------------------------------------

function skipWsAndComments(src: string, start: number): number {
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

function getLastNonWsChar(text: string): string {
  for (let i = text.length - 1; i >= 0; i--) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return "";
}

function needsCommaBeforeNextElement(
  out: string,
  containerStack: Array<"{" | "[">
): boolean {
  if (containerStack.length === 0) return false;
  const last = getLastNonWsChar(out);
  return (
    last !== "" &&
    last !== "{" &&
    last !== "[" &&
    last !== "," &&
    last !== ":" &&
    (last === "}" ||
      last === "]" ||
      last === '"' ||
      (last >= "0" && last <= "9") ||
      last === "e" || // true / false
      last === "l") // null
  );
}

function stripIncompleteObjectKey(out: string): string {
  // Remove trailing dangling key right after ',' inside an object: `, "partialKey"` -> ``
  const afterCommaKey = out.replace(/,\s*"(?:[^"\\]|\\.)*"\s*$/, "");
  if (afterCommaKey !== out) return afterCommaKey;
  // Remove lone dangling key right after '{': `{"partialKey"` -> `{`
  const afterBraceKey = out.replace(/({\s*)"(?:[^"\\]|\\.)*"\s*$/, "$1");
  return afterBraceKey;
}

function closeOpenContainers(
  text: string,
  stack: Array<"{" | "[">
): string {
  let closed = text.replace(/[,\s]+$/, "");
  const remaining = [...stack];
  while (remaining.length > 0) {
    const open = remaining.pop();
    closed = closed.replace(/,\s*$/, "");
    closed += open === "{" ? "}" : "]";
  }
  return closed;
}

function rollbackToLastValidJsonBoundary(repaired: string): string | null {
  // Walk outside strings to collect candidate structural cut boundaries
  const boundaries: number[] = [];
  let inStr = false;
  let esc = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === ",") {
      boundaries.push(i);
    } else if (ch === "}" || ch === "]") {
      boundaries.push(i + 1);
    }
  }

  for (
    let b = boundaries.length - 1, checked = 0;
    b >= 0 && checked < 40;
    b--, checked++
  ) {
    const cut = repaired.slice(0, boundaries[b]).replace(/[,\s]+$/, "");
    if (!cut.startsWith("{")) continue;

    // Recompute open container stack for this clean prefix
    const prefixStack: Array<"{" | "["> = [];
    let pInStr = false;
    let pEsc = false;
    for (let i = 0; i < cut.length; i++) {
      const c = cut[i];
      if (pEsc) {
        pEsc = false;
        continue;
      }
      if (pInStr) {
        if (c === "\\") pEsc = true;
        else if (c === '"') pInStr = false;
        continue;
      }
      if (c === '"') pInStr = true;
      else if (c === "{" || c === "[") prefixStack.push(c);
      else if (c === "}" && prefixStack[prefixStack.length - 1] === "{") {
        prefixStack.pop();
      } else if (c === "]" && prefixStack[prefixStack.length - 1] === "[") {
        prefixStack.pop();
      }
    }
    if (pInStr) continue;

    const cleanedPrefix = stripIncompleteObjectKey(cut);
    const candidate = closeOpenContainers(cleanedPrefix, prefixStack);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return candidate;
      }
    } catch {
      // Keep walking backward to earlier boundary
    }
  }

  return null;
}

function repairMalformedJson(src: string): string {
  const containerStack: Array<"{" | "["> = [];
  let expectingKey = false;
  let inString = false;
  let stringIsKey = false;
  let escapeNext = false;
  let out = "";

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        if (
          ch === '"' ||
          ch === "\\" ||
          ch === "/" ||
          ch === "b" ||
          ch === "f" ||
          ch === "n" ||
          ch === "r" ||
          ch === "t"
        ) {
          out += `\\${ch}`;
        } else if (ch === "u" && /^[0-9a-fA-F]{4}/.test(src.slice(i + 1, i + 5))) {
          out += "\\u";
        } else if (ch === "'") {
          // RFC-8259 forbids \' inside JSON strings; emit plain single quote
          out += "'";
        } else {
          out += `\\\\${ch}`;
        }
        continue;
      }

      if (ch === "\\") {
        escapeNext = true;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      if (ch.charCodeAt(0) < 32) {
        continue;
      }

      if (ch === '"') {
        const nextIdx = skipWsAndComments(src, i + 1);
        const nextCh = src[nextIdx] ?? "";
        const container = containerStack[containerStack.length - 1];

        if (stringIsKey) {
          if (nextCh === ":" || nextCh === "") {
            inString = false;
            stringIsKey = false;
            out += '"';
          } else {
            out += '\\"';
          }
          continue;
        }

        // String value: never terminated by ':' (only by EOF, '}'/']', valid ',', or missing-comma newline before next key)
        if (nextCh === "") {
          inString = false;
          out += '"';
          continue;
        }

        if (nextCh === "}" || nextCh === "]") {
          const afterBracketIdx = skipWsAndComments(src, nextIdx + 1);
          const afterBracketCh = src[afterBracketIdx] ?? "";
          if (!/[a-zA-Z]/.test(afterBracketCh)) {
            inString = false;
            out += '"';
            continue;
          }
        }

        if (nextCh === ",") {
          const afterCommaIdx = skipWsAndComments(src, nextIdx + 1);
          const afterComma = src.slice(afterCommaIdx);

          if (container === "{") {
            const startsNextObjectEntry =
              afterComma.length === 0 ||
              afterComma[0] === "}" ||
              /^"[^"\n\r]{1,72}"\s*:/.test(afterComma) ||
              /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(afterComma) ||
              /^"[a-zA-Z0-9_]*$/.test(afterComma);
            if (startsNextObjectEntry) {
              inString = false;
              out += '"';
              continue;
            }
          } else if (container === "[") {
            const startsNextArrayItem =
              afterComma.length === 0 ||
              afterComma[0] === "]" ||
              afterComma[0] === "{" ||
              afterComma[0] === "[" ||
              afterComma[0] === '"' ||
              /^(?:true|false|null|True|False|None)\b/.test(afterComma) ||
              /^[+-]?\d/.test(afterComma);
            if (startsNextArrayItem) {
              inString = false;
              out += '"';
              continue;
            }
          }
        }

        // Handle omitted comma on newline before next property key `"val"\n "next_key":`
        if (
          container === "{" &&
          src.slice(i + 1, nextIdx).includes("\n") &&
          /^(?:"[^"\n\r]{1,72}"|[a-zA-Z_][a-zA-Z0-9_]*)\s*:/.test(
            src.slice(nextIdx)
          )
        ) {
          inString = false;
          out += '"';
          continue;
        }

        // Otherwise this quote is unescaped prose punctuation inside a string value
        out += '\\"';
        continue;
      }

      out += ch;
      continue;
    }

    // Outside string literals
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }

    if (ch === "/" && src[i + 1] === "/") {
      i += 2;
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }

    if (ch === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 1;
      continue;
    }

    if (ch === "{") {
      if (needsCommaBeforeNextElement(out, containerStack)) {
        out += ",";
      }
      containerStack.push("{");
      expectingKey = true;
      out += "{";
      continue;
    }

    if (ch === "[") {
      if (needsCommaBeforeNextElement(out, containerStack)) {
        out += ",";
      }
      containerStack.push("[");
      expectingKey = false;
      out += "[";
      continue;
    }

    if (ch === "}") {
      out = out.replace(/,\s*$/, "");
      if (/:\s*$/.test(out)) {
        out += "null";
      }
      if (containerStack[containerStack.length - 1] === "{") {
        containerStack.pop();
      }
      expectingKey = false;
      out += "}";
      if (containerStack.length === 0) {
        return out;
      }
      continue;
    }

    if (ch === "]") {
      out = out.replace(/,\s*$/, "");
      if (containerStack[containerStack.length - 1] === "[") {
        containerStack.pop();
      }
      expectingKey = false;
      out += "]";
      continue;
    }

    if (ch === ",") {
      if (getLastNonWsChar(out) === ",") {
        continue;
      }
      expectingKey = containerStack[containerStack.length - 1] === "{";
      out += ",";
      continue;
    }

    if (ch === ":") {
      expectingKey = false;
      out += ":";
      continue;
    }

    if (ch === '"') {
      const insertedComma = needsCommaBeforeNextElement(out, containerStack);
      if (insertedComma) {
        out += ",";
        expectingKey = containerStack[containerStack.length - 1] === "{";
      }
      inString = true;
      stringIsKey =
        containerStack[containerStack.length - 1] === "{" && expectingKey;
      out += '"';
      continue;
    }

    // Numeric literals (including leading '+', decimals, scientific notation, and truncated tails)
    if (
      ch === "-" ||
      (ch === "+" && /[0-9.]/.test(src[i + 1] ?? "")) ||
      (ch >= "0" && ch <= "9")
    ) {
      if (needsCommaBeforeNextElement(out, containerStack)) {
        out += ",";
      }
      let end = i + 1;
      while (end < src.length && /[0-9.eE+-]/.test(src[end])) {
        end++;
      }
      let numToken = src.slice(i, end);
      if (numToken.startsWith("+")) {
        numToken = numToken.slice(1);
      }
      if (/^[+-]?$/.test(numToken)) {
        numToken = "0";
      } else {
        numToken = numToken.replace(/([.eE][+-]?|[+-])$/, "");
        if (!numToken || !/^-?\d/.test(numToken)) numToken = "0";
      }
      out += numToken;
      i = end - 1;
      continue;
    }

    // Unquoted keys or Python/bareword literals (None/True/False)
    if (/[a-zA-Z_]/.test(ch)) {
      let end = i + 1;
      while (end < src.length && /[a-zA-Z0-9_]/.test(src[end])) end++;
      const word = src.slice(i, end);
      const afterWordIdx = skipWsAndComments(src, end);

      if (
        containerStack[containerStack.length - 1] === "{" &&
        src[afterWordIdx] === ":"
      ) {
        if (needsCommaBeforeNextElement(out, containerStack)) {
          out += ",";
        }
        expectingKey = false;
        out += `"${word}"`;
      } else {
        if (needsCommaBeforeNextElement(out, containerStack)) {
          out += ",";
        }
        const lower = word.toLowerCase();
        if (lower === "none" || lower === "null") out += "null";
        else if (lower === "true") out += "true";
        else if (lower === "false") out += "false";
        else out += word;
      }
      i = end - 1;
      continue;
    }

    out += ch;
  }

  // Handle early truncation (max_tokens reached before root closing brace)
  if (inString) {
    out += '"';
    inString = false;
  }

  out = out.replace(/[,\s]+$/, "");
  // Complete truncated numeric sign/decimal (e.g., `"monthly_change": -` -> `"monthly_change": 0`)
  out = out.replace(/([:,\[]\s*)[+-]$/, "$10");
  out = out.replace(/(:\s*-?\d+)\.$/, "$1");
  // Complete truncated property colon (`"title":` -> `"title": null`)
  if (/:\s*$/.test(out)) {
    out += " null";
  }
  // Drop dangling partial object key without value (`{"a": 1, "partial"` -> `{"a": 1`)
  if (containerStack[containerStack.length - 1] === "{") {
    out = stripIncompleteObjectKey(out);
  }

  const repairedClosed = closeOpenContainers(out, containerStack);
  try {
    JSON.parse(repairedClosed);
    return repairedClosed;
  } catch {
    const rolledBack = rollbackToLastValidJsonBoundary(out);
    if (rolledBack) {
      return rolledBack;
    }
    return repairedClosed;
  }
}

/**
 * Extracts and repairs LLM JSON output before `JSON.parse()`:
 * 1. Strips markdown fences (```json / ```) and locates the first `{` to last `}`.
 * 2. Fast-paths clean complete JSON objects without altering characters.
 * 3. Repairs unescaped inner double quotes in prose strings, illegal trailing commas,
 *    Python literals, `+` number prefixes, unquoted keys, and `\'` escapes.
 * 4. If truncated early before closing braces, closes open quotes/brackets (or rolls back
 *    to the last complete boundary) so partial valid items still parse cleanly.
 */
export function extractAndRepairJson(rawText: string): string {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new Error("AI Guardrail Violation: Empty raw output from LLM.");
  }

  const withoutFences = rawText.replace(/```(?:json)?/gi, "").trim();
  const firstBrace = withoutFences.indexOf("{");
  if (firstBrace === -1) {
    throw new Error(
      "AI Guardrail Violation: Raw output does not contain an opening '{' JSON brace."
    );
  }

  const fromFirst = withoutFences.slice(firstBrace);
  const lastBrace = fromFirst.lastIndexOf("}");
  if (lastBrace !== -1) {
    const directSlice = fromFirst.slice(0, lastBrace + 1);
    const commaCleaned = directSlice.replace(/,\s*([}\]])/g, "$1");
    try {
      const parsed = JSON.parse(commaCleaned);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return commaCleaned;
      }
    } catch {
      // Fall through to full context-aware repair
    }
  }

  return repairMalformedJson(fromFirst);
}

// Preserve aliases used by aiGuardrails callers & crisisEngine.ts
export const sanitizeAndExtractJsonObject = extractAndRepairJson;
export const extractJsonObjectString = extractAndRepairJson;

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
