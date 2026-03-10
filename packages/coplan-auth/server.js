import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const AUTH_DIR_NAME = ".coplan";
const AUTH_FILE_NAME = "auth.json";
const USAGE_FILE_NAME = "usage-events.v1.jsonl";
const CONFIG_FILE_NAME = "config.json";
const MAX_BODY_BYTES = 16 * 1024;
const STARTED_AT = new Date().toISOString();
const CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const CODEX_MODELS_CACHE_PATH = path.join(os.homedir(), ".codex", "models_cache.json");

function getAuthPath() {
  return path.join(os.homedir(), AUTH_DIR_NAME, AUTH_FILE_NAME);
}

function getUsagePath() {
  const override = process.env.COPLAN_USAGE_PATH ? process.env.COPLAN_USAGE_PATH.trim() : "";
  if (override) {
    return override;
  }
  return path.join(os.homedir(), AUTH_DIR_NAME, USAGE_FILE_NAME);
}

function getConfigPath() {
  const override = process.env.COPLAN_CONFIG_PATH ? process.env.COPLAN_CONFIG_PATH.trim() : "";
  if (override) {
    return override;
  }
  return path.join(os.homedir(), AUTH_DIR_NAME, CONFIG_FILE_NAME);
}

function ensureConfigDir() {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
}

function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeConfig(config) {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(configPath, 0o600);
    } catch (_) {
      // Best-effort permission hardening on Unix-like platforms.
    }
  }
}

function mergeConfig(prev, nextPartial) {
  const out = prev && typeof prev === "object" ? { ...prev } : {};
  const next = nextPartial && typeof nextPartial === "object" ? nextPartial : {};

  if (next.dashboard && typeof next.dashboard === "object") {
    const dash = out.dashboard && typeof out.dashboard === "object" ? { ...out.dashboard } : {};
    if (typeof next.dashboard.auto_open === "boolean") {
      dash.auto_open = next.dashboard.auto_open;
    }
    out.dashboard = dash;
  }

  if (next.codex && typeof next.codex === "object") {
    const codex = out.codex && typeof out.codex === "object" ? { ...out.codex } : {};
    if (typeof next.codex.api_model === "string") {
      codex.api_model = next.codex.api_model.trim();
    }
    if (typeof next.codex.cli_model === "string") {
      codex.cli_model = next.codex.cli_model.trim();
    }
    if (typeof next.codex.cli_reasoning_effort === "string") {
      codex.cli_reasoning_effort = next.codex.cli_reasoning_effort.trim();
    }
    out.codex = codex;
  }

  return out;
}

function readCodexConfigSelection() {
  if (!fs.existsSync(CODEX_CONFIG_PATH)) {
    return { model: "", reasoning_effort: "" };
  }
  try {
    const raw = fs.readFileSync(CODEX_CONFIG_PATH, "utf8");
    const lines = raw.split(/\r?\n/);

    // Prefer top-level model before any section header.
    let inTopLevel = true;
    let fallbackModel = "";
    let reasoning = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      if (trimmed.startsWith("[")) {
        inTopLevel = false;
      }
      const match = trimmed.match(/^model\s*=\s*"([^"]+)"/);
      if (match && match[1]) {
        if (inTopLevel) {
          fallbackModel = match[1].trim();
        }
        if (!fallbackModel) {
          fallbackModel = match[1].trim();
        }
      }

      const rm = trimmed.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/);
      if (rm && rm[1]) {
        if (inTopLevel) {
          reasoning = rm[1].trim();
        }
        if (!reasoning) {
          reasoning = rm[1].trim();
        }
      }
    }

    return { model: fallbackModel, reasoning_effort: reasoning };
  } catch (_) {
    return { model: "", reasoning_effort: "" };
  }
}

