import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { reviewPlanWithCodex } from "./codexClient.js";
import { logger } from "./logger.js";
import { normalizeReview } from "./schemas.js";

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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("coplan-mcp server started");
}

main().catch((error) => {
  logger.error("Failed to start coplan-mcp server", error);
  process.exit(1);
});

