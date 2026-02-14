import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Section, Card, Button, LogOutput, Code, Badge } from "./ui";
import { getConfigRaw, saveConfigRaw } from "../api";

export default function ConfigPanel() {
    const [content, setContent] = useState("");
    const [configPath, setConfigPath] = useState("");
    const [exists, setExists] = useState(false);
    const [output, setOutput] = useState("");
    const [saving, setSaving] = useState(false);
    const editorRef = useRef(null);

    const load = async () => {
        setOutput("");
        try {
            const r = await getConfigRaw();
            const raw = r.content || "";
            // Try to pretty-print if valid JSON
            try {
                const parsed = JSON.parse(raw);
                setContent(JSON.stringify(parsed, null, 2));
            } catch {
                setContent(raw);
            }
            setConfigPath(r.path || "");
            setExists(r.exists || false);
        } catch (e) {
            setOutput(`Error loading: ${e}`);
        }
    };

    useEffect(() => { load(); }, []);

    const handleFormat = () => {
        if (editorRef.current) {
            editorRef.current.getAction("editor.action.formatDocument")?.run();
        }
    };

    const handleSave = async () => {
        if (!confirm("Save config and restart gateway? A timestamped backup will be created.")) return;
        setSaving(true);
        setOutput("Saving...\n");
        try {
            const r = await saveConfigRaw(content);
            setOutput(`Saved: ${r.path || ""}\nGateway restarted.`);
        } catch (e) {
            setOutput(`Error: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    const handleEditorMount = (editor) => {
        editorRef.current = editor;
    };

    return (
        <div className="space-y-6">
            <Section
                title="Config editor"
                description="Edit the full config file on disk. Saving creates a timestamped backup and restarts the gateway."
            >
                {configPath && (
                    <div className="flex items-center gap-2 mb-3">
                        <Code>{configPath}</Code>
                        {!exists && <Badge variant="outline">not created yet</Badge>}
                    </div>
                )}
                <Card className="overflow-hidden">
                    <Editor
                        height="400px"
                        defaultLanguage="json"
                        value={content}
                        onChange={(v) => setContent(v || "")}
                        onMount={handleEditorMount}
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
                </Card>
                <div className="flex items-center gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={load}>Reload</Button>
                    <Button variant="outline" size="sm" onClick={handleFormat}>Format</Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>
                <LogOutput>{output}</LogOutput>
            </Section>
        </div>
    );
}