function readCoplanCliModelFromConfig() {
  const cfg = readConfig();
  const value = cfg && typeof cfg === "object" ? cfg.codex?.cli_model : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function readCoplanCliReasoningEffortFromConfig() {
  const cfg = readConfig();
  const value = cfg && typeof cfg === "object" ? cfg.codex?.cli_reasoning_effort : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function readCoplanCliModelFromEnv() {
  const env = process.env.COPLAN_CODEX_CLI_MODEL || process.env.COPLAN_CODEX_MODEL || "";
  return env.trim();
}

function readCoplanCliReasoningEffortFromEnv() {
  const env = process.env.COPLAN_CODEX_CLI_REASONING_EFFORT || "";
  return env.trim();
}

function resolveEffectiveCliModel() {
  const envModel = readCoplanCliModelFromEnv();
  if (envModel) {
    return { effective: envModel, source: "env" };
  }
  const cfgModel = readCoplanCliModelFromConfig();
  if (cfgModel) {
    return { effective: cfgModel, source: "coplan_config" };
  }
  const codex = readCodexConfigSelection();
  if (codex.model) {
    return { effective: codex.model, source: "codex_config" };
  }
  return { effective: "", source: "codex_default" };
}

function resolveEffectiveCliSelection() {
  const modelResolved = resolveEffectiveCliModel();
  const codex = readCodexConfigSelection();

  const effortEnv = readCoplanCliReasoningEffortFromEnv();
  const effortCfg = readCoplanCliReasoningEffortFromConfig();
  const effortCodex = codex.reasoning_effort || "";
  const effectiveEffort = effortEnv || effortCfg || effortCodex;
  const effortSource = effortEnv ? "env" : effortCfg ? "coplan_config" : effortCodex ? "codex_config" : "unknown";
  return {
    effective_model: modelResolved.effective,
    model_source: modelResolved.source,
    effective_reasoning_effort: effectiveEffort,
    reasoning_source: effortSource,
    sources: {
      env: readCoplanCliModelFromEnv() || null,
      coplan_config: readCoplanCliModelFromConfig() || null,
      codex_config: codex.model || null,
      env_reasoning_effort: effortEnv || null,
      coplan_reasoning_effort: effortCfg || null,
      codex_reasoning_effort: effortCodex || null
    }
  };
}

function readCodexModelsCache() {
  if (!fs.existsSync(CODEX_MODELS_CACHE_PATH)) {
    return { fetched_at: null, models: [] };
  }
  try {
    const raw = fs.readFileSync(CODEX_MODELS_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const models = Array.isArray(parsed?.models) ? parsed.models : [];
    const out = [];
    const seen = new Set();
    for (const model of models) {
      if (!model || typeof model !== "object") {
        continue;
      }
      const slug = typeof model.slug === "string" ? model.slug : "";
      if (!slug) {
        continue;
      }

      const visibility = typeof model.visibility === "string" ? model.visibility : "";
      if (visibility && visibility !== "list") {
        // Skip hidden/experimental/blocked entries from cache.
        continue;
      }
      if (seen.has(slug)) {
        continue;
      }
      seen.add(slug);

      const levels = Array.isArray(model.supported_reasoning_levels) ? model.supported_reasoning_levels : [];
      const supportedEfforts = levels
        .map((l) => (l && typeof l === "object" && typeof l.effort === "string" ? l.effort : ""))
        .filter((e) => e);
      if (supportedEfforts.length === 0) {
        continue;
      }
      out.push({
        slug,
        display_name: typeof model.display_name === "string" ? model.display_name : slug,
        description: typeof model.description === "string" ? model.description : "",
        default_reasoning_level: typeof model.default_reasoning_level === "string" ? model.default_reasoning_level : "",
        supported_reasoning_levels: supportedEfforts,
        supported_in_api: typeof model.supported_in_api === "boolean" ? model.supported_in_api : null
      });
    }
    const fetched = typeof parsed?.fetched_at === "string" ? parsed.fetched_at : null;
    return { fetched_at: fetched, models: out };
  } catch (_) {
    return { fetched_at: null, models: [] };
  }
}

function getCodexCommand() {
  let command = process.platform === "win32" ? "codex.cmd" : "codex";
  if (process.platform === "win32" && !path.isAbsolute(command)) {
    const appData = process.env.APPDATA || "";
    const shimPath = appData ? path.join(appData, "npm", command) : "";
    if (shimPath && fs.existsSync(shimPath)) {
      command = shimPath;
    }
  }
  return command;
}

function runCodexSync(args) {
  const result = spawnSync(getCodexCommand(), args, {
    encoding: "utf8",
    stdio: "pipe",
    shell: process.platform === "win32",
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : ""
  };
}

function getCodexLoginStatus() {
  const result = runCodexSync(["login", "status"]);
  if (result.status !== 0) {
    const combined = `${result.error || ""}\n${result.stderr}\n${result.stdout}`.trim();
    const text = combined.toLowerCase();

    // Codex CLI may exit non-zero when logged out. Treat that as "available, not logged in".
    const looksLoggedOut = text.includes("not logged in") || text.includes("logged out") || text.includes("please login");
    if (looksLoggedOut) {
      return { available: true, loggedIn: false, detail: "" };
    }

    // If the process failed to spawn / is invalid, mark unavailable.
    const spawnError = text.includes("enoent") || text.includes("einval") || text.includes("failed to execute") || text.includes("not recognized");
    if (spawnError) {
      return { available: false, loggedIn: false, detail: combined || "codex login status failed" };
    }

    // Unknown failure: keep CLI as available but show detail.
    return { available: true, loggedIn: false, detail: combined || "codex login status failed" };
  }
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return { available: true, loggedIn: text.includes("logged in"), detail: "" };
}

function ensureAuthDir() {
  fs.mkdirSync(path.dirname(getAuthPath()), { recursive: true });
}

function writeAuth(record) {
  ensureAuthDir();
  const authPath = getAuthPath();
  fs.writeFileSync(authPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(authPath, 0o600);
    } catch (_) {
      // Best-effort permission hardening on Unix-like platforms.
    }
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    // Avoid sticky stale assets during rapid local iteration.
    "Cache-Control": "no-store"
  });
  res.end(data);
}

function safeParseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (_) {
    return null;
  }
}

function normalizeUsageEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const ts = typeof event.ts === "string" ? event.ts : null;
  if (!ts) {
    return null;
  }
  const input = Number.isFinite(event.input_tokens) ? event.input_tokens : undefined;
  const output = Number.isFinite(event.output_tokens) ? event.output_tokens : undefined;
  const total = Number.isFinite(event.total_tokens)
    ? event.total_tokens
    : input !== undefined && output !== undefined
      ? input + output
      : undefined;
  const cached = Number.isFinite(event.cached_input_tokens) ? event.cached_input_tokens : undefined;
  const reasoning_effort = typeof event.reasoning_effort === "string" ? event.reasoning_effort : undefined;

  const request =
    event.request && typeof event.request === "object"
      ? {
          ...(Number.isFinite(event.request.plan_chars) ? { plan_chars: event.request.plan_chars } : {}),
          ...(typeof event.request.plan_sha256_12 === "string" && event.request.plan_sha256_12
            ? { plan_sha256_12: event.request.plan_sha256_12 }
            : {}),
          ...(typeof event.request.plan_preview === "string" && event.request.plan_preview
            ? { plan_preview: event.request.plan_preview }
            : {})
        }
      : null;

  return {
    ts,
    tool: typeof event.tool === "string" ? event.tool : "codex_plan_review",
    provider: typeof event.provider === "string" ? event.provider : "unknown",
    model: typeof event.model === "string" ? event.model : undefined,
    ...(reasoning_effort ? { reasoning_effort } : {}),
    ...(request && Object.keys(request).length ? { request } : {}),
    ...(input !== undefined ? { input_tokens: input } : {}),
    ...(output !== undefined ? { output_tokens: output } : {}),
    ...(total !== undefined ? { total_tokens: total } : {}),
    ...(cached !== undefined ? { cached_input_tokens: cached } : {})
  };
}

