import { useState, useEffect, useCallback, useRef } from "react";
import { Section, Card, CardContent, Button, Input, Label, Badge } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { approvePairing, getPendingDevices, approveDevice } from "../api";

/* ── Pairing Approve Form (replaces native prompt()) ── */
const CHANNELS = [
    { value: "telegram", label: "Telegram" },
    { value: "discord", label: "Discord" },
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
                <div className="space-y-4">
                    <Label>Channel</Label>
                    <div className="flex rounded-md border border-input bg-muted p-0.5 w-fit">
                        {CHANNELS.map((ch) => (
                            <button
                                key={ch.value}
                                type="button"
                                onClick={() => setChannel(ch.value)}
                                className={`px-3 py-1.5 text-sm rounded-sm transition-colors cursor-pointer ${channel === ch.value
                                    ? "bg-background text-foreground shadow-sm font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                {ch.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
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
        </form>
    );
}

/* ── Pending device request row ── */
function PendingDeviceRow({ device, onApprove }) {
    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-border last:border-b-0">
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">{device.requestId}</code>
                    {device.flags && <Badge variant="outline">{device.flags}</Badge>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {device.device && <span title="Device ID">Device: <span className="font-mono">{device.device}</span></span>}
                    {device.role && <span>Role: {device.role}</span>}
                    {device.ip && <span>IP: <span className="font-mono">{device.ip}</span></span>}
                    {device.age && <span>Age: {device.age}</span>}
                </div>
            </div>
            <Button variant="default" size="sm" onClick={() => onApprove(device.requestId)} className="shrink-0">
                Approve
            </Button>
        </div>
    );
}

/* ── Paired device row ── */
function PairedDeviceRow({ device }) {
    return (
        <div className="px-4 py-3 border-b border-border last:border-b-0 space-y-1">
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded break-all">{device.device}</code>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {device.roles && <span>Roles: {device.roles}</span>}
                {device.scopes && <span>Scopes: {device.scopes}</span>}
                {device.tokens && <span>Tokens: {device.tokens}</span>}
                {device.ip && <span>IP: <span className="font-mono">{device.ip}</span></span>}
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
    const [devicesLog, setDevicesLog] = useState("");
    const [dialog, setDialog] = useState(null);
    const didMount = useRef(false);

    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    const refreshDevices = useCallback(async () => {
        setDevicesLoading(true);
        setDevicesLog("");
        try {
            const d = await getPendingDevices();
            setPending(d.pending || []);
            setPaired(d.paired || []);
            if (!d.pending?.length && !d.paired?.length) {
                setDevicesLog("No device requests found.");
            }
        } catch (e) {
            setDevicesLog(`Error: ${e}`);
        } finally {
            setDevicesLoading(false);
        }
    }, []);

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
        try {
            const r = await approveDevice(id);
            setDevicesLog(r.output || "Approved.");
            refreshDevices();
        } catch (e) {
            setDevicesLog(`Error: ${e}`);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-8 py-6 w-full space-y-8">
            {/* Channel pairing */}
            <Section title="Channel pairing" description="Approve a pairing request from Telegram or Discord.">
                <Card>
                    <CardContent>
                        <PairingForm onLog={(msg) => setPairingLog((p) => (p ? p + "\n" : "") + msg)} />
                    </CardContent>
                </Card>
                {pairingLog && (
                    <pre className="mt-3 rounded-md border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-foreground/80">
                        {pairingLog}
                    </pre>
                )}
            </Section>

            {/* Device pairing */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold tracking-tight">Device pairing</h2>
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
                                <PendingDeviceRow key={d.requestId} device={d} onApprove={handleApproveDevice} />
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
                                <PairedDeviceRow key={d.device || i} device={d} />
                            ))}
                        </Card>
                    </div>
                )}

                {devicesLog && <p className="text-xs text-muted-foreground mt-2">{devicesLog}</p>}
            </div>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
