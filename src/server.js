import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import express from "express";
import httpProxy from "http-proxy";
import pty from "node-pty";
import * as tar from "tar";

// Railway deployments sometimes inject PORT=3000 by default. We want the wrapper to
// reliably listen on 8080 unless explicitly overridden.
//
// Prefer OPENCLAW_PUBLIC_PORT (set in the Dockerfile / template) over PORT.
const PORT = Number.parseInt(
  process.env.OPENCLAW_PUBLIC_PORT?.trim() ??
  process.env.PORT ??
  "8080",
  10,
);

// State/workspace
// OpenClaw defaults to ~/.openclaw.
const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".openclaw");

const WORKSPACE_DIR =
  process.env.OPENCLAW_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

// Protect /setup with a user-provided password.
// If not set, generate a secure random password and log it.
const SETUP_PASSWORD = (() => {
  const env = process.env.SETUP_PASSWORD?.trim();
  if (env) return env;
  const generated = crypto.randomBytes(16).toString("base64url");
  console.warn("=".repeat(60));
  console.warn("[wrapper] SETUP_PASSWORD not set. Generated password:");
  console.warn(`[wrapper]   ${generated}`);
  console.warn("[wrapper] Set SETUP_PASSWORD in Railway Variables to use your own.");
  console.warn("=".repeat(60));
  return generated;
})();

// Gateway admin token (protects OpenClaw gateway + Control UI).
// Must be stable across restarts. If not provided via env, persist it in the state dir.
function resolveGatewayToken() {
  const envTok = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // ignore
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // best-effort
  }
  return generated;
}

const OPENCLAW_GATEWAY_TOKEN = resolveGatewayToken();
process.env.OPENCLAW_GATEWAY_TOKEN = OPENCLAW_GATEWAY_TOKEN;

// Where the gateway will listen internally (we proxy to it).
const INTERNAL_GATEWAY_PORT = Number.parseInt(process.env.INTERNAL_GATEWAY_PORT ?? "18789", 10);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

// Always run the built-from-source CLI entry directly to avoid PATH/global-install mismatches.
const OPENCLAW_ENTRY = process.env.OPENCLAW_ENTRY?.trim() || "/openclaw/dist/entry.js";
const OPENCLAW_NODE = process.env.OPENCLAW_NODE?.trim() || "node";

// When true, the web terminal spawns a full PTY shell (bash).
// When false (default), only openclaw/gateway commands are allowed — no shell injection possible.
const TERMINAL_FULL_ACCESS = (process.env.TERMINAL_FULL_ACCESS || "").trim().toLowerCase() === "true";

function clawArgs(args) {
  return [OPENCLAW_ENTRY, ...args];
}

function resolveConfigCandidates() {
  const explicit = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (explicit) return [explicit];

  return [path.join(STATE_DIR, "openclaw.json")];
}

function configPath() {
  const candidates = resolveConfigCandidates();
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  // Default to canonical even if it doesn't exist yet.
  return candidates[0] || path.join(STATE_DIR, "openclaw.json");
}

function isConfigured() {
  try {
    return resolveConfigCandidates().some((candidate) => fs.existsSync(candidate));
  } catch {
    return false;
  }
}

let gatewayProc = null;
let gatewayStarting = null;

// Debug breadcrumbs for common Railway failures (502 / "Application failed to respond").
let lastGatewayError = null;
let lastGatewayExit = null;
let lastDoctorOutput = null;
let lastDoctorAt = null;

// Auto-restart state (exponential backoff).
let _restartAttempts = 0;
let _restartTimer = null;
const RESTART_BASE_DELAY_MS = 2_000;
const RESTART_MAX_DELAY_MS = 60_000;
const RESTART_MAX_ATTEMPTS = 10;

function scheduleGatewayRestart() {
  if (_restartTimer) return; // already scheduled
  if (_restartAttempts >= RESTART_MAX_ATTEMPTS) {
    console.error(`[gateway] giving up auto-restart after ${_restartAttempts} attempts`);
    return;
  }
  const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** _restartAttempts, RESTART_MAX_DELAY_MS);
  _restartAttempts++;
  console.log(`[gateway] scheduling auto-restart in ${delay}ms (attempt ${_restartAttempts}/${RESTART_MAX_ATTEMPTS})`);
  _restartTimer = setTimeout(async () => {
    _restartTimer = null;
    try {
      await ensureGatewayRunning();
      // Success — reset backoff.
      _restartAttempts = 0;
      console.log("[gateway] auto-restart succeeded");
    } catch (err) {
      console.error(`[gateway] auto-restart failed: ${String(err)}`);
      // The exit handler will schedule the next attempt if the process crashes again.
    }
  }, delay);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeGateway()) return true;
    await sleep(250);
  }
  return false;
}

async function startGateway() {
  if (gatewayProc) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const args = [
    "gateway",
    "run",
    "--bind",
    "loopback",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
    "--auth",
    "token",
    "--token",
    OPENCLAW_GATEWAY_TOKEN,
  ];

  gatewayProc = childProcess.spawn(OPENCLAW_NODE, clawArgs(args), {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: STATE_DIR,
      OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    },
  });

  gatewayProc.on("error", (err) => {
    const msg = `[gateway] spawn error: ${String(err)}`;
    console.error(msg);
    lastGatewayError = msg;
    gatewayProc = null;
  });

  gatewayProc.on("exit", (code, signal) => {
    const msg = `[gateway] exited code=${code} signal=${signal}`;
    console.error(msg);
    lastGatewayExit = { code, signal, at: new Date().toISOString() };
    gatewayProc = null;

    // Auto-restart with exponential backoff if the gateway crashes unexpectedly.
    // Only restart if still configured (user may have reset).
    if (isConfigured() && signal !== "SIGTERM") {
      scheduleGatewayRestart();
    }
  });
}

async function runDoctorBestEffort() {
  // Avoid spamming `openclaw doctor` in a crash loop.
  const now = Date.now();
  if (lastDoctorAt && now - lastDoctorAt < 5 * 60 * 1000) return;
  lastDoctorAt = now;

  try {
    const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
    const out = redactSecrets(r.output || "");
    lastDoctorOutput = out.length > 50_000 ? out.slice(0, 50_000) + "\n... (truncated)\n" : out;
  } catch (err) {
    lastDoctorOutput = `doctor failed: ${String(err)}`;
  }
}

async function ensureGatewayRunning() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  if (gatewayProc) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      try {
        lastGatewayError = null;
        await startGateway();
        const ready = await waitForGatewayReady({ timeoutMs: 20_000 });
        if (!ready) {
          throw new Error("Gateway did not become ready in time");
        }
      } catch (err) {
        const msg = `[gateway] start failure: ${String(err)}`;
        lastGatewayError = msg;
        // Collect extra diagnostics to help users file issues.
        await runDoctorBestEffort();
        throw err;
      }
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