function readUsageEvents({ from, to, limit }) {
  const usagePath = getUsagePath();
  if (!fs.existsSync(usagePath)) {
    return { usagePath, events: [] };
  }
  const raw = fs.readFileSync(usagePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const events = [];

  const fromMs = from ? Date.parse(from) : NaN;
  const toMs = to ? Date.parse(to) : NaN;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = safeParseJsonLine(lines[i]);
    const event = normalizeUsageEvent(parsed);
    if (!event) {
      continue;
    }
    const tsMs = Date.parse(event.ts);
    if (Number.isFinite(fromMs) && Number.isFinite(tsMs) && tsMs < fromMs) {
      continue;
    }
    if (Number.isFinite(toMs) && Number.isFinite(tsMs) && tsMs > toMs) {
      continue;
    }
    events.push(event);
    if (limit && events.length >= limit) {
      break;
    }
  }

  return { usagePath, events };
}

function formatLocalDay(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isTrustedBrowserRequest(req, expectedOrigin) {
  const origin = req.headers.origin;
  const hasOrigin = typeof origin === "string" && origin.length > 0;
  if (hasOrigin && origin !== expectedOrigin) {
    return false;
  }

  const referer = req.headers.referer;
  const hasReferer = typeof referer === "string" && referer.length > 0;
  if (hasReferer) {
    if (!referer.startsWith(`${expectedOrigin}/`) && referer !== expectedOrigin) {
      return false;
    }
  }

  if (!hasOrigin && !hasReferer) {
    return false;
  }

  return true;
}

function createRequestHandler(expectedOrigin) {
  return async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      serveFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/dashboard/usage") {
      serveFile(res, path.join(PUBLIC_DIR, "usage.html"), "text/html; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/app.js") {
      serveFile(res, path.join(PUBLIC_DIR, "app.js"), "application/javascript; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/dashboard/usage.js") {
      serveFile(res, path.join(PUBLIC_DIR, "usage.js"), "application/javascript; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/style.css") {
      serveFile(res, path.join(PUBLIC_DIR, "style.css"), "text/css; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/dashboard/usage.css") {
      serveFile(res, path.join(PUBLIC_DIR, "usage.css"), "text/css; charset=utf-8");
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, { ok: true, auth_path: getAuthPath() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meta") {
      sendJson(res, 200, {
        ok: true,
        pid: process.pid,
        started_at: STARTED_AT,
        config_path: getConfigPath(),
        usage_path: getUsagePath()
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, { ok: true, config_path: getConfigPath(), config: readConfig() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/config") {
      try {
        if (!isTrustedBrowserRequest(req, expectedOrigin)) {
          sendJson(res, 403, { ok: false, error: "Untrusted origin." });
          return;
        }
        const contentType = (req.headers["content-type"] || "").toLowerCase();
        if (!contentType.includes("application/json")) {
          sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
          return;
        }
        const body = await readRequestBody(req);
        const prev = readConfig();
        const merged = mergeConfig(prev, body);
        writeConfig(merged);
        sendJson(res, 200, { ok: true, config_path: getConfigPath(), config: merged });
        return;
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/api/codex/status") {
      const status = getCodexLoginStatus();
      sendJson(res, 200, { ok: true, codex_cli_available: status.available, codex_logged_in: status.loggedIn, detail: status.detail || null });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/codex/model") {
      const resolved = resolveEffectiveCliSelection();
      sendJson(res, 200, {
        ok: true,
        effective_model: resolved.effective_model || null,
        effective_reasoning_effort: resolved.effective_reasoning_effort || null,
        source: {
          model: resolved.model_source,
          reasoning_effort: resolved.reasoning_source
        },
        sources: resolved.sources,
        codex_config_path: CODEX_CONFIG_PATH
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/codex/models") {
      const status = getCodexLoginStatus();
      const cache = status.available && status.loggedIn ? readCodexModelsCache() : { fetched_at: null, models: [] };
      sendJson(res, 200, {
        ok: true,
        codex_cli_available: status.available,
        codex_logged_in: status.loggedIn,
        fetched_at: cache.fetched_at,
        models: cache.models,
        models_cache_path: CODEX_MODELS_CACHE_PATH
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/codex/login") {
      try {
        if (!isTrustedBrowserRequest(req, expectedOrigin)) {
          sendJson(res, 403, { ok: false, error: "Untrusted origin." });
          return;
        }
        // Fire-and-forget: Codex CLI opens browser for ChatGPT login.
        // On Windows, prefer hiding any console window.
        const spawnOptions = {
          detached: true,
          stdio: "ignore",
          windowsHide: process.platform === "win32"
        };

        // Avoid `shell: true` here because it can pop up a cmd window.
        let child;
        try {
          child = spawn(getCodexCommand(), ["login"], spawnOptions);
        } catch (_) {
          // Fallback: invoke via cmd explicitly.
          child = spawn("cmd.exe", ["/c", getCodexCommand(), "login"], spawnOptions);
        }

        child.unref();
        sendJson(res, 200, { ok: true });
        return;
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    if (req.method === "POST" && url.pathname === "/api/codex/logout") {
      try {
        if (!isTrustedBrowserRequest(req, expectedOrigin)) {
          sendJson(res, 403, { ok: false, error: "Untrusted origin." });
          return;
        }
        const result = runCodexSync(["logout"]);
        if (result.status !== 0) {
          const msg = `${result.error || ""}\n${result.stderr}\n${result.stdout}`.trim();
          throw new Error(msg || "codex logout failed");
        }
        sendJson(res, 200, { ok: true });
        return;
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/api/usage/events") {
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "200")));
      const from = url.searchParams.get("from") || "";
      const to = url.searchParams.get("to") || "";
      const { usagePath, events } = readUsageEvents({ from, to, limit });
      sendJson(res, 200, { ok: true, usage_path: usagePath, events });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/usage/summary") {
      const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || "30")));
      const now = Date.now();
      const from = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      const { usagePath, events } = readUsageEvents({ from, to: "", limit: 100000 });

      const totals = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cached_input_tokens: 0, count: 0 };
      const byDay = new Map();

      for (const event of events) {
        const day = formatLocalDay(event.ts);
        if (!day) {
          continue;
        }
        const input = Number.isFinite(event.input_tokens) ? event.input_tokens : 0;
        const output = Number.isFinite(event.output_tokens) ? event.output_tokens : 0;
        const total = Number.isFinite(event.total_tokens) ? event.total_tokens : input + output;
        const cached = Number.isFinite(event.cached_input_tokens) ? event.cached_input_tokens : 0;

        totals.input_tokens += input;
        totals.output_tokens += output;
        totals.total_tokens += total;
        totals.cached_input_tokens += cached;
        totals.count += 1;

        const prev = byDay.get(day) || {
          day,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cached_input_tokens: 0,
          count: 0
        };
        prev.input_tokens += input;
        prev.output_tokens += output;
        prev.total_tokens += total;
        prev.cached_input_tokens += cached;
        prev.count += 1;
        byDay.set(day, prev);
      }

      const daily = Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? -1 : 1));

      sendJson(res, 200, { ok: true, usage_path: usagePath, window_days: days, totals, by_day: daily });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/login") {
      try {
        if (!isTrustedBrowserRequest(req, expectedOrigin)) {
          sendJson(res, 403, { ok: false, error: "Untrusted origin." });
          return;
        }
        const contentType = (req.headers["content-type"] || "").toLowerCase();
        if (!contentType.includes("application/json")) {
          sendJson(res, 415, { ok: false, error: "Content-Type must be application/json." });
          return;
        }

        const body = await readRequestBody(req);
        const provider = body.provider === "openai" ? "openai" : "openai";
        const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";

        if (!accessToken) {
          sendJson(res, 400, { ok: false, error: "access_token is required." });
          return;
        }

        const payload = {
          provider,
          access_token: accessToken,
          created_at: new Date().toISOString()
        };

        writeAuth(payload);
        sendJson(res, 200, { ok: true, auth_path: getAuthPath() });
        return;
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    res.writeHead(404);
    res.end("Not found");
  };
}

export async function startAuthServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number(options.port || 8719);

  if (host !== "127.0.0.1") {
    throw new Error("Auth server must bind to 127.0.0.1 only.");
  }

  const expectedOrigin = `http://${host}:${port}`;
  const server = http.createServer(createRequestHandler(expectedOrigin));

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  return {
    host,
    port,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startAuthServer()
    .then(({ url }) => {
      console.log(`coplan-auth listening at ${url}`);
    })
    .catch((error) => {
      console.error("Failed to start auth server:", error);
      process.exit(1);
    });
}
