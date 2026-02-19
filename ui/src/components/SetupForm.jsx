import { useState, useEffect, useCallback, useRef } from "react";
import { Section, Card, CardContent, Button, Input, Label, LogOutput, Separator } from "./ui";
import RichSelect from "./RichSelect";
import ConfirmDialog from "./ConfirmDialog";
import { getAuthGroups, runSetupStream, resetSetup } from "../api";

/* ── Horizontal Progress Stepper ── */
function StepNode({ status }) {
    const base = "flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all duration-300 shrink-0";
    if (status === "done") return (
        <span className={`${base} bg-foreground text-background`}>
            <svg width="8" height="8" viewBox="0 0 14 14" fill="none"><path d="M3 7.5L5.5 10L11 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
    );
    if (status === "failed") return (
        <span className={`${base} bg-foreground text-background`}>
            <svg width="8" height="8" viewBox="0 0 14 14" fill="none"><path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        </span>
    );
    if (status === "running") return (
        <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0">
            <span className="absolute inset-[-3px] rounded-full border border-foreground/20 animate-ping" />
            <span className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
        </span>
    );
    // pending
    return <span className={`${base} border-2 border-border`} />;
}

function SetupStepper({ steps, log, stepperRef }) {
    const [showLog, setShowLog] = useState(false);
    const n = steps.length;
    // find the currently active step for the label below
    const activeIdx = steps.findIndex((s) => s.status === "running");
    const activeStep = activeIdx >= 0 ? steps[activeIdx] : null;

    return (
        <Card>
            <div ref={stepperRef} />
            <CardContent className="py-6">
                {/* nodes row — circles with gap lines between them */}
                <div className="flex items-center">
                    {steps.map((s, i) => (
                        <div key={s.label} className={`flex items-center ${i < n - 1 ? "flex-1" : ""}`}>
                            {/* node with tooltip */}
                            <div className="relative group">
                                <StepNode status={s.status} />
                                {/* tooltip on hover */}
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 rounded bg-foreground text-background text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    {s.label}
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-foreground" />
                                </div>
                            </div>
                            {/* connector line with gap from circles */}
                            {i < n - 1 && (
                                <div className="flex-1 mx-2.5 h-px bg-border relative overflow-hidden">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-foreground transition-all duration-500"
                                        style={{ width: s.status === "done" ? "100%" : "0%" }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* single active step label centered below */}
                <div className="mt-3 text-center h-5">
                    {activeStep && (
                        <span className="text-xs text-muted-foreground animate-pulse">
                            {activeStep.label}…
                        </span>
                    )}
                    {!activeStep && steps.length > 0 && steps.every((s) => s.status === "done") && (
                        <span className="text-xs text-muted-foreground">All steps completed</span>
                    )}
                    {!activeStep && steps.some((s) => s.status === "failed") && (
                        <span className="text-xs text-muted-foreground">Setup encountered an error</span>
                    )}
                </div>

                {/* collapsible log */}
                {log && (
                    <div className="mt-4 pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={() => setShowLog((v) => !v)}
                            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <span className={`transition-transform ${showLog ? "rotate-90" : ""}`}>▶</span>
                            {showLog ? "Hide logs" : "Show logs"}
                        </button>
                        {showLog && <LogOutput>{log}</LogOutput>}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

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
    const stepperRef = useRef(null);

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

    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (steps.length > 0) {
            stepperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, [steps]);

    const handleRun = () => {
        const e = {};
        if (!authChoice) e.authChoice = "Please select an auth method.";
        if (!authSecret.trim()) e.authSecret = "Please enter your API key or token.";
        if (Object.keys(e).length) { setErrors(e); return; }
        setErrors({});

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
                onPlan: ({ steps: planSteps }) => {
                    setSteps(planSteps.map((label) => ({ label, status: "pending" })));
                },
                onStep: ({ label }) => {
                    setSteps((prev) => {
                        // If already in plan, just mark running
                        if (prev.find((s) => s.label === label)) {
                            return prev.map((s) => s.label === label ? { ...s, status: "running" } : s);
                        }
                        return [...prev, { label, status: "running" }];
                    });
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
                    <CardContent className="space-y-6">
                        <div className="space-y-2.5">
                            <Label>Provider group</Label>
                            <RichSelect value={group} onChange={setGroup} options={providerOptions} placeholder="Select provider..." />
                        </div>
                        <div className="space-y-2.5">
                            <Label>Auth method</Label>
                            <RichSelect value={authChoice} onChange={(v) => { setAuthChoice(v); setErrors((p) => ({ ...p, authChoice: undefined })); }} options={authOptions} placeholder="Select auth method..." />
                            {errors.authChoice && <p className="text-xs text-destructive">{errors.authChoice}</p>}
                        </div>
                        <div className="space-y-2.5">
                            <Label>Key / Token</Label>
                            <Input type="password" value={authSecret} onChange={(e) => { setAuthSecret(e.target.value); setErrors((p) => ({ ...p, authSecret: undefined })); }} placeholder="Paste API key or token" className="font-mono" error={!!errors.authSecret} />
                            {errors.authSecret && <p className="text-xs text-destructive">{errors.authSecret}</p>}
                        </div>
                        <div className="space-y-2.5">
                            <Label>Wizard flow</Label>
                            <div className="flex rounded-lg border border-input overflow-hidden w-fit">
                                {[
                                    { value: "quickstart", label: "Quickstart" },
                                    { value: "advanced", label: "Advanced" },
                                    { value: "manual", label: "Manual" },
                                ].map((opt) => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setFlow(opt.value)}
                                        className={`px-4 py-2 text-sm transition-all cursor-pointer ${flow === opt.value
                                            ? "bg-accent text-foreground font-medium"
                                            : "bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground"
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
                            <div className="space-y-5 pl-4 border-l-2 border-border">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2.5">
                                        <Label>Provider ID</Label>
                                        <Input value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="ollama" />
                                    </div>
                                    <div className="space-y-2.5">
                                        <Label>Base URL</Label>
                                        <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="http://host:11434/v1" className="font-mono" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2.5">
                                        <Label>API</Label>
                                        <RichSelect value={customApi} onChange={setCustomApi} options={[
                                            { value: "openai-completions", label: "openai-completions", description: "Chat Completions API" },
                                            { value: "openai-responses", label: "openai-responses", description: "Responses API" },
                                            { value: "anthropic-messages", label: "anthropic-messages", description: "Anthropic Messages API" },
                                        ]} />
                                    </div>
                                    <div className="space-y-2.5">
                                        <Label>API key env var</Label>
                                        <Input value={customKeyEnv} onChange={(e) => setCustomKeyEnv(e.target.value)} placeholder="OLLAMA_API_KEY" className="font-mono" />
                                    </div>
                                </div>
                                <div className="space-y-2.5">
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
                            <div className="space-y-5 mt-4">
                                <div className="space-y-2.5">
                                    <Label>Telegram bot token</Label>
                                    <Input type="password" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder="123456:ABC..." className="font-mono" />
                                    <p className="text-xs text-muted-foreground">Get from @BotFather on Telegram.</p>
                                </div>
                                <div className="space-y-2.5">
                                    <Label>Discord bot token</Label>
                                    <Input type="password" value={discordToken} onChange={(e) => setDiscordToken(e.target.value)} placeholder="Bot token" className="font-mono" />
                                    <p className="text-xs text-muted-foreground">Enable MESSAGE CONTENT INTENT in Bot settings.</p>
                                </div>
                                <div className="space-y-2.5">
                                    <Label>Slack bot token</Label>
                                    <Input type="password" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} placeholder="xoxb-..." className="font-mono" />
                                </div>
                                <div className="space-y-2.5">
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
                <SetupStepper steps={steps} log={log} stepperRef={stepperRef} />
            )}

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
