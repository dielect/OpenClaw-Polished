import { useState, useEffect, useRef, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { Button, Badge } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import { getConfigRaw, saveConfigRaw } from "../api";

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

/* Deep merge: arrays are replaced, objects are recursively merged */
function deepMerge(target, source) {
    if (source === null || source === undefined) return target;
    if (typeof source !== "object" || Array.isArray(source)) return source;
    if (typeof target !== "object" || Array.isArray(target) || target === null) {
        target = {};
    }
    const result = { ...target };
    for (const key of Object.keys(source)) {
        result[key] = deepMerge(result[key], source[key]);
    }
    return result;
}

/* Apply a patch operation to a JSON object */
function applyPatch(obj, patch) {
    if (!patch) return obj;
    const { op, path: dotPath, value } = patch;

    // Simple set at root level
    if (!dotPath) return deepMerge(obj, value);

    const keys = dotPath.split(".");
    const last = keys.pop();

    // Navigate to parent
    let parent = obj;
    for (const k of keys) {
        if (parent[k] === undefined || parent[k] === null) parent[k] = {};
        parent = parent[k];
    }

    if (op === "merge" || op === "set") {
        if (typeof value === "object" && !Array.isArray(value) && typeof parent[last] === "object" && !Array.isArray(parent[last])) {
            parent[last] = deepMerge(parent[last], value);
        } else {
            parent[last] = value;
        }
    } else if (op === "append" && Array.isArray(parent[last])) {
        parent[last] = [...parent[last], value];
    } else if (op === "delete") {
        delete parent[last];
    } else {
        // Default: set
        parent[last] = value;
    }

    return obj;
}

export default function ConfigPanel({ pendingPatch, onPatchConsumed }) {
    const [original, setOriginal] = useState("");
    const [content, setContent] = useState("");
    const [configPath, setConfigPath] = useState("");
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

    const load = async () => {
        setStatus("");
        setDiffMode(false);
        try {
            const r = await getConfigRaw();
            const raw = r.content || "";
            let formatted = raw;
            try {
                formatted = JSON.stringify(JSON.parse(raw), null, 2);
            } catch { }
            setOriginal(formatted);
            setContent(formatted);
            setConfigPath(r.path || "");
            setExists(r.exists || false);
        } catch (e) {
            setStatus(`Error loading: ${e}`);
        }
    };

    useEffect(() => { load(); }, []);

    // Apply pending patch from Setup quick actions
    const patchAppliedRef = useRef(false);
    useEffect(() => {
        if (!pendingPatch || patchAppliedRef.current) return;
        if (!content && !original) return; // wait for load
        try {
            const obj = JSON.parse(content || "{}");
            const patched = applyPatch(obj, pendingPatch);
            const formatted = JSON.stringify(patched, null, 2);
            setContent(formatted);
            patchAppliedRef.current = true;
            onPatchConsumed?.();
        } catch {
            onPatchConsumed?.();
        }
    }, [pendingPatch, content, original, onPatchConsumed]);

    // Reset patch guard when patch changes
    useEffect(() => { patchAppliedRef.current = false; }, [pendingPatch]);

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
            await saveConfigRaw(content);
            setOriginal(content);
            setDiffMode(false);
            setStatus("Saved. Gateway restarted.");
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
                        {configPath || "openclaw.json"}
                    </span>
                    {!exists && <Badge variant="outline">not found — run setup first</Badge>}
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
                    {!diffMode && exists && <Button variant="ghost" size="sm" onClick={handleFormat}>Format</Button>}
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
                        language="json"
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
                        defaultLanguage="json"
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
