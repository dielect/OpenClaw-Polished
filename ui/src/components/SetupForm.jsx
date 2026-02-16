import { useState, useEffect, useCallback, useRef } from "react";
import { Section, Card, CardContent, Button, Input, Label, LogOutput, Separator } from "./ui";
import RichSelect from "./RichSelect";
import ConfirmDialog from "./ConfirmDialog";
import { getAuthGroups, runSetupStream, resetSetup } from "../api";

export default function SetupForm({ status }) {
    const [groups, setGroups] = useState([]);
    const [apiKeyChoices, setApiKeyChoices] = useState(new Set());
    const [group, setGroup] = useState("");
    const [authChoice, setAuthChoice] = useState("");
    const [authSecret, setAuthSecret] = useState("");
    const [flow, setFlow] = useState("quickstart");

    const [telegramToken, setTelegramToken] = useState("");
    const [discordToken, setDiscordToken] = useState("");
    const [slackBotToken, setSlackBotToken] = useState("");
    const [slackAppToken, setSlackAppToken] = useState("");

    const [customId, setCustomId] = useState("");
    const [customUrl, setCustomUrl] = useState("");
    const [customApi, setCustomApi] = useState("openai-completions");
    const [customKeyEnv, setCustomKeyEnv] = useState("");
    const [customModel, setCustomModel] = useState("");

    const [log, setLog] = useState("");
    const [running, setRunning] = useState(false);
    const [steps, setSteps] = useState([]); // { label, status: 'running'|'done'|'failed' }
    const [setupDone, setSetupDone] = useState(false);
    const abortRef = useRef(null);

    const [dialog, setDialog] = useState(null);
    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    useEffect(() => {
        getAuthGroups().then((d) => {
            const g = d.authGroups || [];
            setGroups(g);
            setApiKeyChoices(new Set(d.apiKeyChoices || []));
            if (g.length) setGroup(g[0].value);
        }).catch(() => { });
    }, []);

    const currentGroup = groups.find((g) => g.value === group);
    const options = currentGroup?.options || [];

    useEffect(() => {
        if (options.length && !options.find((o) => o.value === authChoice && apiKeyChoices.has(o.value))) {
            const enabled = options.find((o) => apiKeyChoices.has(o.value));
            setAuthChoice(enabled?.value || "");
        }
    }, [group, apiKeyChoices]);

    const handleRun = () => {
        setRunning(true);
        setLog("");
        setSteps([]);

        const abort = runSetupStream(
            {
                flow, authChoice, authSecret,
                telegramToken, discordToken, slackBotToken, slackAppToken,
                customProviderId: customId, customProviderBaseUrl: customUrl,
                customProviderApi: customApi, customProviderApiKeyEnv: customKeyEnv,
                customProviderModelId: customModel,
            },
            {
                onStep: ({ label }) => {
                    setSteps((prev) => [...prev, { label, status: "running" }]);
                },
                onStepDone: ({ label, ok }) => {
                    setSteps((prev) =>
                        prev.map((s) => s.label === label ? { ...s, status: ok ? "done" : "failed" } : s)
                    );
                },
                onLog: ({ text }) => {
                    setLog((p) => p + text);
                },
                onDone: ({ ok, output }) => {
                    if (output) setLog((p) => p + (p ? "\n" : "") + output);
                    setRunning(false);
                    if (ok) setSetupDone(true);
                    status.refresh();
                },
                onError: (err) => {
                    setLog((p) => p + `\nError: ${err}\n`);
                    setRunning(false);
                },
            },
        );
        abortRef.current = abort;
    };

    const handleReset = async () => {
        const ok = await showConfirm({
            title: "Reset setup?",
            description: "This deletes the config file so onboarding can run again.",
            confirmLabel: "Reset",
            variant: "destructive",
        });
        if (!ok) return;
        setLog("Resetting...\n");
        try {
            const text = await resetSetup();
            setLog((p) => p + text + "\n");
            status.refresh();
        } catch (e) {
            setLog((p) => p + `Error: ${e}\n`);
        }
    };

    const providerOptions = groups.map((g) => ({
        value: g.value, label: g.label, description: g.hint || undefined,
    }));

    const authOptions = options.map((o) => ({
        value: o.value, label: o.label,
        description: o.hint || (!apiKeyChoices.has(o.value) ? "Interactive (not supported here)" : undefined),
        disabled: !apiKeyChoices.has(o.value),
    }));

    const [showCustom, setShowCustom] = useState(false);
    const [showChannels, setShowChannels] = useState(false);

    return (
        <div className="space-y-6">
            <Section title="Model / Auth provider" description="Select your AI provider and authentication method.">
                <Card>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Provider group</Label>
                            <RichSelect value={group} onChange={setGroup} options={providerOptions} placeholder="Select provider..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Auth method</Label>
                            <RichSelect value={authChoice} onChange={setAuthChoice} options={authOptions} placeholder="Select auth method..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Key / Token</Label>
                            <Input type="password" value={authSecret} onChange={(e) => setAuthSecret(e.target.value)} placeholder="Paste API key or token" className="font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label>Wizard flow</Label>
                            <div className="flex rounded-md border border-input overflow-hidden w-fit">
                                {[
                                    { value: "quickstart", label: "Quickstart" },
                                    { value: "advanced", label: "Advanced" },
                                    { value: "manual", label: "Manual" },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setFlow(opt.value)}
                                        className={`px-3 py-1.5 text-sm transition-colors cursor-pointer ${flow === opt.value
                                            ? "bg-primary text-primary-foreground font-medium"
                                            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Separator />

                        <button
                            type="button"
                            onClick={() => setShowCustom((v) => !v)}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <span className={`text-xs transition-transform ${showCustom ? "rotate-90" : ""}`}>▶</span>
                            Custom provider (Ollama, vLLM, etc.)
                        </button>
                        {showCustom && (
                            <div className="space-y-4 pl-4 border-l-2 border-border">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Provider ID</Label>
                                        <Input value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="ollama" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Base URL</Label>
                                        <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="http://host:11434/v1" className="font-mono" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>API</Label>
                                        <RichSelect value={customApi} onChange={setCustomApi} options={[
                                            { value: "openai-completions", label: "openai-completions", description: "Chat Completions API" },
                                            { value: "openai-responses", label: "openai-responses", description: "Responses API" },
                                            { value: "anthropic-messages", label: "anthropic-messages", description: "Anthropic Messages API" },
                                        ]} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>API key env var</Label>
                                        <Input value={customKeyEnv} onChange={(e) => setCustomKeyEnv(e.target.value)} placeholder="OLLAMA_API_KEY" className="font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Model ID</Label>
                                    <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="llama3.1:8b" className="font-mono" />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </Section>

            <Section
                title={<span>Channels <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span></span>}
                description="Configure messaging integrations. You can skip this and add them later."
            >
                <Card>
                    <CardContent>
                        <button
                            type="button"
                            onClick={() => setShowChannels((v) => !v)}
                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <span className={`text-xs transition-transform ${showChannels ? "rotate-90" : ""}`}>▶</span>
                            {showChannels ? "Hide channel settings" : "Configure Telegram, Discord, or Slack"}
                        </button>
                        {showChannels && (
                            <div className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label>Telegram bot token</Label>
                                    <Input type="password" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder="123456:ABC..." className="font-mono" />
                                    <p className="text-xs text-muted-foreground">Get from @BotFather on Telegram.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Discord bot token</Label>
                                    <Input type="password" value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} placeholder="Bot token" className="font-mono" />
                                    <p className="text-xs text-muted-foreground">Enable MESSAGE CONTENT INTENT in Bot settings.</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Slack bot token</Label>
                                    <Input type="password" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} placeholder="xoxb-..." className="font-mono" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Slack app token</Label>
                                    <Input type="password" value={slackAppToken} onChange={(e) => setSlackAppToken(e.target.value)} placeholder="xapp-..." className="font-mono" />
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </Section>

            <Separator />

            <div className="flex items-center justify-end gap-2">
                {!status.data?.configured && (
                    <Button onClick={handleRun} disabled={running}>
                        {running ? "Running..." : "Run setup"}
                    </Button>
                )}
                {status.data?.configured && (
                    <Button onClick={handleReset}>Reset</Button>
                )}
            </div>

            {steps.length > 0 && !setupDone && (
                <div className="space-y-1.5">
                    {steps.map((s) => (
                        <div key={s.label} className="flex items-center gap-2 text-sm">
                            {s.status === "running" && <span className="text-foreground animate-pulse">●</span>}
                            {s.status === "done" && <span className="text-emerald-500">✓</span>}
                            {s.status === "failed" && <span className="text-red-500">✗</span>}
                            <span className={s.status === "running" ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {!setupDone && <LogOutput>{log}</LogOutput>}

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
