const daysNode = document.getElementById("days");
const refreshNode = document.getElementById("refresh");
const themeNode = document.getElementById("theme");

const statusNode = document.getElementById("status");
const usagePathNode = document.getElementById("usage-path");

const codexIndicatorNode = document.getElementById("codex-indicator");
const codexModelNode = document.getElementById("codex-model");
const codexLoginNode = document.getElementById("codex-login");
const codexLogoutNode = document.getElementById("codex-logout");

const modelControlsNode = document.getElementById("model-controls");
const cliModelNode = document.getElementById("cli-model");
const cliEffortNode = document.getElementById("cli-effort");
const setCliNode = document.getElementById("set-cli");

let cachedModels = [];
let desiredCliModel = "";
let desiredCliEffort = "";

const mTotal = document.getElementById("m-total");
const mInput = document.getElementById("m-input");
const mOutput = document.getElementById("m-output");
const mCached = document.getElementById("m-cached");
const mCount = document.getElementById("m-count");

const dailyNode = document.getElementById("daily");
const eventsNode = document.getElementById("events");

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.className = isError ? "error" : "ok";
}

function fmt(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return "-";
  }
  return new Intl.NumberFormat(undefined).format(n);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function cell(className, label, child) {
  const node = el("div", className || "cell");
  if (label) {
    node.dataset.label = label;
  }
  if (child !== undefined) {
    if (typeof child === "string") {
      node.textContent = child;
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

function formatLocalTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "-";
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function getStoredTheme() {
  const raw = localStorage.getItem("coplan.theme");
  return raw === "dark" || raw === "light" || raw === "system" ? raw : "system";
}

function applyTheme(theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.body.classList.toggle("theme-dark", resolved === "dark");
  if (themeNode) {
    themeNode.value = theme;
  }
}

function setTheme(theme) {
  localStorage.setItem("coplan.theme", theme);
  applyTheme(theme);
}

function setAuthButtons(state) {
  const available = !!state?.available;
  const loggedIn = !!state?.loggedIn;
  if (codexLoginNode) {
    codexLoginNode.style.display = available && !loggedIn ? "inline-flex" : "none";
  }
  if (codexLogoutNode) {
    codexLogoutNode.style.display = available && loggedIn ? "inline-flex" : "none";
  }
}

function setModelControlsVisible(visible) {
  if (modelControlsNode) {
    modelControlsNode.style.display = visible ? "flex" : "none";
  }
}

function setIndicator(text, kind) {
  if (!codexIndicatorNode) {
    return;
  }
  codexIndicatorNode.textContent = text;
  codexIndicatorNode.className = kind === "ok" ? "pill pill-ok" : kind === "bad" ? "pill pill-bad" : "pill pill-unknown";
}

async function refreshCodexStatus() {
  try {
    const res = await fetch("/api/codex/status");
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to load Codex status.");
    }

    if (!payload.codex_cli_available) {
      setIndicator("ChatGPT: unavailable", "bad");
      setAuthButtons({ available: false, loggedIn: false });
      setModelControlsVisible(false);
      return;
    }

    if (payload.codex_logged_in) {
      setIndicator("ChatGPT: logged in", "ok");
      setAuthButtons({ available: true, loggedIn: true });
      setModelControlsVisible(true);
      return;
    }

    setIndicator("ChatGPT: logged out", "bad");
    setAuthButtons({ available: true, loggedIn: false });
    setModelControlsVisible(false);
  } catch (_) {
    setIndicator("ChatGPT: unknown", "unknown");
    setAuthButtons({ available: false, loggedIn: false });
    setModelControlsVisible(false);
  }
}

async function refreshCodexModel() {
  if (!codexModelNode) {
    return;
  }
  try {
    const res = await fetch("/api/codex/model");
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to load model.");
    }

    const model = payload.effective_model || "(default)";
    const effort = payload.effective_reasoning_effort || "";
    codexModelNode.textContent = effort ? `Model: ${model} | effort: ${effort}` : `Model: ${model}`;

    const src = payload.source && typeof payload.source === "object" ? payload.source : {};
    const modelSrc = typeof src.model === "string" ? src.model : "";
    const effortSrc = typeof src.reasoning_effort === "string" ? src.reasoning_effort : "";
    const bits = [];
    if (modelSrc) bits.push(`model=${modelSrc}`);
    if (effortSrc) bits.push(`effort=${effortSrc}`);
    codexModelNode.title = bits.length ? `Source: ${bits.join(", ")}` : "";

    // Keep selectors in sync (prefer user-configurable sources when present).
    const sources = payload.sources && typeof payload.sources === "object" ? payload.sources : {};
    const cfgModel = typeof sources.coplan_config === "string" ? sources.coplan_config : "";
    const cfgEffort = typeof sources.coplan_reasoning_effort === "string" ? sources.coplan_reasoning_effort : "";

    desiredCliModel = cfgModel || (payload.effective_model || "");
    desiredCliEffort = cfgEffort || (payload.effective_reasoning_effort || "");

    if (cliModelNode) {
      cliModelNode.value = desiredCliModel;
    }
    if (cliEffortNode) {
      cliEffortNode.value = desiredCliEffort;
    }
  } catch (_) {
    codexModelNode.textContent = "Model: -";
    codexModelNode.title = "";
  }
}

function setSelectOptions(selectNode, items) {
  if (!selectNode) {
    return;
  }
  const prev = selectNode.value;
  selectNode.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "(model)";
  selectNode.appendChild(first);

  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    selectNode.appendChild(opt);
  }
  if (items.some((i) => i.value === prev)) {
    selectNode.value = prev;
  }
}

