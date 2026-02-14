import { useState, useRef } from "react";
import { Section, Card, CardRow, Button, Badge, LogOutput, Code } from "./ui";
import { importBackup, exportBackup } from "../api";

export default function StatusPanel({ status }) {
    const { data, error, loading, refresh } = status;
    const [importLog, setImportLog] = useState("");
    const [exporting, setExporting] = useState(false);
    const fileRef = useRef(null);

    const handleExport = async () => {
        setExporting(true);
        try { await exportBackup(); }
        catch (e) { alert(`Export failed: ${e.message}`); }
        finally { setExporting(false); }
    };

    const handleImport = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) return alert("Pick a .tar.gz file first");
        if (!confirm("Import backup? This overwrites files under /data and restarts the gateway.")) return;
        setImportLog(`Uploading ${file.name} (${file.size} bytes)...\n`);
        try {
            const text = await importBackup(file);
            setImportLog((p) => p + text + "\n");
            refresh();
        } catch (e) {
            setImportLog((p) => p + `Error: ${e}\n`);
        }
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
                            <a href="/openclaw" target="_blank" className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground transition-colors">
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
                </Card>
            </Section>

            <Section title="Import backup" description="Restores into /data and restarts the gateway.">
                <div className="flex items-center gap-3">
                    <input ref={fileRef} type="file" accept=".tar.gz,application/gzip" className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80 file:cursor-pointer" />
                    <Button variant="destructive" size="sm" onClick={handleImport}>Import</Button>
                </div>
                <LogOutput>{importLog}</LogOutput>
            </Section>

            <div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                </Button>
            </div>
        </div>
    );
}
