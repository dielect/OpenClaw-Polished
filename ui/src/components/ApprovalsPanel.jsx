import { useState, useEffect, useCallback, useRef } from "react";
import { Section, Card, CardContent, Button, Input, Label, Badge } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { approvePairing, getPendingDevices, approveDevice, rejectDevice, revokeDevice } from "../api";
import { useToast } from "./Toast";

/* ── Error display with collapsible stack trace ── */
function ErrorBlock({ message }) {
    const [expanded, setExpanded] = useState(false);

    // Try to extract a short summary from the error
    const parseError = (raw) => {
        if (!raw) return { summary: raw, detail: null };
        const str = String(raw);

        // Try to pull out HTTP status and the core error message
        const httpMatch = str.match(/HTTP\s+(\d+)/);
        const moduleMatch = str.match(/Error:\s*(Cannot find module\s+'[^']+')/);
        const genericMatch = str.match(/(?:^Error:\s*Error:\s*|^Error:\s*)(.+?)(?:\n|$)/);

        let summary = "";
        if (httpMatch) summary += `HTTP ${httpMatch[1]}`;
        if (moduleMatch) {
            summary += summary ? " — " : "";
            summary += moduleMatch[1];
        } else if (genericMatch && !moduleMatch) {
            const brief = genericMatch[1].replace(/\{.*/, "").trim();
            if (brief.length < 120) {
                summary += summary ? " — " : "";
                summary += brief;
            }
        }
        if (!summary) summary = str.slice(0, 100) + (str.length > 100 ? "…" : "");

        // Extract stack trace / full output for detail
        const hasDetail = str.length > summary.length + 20;
        return { summary, detail: hasDetail ? str : null };
    };

    const { summary, detail } = parseError(message);

    return (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
            <div className="flex items-start gap-2 px-3 py-2.5">
                <span className="text-destructive mt-0.5 shrink-0 text-sm">✕</span>
                <p className="text-sm text-destructive flex-1 break-words">{summary}</p>
                {detail && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1"
                    >
                        {expanded ? "Hide" : "Details"}
                    </button>
                )}
            </div>
            {expanded && detail && (
                <pre className="border-t border-destructive/20 bg-muted/50 px-3 py-2.5 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto text-muted-foreground leading-relaxed">
                    {detail}
                </pre>
            )}
        </div>
    );
}

/* ── Log display — routes errors through ErrorBlock, plain text as-is ── */
function LogOutput({ text }) {
    if (!text) return null;
    const lines = text.split("\n");
    const blocks = [];
    let plainBuf = [];

    const flushPlain = () => {
        if (plainBuf.length) {
            blocks.push({ type: "plain", text: plainBuf.join("\n"), key: blocks.length });
            plainBuf = [];
        }
    };

    for (const line of lines) {
        if (/^Error:\s/.test(line)) {
            flushPlain();
            blocks.push({ type: "error", text: line, key: blocks.length });
        } else {
            plainBuf.push(line);
        }
    }
    flushPlain();

    return (
        <>
            {blocks.map((b) =>
                b.type === "error" ? (
                    <ErrorBlock key={b.key} message={b.text} />
                ) : (
                    <pre key={b.key} className="mt-3 rounded-md border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-foreground/80">
                        {b.text}
                    </pre>
                )
            )}
        </>
    );
}

/* ── Channel icons ── */
const TelegramIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
);

const DiscordIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
);

/* ── Pairing Approve Form (replaces native prompt()) ── */
const CHANNELS = [
    { value: "telegram", label: "Telegram", icon: TelegramIcon },
    { value: "discord", label: "Discord", icon: DiscordIcon },
];