function setEffortOptionsForModelSlug(modelSlug) {
  if (!cliEffortNode) {
    return;
  }
  const prev = cliEffortNode.value;
  cliEffortNode.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "(effort)";
  cliEffortNode.appendChild(first);

  const found = Array.isArray(cachedModels) ? cachedModels.find((m) => m && m.slug === modelSlug) : null;
  const efforts = Array.isArray(found?.supported_reasoning_levels) ? found.supported_reasoning_levels : [];
  for (const e of efforts) {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    cliEffortNode.appendChild(opt);
  }

  if (efforts.includes(prev)) {
    cliEffortNode.value = prev;
    return;
  }
  if (found && typeof found.default_reasoning_level === "string" && found.default_reasoning_level) {
    if (efforts.includes(found.default_reasoning_level)) {
      cliEffortNode.value = found.default_reasoning_level;
    }
  }
}

async function refreshCodexModelsList() {
  if (!cliModelNode) {
    return;
  }
  try {
    const res = await fetch("/api/codex/models");
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to load models.");
    }
    const models = Array.isArray(payload.models) ? payload.models : [];
    cachedModels = models;
    setSelectOptions(
      cliModelNode,
      models
        .map((m) => ({
          value: typeof m.slug === "string" ? m.slug : "",
          label: typeof m.display_name === "string" ? m.display_name : typeof m.slug === "string" ? m.slug : ""
        }))
        .filter((m) => m.value && m.label)
    );

    // Ensure the current/effective model is selected once options exist.
    if (desiredCliModel && Array.from(cliModelNode.options).some((o) => o.value === desiredCliModel)) {
      cliModelNode.value = desiredCliModel;
    }
    setEffortOptionsForModelSlug(cliModelNode.value || "");
    if (cliEffortNode && desiredCliEffort && Array.from(cliEffortNode.options).some((o) => o.value === desiredCliEffort)) {
      cliEffortNode.value = desiredCliEffort;
    }
  } catch (_) {
    // keep whatever is in the input
  }
}

async function setCliSelection() {
  if (!setCliNode) {
    return;
  }
  setCliNode.disabled = true;
  try {
    const model = cliModelNode ? cliModelNode.value.trim() : "";
    const effort = cliEffortNode ? cliEffortNode.value.trim() : "";
    const res = await fetch("/api/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        codex: {
          cli_model: model,
          cli_reasoning_effort: effort
        }
      })
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to save config.");
    }
    setStatus("Saved.");
    await refreshCodexModel();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    setCliNode.disabled = false;
  }
}

function renderDaily(rows) {
  dailyNode.innerHTML = "";
  if (!Array.isArray(rows) || rows.length === 0) {
    dailyNode.appendChild(el("div", "row daily", "No data yet. Run /coplan a few times first."));
    return;
  }

  const maxTotal = Math.max(...rows.map((r) => (typeof r.total_tokens === "number" ? r.total_tokens : 0)), 1);

  const head = el("div", "row daily head");
  head.appendChild(el("div", "cell", "Day"));
  head.appendChild(el("div", "cell", "Total"));
  head.appendChild(el("div", "cell", "Input"));
  head.appendChild(el("div", "cell", "Output"));
  head.appendChild(el("div", "cell", "Events"));
  dailyNode.appendChild(head);

  for (const r of rows) {
    const row = el("div", "row daily");
    row.appendChild(cell("cell mono", "Day", r.day));

    const totalCell = el("div", "cell");
    totalCell.appendChild(el("div", "cell", fmt(r.total_tokens || 0)));
    const bar = el("div", "bar");
    const fill = el("div");
    fill.style.width = `${Math.max(2, Math.round(((r.total_tokens || 0) / maxTotal) * 100))}%`;
    bar.appendChild(fill);
    totalCell.appendChild(bar);
    row.appendChild(cell("cell", "Total", totalCell));

    row.appendChild(cell("cell", "Input", fmt(r.input_tokens || 0)));
    row.appendChild(cell("cell", "Output", fmt(r.output_tokens || 0)));
    row.appendChild(cell("cell", "Events", fmt(r.count || 0)));
    dailyNode.appendChild(row);
  }
}