async function restartGateway() {
  // Cancel any pending auto-restart so we don't race.
  if (_restartTimer) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  _restartAttempts = 0;

  if (gatewayProc) {
    const proc = gatewayProc;
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    // Wait for the process to actually exit (up to 5s), then SIGKILL as fallback.
    await new Promise((resolve) => {
      const onExit = () => { clearTimeout(killTimer); resolve(); };
      proc.once("exit", onExit);
      const killTimer = setTimeout(() => {
        proc.removeListener("exit", onExit);
        try { proc.kill("SIGKILL"); } catch { }
        // Give SIGKILL a moment.
        setTimeout(resolve, 500);
      }, 5_000);
    });
    gatewayProc = null;
  }
  return ensureGatewayRunning();
}

function requireSetupAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    // Don't send WWW-Authenticate header for API/XHR requests — it triggers
    // the browser's native auth popup, which conflicts with our React login page.
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  if (password !== SETUP_PASSWORD) {
    return res.status(401).send("Invalid password");
  }
  return next();
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Minimal health endpoint for Railway.
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

// Auth verification endpoint for the React UI (replaces browser Basic Auth popup).
app.get("/setup/api/auth/verify", requireSetupAuth, (_req, res) => {
  res.json({ ok: true });
});

async function probeGateway() {
  // A simple TCP connect check is enough for "is it up".
  return await new Promise((resolve) => {
    const sock = net.createConnection({
      host: INTERNAL_GATEWAY_HOST,
      port: INTERNAL_GATEWAY_PORT,
      timeout: 750,
    });

    const done = (ok) => {
      try { sock.destroy(); } catch { }
      resolve(ok);
    };

    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

// Public health endpoint (no auth) so Railway can probe without /setup.
// Keep this free of secrets.
app.get("/healthz", async (_req, res) => {
  let gatewayReachable = false;
  if (isConfigured()) {
    try {
      gatewayReachable = await probeGateway();
    } catch {
      gatewayReachable = false;
    }
  }

  res.json({
    ok: true,
    wrapper: {
      configured: isConfigured(),
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
    },
    gateway: {
      target: GATEWAY_TARGET,
      reachable: gatewayReachable,
      lastError: lastGatewayError,
      lastExit: lastGatewayExit,
      lastDoctorAt,
    },
  });
});

// Serve the React UI build for /setup and its sub-assets.
const SETUP_UI_DIR = path.join(process.cwd(), "ui", "dist");
const _setupIndexHtml = (() => {
  try {
    return fs.readFileSync(path.join(SETUP_UI_DIR, "index.html"), "utf8");
  } catch {
    return null;
  }
})();

// Static assets (JS/CSS chunks) — no auth required since the React app handles login itself.
app.use("/setup/assets", express.static(path.join(SETUP_UI_DIR, "assets"), { maxAge: "1y", immutable: true }));

// The setup SPA entry point.
app.get("/setup", (_req, res) => {
  if (!_setupIndexHtml) {
    return res.status(500).type("text/plain").send("Setup UI not built. Run `npm run build` in ui/.");
  }
  res.type("html").send(_setupIndexHtml);
});

// --- Auth provider data sources ---
// To update providers, edit these two arrays. AUTH_GROUPS is built automatically.

const AUTH_CHOICE_GROUP_DEFS = [
  { value: "openai", label: "OpenAI", hint: "Codex OAuth + API key", choices: ["openai-codex", "openai-api-key"] },
  { value: "anthropic", label: "Anthropic", hint: "setup-token + API key", choices: ["token", "apiKey"] },
  { value: "chutes", label: "Chutes", hint: "OAuth", choices: ["chutes"] },
  { value: "vllm", label: "vLLM", hint: "Local/self-hosted OpenAI-compatible", choices: ["vllm"] },
  { value: "minimax", label: "MiniMax", hint: "M2.5 (recommended)", choices: ["minimax-portal", "minimax-api", "minimax-api-key-cn", "minimax-api-lightning"] },
  { value: "moonshot", label: "Moonshot AI (Kimi K2.5)", hint: "Kimi K2.5 + Kimi Coding", choices: ["moonshot-api-key", "moonshot-api-key-cn", "kimi-code-api-key"] },
  { value: "google", label: "Google", hint: "Gemini API key + OAuth", choices: ["gemini-api-key", "google-antigravity", "google-gemini-cli"] },
  { value: "xai", label: "xAI (Grok)", hint: "API key", choices: ["xai-api-key"] },
  { value: "openrouter", label: "OpenRouter", hint: "API key", choices: ["openrouter-api-key"] },
  { value: "qwen", label: "Qwen", hint: "OAuth", choices: ["qwen-portal"] },
  { value: "zai", label: "Z.AI", hint: "GLM Coding Plan / Global / CN", choices: ["zai-coding-global", "zai-coding-cn", "zai-global", "zai-cn"] },
  { value: "qianfan", label: "Qianfan", hint: "API key", choices: ["qianfan-api-key"] },
  { value: "copilot", label: "Copilot", hint: "GitHub + local proxy", choices: ["github-copilot", "copilot-proxy"] },
  { value: "ai-gateway", label: "Vercel AI Gateway", hint: "API key", choices: ["ai-gateway-api-key"] },
  { value: "opencode-zen", label: "OpenCode Zen", hint: "API key", choices: ["opencode-zen"] },
  { value: "xiaomi", label: "Xiaomi", hint: "API key", choices: ["xiaomi-api-key"] },
  { value: "synthetic", label: "Synthetic", hint: "Anthropic-compatible (multi-model)", choices: ["synthetic-api-key"] },
  { value: "together", label: "Together AI", hint: "API key", choices: ["together-api-key"] },
  { value: "huggingface", label: "Hugging Face", hint: "Inference API (HF token)", choices: ["huggingface-api-key"] },
  { value: "venice", label: "Venice AI", hint: "Privacy-focused (uncensored models)", choices: ["venice-api-key"] },
  { value: "litellm", label: "LiteLLM", hint: "Unified LLM gateway (100+ providers)", choices: ["litellm-api-key"] },
];

const BASE_AUTH_CHOICE_OPTIONS = [
  { value: "token", label: "Anthropic token (paste setup-token)", hint: "run `claude setup-token` elsewhere, then paste the token here" },
  { value: "openai-codex", label: "OpenAI Codex (ChatGPT OAuth)" },
  { value: "chutes", label: "Chutes (OAuth)" },
  { value: "vllm", label: "vLLM (custom URL + model)", hint: "Local/self-hosted OpenAI-compatible server" },
  { value: "openai-api-key", label: "OpenAI API key" },
  { value: "xai-api-key", label: "xAI (Grok) API key" },
  { value: "qianfan-api-key", label: "Qianfan API key" },
  { value: "openrouter-api-key", label: "OpenRouter API key" },
  { value: "litellm-api-key", label: "LiteLLM API key", hint: "Unified gateway for 100+ LLM providers" },
  { value: "ai-gateway-api-key", label: "Vercel AI Gateway API key" },
  { value: "cloudflare-ai-gateway-api-key", label: "Cloudflare AI Gateway", hint: "Account ID + Gateway ID + API key" },
  { value: "moonshot-api-key", label: "Kimi API key (.ai)" },
  { value: "moonshot-api-key-cn", label: "Kimi API key (.cn)" },
  { value: "kimi-code-api-key", label: "Kimi Code API key (subscription)" },
  { value: "synthetic-api-key", label: "Synthetic API key" },
  { value: "venice-api-key", label: "Venice AI API key", hint: "Privacy-focused inference (uncensored models)" },
  { value: "together-api-key", label: "Together AI API key", hint: "Access to Llama, DeepSeek, Qwen, and more open models" },
  { value: "huggingface-api-key", label: "Hugging Face API key (HF token)", hint: "Inference Providers — OpenAI-compatible chat" },
  { value: "github-copilot", label: "GitHub Copilot (GitHub device login)", hint: "Uses GitHub device flow" },
  { value: "gemini-api-key", label: "Google Gemini API key" },
  { value: "google-antigravity", label: "Google Antigravity OAuth", hint: "Uses the bundled Antigravity auth plugin" },
  { value: "google-gemini-cli", label: "Google Gemini CLI OAuth", hint: "Uses the bundled Gemini CLI auth plugin" },
  { value: "zai-api-key", label: "Z.AI API key" },
  { value: "zai-coding-global", label: "Coding-Plan-Global", hint: "GLM Coding Plan Global (api.z.ai)" },
  { value: "zai-coding-cn", label: "Coding-Plan-CN", hint: "GLM Coding Plan CN (open.bigmodel.cn)" },
  { value: "zai-global", label: "Global", hint: "Z.AI Global (api.z.ai)" },
  { value: "zai-cn", label: "CN", hint: "Z.AI CN (open.bigmodel.cn)" },
  { value: "xiaomi-api-key", label: "Xiaomi API key" },
  { value: "minimax-portal", label: "MiniMax OAuth", hint: "Oauth plugin for MiniMax" },
  { value: "qwen-portal", label: "Qwen OAuth" },
  { value: "copilot-proxy", label: "Copilot Proxy (local)", hint: "Local proxy for VS Code Copilot models" },
  { value: "apiKey", label: "Anthropic API key" },
  { value: "opencode-zen", label: "OpenCode Zen (multi-model proxy)", hint: "Claude, GPT, Gemini via opencode.ai/zen" },
  { value: "minimax-api", label: "MiniMax M2.5" },
  { value: "minimax-api-key-cn", label: "MiniMax M2.5 (CN)", hint: "China endpoint (api.minimaxi.com)" },
  { value: "minimax-api-lightning", label: "MiniMax M2.5 Lightning", hint: "Faster, higher output cost" },
];

// Build AUTH_GROUPS by joining the two source arrays.
function buildAuthGroups() {
  const optionMap = new Map(BASE_AUTH_CHOICE_OPTIONS.map((o) => [o.value, o]));
  return AUTH_CHOICE_GROUP_DEFS.map((g) => ({
    value: g.value,
    label: g.label,
    hint: g.hint,
    options: g.choices.map((c) => {
      const base = optionMap.get(c);
      if (!base) return { value: c, label: c };
      const opt = { value: base.value, label: base.label };
      if (base.hint) opt.hint = base.hint;
      return opt;
    }),
  }));
}

const AUTH_GROUPS = buildAuthGroups();

// Cache slow CLI lookups that don't change at runtime.
let _cachedVersion = null;
let _cachedChannelsHelp = null;

app.get("/setup/api/status", requireSetupAuth, async (_req, res) => {
  // Run both in parallel; cache results since they don't change.
  const [version, channelsHelp] = await Promise.all([
    _cachedVersion
      ? Promise.resolve(_cachedVersion)
      : runCmd(OPENCLAW_NODE, clawArgs(["--version"])).then((r) => { _cachedVersion = r; return r; }),
    _cachedChannelsHelp
      ? Promise.resolve(_cachedChannelsHelp)
      : runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"])).then((r) => { _cachedChannelsHelp = r; return r; }),
  ]);

  res.json({
    configured: isConfigured(),
    gatewayTarget: GATEWAY_TARGET,
    gatewayToken: OPENCLAW_GATEWAY_TOKEN,
    openclawVersion: version.output.trim(),
    channelsAddHelp: channelsHelp.output,
    authGroups: AUTH_GROUPS,
  });
});

// Auth choice → CLI flag mapping. Also used to derive the set of API-key-based choices
// (choices NOT in this map are interactive/OAuth and shown as disabled in the UI).
// "token" is special-cased in buildOnboardArgs but still counts as an API-key choice.
const AUTH_CHOICE_FLAG_MAP = {
  "openai-api-key": "--openai-api-key",
  "apiKey": "--anthropic-api-key",
  "openrouter-api-key": "--openrouter-api-key",
  "litellm-api-key": "--litellm-api-key",
  "ai-gateway-api-key": "--ai-gateway-api-key",
  "cloudflare-ai-gateway-api-key": "--cloudflare-ai-gateway-api-key",
  "moonshot-api-key": "--moonshot-api-key",
  "moonshot-api-key-cn": "--moonshot-api-key",
  "kimi-code-api-key": "--kimi-code-api-key",
  "gemini-api-key": "--gemini-api-key",
  "zai-api-key": "--zai-api-key",
  "zai-coding-global": "--zai-api-key",
  "zai-coding-cn": "--zai-api-key",
  "zai-global": "--zai-api-key",
  "zai-cn": "--zai-api-key",
  "xiaomi-api-key": "--xiaomi-api-key",
  "minimax-api": "--minimax-api-key",
  "minimax-api-lightning": "--minimax-api-key",
  "synthetic-api-key": "--synthetic-api-key",
  "venice-api-key": "--venice-api-key",
  "together-api-key": "--together-api-key",
  "huggingface-api-key": "--huggingface-api-key",
  "opencode-zen": "--opencode-zen-api-key",
  "xai-api-key": "--xai-api-key",
  "qianfan-api-key": "--qianfan-api-key",
};

const API_KEY_CHOICES = new Set([...Object.keys(AUTH_CHOICE_FLAG_MAP), "token"]);

app.get("/setup/api/auth-groups", requireSetupAuth, (_req, res) => {
  res.json({ ok: true, authGroups: AUTH_GROUPS, apiKeyChoices: Array.from(API_KEY_CHOICES) });
});

function buildOnboardArgs(payload) {
  const args = [
    "onboard",
    "--non-interactive",
    "--accept-risk",
    "--json",
    "--no-install-daemon",
    "--skip-health",
    "--workspace",
    WORKSPACE_DIR,
    // The wrapper owns public networking; keep the gateway internal.
    "--gateway-bind",
    "loopback",
    "--gateway-port",
    String(INTERNAL_GATEWAY_PORT),
    "--gateway-auth",
    "token",
    "--gateway-token",
    OPENCLAW_GATEWAY_TOKEN,
    "--flow",
    payload.flow || "quickstart",
  ];

  if (payload.authChoice) {
    args.push("--auth-choice", payload.authChoice);

    // Map secret to correct flag for common choices.
    const secret = (payload.authSecret || "").trim();

    const flag = AUTH_CHOICE_FLAG_MAP[payload.authChoice];

    // If the user picked an API-key auth choice but didn't provide a secret, fail fast.
    // Otherwise OpenClaw may fall back to its default auth choice, which looks like the
    // wizard "reverted" their selection.
    if (flag && !secret) {
      throw new Error(`Missing auth secret for authChoice=${payload.authChoice}`);
    }

    if (flag) {
      args.push(flag, secret);
    }

    if (payload.authChoice === "token") {
      // This is the Anthropic setup-token flow.
      if (!secret) throw new Error("Missing auth secret for authChoice=token");
      args.push("--token-provider", "anthropic", "--token", secret);
    }
  }

  return args;
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 120_000;

    const proc = childProcess.spawn(cmd, args, {
      ...opts,
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: STATE_DIR,
        OPENCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    const timer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch { }
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { }
      }, 2_000);
      out += `\n[timeout] Command exceeded ${timeoutMs}ms and was terminated.\n`;
      resolve({ code: 124, output: out });
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: out });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, output: out });
    });
  });
}

