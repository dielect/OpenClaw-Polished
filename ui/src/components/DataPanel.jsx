import { useState, useRef, useCallback } from "react";
import { Section, Card, CardContent, Button } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { importBackup, exportBackup, wipeVolume } from "../api";

export default function DataPanel({ status }) {
    const { data } = status;
    const configured = data?.configured;

    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [wiping, setWiping] = useState(false);
    const [importLog, setImportLog] = useState("");
    const [fileName, setFileName] = useState("");
    const fileRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showAlert = useCallback((title, description) => new Promise((resolve) => {
        setDialog({ title, description, alertOnly: true, onCancel: () => { setDialog(null); resolve(); } });
    }), []);
    const showConfirm = useCallback((title, description) => new Promise((resolve) => {
        setDialog({
            title, description, variant: "destructive", confirmLabel: "Wipe",
            onConfirm: () => { setDialog(null); resolve(true); },
            onCancel: () => { setDialog(null); resolve(false); },
        });
    }), []);

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportBackup();
        } catch (e) {
            await showAlert("Export failed", e.message);
        } finally {
            setExporting(false);
        }
    };

    const handleImport = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) return;
        setImporting(true);
        setImportLog(`Uploading ${file.name} (${file.size} bytes)...\n`);
        try {
            const text = await importBackup(file);
            setImportLog((p) => p + text + "\n");
            status.refresh?.();
        } catch (e) {
            setImportLog((p) => p + `Error: ${e}\n`);
        } finally {
            setImporting(false);
        }
    };

    const handleWipe = async () => {
        const ok = await showConfirm("Wipe /data volume", "This will permanently delete ALL data under /data and stop the gateway. This action cannot be undone.");
        if (!ok) return;
        setWiping(true);
        try {
            await wipeVolume();
            status.refresh?.();
            await showAlert("Volume wiped", "All contents under /data have been deleted. Please redeploy OpenClaw from the Railway console.");
        } catch (e) {
            await showAlert("Wipe failed", e.message);
        } finally {
            setWiping(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-8 py-6 w-full space-y-8">
            {/* Export */}
            <Section title="Export backup" description="Download a .tar.gz archive of your /data directory.">
                <Card>
                    <CardContent className="flex items-center gap-4">
                        <Button variant="outline" onClick={handleExport} disabled={exporting || !configured} size="sm">
                            {exporting ? "Exporting..." : "Export backup"}
                        </Button>
                        {!configured && (
                            <p className="text-xs text-muted-foreground">Export is available after setup is complete.</p>
                        )}
                    </CardContent>
                </Card>
            </Section>

            {/* Import */}
            <Section title="Import backup" description="Upload a .tar.gz file to restore. This overwrites files under /data and restarts the gateway.">
                <Card>
                    <CardContent className="space-y-4">
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".tar.gz,application/gzip"
                            className="hidden"
                            onChange={() => setFileName(fileRef.current?.files?.[0]?.name || "")}
                        />
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/80 cursor-pointer"
                            >
                                Choose file
                            </button>
                            <span className="text-sm text-muted-foreground">{fileName || "No file chosen"}</span>
                        </div>
                        <div>
                            <Button variant="outline" size="sm" onClick={handleImport} disabled={importing}>
                                {importing ? "Importing..." : "Import backup"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                {importLog && (
                    <pre className="mt-3 rounded-md border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-foreground/80">
                        {importLog}
                    </pre>
                )}
            </Section>

            {/* Wipe volume */}
            <Section title="Wipe /data volume" description="Permanently delete all contents under /data. The gateway will be stopped. Use this to start fresh.">
                <Card>
                    <CardContent className="flex items-center gap-4">
                        <Button variant="destructive" size="sm" onClick={handleWipe} disabled={wiping}>
                            {wiping ? "Wiping..." : "Wipe volume"}
                        </Button>
                    </CardContent>
                </Card>
            </Section>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}

