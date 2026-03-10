import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR_NAME = ".coplan";
const FILE_NAME = "config.json";

export function getConfigPath() {
  const override = process.env.COPLAN_CONFIG_PATH ? process.env.COPLAN_CONFIG_PATH.trim() : "";
  if (override) {
    return override;
  }
  return path.join(os.homedir(), DIR_NAME, FILE_NAME);
}

export function readConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function ensureConfigDir() {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
}

export function writeConfig(config) {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(configPath, 0o600);
    } catch (_) {
      // best-effort
    }
  }
}

export function mergeConfig(prev, partial) {
  const out = prev && typeof prev === "object" ? { ...prev } : {};
  const next = partial && typeof partial === "object" ? partial : {};

  if (next.dashboard && typeof next.dashboard === "object") {
    const dash = out.dashboard && typeof out.dashboard === "object" ? { ...out.dashboard } : {};
    if (typeof next.dashboard.auto_open === "boolean") {
      dash.auto_open = next.dashboard.auto_open;
    }
    out.dashboard = dash;
  }

  if (next.codex && typeof next.codex === "object") {
    const codex = out.codex && typeof out.codex === "object" ? { ...out.codex } : {};
    if (typeof next.codex.cli_model === "string") {
      codex.cli_model = next.codex.cli_model.trim();
    }
    if (typeof next.codex.cli_reasoning_effort === "string") {
      codex.cli_reasoning_effort = next.codex.cli_reasoning_effort.trim();
    }
    if (typeof next.codex.api_model === "string") {
      codex.api_model = next.codex.api_model.trim();
    }
    out.codex = codex;
  }

  return out;
}

export function getDashboardAutoOpen(config) {
  const env = process.env.COPLAN_DASHBOARD_AUTO_OPEN;
  if (typeof env === "string" && env.trim()) {
    return env.trim() !== "0";
  }

  const value = config && typeof config === "object" ? config.dashboard?.auto_open : undefined;
  if (typeof value === "boolean") {
    return value;
  }
  // Default: auto-open enabled.
  return true;
}

export function getCodexApiModel(config) {
  const value = config && typeof config === "object" ? config.codex?.api_model : undefined;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

export function getCodexCliModel(config) {
  const value = config && typeof config === "object" ? config.codex?.cli_model : undefined;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}

export function getCodexCliReasoningEffort(config) {
  const value = config && typeof config === "object" ? config.codex?.cli_reasoning_effort : undefined;
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
}
