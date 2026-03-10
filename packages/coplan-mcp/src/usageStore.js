import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA_DIR_NAME = ".coplan";
const USAGE_FILE_NAME = "usage-events.v1.jsonl";

export function getUsagePath() {
  const override = process.env.COPLAN_USAGE_PATH ? process.env.COPLAN_USAGE_PATH.trim() : "";
  if (override) {
    return override;
  }
  return path.join(os.homedir(), DATA_DIR_NAME, USAGE_FILE_NAME);
}

function ensureUsageDir() {
  fs.mkdirSync(path.dirname(getUsagePath()), { recursive: true });
}

export function appendUsageEvent(event) {
  ensureUsageDir();
  const line = `${JSON.stringify(event)}\n`;
  fs.appendFileSync(getUsagePath(), line, "utf8");
}
