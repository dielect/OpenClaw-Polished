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
    scrollbar: { vertical: "hidden", horizontal: "hidden" }
};

const FILE_DEFS = {
    config: { label: "openclaw.json", language: "json", load: getConfigRaw, save: saveConfigRaw, format: true, saveMsg: "Saved. Gateway restarted.", alwaysEditable: false },
    env: { label: ".env", language: "dotenv", load: getEnvRaw, save: saveEnvRaw, format: false, saveMsg: "Saved. Gateway restarted.", alwaysEditable: true },
};

/* ── .env autocomplete definitions ── */
const ENV_KEYS = [
    // { key: "OPENCLAW_GATEWAY_TOKEN", detail: "Gateway auth token", section: "Gateway" },
    // { key: "OPENCLAW_GATEWAY_PASSWORD", detail: "Alternative gateway auth password", section: "Gateway" },
    // { key: "OPENCLAW_STATE_DIR", detail: "State directory (default: ~/.openclaw)", section: "Gateway" },
    // { key: "OPENCLAW_CONFIG_PATH", detail: "Config file path", section: "Gateway" },
    // { key: "OPENCLAW_HOME", detail: "Home directory override", section: "Gateway" },
    // { key: "OPENCLAW_LOAD_SHELL_ENV", detail: "Import missing keys from login shell", section: "Gateway" },
    // { key: "OPENCLAW_SHELL_ENV_TIMEOUT_MS", detail: "Shell env import timeout", section: "Gateway" },
    { key: "OPENAI_API_KEY", detail: "OpenAI API key", section: "Model providers" },
    { key: "ANTHROPIC_API_KEY", detail: "Anthropic API key", section: "Model providers" },
    { key: "GEMINI_API_KEY", detail: "Google Gemini API key", section: "Model providers" },
    { key: "OPENROUTER_API_KEY", detail: "OpenRouter API key", section: "Model providers" },
    { key: "ZAI_API_KEY", detail: "ZAI API key", section: "Model providers" },
    { key: "AI_GATEWAY_API_KEY", detail: "AI Gateway API key", section: "Model providers" },
    { key: "MINIMAX_API_KEY", detail: "MiniMax API key", section: "Model providers" },
    { key: "SYNTHETIC_API_KEY", detail: "Synthetic API key", section: "Model providers" },
    { key: "GROQ_API_KEY", detail: "groq api key", section: "Model providers" },

    { key: "TELEGRAM_BOT_TOKEN", detail: "Telegram bot token", section: "Channels" },
    { key: "DISCORD_BOT_TOKEN", detail: "Discord bot token", section: "Channels" },
    { key: "SLACK_BOT_TOKEN", detail: "Slack bot token (xoxb-...)", section: "Channels" },
    { key: "SLACK_APP_TOKEN", detail: "Slack app token (xapp-...)", section: "Channels" },
    { key: "MATTERMOST_BOT_TOKEN", detail: "Mattermost bot token", section: "Channels" },
    { key: "MATTERMOST_URL", detail: "Mattermost server URL", section: "Channels" },
    { key: "ZALO_BOT_TOKEN", detail: "Zalo bot token", section: "Channels" },
    { key: "OPENCLAW_TWITCH_ACCESS_TOKEN", detail: "Twitch access token", section: "Channels" },

    { key: "BRAVE_API_KEY", detail: "Brave Search API key", section: "Tools & media" },
    { key: "PERPLEXITY_API_KEY", detail: "Perplexity API key", section: "Tools & media" },
    { key: "FIRECRAWL_API_KEY", detail: "Firecrawl API key", section: "Tools & media" },
    { key: "ELEVENLABS_API_KEY", detail: "ElevenLabs API key", section: "Tools & media" },
    { key: "XI_API_KEY", detail: "ElevenLabs alias", section: "Tools & media" },
    { key: "DEEPGRAM_API_KEY", detail: "Deepgram API key", section: "Tools & media" },
];

let _envCompletionDisposable = null;

