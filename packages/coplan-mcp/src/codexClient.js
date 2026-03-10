import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import spawn from "cross-spawn";
import { readAuth } from "./authStore.js";
import { getCodexApiModel, getCodexCliModel, getCodexCliReasoningEffort, readConfig } from "./configStore.js";
import { normalizeReview } from "./schemas.js";
import { appendUsageEvent } from "./usageStore.js";

const ENV_API_MODEL = process.env.COPLAN_CODEX_MODEL || "";
const ENV_CLI_MODEL = process.env.COPLAN_CODEX_CLI_MODEL || process.env.COPLAN_CODEX_MODEL || "";
const ENV_CLI_EFFORT = process.env.COPLAN_CODEX_CLI_REASONING_EFFORT || "";
const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_RUBRIC = [
  "completeness",
  "architecture soundness",
  "security risks",
  "scalability",
  "failure handling",
  "test strategy",
  "rollback strategy"
].join(", ");

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "issues", "missing_steps", "improvements", "questions"],
  properties: {
    score: { type: "number", minimum: 0, maximum: 10 },
    issues: { type: "array", items: { type: "string" } },
    missing_steps: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } }
  }
};

function resolveApiModel() {
  const env = ENV_API_MODEL.trim();
  if (env) {
    return env;
  }
  const cfg = readConfig();
  const fromCfg = getCodexApiModel(cfg);
  return fromCfg || "gpt-5";
}

function resolveCliModel() {
  const env = ENV_CLI_MODEL.trim();
  if (env) {
    return env;
  }
  const cfg = readConfig();
  return getCodexCliModel(cfg);
}

function resolveCliReasoningEffort() {
  const env = ENV_CLI_EFFORT.trim();
  if (env) {
    return env;
  }
  const cfg = readConfig();
  return getCodexCliReasoningEffort(cfg);
}

function getCodexCommand() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function runCodex(args, options = {}) {
  let command = getCodexCommand();
  if (process.platform === "win32" && !path.isAbsolute(command)) {
    const appData = process.env.APPDATA || "";
    const shimPath = appData ? path.join(appData, "npm", command) : "";
    if (shimPath && fs.existsSync(shimPath)) {
      command = shimPath;
    }
  }

  const result = spawn.sync(command, args, {
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    input: options.input,
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024
  });
  if (result.error) {
    const code = result.error.code || "UNKNOWN";
    throw new Error(`Failed to execute ${command}: ${code} ${result.error.message}`);
  }
  return result;
}

function buildPrompt(plan, rubric) {
  const activeRubric = rubric?.trim() ? rubric.trim() : DEFAULT_RUBRIC;
  return [
    "You are a senior software architect reviewing an implementation plan.",
    "",
    "Evaluate using:",
    `- ${activeRubric.split(",").map((item) => item.trim()).join("\n- ")}`,
    "",
    "Return ONLY JSON with fields:",
    "score",
    "issues",
    "missing_steps",
    "improvements",
    "questions",
    "",
    "PLAN:",
    plan
  ].join("\n");
}

function parseReviewJsonString(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    return normalizeReview(parsed);
  } catch (_) {
    return null;
  }
}

function extractJsonObjects(text) {
  const candidates = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function parseReviewFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Codex response was empty.");
  }

  const direct = parseReviewJsonString(trimmed);
  if (direct) {
    return direct;
  }

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of trimmed.matchAll(fenceRegex)) {
    const candidate = parseReviewJsonString(match[1].trim());
    if (candidate) {
      return candidate;
    }
  }

  const objects = extractJsonObjects(trimmed);
  for (const candidateText of objects) {
    const candidate = parseReviewJsonString(candidateText);
    if (candidate) {
      return candidate;
    }
  }

  throw new Error("Codex response did not contain a valid review JSON object.");
}

