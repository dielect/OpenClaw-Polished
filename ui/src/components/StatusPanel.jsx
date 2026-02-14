import { useState, useRef, useCallback } from "react";
import { Section, Card, CardRow, Button, Badge, LogOutput, Code } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { importBackup, exportBackup } from "../api";

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
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".tar.gz,application/gzip"
                        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80 file:cursor-pointer"
                    />
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

export default function StatusPanel({ status }) {
    const { data, error, loading, refresh } = status;
    const [exporting, setExporting] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // Alert dialog state
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
        <div className="space-y-6">
            <Section title="Overview">
                <Card>
                    <CardRow label="State" description={loading ? "Loading..." : error || undefined}>
                        {loading ? (
                            <Badge variant="secondary">...</Badge>
                        ) : data?.configured ? (
                            <Badge variant="success">Configured</Badge>
                        ) : (
                            <Badge variant="outline">Not configured</Badge>
                        )}
                    </CardRow>
                    {data?.openclawVersion && (
                        data.openclawVersion.length > 50 ? (
                            <CardRow label="Version" description="Error retrieving version">
                                <Badge variant="outline">Error</Badge>
                            </CardRow>
                        ) : (
                            <CardRow label="Version">
                                <span className="text-xs font-mono max-w-[200px] truncate block text-right" title={data.openclawVersion}>
                                    {data.openclawVersion}
                                </span>
                            </CardRow>
                        )
                    )}
                    {data?.gatewayTarget && (
                        <CardRow label="Gateway">
                            <Code>{data.gatewayTarget}</Code>
                        </CardRow>
                    )}
                </Card>
            </Section>

            <Section title="Quick links">
                <Card>
                    <CardRow label="OpenClaw UI" description={data?.configured ? "Open the main interface" : "Run setup first to enable"}>
                        {data?.configured ? (
                            <a href={`/openclaw#token=${encodeURIComponent(data?.gatewayToken || "")}`} target="_blank" className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors">
                                Open
                            </a>
                        ) : (
                            <span className="text-sm text-muted-foreground">Not available</span>
                        )}
                    </CardRow>
                    <CardRow label="Export backup" description="Download a .tar.gz of your data">
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {exporting ? "Downloading..." : "Download"}
                        </button>
                    </CardRow>
                    <CardRow label="Import backup" description="Restore from a .tar.gz file">
                        <button
                            onClick={() => setShowImport(true)}
                            className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors cursor-pointer"
                        >
                            Import
                        </button>
                    </CardRow>
                </Card>
            </Section>

            <div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                </Button>
            </div>

            <ImportDialog open={showImport} onClose={() => setShowImport(false)} onDone={refresh} />
            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