function PairingForm({ onLog }) {
    const [channel, setChannel] = useState("telegram");
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!channel || !code.trim()) return;
        setSubmitting(true);
        onLog(`Approving pairing for ${channel}...`);
        try {
            const text = await approvePairing(channel, code.trim());
            onLog(text);
            setCode("");
        } catch (err) {
            onLog(`Error: ${err}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-3">
                    <Label>Channel</Label>
                    <div className="flex rounded-lg border border-input overflow-hidden w-fit">
                        {CHANNELS.map((ch) => {
                            const Icon = ch.icon;
                            return (
                                <button
                                    key={ch.value}
                                    type="button"
                                    onClick={() => setChannel(ch.value)}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-all cursor-pointer ${channel === ch.value
                                        ? "bg-accent text-foreground font-medium"
                                        : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {ch.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex flex-col gap-3">
                    <Label>Pairing code</Label>
                    <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Enter code"
                        className="font-mono"
                    />
                </div>
            </div>
            <Button type="submit" size="sm" disabled={submitting || !code.trim()}>
                {submitting ? "Approving..." : "Approve pairing"}
            </Button>
        </form >
    );
}

/* ── Helpers ── */
function shortId(id) {
    if (!id || id.length <= 12) return id;
    return id.slice(0, 6) + "…" + id.slice(-6);
}

function timeAgo(ms) {
    if (!ms) return null;
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Pending device request row ── */
function PendingDeviceRow({ device, onApprove, onReject, busy }) {
    const roles = device.roles ? device.roles.join(", ") : (device.role || "");

    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">{device.requestId}</code>
                    {device.platform && <Badge variant="outline">{device.platform}</Badge>}
                    {device.clientMode && <Badge variant="outline">{device.clientMode}</Badge>}
                    {device.isRepair && <Badge variant="outline">repair</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {device.deviceId && <span title="Device ID">Device: <span className="font-mono">{shortId(device.deviceId)}</span></span>}
                    {roles && <span>Role: {roles}</span>}
                    {device.remoteIp && <span>IP: <span className="font-mono">{device.remoteIp}</span></span>}
                    {device.ts && <span>Requested: {timeAgo(device.ts)}</span>}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => onReject(device.requestId)} disabled={busy}>
                    Reject
                </Button>
                <Button variant="default" size="sm" onClick={() => onApprove(device.requestId)} disabled={busy}>
                    Approve
                </Button>
            </div>
        </div>
    );
}

/* ── Paired device row ── */
function PairedDeviceRow({ device, onRevoke, busy }) {
    const roles = device.roles ? device.roles.join(", ") : "";
    const scopes = device.scopes ? device.scopes.join(", ") : "";
    const tokenCount = Array.isArray(device.tokens) ? device.tokens.length : null;
    const lastUsed = Array.isArray(device.tokens)
        ? device.tokens.reduce((latest, t) => Math.max(latest, t.lastUsedAtMs || 0), 0)
        : null;

    return (
        <div className="px-4 py-3 border-b border-border last:border-b-0 space-y-1.5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all" title={device.deviceId}>{shortId(device.deviceId)}</code>
                        {device.platform && <Badge variant="outline">{device.platform}</Badge>}
                        {device.clientMode && <Badge variant="outline">{device.clientMode}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {roles && <span>Roles: {roles}</span>}
                        {scopes && <span>Scopes: {scopes}</span>}
                        {tokenCount != null && <span>Tokens: {tokenCount}</span>}
                        {device.remoteIp && <span>IP: <span className="font-mono">{device.remoteIp}</span></span>}
                    </div>
                    {(device.approvedAtMs || lastUsed) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                            {device.approvedAtMs && <span>Approved: {timeAgo(device.approvedAtMs)}</span>}
                            {lastUsed > 0 && <span>Last used: {timeAgo(lastUsed)}</span>}
                        </div>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={() => onRevoke(device)} disabled={busy} className="shrink-0 text-destructive hover:text-destructive">
                    Revoke
                </Button>
            </div>
        </div>
    );
}

/* ── Main Approvals Panel ── */
export default function ApprovalsPanel() {
    const [pairingLog, setPairingLog] = useState("");
    const [pending, setPending] = useState([]);
    const [paired, setPaired] = useState([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [dialog, setDialog] = useState(null);
    const didMount = useRef(false);
    const pairingLogTimer = useRef(null);
    const toast = useToast();

    const appendPairingLog = useCallback((msg) => {
        setPairingLog((p) => (p ? p + "\n" : "") + msg);
        clearTimeout(pairingLogTimer.current);
        if (/^Error:/i.test(msg)) {
            pairingLogTimer.current = setTimeout(() => setPairingLog(""), 8000);
        }
    }, []);

    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    const refreshDevices = useCallback(async () => {
        setDevicesLoading(true);
        try {
            const d = await getPendingDevices();
            setPending(d.pending || []);
            setPaired(d.paired || []);
        } catch (e) {
            toast(`Error: ${e}`, { variant: "error", duration: 8000 });
        } finally {
            setDevicesLoading(false);
        }
    }, [toast]);

    // Auto-fetch on mount
    useEffect(() => {
        if (!didMount.current) {
            didMount.current = true;
            refreshDevices();
        }
    }, [refreshDevices]);

    const handleApproveDevice = async (id) => {
        const ok = await showConfirm({
            title: "Approve device?",
            description: `Approve device request: ${id}`,
            confirmLabel: "Approve",
        });
        if (!ok) return;
        setBusyId(id);
        try {
            await approveDevice(id);
            refreshDevices();
        } catch (e) {
            toast(`Error: ${e}`, { variant: "error", duration: 8000 });
        } finally {
            setBusyId(null);
        }
    };

    const handleRejectDevice = async (id) => {
        const ok = await showConfirm({
            title: "Reject device?",
            description: `Reject device request: ${id}`,
            confirmLabel: "Reject",
            variant: "destructive",
        });
        if (!ok) return;
        setBusyId(id);
        try {
            await rejectDevice(id);
            refreshDevices();
        } catch (e) {
            toast(`Error: ${e}`, { variant: "error", duration: 8000 });
        } finally {
            setBusyId(null);
        }
    };

    const handleRevokeDevice = async (device) => {
        const role = device.role || (device.roles && device.roles[0]) || "";
        const ok = await showConfirm({
            title: "Revoke device?",
            description: `Revoke role "${role}" for device: ${shortId(device.deviceId)}`,
            confirmLabel: "Revoke",
            variant: "destructive",
        });
        if (!ok) return;
        setBusyId(device.deviceId);
        try {
            await revokeDevice(device.deviceId, role);
            refreshDevices();
        } catch (e) {
            toast(`Error: ${e}`, { variant: "error", duration: 8000 });
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-8 py-6 w-full space-y-8">
            {/* Channel pairing */}
            <Section title="Channel pairing" description="Approve a pairing request from Telegram or Discord.">
                <Card>
                    <CardContent>
                        <PairingForm onLog={appendPairingLog} />
                    </CardContent>
                </Card>
                {pairingLog && <LogOutput text={pairingLog} />}
            </Section>

            {/* Device pairing */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold font-heading tracking-tight">Device pairing</h2>
                    <button
                        onClick={refreshDevices}
                        disabled={devicesLoading}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                        <span className={devicesLoading ? "animate-spin" : ""}>↻</span>
                        {devicesLoading ? "Refreshing..." : "Refresh"}
                    </button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                    Device list is not real-time. Use refresh to check for new requests.
                </p>

                {pending.length > 0 && (
                    <div className="mb-4">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Pending ({pending.length})
                        </h4>
                        <Card>
                            {pending.map((d) => (
                                <PendingDeviceRow key={d.requestId} device={d} onApprove={handleApproveDevice} onReject={handleRejectDevice} busy={busyId === d.requestId} />
                            ))}
                        </Card>
                    </div>
                )}

                {paired.length > 0 && (
                    <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Paired ({paired.length})
                        </h4>
                        <Card>
                            {paired.map((d, i) => (
                                <PairedDeviceRow key={d.deviceId || i} device={d} onRevoke={handleRevokeDevice} busy={busyId === d.deviceId} />
                            ))}
                        </Card>
                    </div>
                )}
            </div>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
