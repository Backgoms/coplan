#!/usr/bin/env node
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import spawn from "cross-spawn";
import { startAuthServer } from "@coplan/coplan-auth/server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const COMMANDS_TEMPLATE_DIR = path.join(REPO_ROOT, ".claude", "commands");
const COMMAND_FILE_NAMES = ["coplan.md", "coplan-status.md"];
const USER_COMMANDS_DIR = path.join(os.homedir(), ".claude", "commands");
const MCP_SERVER_NAME = "coplan";
const MCP_SERVER_ENTRY = path.join(REPO_ROOT, "packages", "coplan-mcp", "index.js");
const COPLAN_CLI_ENTRY = path.join(REPO_ROOT, "packages", "coplan-cli", "bin", "coplan.js");
const COPLAN_AUTH_DIR = path.join(os.homedir(), ".coplan");
const COPLAN_AUTH_PATH = path.join(COPLAN_AUTH_DIR, "auth.json");

function nowStamp() {
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function printHelp() {
  console.log("coplan CLI");
  console.log("");
  console.log("Usage:");
  console.log("  coplan setup [--scope user|project|local] [--provider chatgpt|openai] [--dry-run]");
  console.log("  coplan doctor [--json]");
  console.log("  coplan login [--provider chatgpt|openai] [--allow-plain-key-storage]");
  console.log("  coplan status [--json]");
  console.log("  coplan install [--scope user|project|local] [--dry-run]");
  console.log("  coplan uninstall [--scope user|project|local] [--dry-run]");
}

function printLoginHelp() {
  console.log("coplan login");
  console.log("");
  console.log("Usage:");
  console.log("  coplan login [--provider chatgpt|openai] [--allow-plain-key-storage]");
  console.log("");
  console.log("Defaults:");
  console.log("  provider = chatgpt");
  console.log("");
  console.log("Security:");
  console.log("  openai mode uses OPENAI_API_KEY environment variable by default.");
  console.log("  --allow-plain-key-storage enables legacy browser flow (not recommended).");
}

function printStatusHelp() {
  console.log("coplan status");
  console.log("");
  console.log("Usage:");
  console.log("  coplan status [--json]");
}

function printDoctorHelp() {
  console.log("coplan doctor");
  console.log("");
  console.log("Usage:");
  console.log("  coplan doctor [--json]");
}

function printSetupHelp() {
  console.log("coplan setup");
  console.log("");
  console.log("Usage:");
  console.log("  coplan setup [--scope user|project|local] [--provider chatgpt|openai] [--dry-run]");
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

function runExternal(command, args, options = {}) {
  let resolvedCommand = command;
  if (process.platform === "win32" && !path.isAbsolute(command)) {
    const appData = process.env.APPDATA || "";
    const shimPath = appData ? path.join(appData, "npm", command) : "";
    if (shimPath && fs.existsSync(shimPath)) {
      resolvedCommand = shimPath;
    }
  }

  const result = spawn.sync(resolvedCommand, args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
    input: options.input,
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 10 * 1024 * 1024
  });

  if (result.error) {
    const code = result.error.code || "UNKNOWN";
    throw new Error(`Failed to execute ${resolvedCommand}: ${code} ${result.error.message}`);
  }

  return result;
}

function getClaudeCommand() {
  return process.platform === "win32" ? "claude.cmd" : "claude";
}

function getCodexCommand() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function runClaude(args, options = {}) {
  return runExternal(getClaudeCommand(), args, options);
}

function runClaudeWithSources(sources, args, options = {}) {
  return runExternal(getClaudeCommand(), ["--setting-sources", sources, ...args], options);
}

function runCodex(args, options = {}) {
  return runExternal(getCodexCommand(), args, options);
}

function parseCommonInstallOptions(argv, { allowProvider = false } = {}) {
  const options = {
    scope: "user",
    dryRun: false,
    provider: "chatgpt",
    allowPlainKeyStorage: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--allow-plain-key-storage") {
      options.allowPlainKeyStorage = true;
      continue;
    }
    if (token === "--scope") {
      const scope = argv[i + 1];
      if (!scope || !["local", "user", "project"].includes(scope)) {
        throw new Error("Invalid --scope. Use local, user, or project.");
      }
      options.scope = scope;
      i += 1;
      continue;
    }
    if (allowProvider && token === "--provider") {
      const provider = argv[i + 1];
      if (!provider || !["chatgpt", "openai"].includes(provider)) {
        throw new Error("Invalid --provider. Use chatgpt or openai.");
      }
      options.provider = provider;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function parseLoginOptions(argv) {
  const options = {
    provider: "chatgpt",
    allowPlainKeyStorage: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--allow-plain-key-storage") {
      options.allowPlainKeyStorage = true;
      continue;
    }
    if (token === "--provider") {
      const provider = argv[i + 1];
      if (!provider || !["chatgpt", "openai"].includes(provider)) {
        throw new Error("Invalid --provider. Use chatgpt or openai.");
      }
      options.provider = provider;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function parseStatusLikeOptions(argv) {
  const options = {
    json: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function writeLocalAuth(record) {
  fs.mkdirSync(COPLAN_AUTH_DIR, { recursive: true });
  fs.writeFileSync(COPLAN_AUTH_PATH, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(COPLAN_AUTH_PATH, 0o600);
    } catch (_) {
      // Best-effort permission hardening on Unix-like platforms.
    }
  }
}

function readLocalAuth() {
  if (!fs.existsSync(COPLAN_AUTH_PATH)) {
    return null;
  }
  const raw = fs.readFileSync(COPLAN_AUTH_PATH, "utf8");
  return JSON.parse(raw);
}

function maskToken(token) {
  if (!token || token.length < 10) {
    return token ? "***" : "";
  }
  return `${token.slice(0, 7)}...${token.slice(-4)}`;
}

function getCommandFilesStatus() {
  return COMMAND_FILE_NAMES.map((name) => {
    const target = path.join(USER_COMMANDS_DIR, name);
    return {
      name,
      path: target,
      exists: fs.existsSync(target)
    };
  });
}

function toPortablePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function renderCommandTemplate(rawContent) {
  return rawContent.replaceAll("{{COPLAN_CLI_PATH}}", toPortablePath(COPLAN_CLI_ENTRY));
}

function getCliInfo(command, versionArgs) {
  try {
    const result = runExternal(command, versionArgs);
    const detail = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    return {
      available: result.status === 0,
      status: result.status ?? 1,
      detail: detail || null
    };
  } catch (error) {
    return {
      available: false,
      status: -1,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function getCodexStatus() {
  const codexCli = getCliInfo(getCodexCommand(), ["--version"]);
  if (!codexCli.available) {
    return {
      available: false,
      loggedIn: false,
      status: codexCli.status,
      detail: codexCli.detail,
      versionDetail: codexCli.detail
    };
  }

  try {
    const result = runCodex(["login", "status"]);
    const text = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    const loggedIn = result.status === 0 && text.toLowerCase().includes("logged in");
    return {
      available: true,
      loggedIn,
      status: result.status ?? 1,
      detail: text || null,
      versionDetail: codexCli.detail
    };
  } catch (error) {
    return {
      available: false,
      loggedIn: false,
      status: -1,
      detail: error instanceof Error ? error.message : String(error),
      versionDetail: codexCli.detail
    };
  }
}

function getMcpStatus() {
  const sourceSets = ["user", "project", "local", "user,project,local"];
  const details = [];
  let hadCliExecution = false;

  for (const sources of sourceSets) {
    try {
      const getResult = runClaudeWithSources(sources, ["mcp", "get", MCP_SERVER_NAME]);
      hadCliExecution = true;
      const text = `${getResult.stdout || ""}\n${getResult.stderr || ""}`.trim();
      details.push(`[${sources}] mcp get status=${getResult.status}\n${text}`.trim());
      if (getResult.status === 0) {
        return {
          available: true,
          registered: true,
          status: 0,
          scope: sources,
          detail: details.join("\n\n")
        };
      }
    } catch (error) {
      details.push(`[${sources}] mcp get error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const sources of sourceSets) {
    try {
      const listResult = runClaudeWithSources(sources, ["mcp", "list"]);
      hadCliExecution = true;
      const text = `${listResult.stdout || ""}\n${listResult.stderr || ""}`.trim();
      const listed = new RegExp(`(^|\\s)${MCP_SERVER_NAME}(\\s|$)`, "mi").test(text);
      details.push(`[${sources}] mcp list status=${listResult.status}\n${text}`.trim());
      if (listed) {
        return {
          available: true,
          registered: true,
          status: 0,
          scope: sources,
          detail: details.join("\n\n")
        };
      }
    } catch (error) {
      details.push(`[${sources}] mcp list error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (hadCliExecution) {
    return {
      available: true,
      registered: false,
      status: 1,
      scope: null,
      detail: details.join("\n\n") || null
    };
  }

  return {
    available: false,
    registered: false,
    status: -1,
    scope: null,
    detail: details.join("\n\n") || "Failed to execute Claude CLI for MCP checks."
  };
}

function getMcpScope(mcp) {
  if (typeof mcp.scope === "string" && mcp.scope) {
    return mcp.scope;
  }
  return null;
}

function collectStatus() {
  let auth = null;
  let authError = "";
  try {
    auth = readLocalAuth();
  } catch (error) {
    authError = error instanceof Error ? error.message : String(error);
  }

  const provider = auth?.provider || "chatgpt";
  const openaiTokenFromFile = typeof auth?.access_token === "string" ? auth.access_token.trim() : "";
  const openaiTokenFromEnv = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";

  const codex = getCodexStatus();
  const claudeResolved = getCliInfo(getClaudeCommand(), ["--version"]);
  const mcp = getMcpStatus();
  const commandFiles = getCommandFilesStatus();

  const warnings = [];
  if (!claudeResolved.available) {
    warnings.push("Claude CLI is not available in PATH.");
  }
  if (!codex.available && provider === "chatgpt") {
    warnings.push("ChatGPT provider requires Codex CLI.");
  }
  if (provider === "openai" && !openaiTokenFromEnv && !openaiTokenFromFile) {
    warnings.push("OpenAI provider requires OPENAI_API_KEY.");
  }
  if (openaiTokenFromFile) {
    warnings.push("OpenAI key exists in auth.json as plaintext. Prefer OPENAI_API_KEY env var.");
  }

  return {
    auth_file: COPLAN_AUTH_PATH,
    auth_exists: fs.existsSync(COPLAN_AUTH_PATH),
    auth_error: authError || null,
    provider,
    key_source: auth?.key_source || (openaiTokenFromFile ? "file" : provider === "openai" ? "env" : null),
    created_at: auth?.created_at || null,
    openai_env_configured: Boolean(openaiTokenFromEnv),
    openai_key_in_auth_file: Boolean(openaiTokenFromFile),
    openai_key_masked: openaiTokenFromFile ? maskToken(openaiTokenFromFile) : null,
    claude_cli_available: claudeResolved.available,
    claude_cli_detail: claudeResolved.detail,
    codex_cli_available: codex.available,
    codex_cli_detail: codex.versionDetail || codex.detail,
    codex_logged_in: codex.loggedIn,
    codex_status_code: codex.status,
    codex_detail: codex.detail || null,
    mcp_cli_available: mcp.available,
    mcp_registered: mcp.registered,
    mcp_scope: getMcpScope(mcp),
    mcp_detail: mcp.detail,
    command_files: commandFiles,
    warnings
  };
}

function renderStatusText(payload) {
  console.log("coplan status");
  console.log("");
  console.log(`Auth file: ${payload.auth_file}`);
  console.log(`Auth exists: ${payload.auth_exists ? "yes" : "no"}`);
  if (payload.auth_error) {
    console.log(`Auth error: ${payload.auth_error}`);
  }
  console.log(`Provider: ${payload.provider}`);
  if (payload.key_source) {
    console.log(`Key source: ${payload.key_source}`);
  }
  if (payload.created_at) {
    console.log(`Created at: ${payload.created_at}`);
  }
  console.log(`OpenAI env configured: ${payload.openai_env_configured ? "yes" : "no"}`);
  console.log(`OpenAI key in auth file: ${payload.openai_key_in_auth_file ? "yes" : "no"}`);
  if (payload.openai_key_masked) {
    console.log(`OpenAI key (masked): ${payload.openai_key_masked}`);
  }
  console.log(`Claude CLI available: ${payload.claude_cli_available ? "yes" : "no"}`);
  console.log(`Codex CLI available: ${payload.codex_cli_available ? "yes" : "no"}`);
  console.log(`Codex logged in: ${payload.codex_logged_in ? "yes" : "no"}`);
  console.log(`MCP registered (coplan): ${payload.mcp_registered ? "yes" : "no"}`);
  if (payload.mcp_scope) {
    console.log(`MCP scope: ${payload.mcp_scope}`);
  }
  console.log("Command files:");
  for (const file of payload.command_files) {
    console.log(`  - ${file.name}: ${file.exists ? "installed" : "missing"} (${file.path})`);
  }
  if (payload.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of payload.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

function backupCommandFileIfNeeded(srcPath, destPath, { dryRun }) {
  if (!fs.existsSync(destPath)) {
    return { backedUp: false, backupPath: null, unchanged: false };
  }

  const incoming = renderCommandTemplate(fs.readFileSync(srcPath, "utf8"));
  const existing = fs.readFileSync(destPath, "utf8");
  if (incoming === existing) {
    return { backedUp: false, backupPath: null, unchanged: true };
  }

  const backupPath = `${destPath}.${nowStamp()}.bak`;
  if (dryRun) {
    console.log(`[dry-run] Backup: ${destPath} -> ${backupPath}`);
    return { backedUp: true, backupPath, unchanged: false };
  }

  fs.copyFileSync(destPath, backupPath);
  console.log(`Backed up existing command: ${backupPath}`);
  return { backedUp: true, backupPath, unchanged: false };
}

function installCommandTemplate({ dryRun }) {
  const commandTemplates = COMMAND_FILE_NAMES.map((name) => ({
    src: path.join(COMMANDS_TEMPLATE_DIR, name),
    dest: path.join(USER_COMMANDS_DIR, name)
  }));

  for (const file of commandTemplates) {
    if (!fs.existsSync(file.src)) {
      throw new Error(`Command template not found: ${file.src}`);
    }
  }

  if (dryRun) {
    console.log(`[dry-run] Create directory: ${USER_COMMANDS_DIR}`);
  } else {
    fs.mkdirSync(USER_COMMANDS_DIR, { recursive: true });
  }

  for (const file of commandTemplates) {
    const backupInfo = backupCommandFileIfNeeded(file.src, file.dest, { dryRun });
    if (backupInfo.unchanged) {
      console.log(`Slash command unchanged: ${file.dest}`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] Copy: ${file.src} -> ${file.dest}`);
      continue;
    }

    const rendered = renderCommandTemplate(fs.readFileSync(file.src, "utf8"));
    fs.writeFileSync(file.dest, rendered, "utf8");
    console.log(`Installed slash command: ${file.dest}`);
  }
}

function uninstallCommandTemplate({ dryRun }) {
  const commandTargets = COMMAND_FILE_NAMES.map((name) => path.join(USER_COMMANDS_DIR, name));
  let removedAny = false;

  for (const target of commandTargets) {
    if (dryRun) {
      console.log(`[dry-run] Remove: ${target}`);
      continue;
    }

    if (!fs.existsSync(target)) {
      continue;
    }

    fs.unlinkSync(target);
    removedAny = true;
    console.log(`Removed slash command: ${target}`);
  }

  if (!dryRun && !removedAny) {
    console.log("Slash command files not found, skipping file removal.");
  }
}

function addMcpServer({ scope, dryRun }) {
  const args = ["mcp", "add", "--scope", scope, MCP_SERVER_NAME, "--", "node", MCP_SERVER_ENTRY];

  if (dryRun) {
    console.log(`[dry-run] claude mcp add --scope ${scope} ${MCP_SERVER_NAME} -- node ${MCP_SERVER_ENTRY}`);
    return;
  }

  const addResult = runClaude(args);
  if (addResult.status === 0) {
    console.log(`Registered MCP server '${MCP_SERVER_NAME}' (scope: ${scope}).`);
    return;
  }

  const stderr = `${addResult.stderr || ""}`.trim();
  const stdout = `${addResult.stdout || ""}`.trim();
  const msg = `${stderr}\n${stdout}`.toLowerCase();

  if (msg.includes("already") || msg.includes("exists")) {
    removeMcpServer({ scope, dryRun: false, ignoreMissing: true });
    const retry = runClaude(args);
    if (retry.status === 0) {
      console.log(`Re-registered MCP server '${MCP_SERVER_NAME}' (scope: ${scope}).`);
      return;
    }
    throw new Error(
      `Failed to register MCP server after replace.\n${(retry.stderr || retry.stdout || "").trim()}`
    );
  }

  throw new Error(`Failed to register MCP server.\n${(stderr || stdout || "Unknown error").trim()}`);
}

function removeMcpServer({ scope, dryRun, ignoreMissing = false }) {
  const args = ["mcp", "remove", "--scope", scope, MCP_SERVER_NAME];

  if (dryRun) {
    console.log(`[dry-run] claude mcp remove --scope ${scope} ${MCP_SERVER_NAME}`);
    return;
  }

  const result = runClaude(args);
  if (result.status === 0) {
    console.log(`Removed MCP server '${MCP_SERVER_NAME}' (scope: ${scope}).`);
    return;
  }

  const stderr = `${result.stderr || ""}`.trim();
  const stdout = `${result.stdout || ""}`.trim();
  const msg = `${stderr}\n${stdout}`.toLowerCase();

  if (ignoreMissing && (msg.includes("not found") || msg.includes("does not exist"))) {
    return;
  }

  if (msg.includes("not found") || msg.includes("does not exist")) {
    console.log("MCP server not found, skipping removal.");
    return;
  }

  throw new Error(`Failed to remove MCP server.\n${(stderr || stdout || "Unknown error").trim()}`);
}

async function runOpenAiLoginPlaintextServer() {
  const auth = await startAuthServer({ host: "127.0.0.1", port: 8719 });
  console.log(`coplan login server started: ${auth.url}`);
  console.log("Paste your OpenAI API key in the browser.");
  console.log("Press Ctrl+C to stop.");

  try {
    openBrowser(auth.url);
  } catch (_) {
    console.log(`Open this URL manually: ${auth.url}`);
  }

  const shutdown = async () => {
    await auth.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function printOpenAiEnvGuide() {
  console.log("OPENAI_API_KEY is not set.");
  console.log("Set it first, then run `coplan login --provider openai` again.");
  console.log("");
  console.log("macOS/Linux (temporary):");
  console.log("  export OPENAI_API_KEY=\"sk-...\"");
  console.log("");
  console.log("Windows PowerShell (temporary):");
  console.log("  $env:OPENAI_API_KEY=\"sk-...\"");
}

function runOpenAiLoginSecure() {
  const envKey = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.trim() : "";
  if (!envKey) {
    printOpenAiEnvGuide();
    throw new Error("OPENAI_API_KEY is required for secure openai login mode.");
  }

  writeLocalAuth({
    provider: "openai",
    key_source: "env",
    created_at: new Date().toISOString()
  });

  console.log(`coplan auth saved: ${COPLAN_AUTH_PATH}`);
  console.log("Provider: openai (env)");
}

function isCodexLoggedIn() {
  const status = runCodex(["login", "status"]);
  if (status.status !== 0) {
    return false;
  }
  const text = `${status.stdout || ""}\n${status.stderr || ""}`.toLowerCase();
  return text.includes("logged in");
}

function runChatgptLogin() {
  if (isCodexLoggedIn()) {
    writeLocalAuth({
      provider: "chatgpt",
      created_at: new Date().toISOString()
    });
    console.log(`coplan auth saved: ${COPLAN_AUTH_PATH}`);
    console.log("Provider: chatgpt (Codex CLI session)");
    return;
  }

  console.log("Starting Codex login flow. Complete ChatGPT sign-in in the browser.");
  const loginResult = runCodex(["login"], { stdio: "inherit" });
  if (loginResult.status !== 0) {
    throw new Error("Codex login failed.");
  }

  if (!isCodexLoggedIn()) {
    throw new Error("Codex login did not complete. Run `codex login status` to verify.");
  }

  writeLocalAuth({
    provider: "chatgpt",
    created_at: new Date().toISOString()
  });
  console.log(`coplan auth saved: ${COPLAN_AUTH_PATH}`);
  console.log("Provider: chatgpt (Codex CLI session)");
}

async function runLogin(argv) {
  const options = parseLoginOptions(argv);
  if (options.help) {
    printLoginHelp();
    return;
  }

  if (options.provider === "openai") {
    if (options.allowPlainKeyStorage) {
      await runOpenAiLoginPlaintextServer();
      return;
    }
    runOpenAiLoginSecure();
    return;
  }

  runChatgptLogin();
}

function runStatus(argv) {
  const options = parseStatusLikeOptions(argv);
  if (options.help) {
    printStatusHelp();
    return;
  }

  const payload = collectStatus();
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  renderStatusText(payload);
}

function runDoctor(argv) {
  const options = parseStatusLikeOptions(argv);
  if (options.help) {
    printDoctorHelp();
    return;
  }

  const payload = collectStatus();
  const checks = [
    { name: "Claude CLI", ok: payload.claude_cli_available, fix: "Install Claude CLI and ensure PATH is set." },
    { name: "Codex CLI", ok: payload.codex_cli_available, fix: "Install Codex CLI and ensure PATH is set." },
    { name: "MCP registration", ok: payload.mcp_registered, fix: "Run `npm run install:claude`." },
    {
      name: "Slash commands",
      ok: payload.command_files.every((f) => f.exists),
      fix: "Run `npm run install:claude` to install missing command files."
    },
    {
      name: "Provider auth",
      ok:
        payload.provider === "chatgpt"
          ? payload.codex_logged_in
          : payload.openai_env_configured || payload.openai_key_in_auth_file,
      fix:
        payload.provider === "chatgpt"
          ? "Run `npm run login` and complete ChatGPT sign-in."
          : "Set OPENAI_API_KEY and run `npm run login:openai`."
    }
  ];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          checks,
          status: payload
        },
        null,
        2
      )
    );
    return;
  }

  console.log("coplan doctor");
  console.log("");
  for (const check of checks) {
    const state = check.ok ? "OK" : "FAIL";
    console.log(`${state}  ${check.name}`);
    if (!check.ok) {
      console.log(`  Fix: ${check.fix}`);
    }
  }

  if (payload.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of payload.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function runInstall(argv) {
  const options = parseCommonInstallOptions(argv);
  if (options.help) {
    printHelp();
    return;
  }

  installCommandTemplate(options);
  addMcpServer(options);
  console.log("");
  console.log("Install complete.");
  console.log("Next step: run `coplan setup` or `coplan login`.");
}

function runUninstall(argv) {
  const options = parseCommonInstallOptions(argv);
  if (options.help) {
    printHelp();
    return;
  }

  uninstallCommandTemplate(options);
  removeMcpServer(options);
  console.log("");
  console.log("Uninstall complete.");
}

async function runSetup(argv) {
  const options = parseCommonInstallOptions(argv, { allowProvider: true });
  if (options.help) {
    printSetupHelp();
    return;
  }

  installCommandTemplate(options);
  addMcpServer(options);

  if (options.dryRun) {
    console.log(`[dry-run] Login provider: ${options.provider}`);
    if (options.provider === "openai" && !options.allowPlainKeyStorage) {
      console.log("[dry-run] Requires OPENAI_API_KEY environment variable.");
    }
    console.log("[dry-run] Run status check after setup.");
    return;
  }

  if (options.provider === "openai") {
    if (options.allowPlainKeyStorage) {
      await runOpenAiLoginPlaintextServer();
      return;
    }
    runOpenAiLoginSecure();
  } else {
    runChatgptLogin();
  }

  console.log("");
  runDoctor([]);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "setup") {
    await runSetup(rest);
    return;
  }
  if (command === "doctor") {
    runDoctor(rest);
    return;
  }
  if (command === "login") {
    await runLogin(rest);
    return;
  }
  if (command === "status") {
    runStatus(rest);
    return;
  }
  if (command === "install") {
    runInstall(rest);
    return;
  }
  if (command === "uninstall") {
    runUninstall(rest);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
