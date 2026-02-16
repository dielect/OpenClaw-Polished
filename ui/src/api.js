const BASE = "";

let _authHeader = null;

export function setAuth(password) {
    const encoded = btoa(`:${password}`);
    _authHeader = `Basic ${encoded}`;
    try {
        sessionStorage.setItem("openclaw_auth", password);
    } catch { }
}

export function restoreAuth() {
    try {
        const saved = sessionStorage.getItem("openclaw_auth");
        if (saved) {
            setAuth(saved);
            return true;
        }
    } catch { }
    return false;
}

export function clearAuth() {
    _authHeader = null;
    try {
        sessionStorage.removeItem("openclaw_auth");
    } catch { }
}

export function isAuthed() {
    return Boolean(_authHeader);
}

function authHeaders() {
    return _authHeader ? { Authorization: _authHeader } : {};
}

async function request(url, opts = {}) {
    opts.credentials = "same-origin";
    opts.headers = { ...authHeaders(), ...(opts.headers || {}) };
    const res = await fetch(`${BASE}${url}`, opts);
    if (res.status === 401) {
        clearAuth();
        throw new Error("AUTH_REQUIRED");
    }
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
}

async function rawFetch(url, opts = {}) {
    opts.credentials = "same-origin";
    opts.headers = { ...authHeaders(), ...(opts.headers || {}) };
    const res = await fetch(`${BASE}${url}`, opts);
    if (res.status === 401) {
        clearAuth();
        throw new Error("AUTH_REQUIRED");
    }
    return res;
}

export async function verifyAuth(password) {
    const encoded = btoa(`:${password}`);
    const res = await fetch(`${BASE}/setup/api/auth/verify`, {
        credentials: "same-origin",
        headers: { Authorization: `Basic ${encoded}` },
    });
    return res.ok;
}

export function getStatus() {
    return request("/setup/api/status");
}

export async function getHealth() {
    const res = await fetch("/healthz");
    if (!res.ok) return { ok: false, gateway: { reachable: false } };
    return res.json();
}

export function getAuthGroups() {
    return request("/setup/api/auth-groups");
}

export function getDebug() {
    return request("/setup/api/debug");
}

export function runSetup(payload) {
    return rawFetch("/setup/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    }).then(async (res) => {
        const text = await res.text();
        try { return JSON.parse(text); }
        catch { return { ok: false, output: text }; }
    });
}

/**
 * Stream setup progress via SSE. Calls onStep/onStepDone/onLog/onDone as events arrive.
 * Returns an abort function.
 */
export function runSetupStream(payload, { onStep, onStepDone, onLog, onDone, onError }) {
    const controller = new AbortController();

    rawFetch("/setup/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
    }).then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            const lines = buf.split("\n");
            buf = lines.pop() || "";

            let currentEvent = null;
            for (const line of lines) {
                if (line.startsWith("event: ")) {
                    currentEvent = line.slice(7).trim();
                } else if (line.startsWith("data: ") && currentEvent) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (currentEvent === "step") onStep?.(data);
                        else if (currentEvent === "stepDone") onStepDone?.(data);
                        else if (currentEvent === "log") onLog?.(data);
                        else if (currentEvent === "done") onDone?.(data);
                    } catch { /* ignore parse errors */ }
                    currentEvent = null;
                }
            }
        }
    }).catch((err) => {
        if (err.name !== "AbortError") onError?.(err);
    });

    return () => controller.abort();
}

export function runConsoleCmd(cmd, arg) {
    return request("/setup/api/console/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd, arg }),
    });
}

export function getConfigRaw() {
    return request("/setup/api/config/raw");
}

export function saveConfigRaw(content) {
    return request("/setup/api/config/raw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
    });
}

export function getEnvRaw() {
    return request("/setup/api/env/raw");
}

export function saveEnvRaw(content) {
    return request("/setup/api/env/raw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
    });
}

export function resetSetup() {
    return rawFetch("/setup/api/reset", { method: "POST" }).then((r) => r.text());
}

export function approvePairing(channel, code) {
    return rawFetch("/setup/api/pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, code }),
    }).then((r) => r.text());
}

export function getPendingDevices() {
    return request("/setup/api/devices/pending");
}

export function approveDevice(requestId) {
    return request("/setup/api/devices/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
    });
}

export function importBackup(file) {
    return file.arrayBuffer().then((buf) =>
        rawFetch("/setup/import", {
            method: "POST",
            headers: { "content-type": "application/gzip" },
            body: buf,
        }).then((r) => r.text())
    );
}
export async function exportBackup() {
    const res = await rawFetch("/setup/export");
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openclaw-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
    a.click();
    URL.revokeObjectURL(url);
}
export function getTerminalWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const token = btoa(`:${sessionStorage.getItem("openclaw_auth") || ""}`);
    return `${proto}//${location.host}/setup/terminal?token=${encodeURIComponent(token)}`;
}