app.post("/setup/api/run", requireSetupAuth, async (req, res) => {
  // SSE streaming — send step-by-step progress to the client.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const step = (label) => send("step", { label });
  const stepDone = (label, ok = true) => send("stepDone", { label, ok });
  const log = (text) => send("log", { text });

  try {
    if (isConfigured()) {
      step("Starting gateway");
      await ensureGatewayRunning();
      stepDone("Starting gateway");
      send("done", { ok: true, output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n" });
      res.end();
      return;
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = req.body || {};

    let onboardArgs;
    try {
      onboardArgs = buildOnboardArgs(payload);
    } catch (err) {
      send("done", { ok: false, output: `Setup input error: ${String(err)}` });
      res.end();
      return;
    }

    step("Running onboard");
    const onboard = await runCmd(OPENCLAW_NODE, clawArgs(onboardArgs));
    const ok = onboard.code === 0 && isConfigured();
    stepDone("Running onboard", ok);
    log(onboard.output);

    if (!ok) {
      send("done", { ok: false, output: onboard.output });
      res.end();
      return;
    }

    // --- Gateway config ---
    step("Configuring gateway auth");
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.mode", "token"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.auth.token", OPENCLAW_GATEWAY_TOKEN]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.remote.token", OPENCLAW_GATEWAY_TOKEN]));
    stepDone("Configuring gateway auth");

    step("Configuring gateway network");
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.bind", "loopback"]));
    await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "gateway.port", String(INTERNAL_GATEWAY_PORT)]));
    stepDone("Configuring gateway network");

    step("Configuring trusted proxies");
    await runCmd(
      OPENCLAW_NODE,
      clawArgs(["config", "set", "--json", "gateway.trustedProxies", JSON.stringify(["127.0.0.1"])]),
    );
    stepDone("Configuring trusted proxies");

    // --- Custom provider ---
    if (payload.customProviderId?.trim() && payload.customProviderBaseUrl?.trim()) {
      step("Configuring custom provider");
      const providerId = payload.customProviderId.trim();
      const baseUrl = payload.customProviderBaseUrl.trim();
      const api = (payload.customProviderApi || "openai-completions").trim();
      const apiKeyEnv = (payload.customProviderApiKeyEnv || "").trim();
      const modelId = (payload.customProviderModelId || "").trim();

      let skipReason = null;
      if (!/^[A-Za-z0-9_-]+$/.test(providerId)) skipReason = "invalid provider id";
      else if (!/^https?:\/\//.test(baseUrl)) skipReason = "baseUrl must start with http(s)://";
      else if (!["openai-completions", "openai-responses", "anthropic-messages"].includes(api)) skipReason = "api must be openai-completions, openai-responses, or anthropic-messages";
      else if (apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) skipReason = "invalid api key env var name";

      if (skipReason) {
        log(`[custom provider] skipped: ${skipReason}`);
        stepDone("Configuring custom provider", false);
      } else {
        const providerCfg = {
          baseUrl,
          api,
          apiKey: apiKeyEnv ? "${" + apiKeyEnv + "}" : undefined,
          models: modelId ? [{ id: modelId, name: modelId }] : undefined,
        };
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "models.mode", "merge"]));
        const set = await runCmd(
          OPENCLAW_NODE,
          clawArgs(["config", "set", "--json", `models.providers.${providerId}`, JSON.stringify(providerCfg)]),
        );
        log(set.output || "");
        stepDone("Configuring custom provider", set.code === 0);
      }
    }

    // --- Channels ---
    const channelsHelp = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));
    const helpText = channelsHelp.output || "";
    const supports = (name) => helpText.includes(name);

    if (payload.telegramToken?.trim()) {
      step("Configuring Telegram");
      if (!supports("telegram")) {
        log("[telegram] skipped (not supported by this build)");
        stepDone("Configuring Telegram", false);
      } else {
        const token = payload.telegramToken.trim();
        const cfgObj = { enabled: true, dmPolicy: "pairing", botToken: token, groupPolicy: "allowlist", streamMode: "partial" };
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.telegram", JSON.stringify(cfgObj)]));
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
        await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", "telegram"]));
        stepDone("Configuring Telegram");
      }
    }

    if (payload.discordToken?.trim()) {
      step("Configuring Discord");
      if (!supports("discord")) {
        log("[discord] skipped (not supported by this build)");
        stepDone("Configuring Discord", false);
      } else {
        const token = payload.discordToken.trim();
        const cfgObj = { enabled: true, token, groupPolicy: "allowlist", dm: { policy: "pairing" } };
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.discord", JSON.stringify(cfgObj)]));
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));
        stepDone("Configuring Discord");
      }
    }

    if (payload.slackBotToken?.trim() || payload.slackAppToken?.trim()) {
      step("Configuring Slack");
      if (!supports("slack")) {
        log("[slack] skipped (not supported by this build)");
        stepDone("Configuring Slack", false);
      } else {
        const cfgObj = {
          enabled: true,
          botToken: payload.slackBotToken?.trim() || undefined,
          appToken: payload.slackAppToken?.trim() || undefined,
        };
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "set", "--json", "channels.slack", JSON.stringify(cfgObj)]));
        await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.slack"]));
        stepDone("Configuring Slack");
      }
    }

    // --- Start gateway ---
    step("Starting gateway");
    await restartGateway();
    stepDone("Starting gateway");

    step("Running doctor --fix");
    const fix = await runCmd(OPENCLAW_NODE, clawArgs(["doctor", "--fix"]));
    log(redactSecrets(fix.output || ""));
    stepDone("Running doctor --fix", fix.code === 0);

    step("Restarting gateway");
    await restartGateway();
    stepDone("Restarting gateway");

    send("done", { ok: true, output: "Setup complete." });
    res.end();
  } catch (err) {
    console.error("[/setup/api/run] error:", err);
    send("done", { ok: false, output: `Internal error: ${String(err)}` });
    res.end();
  }
});