function extractUsageFromCodexCliJsonl(text) {
  if (typeof text !== "string" || !text.trim()) {
    return undefined;
  }
  const lines = text.split(/\r?\n/);
  let lastUsage;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== "{") {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.type === "turn.completed" && parsed.usage && typeof parsed.usage === "object") {
        lastUsage = parsed.usage;
      }
    } catch (_) {
      // ignore non-JSON lines
    }
  }
  return lastUsage;
}

function extractResponsesText(responseJson) {
  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }

  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const chunks = [];

  for (const item of output) {
    if (!Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
      if (content.type === "text" && typeof content.value === "string") {
        chunks.push(content.value);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractUsageFromResponsesApi(responseJson) {
  const usage = responseJson && typeof responseJson === "object" ? responseJson.usage : null;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  // Keep the full usage object (passthrough schema), but these are the core fields we expect.
  const input_tokens = Number.isFinite(usage.input_tokens) ? usage.input_tokens : undefined;
  const output_tokens = Number.isFinite(usage.output_tokens) ? usage.output_tokens : undefined;
  const total_tokens = Number.isFinite(usage.total_tokens) ? usage.total_tokens : undefined;

  return {
    ...usage,
    ...(input_tokens !== undefined ? { input_tokens } : {}),
    ...(output_tokens !== undefined ? { output_tokens } : {}),
    ...(total_tokens !== undefined ? { total_tokens } : {})
  };
}

function getCodexCliLoginStatus() {
  try {
    const result = runCodex(["login", "status"]);
    if (result.status !== 0) {
      return { ok: false, error: `${result.stderr || result.stdout || ""}`.trim() };
    }
    const text = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();
    return { ok: text.includes("logged in"), error: "" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function reviewViaCodexCli({ plan, rubric }) {
  const loginStatus = getCodexCliLoginStatus();
  if (!loginStatus.ok) {
    if (loginStatus.error) {
      throw new Error(loginStatus.error);
    }
    throw new Error(
      "Codex CLI is not logged in. Run `coplan login --provider chatgpt` (or `codex login`) first."
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coplan-codex-"));
  const outputPath = path.join(tempDir, "last-message.txt");
  const schemaPath = path.join(tempDir, "review-schema.json");
  fs.writeFileSync(schemaPath, `${JSON.stringify(REVIEW_SCHEMA, null, 2)}\n`, "utf8");

  try {
    const prompt = buildPrompt(plan, rubric);
    const args = [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--output-schema",
      schemaPath,
      "--output-last-message",
      outputPath
    ];

    const cliModel = resolveCliModel();
    if (cliModel) {
      args.push("--model", cliModel);
    }

    const cliEffort = resolveCliReasoningEffort();
    if (cliEffort) {
      args.push("--config", `model_reasoning_effort=\"${cliEffort}\"`);
    }
    // Pass prompt through stdin to avoid Windows shell argument splitting.
    args.push("-");

    let result = runCodex(args, { input: prompt });

    // Backward-compat: older Codex CLI versions may not support --json.
    // If the exec fails due to an unknown option, retry without --json.
    if (result.status !== 0) {
      const combined = `${result.stderr || ""}\n${result.stdout || ""}`.toLowerCase();
      const looksLikeUnknownOption = combined.includes("unknown option") || combined.includes("unknown flag");
      if (looksLikeUnknownOption && combined.includes("--json")) {
        const retryArgs = args.filter((item) => item !== "--json");
        result = runCodex(retryArgs, { input: prompt });
      }
    }

    let outputText = "";
    if (fs.existsSync(outputPath)) {
      outputText = fs.readFileSync(outputPath, "utf8");
    }
    if (!outputText.trim()) {
      outputText = `${result.stdout || ""}`.trim();
    }

    if (result.status !== 0) {
      const errText = `${result.stderr || result.stdout || outputText || ""}`.trim();
      throw new Error(`Codex CLI exec failed: ${errText || "unknown error"}`);
    }

    const review = parseReviewFromText(outputText);
    const usage = extractUsageFromCodexCliJsonl(`${result.stdout || ""}\n${result.stderr || ""}`);
    const resultReview = usage ? { ...review, usage } : review;
    recordUsageEvent({
      provider: "chatgpt",
      model: cliModel || "codex-cli-default",
      reasoning_effort: cliEffort || undefined,
      usage: resultReview.usage,
      plan
    });
    return resultReview;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function reviewViaOpenAiApi({ plan, rubric, token }) {
  const prompt = buildPrompt(plan, rubric);
  const apiModel = resolveApiModel();

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      model: apiModel,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Codex API error (${response.status}): ${body}`);
  }

  const responseJson = await response.json();
  const text = extractResponsesText(responseJson);
  const review = parseReviewFromText(text);
  const usage = extractUsageFromResponsesApi(responseJson);
  const resultReview = usage ? { ...review, usage } : review;
  recordUsageEvent({ provider: "openai", model: apiModel, usage: resultReview.usage, plan });
  return resultReview;
}

function resolveProvider(auth) {
  if (!auth) {
    return "chatgpt";
  }
  if (auth.provider === "openai") {
    return "openai";
  }
  if (auth.provider === "chatgpt") {
    return "chatgpt";
  }
  if (typeof auth.access_token === "string" && auth.access_token.trim()) {
    return "openai";
  }
  return "chatgpt";
}

function normalizeUsageForEvent(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const input = Number.isFinite(usage.input_tokens) ? usage.input_tokens : undefined;
  const output = Number.isFinite(usage.output_tokens) ? usage.output_tokens : undefined;
  const total = Number.isFinite(usage.total_tokens)
    ? usage.total_tokens
    : input !== undefined && output !== undefined
      ? input + output
      : undefined;
  const cachedInput = Number.isFinite(usage.cached_input_tokens) ? usage.cached_input_tokens : undefined;

  return {
    ...(input !== undefined ? { input_tokens: input } : {}),
    ...(output !== undefined ? { output_tokens: output } : {}),
    ...(total !== undefined ? { total_tokens: total } : {}),
    ...(cachedInput !== undefined ? { cached_input_tokens: cachedInput } : {})
  };
}

function recordUsageEvent({ provider, model, reasoning_effort, usage, plan }) {
  const normalized = normalizeUsageForEvent(usage);

  const logPreview = String(process.env.COPLAN_LOG_PLAN_PREVIEW || "").trim() === "1";
  const planText = typeof plan === "string" ? plan : "";
  const planChars = planText ? planText.length : undefined;
  const planHash = planText
    ? crypto.createHash("sha256").update(planText, "utf8").digest("hex").slice(0, 12)
    : undefined;
  const planPreview =
    logPreview && planText
      ? planText
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)
      : undefined;
  const request = {
    ...(planChars !== undefined ? { plan_chars: planChars } : {}),
    ...(planHash ? { plan_sha256_12: planHash } : {}),
    ...(planPreview ? { plan_preview: planPreview } : {})
  };

  try {
    appendUsageEvent({
      schema_version: 1,
      ts: new Date().toISOString(),
      tool: "codex_plan_review",
      provider,
      ...(model ? { model } : {}),
      ...(reasoning_effort ? { reasoning_effort } : {}),
      ...(Object.keys(request).length ? { request } : {}),
      ...(normalized ? normalized : {})
    });
  } catch (_) {
    // Best-effort only: token logging must never break plan review.
  }
}

export async function reviewPlanWithCodex({ plan, rubric }) {
  const auth = readAuth();
  const provider = resolveProvider(auth);

  if (provider === "openai") {
    const envToken = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";
    const fileToken = typeof auth?.access_token === "string" ? auth.access_token.trim() : "";
    const token = envToken || fileToken;
    if (!token) {
      throw new Error(
        "OpenAI API key is missing. Set OPENAI_API_KEY and run `coplan login --provider openai`."
      );
    }
    return reviewViaOpenAiApi({ plan, rubric, token });
  }

  return reviewViaCodexCli({ plan, rubric });
}
