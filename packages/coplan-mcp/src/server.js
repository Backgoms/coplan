import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawnSync } from "node:child_process";
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { startAuthServer } from "@coplan/coplan-auth/server";
import { reviewPlanWithCodex } from "./codexClient.js";
import { getDashboardAutoOpen, getConfigPath, mergeConfig, readConfig, writeConfig } from "./configStore.js";
import { logger } from "./logger.js";
import { normalizeReview } from "./schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const CODEX_MODELS_CACHE_PATH = path.join(os.homedir(), ".codex", "models_cache.json");

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

function runGit(args) {
  const result = spawnSync(process.platform === "win32" ? "git.exe" : "git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function isGitClean() {
  const res = runGit(["status", "--porcelain"]);
  return res.status === 0 && res.stdout.trim().length === 0;
}

function getOriginUpstream() {
  const hasMain = runGit(["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"]);
  if (hasMain.status === 0) {
    return "origin/main";
  }
  const hasMaster = runGit(["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"]);
  if (hasMaster.status === 0) {
    return "origin/master";
  }
  return null;
}

function maybeFastForwardUpdate() {
  // Default: try safe fast-forward update on server start.
  // Set COPLAN_MCP_AUTO_UPDATE=0 to disable.
  const enabled = String(process.env.COPLAN_MCP_AUTO_UPDATE || "1").trim() !== "0";
  if (!enabled) {
    return;
  }

  const isRepo = runGit(["rev-parse", "--is-inside-work-tree"]);
  if (isRepo.status !== 0) {
    return;
  }

  const originUrl = runGit(["remote", "get-url", "origin"]);
  if (originUrl.status !== 0) {
    return;
  }

  const fetch = runGit(["fetch", "--quiet", "origin"]);
  if (fetch.status !== 0) {
    const msg = `${fetch.stderr}\n${fetch.stdout}`.trim();
    logger.warn("git fetch failed; skipping auto-update", msg || null);
    return;
  }

  const upstream = getOriginUpstream();
  if (!upstream) {
    return;
  }

  const behindRes = runGit(["rev-list", "--count", `HEAD..${upstream}`]);
  if (behindRes.status !== 0) {
    return;
  }

  const behind = Number(behindRes.stdout.trim() || "0");
  if (!Number.isFinite(behind) || behind <= 0) {
    return;
  }

  if (!isGitClean()) {
    logger.warn(`Auto-update available (behind ${upstream} by ${behind}) but working tree is not clean; skipping.`);
    return;
  }

  const pull = runGit(["pull", "--ff-only"]);
  if (pull.status !== 0) {
    const msg = `${pull.stderr}\n${pull.stdout}`.trim();
    logger.warn("git pull --ff-only failed; skipping auto-update", msg || null);
    return;
  }

  logger.info(`Auto-updated git clone (fast-forward): pulled ${behind} commit(s) from ${upstream}.`);
}

const server = new McpServer({
  name: "coplan-mcp",
  version: "0.1.0"
});

server.tool(
  "codex_plan_review",
  "Validate a software implementation plan using Codex and return structured critique.",
  {
    plan: z.string().min(1),
    rubric: z.string().optional()
  },
  async ({ plan, rubric }) => {
    logger.info("codex_plan_review called");

    try {
      const result = await reviewPlanWithCodex({ plan, rubric });
      const normalized = normalizeReview(result);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(normalized, null, 2)
          }
        ],
        structuredContent: normalized
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("codex_plan_review failed", message);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                score: 0,
                issues: [message],
                missing_steps: [],
                improvements: [],
                questions: []
              },
              null,
              2
            )
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "coplan_codex_cli_models",
  "Return the list of available Codex CLI models (from the local Codex models cache).",
  {},
  async () => {
    const cache = readCodexModelsCache();
    const payload = {
      ok: true,
      fetched_at: cache.fetched_at,
      models: cache.models,
      models_cache_path: CODEX_MODELS_CACHE_PATH
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload
    };
  }
);