app.get("/setup/api/debug", requireSetupAuth, async (_req, res) => {
  const v = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
  const help = await runCmd(OPENCLAW_NODE, clawArgs(["channels", "add", "--help"]));

  // Channel config checks (redact secrets before returning to client)
  const tg = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.telegram"]));
  const dc = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", "channels.discord"]));

  const tgOut = redactSecrets(tg.output || "");
  const dcOut = redactSecrets(dc.output || "");

  res.json({
    wrapper: {
      node: process.version,
      port: PORT,
      publicPortEnv: process.env.PORT || null,
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
      configured: isConfigured(),
      configPathResolved: configPath(),
      configPathCandidates: typeof resolveConfigCandidates === "function" ? resolveConfigCandidates() : null,
      internalGatewayHost: INTERNAL_GATEWAY_HOST,
      internalGatewayPort: INTERNAL_GATEWAY_PORT,
      gatewayTarget: GATEWAY_TARGET,
      gatewayRunning: Boolean(gatewayProc),
      gatewayTokenFromEnv: Boolean(process.env.OPENCLAW_GATEWAY_TOKEN?.trim()),
      gatewayTokenPersisted: fs.existsSync(path.join(STATE_DIR, "gateway.token")),
      lastGatewayError,
      lastGatewayExit,
      lastDoctorAt,
      lastDoctorOutput,
      railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    },
    openclaw: {
      entry: OPENCLAW_ENTRY,
      node: OPENCLAW_NODE,
      version: v.output.trim(),
      channelsAddHelpIncludesTelegram: help.output.includes("telegram"),
      channels: {
        telegram: {
          exit: tg.code,
          configuredEnabled: /"enabled"\s*:\s*true/.test(tg.output || "") || /enabled\s*[:=]\s*true/.test(tg.output || ""),
          botTokenPresent: /(\d{5,}:[A-Za-z0-9_-]{10,})/.test(tg.output || ""),
          output: tgOut,
        },
        discord: {
          exit: dc.code,
          configuredEnabled: /"enabled"\s*:\s*true/.test(dc.output || "") || /enabled\s*[:=]\s*true/.test(dc.output || ""),
          tokenPresent: /"token"\s*:\s*"?\S+"?/.test(dc.output || "") || /token\s*[:=]\s*\S+/.test(dc.output || ""),
          output: dcOut,
        },
      },
    },
  });
});

