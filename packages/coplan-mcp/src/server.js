import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { reviewPlanWithCodex } from "./codexClient.js";
import { logger } from "./logger.js";
import { normalizeReview } from "./schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

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

async function main() {
  maybeFastForwardUpdate();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("coplan-mcp server started");
}

main().catch((error) => {
  logger.error("Failed to start coplan-mcp server", error);
  process.exit(1);
});
