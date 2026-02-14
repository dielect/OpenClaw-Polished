import { useState, useRef, useCallback } from "react";
import { Section, Card, CardContent, Button } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { importBackup, exportBackup } from "../api";

export default function DataPanel({ status }) {
    const { data } = status;
    const configured = data?.configured;

    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importLog, setImportLog] = useState("");
    const fileRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showAlert = useCallback((title, description) => new Promise((resolve) => {
        setDialog({ title, description, alertOnly: true, onCancel: () => { setDialog(null); resolve(); } });
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

    return (
        <div className="max-w-3xl mx-auto px-8 py-6 w-full space-y-8">
            {/* Export */}
            <Section title="Export backup" description="Download a .tar.gz archive of your /data directory.">
                <Card>
                    <CardContent className="flex items-center gap-4">
                        <Button onClick={handleExport} disabled={exporting || !configured} size="sm">
                            <span className="text-base">📦</span>
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
                            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80 file:cursor-pointer"
                        />
                        <div>
                            <Button variant="destructive" size="sm" onClick={handleImport} disabled={importing}>
                                <span className="text-base">📥</span>
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

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}