function renderEvents(events) {
  eventsNode.innerHTML = "";
  if (!Array.isArray(events) || events.length === 0) {
    eventsNode.appendChild(el("div", "row events", "No events yet."));
    return;
  }

  const head = el("div", "row events head");
  head.appendChild(el("div", "cell", "Time"));
  head.appendChild(el("div", "cell", "Provider"));
  head.appendChild(el("div", "cell", "Model"));
  head.appendChild(el("div", "cell", "Request"));
  head.appendChild(el("div", "cell", "Total"));
  head.appendChild(el("div", "cell", "Cached"));
  eventsNode.appendChild(head);

  for (const e of events) {
    const row = el("div", "row events");
    row.appendChild(cell("cell mono", "Time", typeof e.ts === "string" ? formatLocalTimestamp(e.ts) : "-"));
    row.appendChild(cell("cell", "Provider", e.provider || "-"));
    const modelText = e.model
      ? e.reasoning_effort
        ? `${e.model} | ${e.reasoning_effort}`
        : e.model
      : "-";
    row.appendChild(cell("cell", "Model", modelText));

    const req = e.request || {};
    const parts = [];
    if (typeof req.plan_chars === "number") {
      parts.push(`${fmt(req.plan_chars)} chars`);
    }
    if (typeof req.plan_sha256_12 === "string" && req.plan_sha256_12) {
      parts.push(`sha:${req.plan_sha256_12}`);
    }

    const reqCell = el("div", "cell");
    reqCell.appendChild(el("div", "req-meta mono", parts.join(" | ") || "-"));
    if (typeof req.plan_preview === "string" && req.plan_preview) {
      reqCell.appendChild(el("div", "req-preview", req.plan_preview));
    }
    row.appendChild(cell("cell", "Request", reqCell));

    row.appendChild(cell("cell", "Total", fmt(e.total_tokens || 0)));
    row.appendChild(cell("cell", "Cached", fmt(e.cached_input_tokens || 0)));
    eventsNode.appendChild(row);
  }
}

async function codexLogin() {
  if (!codexLoginNode) {
    return;
  }
  codexLoginNode.disabled = true;
  try {
    const res = await fetch("/api/codex/login", { method: "POST" });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to start Codex login.");
    }
    setStatus("Codex login started. Complete sign-in in the browser.");
    await waitForCodexLoginAndRefresh();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    codexLoginNode.disabled = false;
  }
}

async function codexLogout() {
  if (!codexLogoutNode) {
    return;
  }
  codexLogoutNode.disabled = true;
  try {
    const res = await fetch("/api/codex/logout", { method: "POST" });
    const payload = await res.json();
    if (!res.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to logout.");
    }
    setStatus("Logged out.");
    await refreshCodexStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    codexLogoutNode.disabled = false;
  }
}

async function waitForCodexLoginAndRefresh() {
  const started = Date.now();
  const timeoutMs = 180_000;
  const intervalMs = 1500;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("/api/codex/status");
      const payload = await res.json();
      if (res.ok && payload.ok) {
        if (payload.codex_cli_available && payload.codex_logged_in) {
          await load();
          setStatus("Logged in. Dashboard refreshed.");
          return;
        }
      }
    } catch (_) {
      // ignore
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    refreshCodexStatus();
  }

  refreshCodexStatus();
  setStatus("Waiting for login... (still not detected)");
}

async function load() {
  setStatus("Loading...");

  try {
    const days = Number(daysNode.value || "30");
    const [summaryRes, eventsRes] = await Promise.all([
      fetch(`/api/usage/summary?days=${encodeURIComponent(String(days))}`),
      fetch(`/api/usage/events?limit=100`)
    ]);

    const summary = await summaryRes.json();
    const eventsPayload = await eventsRes.json();

    if (!summaryRes.ok || !summary.ok) {
      throw new Error(summary.error || "Failed to load usage summary.");
    }
    if (!eventsRes.ok || !eventsPayload.ok) {
      throw new Error(eventsPayload.error || "Failed to load usage events.");
    }

    usagePathNode.textContent = summary.usage_path || "-";

    const totals = summary.totals || {};
    mTotal.textContent = fmt(totals.total_tokens);
    mInput.textContent = fmt(totals.input_tokens);
    mOutput.textContent = fmt(totals.output_tokens);
    mCached.textContent = fmt(totals.cached_input_tokens);
    mCount.textContent = fmt(totals.count);

    renderDaily(summary.by_day || []);
    renderEvents(eventsPayload.events || []);

    refreshCodexStatus();
    refreshCodexModel();
    refreshCodexModelsList();

    setStatus("Loaded.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

refreshNode.addEventListener("click", load);
daysNode.addEventListener("change", load);

if (themeNode) {
  themeNode.addEventListener("change", () => {
    setTheme(themeNode.value || "system");
  });
}
if (codexLoginNode) {
  codexLoginNode.addEventListener("click", codexLogin);
}
if (codexLogoutNode) {
  codexLogoutNode.addEventListener("click", codexLogout);
}
if (setCliNode) {
  setCliNode.addEventListener("click", setCliSelection);
}

if (cliModelNode) {
  cliModelNode.addEventListener("change", () => {
    setEffortOptionsForModelSlug(cliModelNode.value || "");
  });
}

applyTheme(getStoredTheme());
if (themeNode) {
  themeNode.value = getStoredTheme();
}
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (getStoredTheme() === "system") {
      applyTheme("system");
    }
  });
}

// Hide model controls until status confirms logged-in.
setModelControlsVisible(false);

load();
