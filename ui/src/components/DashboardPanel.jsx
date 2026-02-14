import { useState, useRef, useCallback, useEffect } from "react";
import { Button, Card, CardContent, LogOutput } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import SetupForm from "./SetupForm";
import { importBackup, exportBackup } from "../api";


/* ── Quick-action card (big clickable tile) ── */
function ActionCard({ icon, title, description, onClick, disabled, href }) {
    const cls = `group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-8 transition-all
        ${disabled
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5"}`;

    if (href && !disabled) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                <span className="text-3xl">{icon}</span>
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground text-center">{description}</span>
            </a>
        );
    }
    return (
        <button type="button" onClick={disabled ? undefined : onClick} className={cls}>
            <span className="text-3xl">{icon}</span>
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-xs text-muted-foreground text-center">{description}</span>
        </button>
    );
}

/* ── Data dropdown menu (export / import) ── */
function DataMenu({ onExport, onImport, exporting }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
            >
                <span>📁</span> Data
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="opacity-50">
                    <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <div className="absolute right-0 mt-1 w-44 rounded-md border border-border bg-card shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95">
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onExport(); }}
                        disabled={exporting}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
                    >
                        <span className="text-base">📦</span>
                        {exporting ? "Exporting..." : "Export backup"}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onImport(); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
                    >
                        <span className="text-base">📥</span>
                        Import backup
                    </button>
                </div>
            )}
        </div>
    );
}

/* ── Import dialog ── */
function ImportDialog({ open, onClose, onDone }) {
    const fileRef = useRef(null);
    const [importing, setImporting] = useState(false);
    const [log, setLog] = useState("");

    const handleImport = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) return;
        setImporting(true);
        setLog(`Uploading ${file.name} (${file.size} bytes)...\n`);
        try {
            const text = await importBackup(file);
            setLog((p) => p + text + "\n");
            onDone?.();
        } catch (e) {
            setLog((p) => p + `Error: ${e}\n`);
        } finally {
            setImporting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50" onClick={!importing ? onClose : undefined} />
            <div className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
                <h3 className="text-base font-semibold leading-none tracking-tight">Import backup</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Select a .tar.gz file. This overwrites files under /data and restarts the gateway.
                </p>
                <div className="mt-4">
                    <input ref={fileRef} type="file" accept=".tar.gz,application/gzip"
                        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80 file:cursor-pointer" />
                </div>
                {log && (
                    <pre className="mt-3 rounded-md border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-foreground/80">
                        {log}
                    </pre>
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
                        {log && !importing ? "Close" : "Cancel"}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleImport} disabled={importing}>
                        {importing ? "Importing..." : "Import"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ── Quick patch preset ── */
const QUICK_PATCHES = [
    {
        icon: "🔧",
        title: "Add Provider",
        description: "Insert a new provider template",
        patch: {
            op: "append",
            path: "providers",
            value: { name: "new-provider", baseURL: "https://api.example.com/v1", apiKey: "sk-xxx", models: ["model-name"] },
        },
    },
    {
        icon: "📡",
        title: "Add Channel",
        description: "Insert a new channel template",
        patch: {
            op: "append",
            path: "channels",
            value: { type: "telegram", token: "BOT_TOKEN_HERE" },
        },
    },
    {
        icon: "🔌",
        title: "Enable Plugin",
        description: "Add a plugin entry to the config",
        patch: {
            op: "merge",
            path: "plugins",
            value: { "plugin-name": { enabled: true } },
        },
    },
];

/* ── Main Dashboard ── */
export default function DashboardPanel({ status, onNavigateConfig }) {
    const { data, error, loading, refresh } = status;
    const configured = data?.configured;

    const [exporting, setExporting] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showSetup, setShowSetup] = useState(false);

    const [dialog, setDialog] = useState(null);
    const showAlert = useCallback((title, description) => new Promise((resolve) => {
        setDialog({ title, description, alertOnly: true, onCancel: () => { setDialog(null); resolve(); } });
    }), []);

    const handleExport = async () => {
        setExporting(true);
        try { await exportBackup(); }
        catch (e) { await showAlert("Export failed", e.message); }
        finally { setExporting(false); }
    };

    return (
        <div className="space-y-10">
            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {/* ── Configured: action cards + data menu ── */}
            {configured && (
                <>
                    <div className="flex justify-end">
                        <DataMenu onExport={handleExport} onImport={() => setShowImport(true)} exporting={exporting} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 -mt-6">
                        <ActionCard
                            icon="🚀"
                            title="OpenClaw UI"
                            description="Open the main interface"
                            href="/openclaw"
                        />
                        <ActionCard
                            icon="⚙️"
                            title={showSetup ? "Hide Setup" : "Reconfigure"}
                            description={showSetup ? "Collapse the setup form" : "Change provider, channels, or reset"}
                            onClick={() => setShowSetup((v) => !v)}
                        />
                    </div>
                </>
            )}

            {/* ── Quick config patches ── */}
            {configured && (
                <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Config</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {QUICK_PATCHES.map((p) => (
                            <button
                                key={p.title}
                                type="button"
                                onClick={() => onNavigateConfig(p.patch)}
                                className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-all hover:border-foreground/20 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
                            >
                                <span className="text-xl">{p.icon}</span>
                                <span className="text-xs font-semibold">{p.title}</span>
                                <span className="text-[11px] text-muted-foreground leading-tight">{p.description}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Not configured OR reconfigure: setup form ── */}
            {(!configured || showSetup) && (
                <div>
                    {configured && (
                        <div className="mb-4 h-px bg-border" />
                    )}
                    <SetupForm status={status} />
                </div>
            )}

            {/* ── Not configured: import as alternative ── */}
            {!configured && (
                <div className="flex justify-center">
                    <button
                        onClick={() => setShowImport(true)}
                        className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors cursor-pointer"
                    >
                        Or restore from a backup
                    </button>
                </div>
            )}

            {/* ── Footer toolbar ── */}
            <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? "Refreshing..." : "↻ Refresh"}
                </Button>
            </div>

            <ImportDialog open={showImport} onClose={() => setShowImport(false)} onDone={refresh} />
            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