// --- Debug console (Option A: allowlisted commands + config editor) ---

function redactSecrets(text) {
  if (!text) return text;
  // Very small best-effort redaction. (Config paths/values may still contain secrets.)
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(gho_[A-Za-z0-9_]{10,})/g, "[REDACTED]")
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, "[REDACTED]")
    // Telegram bot tokens look like: 123456:ABCDEF...
    .replace(/(\d{5,}:[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(AA[A-Za-z0-9_-]{10,}:\S{10,})/g, "[REDACTED]");
}

function extractDeviceRequestIds(text) {
  const s = String(text || "");
  const out = new Set();

  // Common patterns: requestId=XYZ, requestId: XYZ, "requestId":"XYZ".
  for (const m of s.matchAll(/requestId\s*(?:=|:)\s*([A-Za-z0-9_-]{6,})/g)) out.add(m[1]);
  for (const m of s.matchAll(/"requestId"\s*:\s*"([A-Za-z0-9_-]{6,})"/g)) out.add(m[1]);

  // CLI table output: bare UUIDs (v4) in table cells under "Pending" section.
  const pendingSection = s.split(/Paired\b/)[0]; // only look before "Paired" section
  for (const m of pendingSection.matchAll(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)) out.add(m[1]);

  return Array.from(out);
}

/**
 * Parse the CLI table output from `devices list` into structured pending/paired arrays.
 * Handles multi-line cell values by joining continuation lines.
 */
function parseDeviceListOutput(text) {
  const s = String(text || "");
  const pending = [];
  const paired = [];

  // Split into Pending and Paired sections
  const pendingMatch = s.match(/Pending\s*\(\d+\)\s*\n([\s\S]*?)(?=Paired\s*\(\d+\)|$)/);
  const pairedMatch = s.match(/Paired\s*\(\d+\)\s*\n([\s\S]*?)$/);

  function parseTableRows(block, headers) {
    if (!block) return [];
    const lines = block.split("\n");
    const rows = [];
    let current = null;

    for (const line of lines) {
      // Skip border lines (┌─┬─┐, ├─┼─┤, └─┴─┘)
      if (/^[┌├└][─┬┼┴┐┤┘]+/.test(line.trim())) continue;
      // Skip header row (contains the column names)
      if (headers.some((h) => line.includes(h))) continue;
      // Data rows start with │
      if (!line.trim().startsWith("│")) continue;

      const cells = line.split("│").slice(1, -1).map((c) => c.trim());
      if (cells.length < headers.length) continue;

      // If first cell is non-empty, it's a new row; otherwise continuation of previous
      if (cells[0]) {
        if (current) rows.push(current);
        current = cells.map((c) => c);
      } else if (current) {
        // Continuation line — append non-empty cells to current
        for (let i = 0; i < cells.length; i++) {
          if (cells[i]) current[i] = (current[i] + cells[i]).trim();
        }
      }
    }
    if (current) rows.push(current);
    return rows;
  }

  if (pendingMatch) {
    const pendingHeaders = ["Request", "Device", "Role", "IP", "Age", "Flags"];
    const rows = parseTableRows(pendingMatch[1], pendingHeaders);
    for (const cells of rows) {
      pending.push({
        requestId: cells[0] || "",
        device: cells[1] || "",
        role: cells[2] || "",
        ip: cells[3] || "",
        age: cells[4] || "",
        flags: cells[5] || "",
      });
    }
  }

  if (pairedMatch) {
    const pairedHeaders = ["Device", "Roles", "Scopes", "Tokens", "IP"];
    const rows = parseTableRows(pairedMatch[1], pairedHeaders);
    for (const cells of rows) {
      paired.push({
        device: cells[0] || "",
        roles: cells[1] || "",
        scopes: cells[2] || "",
        tokens: cells[3] || "",
        ip: cells[4] || "",
      });
    }
  }

  return { pending, paired };
}

// Wrapper-managed commands (not openclaw CLI) — keep as strict allowlist.
const GATEWAY_COMMANDS = new Set(["gateway.restart", "gateway.stop", "gateway.start"]);

// Shell metacharacters that must never appear in cmd or arg to prevent injection.
const SHELL_UNSAFE = /[&|;`$(){}!<>\\#\n\r]/;

function isAllowedConsoleCmd(cmd) {
  if (GATEWAY_COMMANDS.has(cmd)) return true;
  // Allow any openclaw.* dotted command (e.g. openclaw.config.get, openclaw.channels.add)
  return /^openclaw\.[a-z][a-z0-9._-]*$/i.test(cmd);
}

app.post("/setup/api/console/run", requireSetupAuth, async (req, res) => {
  const payload = req.body || {};
  const cmd = String(payload.cmd || "").trim();
  const arg = String(payload.arg || "").trim();

  if (!isAllowedConsoleCmd(cmd)) {
    return res.status(400).json({ ok: false, error: "Command not allowed. Must be gateway.* or openclaw.*" });
  }
  if (SHELL_UNSAFE.test(cmd) || SHELL_UNSAFE.test(arg)) {
    return res.status(400).json({ ok: false, error: "Invalid characters in command or argument" });
  }

  try {
    if (cmd === "gateway.restart") {
      await restartGateway();
      return res.json({ ok: true, output: "Gateway restarted (wrapper-managed).\n" });
    }
    if (cmd === "gateway.stop") {
      if (gatewayProc) {
        try { gatewayProc.kill("SIGTERM"); } catch { }
        await sleep(750);
        gatewayProc = null;
      }
      return res.json({ ok: true, output: "Gateway stopped (wrapper-managed).\n" });
    }
    if (cmd === "gateway.start") {
      const r = await ensureGatewayRunning();
      return res.json({ ok: Boolean(r.ok), output: r.ok ? "Gateway started.\n" : `Gateway not started: ${r.reason}\n` });
    }

    if (cmd === "openclaw.version") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["--version"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.status") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["status"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.health") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["health"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.doctor") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["doctor"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.logs.tail") {
      const lines = Math.max(50, Math.min(1000, Number.parseInt(arg || "200", 10) || 200));
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["logs", "--tail", String(lines)]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.config.get") {
      if (!arg) return res.status(400).json({ ok: false, error: "Missing config path" });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["config", "get", arg]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    // Device management commands (for fixing "disconnected (1008): pairing required")
    if (cmd === "openclaw.devices.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.devices.approve") {
      const requestId = String(arg || "").trim();
      if (!requestId) {
        return res.status(400).json({ ok: false, error: "Missing device request ID" });
      }
      if (!/^[A-Za-z0-9_-]+$/.test(requestId)) {
        return res.status(400).json({ ok: false, error: "Invalid device request ID" });
      }
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    // Plugin management commands
    if (cmd === "openclaw.plugins.list") {
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "list"]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "openclaw.plugins.enable") {
      const name = String(arg || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "Missing plugin name" });
      if (!/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ ok: false, error: "Invalid plugin name" });
      const r = await runCmd(OPENCLAW_NODE, clawArgs(["plugins", "enable", name]));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    // Generic openclaw.* fallback: convert dotted command to CLI args.
    // e.g. "openclaw.channels.add" → ["channels", "add"]
    if (cmd.startsWith("openclaw.")) {
      const parts = cmd.slice("openclaw.".length).split(".").map((s) => s.replace(/_/g, "-"));
      // Special case: "openclaw.version" → ["--version"]
      const cliArgs = parts.length === 1 && parts[0] === "version" ? ["--version"] : parts;
      if (arg) cliArgs.push(arg);
      const r = await runCmd(OPENCLAW_NODE, clawArgs(cliArgs));
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    return res.status(400).json({ ok: false, error: "Unhandled command" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get("/setup/api/config/raw", requireSetupAuth, async (_req, res) => {
  try {
    const p = configPath();
    const exists = fs.existsSync(p);
    const content = exists ? fs.readFileSync(p, "utf8") : "";
    res.json({ ok: true, path: p, exists, content });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/setup/api/config/raw", requireSetupAuth, async (req, res) => {
  try {
    const content = String((req.body && req.body.content) || "");
    if (content.length > 500_000) {
      return res.status(413).json({ ok: false, error: "Config too large" });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });

    const p = configPath();
    // Backup
    if (fs.existsSync(p)) {
      const backupPath = `${p}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      fs.copyFileSync(p, backupPath);
    }

    fs.writeFileSync(p, content, { encoding: "utf8", mode: 0o600 });

    // Apply immediately.
    if (isConfigured()) {
      await restartGateway();
    }

    res.json({ ok: true, path: p });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/setup/api/pairing/approve", requireSetupAuth, async (req, res) => {
  const { channel, code } = req.body || {};
  if (!channel || !code) {
    return res.status(400).json({ ok: false, error: "Missing channel or code" });
  }
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["pairing", "approve", String(channel), String(code)]));
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: r.output });
});

