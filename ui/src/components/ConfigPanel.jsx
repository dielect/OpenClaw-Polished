import { useState, useEffect, useRef, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Button, Badge } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { getConfigRaw, saveConfigRaw, getEnvRaw, saveEnvRaw } from "../api";

const EDITOR_OPTIONS = {
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
    scrollbar: { vertical: "hidden", horizontal: "hidden" },
};

const TABS = [
    { id: "config", label: "openclaw.json", language: "json", load: getConfigRaw, save: saveConfigRaw, format: true, saveMsg: "Saved. Gateway restarted." },
    { id: "env", label: ".env", language: "plaintext", load: getEnvRaw, save: saveEnvRaw, format: false, saveMsg: "Saved." },
];

function FileEditor({ tab }) {
    const [original, setOriginal] = useState("");
    const [content, setContent] = useState("");
    const [filePath, setFilePath] = useState("");
    const [exists, setExists] = useState(false);
    const [status, setStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const [diffMode, setDiffMode] = useState(false);
    const editorRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    const hasChanges = content !== original;

    const load = useCallback(async () => {
        setStatus("");
        setDiffMode(false);
        try {
            const r = await tab.load();
            const raw = r.content || "";
            let formatted = raw;
            if (tab.language === "json") {
                try { formatted = JSON.stringify(JSON.parse(raw), null, 2); } catch { }
            }
            setOriginal(formatted);
            setContent(formatted);
            setFilePath(r.path || "");
            setExists(r.exists || false);
        } catch (e) {
            setStatus(`Error loading: ${e}`);
        }
    }, [tab]);

    useEffect(() => { load(); }, [load]);

    const handleFormat = () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
    };

    const handleSave = async () => {
        const ok = await showConfirm({
            title: `Save ${tab.label}?`,
            description: tab.id === "config"
                ? "This will save the config and restart the gateway. A timestamped backup will be created."
                : "This will save the file. A timestamped backup will be created.",
            confirmLabel: "Save",
        });
        if (!ok) return;
        setSaving(true);
        setStatus("Saving...");
        try {
            await tab.save(content);
            setOriginal(content);
            setDiffMode(false);
            setStatus(tab.saveMsg);
        } catch (e) {
            setStatus(`Error: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setContent(original);
        setDiffMode(false);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Toolbar */}
            <div className="h-11 flex items-center justify-between px-4 border-b border-border shrink-0 bg-background">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                        {filePath || tab.label}
                    </span>
                    {!exists && <Badge variant="outline">not found</Badge>}
                    {hasChanges && <Badge variant="secondary">modified</Badge>}
                    {status && (
                        <span className={`text-xs truncate ${status.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
                            — {status}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {hasChanges && exists && (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setDiffMode((v) => !v)}>
                                {diffMode ? "Editor" : "Diff"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleDiscard}>Discard</Button>
                        </>
                    )}
                    <Button variant="ghost" size="sm" onClick={load}>Reload</Button>
                    {!diffMode && exists && tab.format && (
                        <Button variant="ghost" size="sm" onClick={handleFormat}>Format</Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges || !exists}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {/* Editor / Diff */}
            <div className="flex-1 min-h-0">
                {diffMode ? (
                    <DiffEditor
                        height="100%"
                        language={tab.language}
                        original={original}
                        modified={content}
                        onMount={(editor) => {
                            const modifiedEditor = editor.getModifiedEditor();
                            modifiedEditor.onDidChangeModelContent(() => {
                                setContent(modifiedEditor.getValue());
                            });
                        }}
                        options={{
                            ...EDITOR_OPTIONS,
                            readOnly: false,
                            originalEditable: false,
                            renderSideBySide: true,
                        }}
                    />
                ) : (
                    <Editor
                        height="100%"
                        defaultLanguage={tab.language}
                        value={exists ? content : ""}
                        onChange={(v) => exists && setContent(v || "")}
                        onMount={(editor) => { editorRef.current = editor; }}
                        options={{ ...EDITOR_OPTIONS, readOnly: !exists }}
                    />
                )}
            </div>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}

export default function ConfigPanel() {
    const [activeTab, setActiveTab] = useState("config");

    return (
        <div className="flex flex-1 min-h-0">
            {/* Sidebar */}
            <div className="w-44 shrink-0 border-r border-border bg-background py-2 px-2 space-y-0.5">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={`w-full text-left rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${activeTab === t.id
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Editor area */}
            <div className="flex-1 flex flex-col min-h-0">
                <FileEditor key={activeTab} tab={TABS.find((t) => t.id === activeTab)} />
            </div>
        </div>
    );
}