server.tool(
  "coplan_get_codex_cli_selection",
  "Get current coplan Codex CLI selection (model + reasoning effort) from config and env.",
  {},
  async () => {
    const cfg = readConfig() || {};
    const codex = cfg && typeof cfg === "object" && cfg.codex && typeof cfg.codex === "object" ? cfg.codex : {};
    const envModel = (process.env.COPLAN_CODEX_CLI_MODEL || process.env.COPLAN_CODEX_MODEL || "").trim();
    const envEffort = (process.env.COPLAN_CODEX_CLI_REASONING_EFFORT || "").trim();

    const payload = {
      ok: true,
      config_path: getConfigPath(),
      config: {
        cli_model: typeof codex.cli_model === "string" && codex.cli_model.trim() ? codex.cli_model.trim() : null,
        cli_reasoning_effort:
          typeof codex.cli_reasoning_effort === "string" && codex.cli_reasoning_effort.trim()
            ? codex.cli_reasoning_effort.trim()
            : null
      },
      env: {
        cli_model: envModel || null,
        cli_reasoning_effort: envEffort || null
      }
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload
    };
  }
);

server.tool(
  "coplan_set_codex_cli_selection",
  "Set coplan Codex CLI selection (model + reasoning effort) in ~/.coplan/config.json.",
  {
    model: z.string().optional(),
    reasoning_effort: z.string().optional()
  },
  async ({ model, reasoning_effort }) => {
    const prev = readConfig() || {};
    const merged = mergeConfig(prev, {
      codex: {
        ...(typeof model === "string" ? { cli_model: model } : {}),
        ...(typeof reasoning_effort === "string" ? { cli_reasoning_effort: reasoning_effort } : {})
      }
    });

    // Clean up empty strings to keep config tidy.
    if (merged && typeof merged === "object" && merged.codex && typeof merged.codex === "object") {
      if (typeof merged.codex.cli_model === "string" && !merged.codex.cli_model.trim()) {
        delete merged.codex.cli_model;
      }
      if (typeof merged.codex.cli_reasoning_effort === "string" && !merged.codex.cli_reasoning_effort.trim()) {
        delete merged.codex.cli_reasoning_effort;
      }
      if (Object.keys(merged.codex).length === 0) {
        delete merged.codex;
      }
    }

    writeConfig(merged);

    const payload = {
      ok: true,
      config_path: getConfigPath(),
      saved: {
        cli_model: typeof model === "string" ? model.trim() || null : null,
        cli_reasoning_effort: typeof reasoning_effort === "string" ? reasoning_effort.trim() || null : null
      }
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload
    };
  }
);

async function main() {
  maybeFastForwardUpdate();

  // Make the usage dashboard available as soon as the MCP server starts.
  // If another process already serves 127.0.0.1:8719, keep going.
  const dashboardUrl = "http://127.0.0.1:8719/dashboard/usage";
  const autoOpen = getDashboardAutoOpen(readConfig());
  try {
    const auth = await startAuthServer({ host: "127.0.0.1", port: 8719 });
    logger.info(`Usage dashboard: ${auth.url}/dashboard/usage`);
    if (autoOpen) {
      openBrowser(`${auth.url}/dashboard/usage`);
    }
  } catch (error) {
    const code = error && typeof error === "object" ? error.code : null;
    if (code === "EADDRINUSE") {
      logger.info("Usage dashboard already running: http://127.0.0.1:8719/dashboard/usage");
      if (autoOpen) {
        openBrowser(dashboardUrl);
      }
    } else {
      logger.warn("Failed to start usage dashboard server", error instanceof Error ? error.message : String(error));
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("coplan-mcp server started");
}

function openBrowser(url) {
  const platform = process.platform;
  let command;

  if (platform === "win32") {
    command = `start "" "${url}"`;
    exec(command, { shell: "cmd.exe" });
    return;
  }

  if (platform === "darwin") {
    command = `open "${url}"`;
    exec(command);
    return;
  }

  command = `xdg-open "${url}"`;
  exec(command);
}

main().catch((error) => {
  logger.error("Failed to start coplan-mcp server", error);
  process.exit(1);
});