// Device pairing helper (list + approve) to avoid needing SSH.
app.get("/setup/api/devices/pending", requireSetupAuth, async (_req, res) => {
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "list"]));
  const output = redactSecrets(r.output);
  const requestIds = extractDeviceRequestIds(output);
  const parsed = parseDeviceListOutput(output);
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, requestIds, ...parsed, output });
});

app.post("/setup/api/devices/approve", requireSetupAuth, async (req, res) => {
  const requestId = String((req.body && req.body.requestId) || "").trim();
  if (!requestId) return res.status(400).json({ ok: false, error: "Missing device request ID" });
  if (!/^[A-Za-z0-9_-]+$/.test(requestId)) return res.status(400).json({ ok: false, error: "Invalid device request ID" });
  const r = await runCmd(OPENCLAW_NODE, clawArgs(["devices", "approve", requestId]));
  return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
});

app.post("/setup/api/reset", requireSetupAuth, async (_req, res) => {
  // Reset: stop gateway (frees memory) + delete config file(s) so /setup can rerun.
  // Keep credentials/sessions/workspace by default.
  try {
    // Stop gateway to avoid running gateway + onboard concurrently on small Railway instances.
    try {
      if (gatewayProc) {
        try { gatewayProc.kill("SIGTERM"); } catch { }
        await sleep(750);
        gatewayProc = null;
      }
    } catch {
      // ignore
    }

    const candidates = typeof resolveConfigCandidates === "function" ? resolveConfigCandidates() : [configPath()];
    for (const p of candidates) {
      try { fs.rmSync(p, { force: true }); } catch { }
    }

    res.type("text/plain").send("OK - stopped gateway and deleted config file(s). You can rerun setup now.");
  } catch (err) {
    res.status(500).type("text/plain").send(String(err));
  }
});