function registerEnvLanguage(monaco) {
    // Dispose previous registration (if any) so a fresh Monaco instance gets
    // a working completion provider even after component remounts.
    if (_envCompletionDisposable) {
        _envCompletionDisposable.dispose();
        _envCompletionDisposable = null;
    }

    // Only register the language id once (idempotent in Monaco, but be explicit).
    const registered = monaco.languages.getLanguages().some((l) => l.id === "dotenv");
    if (!registered) {
        monaco.languages.register({ id: "dotenv" });

        monaco.languages.setMonarchTokensProvider("dotenv", {
            tokenizer: {
                root: [
                    [/^\s*#.*$/, "comment"],
                    [/^([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/, ["variable", "delimiter", "string"]],
                ],
            },
        });
    }

    // Re-register completion provider every time — returns a disposable.
    _envCompletionDisposable = monaco.languages.registerCompletionItemProvider("dotenv", {
        triggerCharacters: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ_'],
        provideCompletionItems(model, position) {
            const lineContent = model.getLineContent(position.lineNumber);
            const textUntilPosition = lineContent.substring(0, position.column - 1);

            if (textUntilPosition.includes("=")) return { suggestions: [] };

            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            const suggestions = ENV_KEYS.map((e) => ({
                label: e.key,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: `[${e.section}] ${e.detail}`,
                insertText: `${e.key}=`,
                range,
                sortText: `${e.section}-${e.key}`,
            }));

            return { suggestions };
        },
    });
}

export default function ConfigPanel({ fileId }) {
    const def = FILE_DEFS[fileId] || FILE_DEFS.config;
    const canAlwaysEdit = def.alwaysEditable;

    const [original, setOriginal] = useState("");
    const [content, setContent] = useState("");
    const [filePath, setFilePath] = useState("");
    const [exists, setExists] = useState(false);
    const [status, setStatus] = useState("");
    const [saving, setSaving] = useState(false);
    const [diffMode, setDiffMode] = useState(false);
    const importRef = useRef(null);
    const editorRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    const hasChanges = content !== original;
    const editable = exists || canAlwaysEdit;

    const load = useCallback(async () => {
        setStatus("");
        setDiffMode(false);
        try {
            const r = await def.load();
            const raw = r.content || "";
            let formatted = raw;
            if (def.language === "json") {
                try { formatted = JSON.stringify(JSON.parse(raw), null, 2); } catch { }
            }
            setOriginal(formatted);
            setContent(formatted);
            setFilePath(r.path || "");
            setExists(r.exists || false);
        } catch (e) {
            setStatus(`Error loading: ${e}`);
        }
    }, [def]);

    useEffect(() => { load(); }, [load]);

    const handleFormat = () => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
    };

    const handleSave = async () => {
        const ok = await showConfirm({
            title: `Save ${def.label}?`,
            description: fileId === "config"
                ? "This will save the config and restart the gateway. A timestamped backup will be created."
                : "This will save the file and restart the gateway.",
            confirmLabel: "Save",
        });
        if (!ok) return;
        setSaving(true);
        setStatus("Saving...");
        try {
            await def.save(content);
            setOriginal(content);
            setExists(true);
            setDiffMode(false);
            setStatus(def.saveMsg);
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

    const handleImportJson = () => {
        importRef.current?.click();
    };

    const onImportFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                setContent(JSON.stringify(parsed, null, 2));
                setDiffMode(true);
                setStatus("Imported — review diff and save to apply.");
            } catch (err) {
                setStatus(`Import error: invalid JSON — ${err.message}`);
            }
        };
        reader.readAsText(file);
        // Reset so the same file can be re-imported.
        e.target.value = "";
    };

    const handleEditorMount = (editor, monaco) => {
        editorRef.current = editor;
        if (fileId === "env") {
            registerEnvLanguage(monaco);
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Toolbar */}
            <div className="h-11 flex items-center justify-between px-4 border-b border-border shrink-0 bg-background">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground truncate">
                        {filePath || def.label}
                    </span>
                    {!exists && !canAlwaysEdit && <Badge variant="outline">not found</Badge>}
                    {!exists && canAlwaysEdit && <Badge variant="outline">new file</Badge>}
                    {hasChanges && <Badge variant="secondary">modified</Badge>}
                    {status && (
                        <span className={`text-xs truncate ${status.startsWith("Error") ? "text-destructive" : "text-muted-foreground"}`}>
                            — {status}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {hasChanges && editable && (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setDiffMode((v) => !v)}>
                                {diffMode ? "Editor" : "Diff"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleDiscard}>Discard</Button>
                        </>
                    )}
                    <Button variant="ghost" size="sm" onClick={load}>Reload</Button>
                    {fileId === "config" && editable && (
                        <Button variant="ghost" size="sm" onClick={handleImportJson}>Import JSON</Button>
                    )}
                    {!diffMode && editable && def.format && (
                        <Button variant="ghost" size="sm" onClick={handleFormat}>Format</Button>
                    )}
                    <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges || !editable}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            {/* Editor / Diff */}
            <div className="flex-1 min-h-0">
                {diffMode ? (
                    <DiffEditor
                        height="100%"
                        language={def.language}
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
                        defaultLanguage={def.language}
                        value={content}
                        onChange={(v) => editable && setContent(v || "")}
                        onMount={handleEditorMount}
                        options={{ ...EDITOR_OPTIONS, readOnly: !editable }}
                    />
                )}
            </div>

            {dialog && <ConfirmDialog open {...dialog} />}
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
        </div>
    );
}
