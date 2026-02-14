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