app.get("/setup/export", requireSetupAuth, async (_req, res) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  res.setHeader("content-type", "application/gzip");
  res.setHeader(
    "content-disposition",
    `attachment; filename="openclaw-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz"`,
  );

  // Prefer exporting from a common /data root so archives are easy to inspect and restore.
  // This preserves dotfiles like /data/.openclaw/openclaw.json.
  const stateAbs = path.resolve(STATE_DIR);
  const workspaceAbs = path.resolve(WORKSPACE_DIR);

  const dataRoot = "/data";
  const underData = (p) => p === dataRoot || p.startsWith(dataRoot + path.sep);

  let cwd = "/";
  let paths = [stateAbs, workspaceAbs].map((p) => p.replace(/^\//, ""));

  if (underData(stateAbs) && underData(workspaceAbs)) {
    cwd = dataRoot;
    // We export relative to /data so the archive contains: .openclaw/... and workspace/...
    paths = [
      path.relative(dataRoot, stateAbs) || ".",
      path.relative(dataRoot, workspaceAbs) || ".",
    ];
  }

  const stream = tar.c(
    {
      gzip: true,
      portable: true,
      noMtime: true,
      cwd,
      onwarn: () => { },
    },
    paths,
  );

  stream.on("error", (err) => {
    console.error("[export]", err);
    if (!res.headersSent) res.status(500);
    res.end(String(err));
  });

  stream.pipe(res);
});

function isUnderDir(p, root) {
  const abs = path.resolve(p);
  const r = path.resolve(root);
  return abs === r || abs.startsWith(r + path.sep);
}

function looksSafeTarPath(p) {
  if (!p) return false;
  // tar paths always use / separators
  if (p.startsWith("/") || p.startsWith("\\")) return false;
  // windows drive letters
  if (/^[A-Za-z]:[\\/]/.test(p)) return false;
  // path traversal
  if (p.split("/").includes("..")) return false;
  return true;
}

async function readBodyBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Import a backup created by /setup/export.
// This is intentionally limited to restoring into /data to avoid overwriting arbitrary host paths.
app.post("/setup/import", requireSetupAuth, async (req, res) => {
  try {
    const dataRoot = "/data";
    if (!isUnderDir(STATE_DIR, dataRoot) || !isUnderDir(WORKSPACE_DIR, dataRoot)) {
      return res
        .status(400)
        .type("text/plain")
        .send("Import is only supported when OPENCLAW_STATE_DIR and OPENCLAW_WORKSPACE_DIR are under /data (Railway volume).\n");
    }

    // Stop gateway before restore so we don't overwrite live files.
    if (gatewayProc) {
      try { gatewayProc.kill("SIGTERM"); } catch { }
      await sleep(750);
      gatewayProc = null;
    }

    const buf = await readBodyBuffer(req, 250 * 1024 * 1024); // 250MB max
    if (!buf.length) return res.status(400).type("text/plain").send("Empty body\n");

    // Extract into /data.
    // We only allow safe relative paths, and we intentionally do NOT delete existing files.
    // (Users can reset/redeploy or manually clean the volume if desired.)
    const tmpPath = path.join(os.tmpdir(), `openclaw-import-${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpPath, buf);

    await tar.x({
      file: tmpPath,
      cwd: dataRoot,
      gzip: true,
      strict: true,
      onwarn: () => { },
      filter: (p) => {
        // Allow only paths that look safe.
        return looksSafeTarPath(p);
      },
    });

    try { fs.rmSync(tmpPath, { force: true }); } catch { }

    // Restart gateway after restore.
    if (isConfigured()) {
      await restartGateway();
    }

    res.type("text/plain").send("OK - imported backup into /data and restarted gateway.\n");
  } catch (err) {
    console.error("[import]", err);
    res.status(500).type("text/plain").send(String(err));
  }
});

// Proxy everything else to the gateway.
const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  xfwd: true,
});

proxy.on("error", (err, _req, resOrSocket) => {
  console.error("[proxy]", err);
  // resOrSocket is http.ServerResponse for HTTP, net.Socket for WS upgrade.
  try {
    if (resOrSocket && typeof resOrSocket.writeHead === "function" && !resOrSocket.headersSent) {
      resOrSocket.writeHead(502, { "Content-Type": "text/plain" });
      resOrSocket.end("Bad Gateway: upstream unreachable");
    } else if (resOrSocket && typeof resOrSocket.destroy === "function") {
      resOrSocket.destroy();
    }
  } catch {
    // best-effort
  }
});

app.use(async (req, res) => {
  // If not configured, force users to /setup for any non-setup routes.
  if (!isConfigured() && !req.path.startsWith("/setup")) {
    return res.redirect("/setup");
  }

  if (isConfigured()) {
    // Fast synchronous path: if gateway is already running, proxy immediately
    // without going through async ensureGatewayRunning().
    if (!gatewayProc) {
      try {
        await ensureGatewayRunning();
      } catch (err) {
        const hint = [
          "Gateway not ready.",
          String(err),
          lastGatewayError ? `\n${lastGatewayError}` : "",
          "\nTroubleshooting:",
          "- Visit /setup and check the Debug Console",
          "- Visit /setup/api/debug for config + gateway diagnostics",
        ].join("\n");
        return res.status(503).type("text/plain").send(hint);
      }
    }
  }

  return proxy.web(req, res, { target: GATEWAY_TARGET });
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[wrapper] listening on :${PORT}`);
  console.log(`[wrapper] state dir: ${STATE_DIR}`);
  console.log(`[wrapper] workspace dir: ${WORKSPACE_DIR}`);

  // Harden state dir for OpenClaw and avoid missing credentials dir on fresh volumes.
  try {
    fs.mkdirSync(path.join(STATE_DIR, "credentials"), { recursive: true });
  } catch { }
  try {
    fs.chmodSync(STATE_DIR, 0o700);
  } catch { }

  console.log(`[wrapper] gateway token: ${OPENCLAW_GATEWAY_TOKEN ? "(set)" : "(missing)"}`);
  console.log(`[wrapper] gateway target: ${GATEWAY_TARGET}`);

  // Auto-start the gateway if already configured so polling channels (Telegram/Discord/etc.)
  // work even if nobody visits the web UI.
  if (isConfigured()) {
    console.log("[wrapper] config detected; starting gateway...");
    try {
      await ensureGatewayRunning();
      console.log("[wrapper] gateway ready");
    } catch (err) {
      console.error(`[wrapper] gateway failed to start at boot: ${String(err)}`);
    }
  }
});

// --- Web terminal (PTY over WebSocket) ---
const terminalWss = new WebSocketServer({ noServer: true });

function authenticateWs(req) {
  // Check Basic auth from query param (WebSocket can't send custom headers easily)
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const password = idx >= 0 ? decoded.slice(idx + 1) : "";
    return password === SETUP_PASSWORD;
  } catch { return false; }
}

// Shell metacharacters that must never appear in restricted-mode input.
const RESTRICTED_SHELL_UNSAFE = /[&|;`$(){}!<>\\#\n\r"']/;

function handleRestrictedTerminal(ws) {
  let inputBuf = "";
  let cols = 80;
  let rows = 24;
  let activePty = null;

  const PROMPT = "\x1b[32mopenclaw\x1b[0m $ ";
  const writePrompt = () => ws.send(PROMPT);

  ws.send("\x1b[90m[Restricted terminal — only openclaw and gateway commands allowed]\x1b[0m\r\n");
  ws.send("\x1b[90mSet TERMINAL_FULL_ACCESS=true for a full shell.\x1b[0m\r\n\r\n");
  writePrompt();

  function spawnRestrictedCmd(cmd, args) {
    activePty = pty.spawn(cmd, args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: STATE_DIR,
      env: { ...process.env, TERM: "xterm-256color" },
    });

    activePty.onData((data) => {
      try { ws.send(data); } catch { }
    });

    activePty.onExit(() => {
      activePty = null;
      writePrompt();
    });
  }

  ws.on("message", async (msg) => {
    const str = msg.toString();

    // Handle resize
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        cols = Math.max(1, parsed.cols);
        rows = Math.max(1, parsed.rows);
        if (activePty) activePty.resize(cols, rows);
        return;
      }
    } catch { /* not JSON */ }

    // If a PTY command is running, forward input to it
    if (activePty) {
      activePty.write(str);
      return;
    }

    // Line-editing mode (prompt)
    for (const ch of str) {
      if (ch === "\r" || ch === "\n") {
        ws.send("\r\n");
        const line = inputBuf.trim();
        inputBuf = "";

        if (!line) { writePrompt(); continue; }

        const parts = line.split(/\s+/);
        const base = parts[0].toLowerCase();

        const isOpenclaw = base === "openclaw" && parts.length >= 2;
        const isGatewayCmd = /^gateway\.(restart|stop|start)$/.test(base);

        if (!isOpenclaw && !isGatewayCmd) {
          ws.send("\x1b[31mOnly openclaw and gateway.* commands are allowed.\x1b[0m\r\n");
          writePrompt();
          continue;
        }

        if (RESTRICTED_SHELL_UNSAFE.test(line)) {
          ws.send("\x1b[31mInvalid characters detected. Shell operators are not allowed.\x1b[0m\r\n");
          writePrompt();
          continue;
        }

        if (isGatewayCmd) {
          try {
            if (base === "gateway.restart") {
              await restartGateway();
              ws.send("Gateway restarted.\r\n");
            } else if (base === "gateway.stop") {
              if (gatewayProc) {
                try { gatewayProc.kill("SIGTERM"); } catch { }
                await sleep(750);
                gatewayProc = null;
              }
              ws.send("Gateway stopped.\r\n");
            } else if (base === "gateway.start") {
              const r = await ensureGatewayRunning();
              ws.send(r.ok ? "Gateway started.\r\n" : `Gateway not started: ${r.reason}\r\n`);
            }
          } catch (e) {
            ws.send(`\x1b[31mError: ${String(e)}\x1b[0m\r\n`);
          }
          writePrompt();
          continue;
        }

        // openclaw command — spawn in a real PTY for interactive TUI support
        const cliArgs = clawArgs(parts.slice(1));
        spawnRestrictedCmd(OPENCLAW_NODE, cliArgs);
      } else if (ch === "\x7f" || ch === "\b") {
        if (inputBuf.length > 0) {
          inputBuf = inputBuf.slice(0, -1);
          ws.send("\b \b");
        }
      } else if (ch === "\x03") {
        inputBuf = "";
        ws.send("^C\r\n");
        writePrompt();
      } else if (ch === "\x15") {
        const clearSeq = "\b \b".repeat(inputBuf.length);
        ws.send(clearSeq);
        inputBuf = "";
      } else if (ch >= " ") {
        inputBuf += ch;
        ws.send(ch);
      }
    }
  });

  ws.on("close", () => {
    if (activePty) { try { activePty.kill(); } catch { } activePty = null; }
  });
}

function handleFullTerminal(ws) {
  const shell = process.env.SHELL || "/bin/bash";
  const term = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: STATE_DIR,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  term.onData((data) => {
    try { ws.send(data); } catch { }
  });

  term.onExit(() => {
    try { ws.close(); } catch { }
  });

  ws.on("message", (msg) => {
    const str = msg.toString();
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === "resize" && parsed.cols && parsed.rows) {
        term.resize(Math.max(1, parsed.cols), Math.max(1, parsed.rows));
        return;
      }
    } catch { /* not JSON, treat as input */ }
    term.write(str);
  });

  ws.on("close", () => {
    try { term.kill(); } catch { }
  });
}

terminalWss.on("connection", (ws) => {
  if (TERMINAL_FULL_ACCESS) {
    handleFullTerminal(ws);
  } else {
    handleRestrictedTerminal(ws);
  }
});

server.on("upgrade", async (req, socket, head) => {
  const pathname = req.url?.split("?")[0];

  // Terminal WebSocket
  if (pathname === "/setup/terminal") {
    if (!authenticateWs(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    terminalWss.handleUpgrade(req, socket, head, (ws) => {
      terminalWss.emit("connection", ws, req);
    });
    return;
  }

  // Gateway proxy
  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  if (!gatewayProc) {
    try {
      await ensureGatewayRunning();
    } catch {
      socket.destroy();
      return;
    }
  }
  proxy.ws(req, socket, head, { target: GATEWAY_TARGET });
});

process.on("SIGTERM", () => {
  // Best-effort shutdown
  try {
    if (gatewayProc) gatewayProc.kill("SIGTERM");
  } catch {
    // ignore
  }
  process.exit(0);
});
