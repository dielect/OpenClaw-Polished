import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { Button, Badge } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { getConfigRaw, saveConfigRaw } from "../api";

export default function ConfigPanel() {
    const [content, setContent] = useState("");
    const [configPath, setConfigPath] = useState("");
    const [exists, setExists] = useState(false);
    const [status, setStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const editorRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    const load = async () => {
        setStatus("");
        try {
            const r = await getConfigRaw();
            const raw = r.content || "";
            try {
                const parsed = JSON.parse(raw);
                setContent(JSON.stringify(parsed, null, 2));
            } catch {
                setContent(raw);
            }
            setConfigPath(r.path || "");
            setExists(r.exists || false);
        } catch (e) {
            setStatus(`Error loading: ${e}`);
        }
    };

    useEffect(() => { load(); }, []);

    const handleFormat = () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
    };

    const handleSave = async () => {
        const ok = await showConfirm({
            title: "Save config?",
            description: "This will save the config and restart the gateway. A timestamped backup will be created.",
            confirmLabel: "Save",
        });
        if (!ok) return;
        setSaving(true);
        setStatus("Saving...");
        try {
            const r = await saveConfigRaw(content);
            setStatus(`Saved. Gateway restarted.`);
        } catch (e) {
            setStatus(`Error: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Toolbar */}
            <div className="h-11 flex items-center justify-between px-4 border-b border-border shrink-0 bg-background">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                        {configPath || "openclaw.json"}
                    </span>
                    {!exists && <Badge variant="outline">new</Badge>}
                    {status && (
                        <span className={`text-xs truncate ${status.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
                            — {status}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={load}>Reload</Button>
                    <Button variant="ghost" size="sm" onClick={handleFormat}>Format</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0">
                <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={content}
                    onChange={(v) => setContent(v || "")}
                    onMount={(editor) => { editorRef.current = editor; }}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: "'IBM Plex Mono', monospace",
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        formatOnPaste: true,
                        renderLineHighlight: "none",
                        overviewRulerLanes: 0,
                        hideCursorInOverviewRuler: true,
                        padding: { top: 12, bottom: 12 },
                    }}
                />
            </div>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
