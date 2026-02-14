import { useState, useEffect, useCallback } from "react";
import { Section, Card, CardContent, Button, Input, Select, Label, LogOutput, Separator } from "./ui";
import RichSelect from "./RichSelect";
import ConfirmDialog from "./ConfirmDialog";
import { getAuthGroups, runSetup, resetSetup } from "../api";

function isInteractiveOAuth(value, label) {
    return /OAuth/i.test(label) || /cli|codex|portal/i.test(value);
}

export default function SetupPanel({ status }) {
    const [groups, setGroups] = useState([]);
    const [group, setGroup] = useState("");
    const [authChoice, setAuthChoice] = useState("");
    const [authSecret, setAuthSecret] = useState("");
    const [flow, setFlow] = useState("quickstart");
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Channels
    const [telegramToken, setTelegramToken] = useState("");
    const [discordToken, setDiscordToken] = useState("");
    const [slackBotToken, setSlackBotToken] = useState("");
    const [slackAppToken, setSlackAppToken] = useState("");

    // Custom provider
    const [customId, setCustomId] = useState("");
    const [customUrl, setCustomUrl] = useState("");
    const [customApi, setCustomApi] = useState("openai-completions");
    const [customKeyEnv, setCustomKeyEnv] = useState("");
    const [customModel, setCustomModel] = useState("");

    const [log, setLog] = useState("");
    const [running, setRunning] = useState(false);

    // Confirm dialog state
    const [dialog, setDialog] = useState(null);
    const showConfirm = useCallback((opts) => new Promise((resolve) => {
        setDialog({ ...opts, onConfirm: () => { setDialog(null); resolve(true); }, onCancel: () => { setDialog(null); resolve(false); } });
    }), []);

    useEffect(() => {
        getAuthGroups().then((d) => {
            const g = d.authGroups || [];
            setGroups(g);
            if (g.length) setGroup(g[0].value);
        }).catch(() => { });
    }, []);

    const currentGroup = groups.find((g) => g.value === group);
    const options = (currentGroup?.options || []).filter(
        (o) => showAdvanced || !isInteractiveOAuth(o.value, o.label)
    );

    useEffect(() => {
        if (options.length && !options.find((o) => o.value === authChoice)) {
            const nonInteractive = options.find((o) => !isInteractiveOAuth(o.value, o.label));
            setAuthChoice(nonInteractive?.value || options[0]?.value || "");
        }
    }, [group, showAdvanced]);

    const handleRun = async () => {
        setRunning(true);
        setLog("Running setup...\n");
        try {
            const res = await runSetup({
                flow, authChoice, authSecret,
                telegramToken, discordToken, slackBotToken, slackAppToken,
                customProviderId: customId, customProviderBaseUrl: customUrl,
                customProviderApi: customApi, customProviderApiKeyEnv: customKeyEnv,
                customProviderModelId: customModel,
            });
            setLog((p) => p + (res.output || JSON.stringify(res, null, 2)));
            status.refresh();
        } catch (e) {
            setLog((p) => p + `Error: ${e}\n`);
        } finally {
            setRunning(false);
        }
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

    // Build provider group options with descriptions for RichSelect
    const providerOptions = groups.map((g) => ({
        value: g.value,
        label: g.label,
        description: g.hint || undefined,
    }));

    // Build auth method options with descriptions
    const authOptions = options.map((o) => ({
        value: o.value,
        label: o.label,
        description: isInteractiveOAuth(o.value, o.label) ? "Interactive OAuth" : undefined,
    }));

    return (
        <div className="space-y-6">
            <Section title="Model / Auth provider" description="Select your AI provider and authentication method.">
                <Card>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Provider group</Label>
                            <RichSelect
                                value={group}
                                onChange={setGroup}
                                options={providerOptions}
                                placeholder="Select provider..."
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Auth method</Label>
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                                    <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} className="rounded accent-neutral-900" />
                                    Show OAuth options
                                </label>
                            </div>
                            <RichSelect
                                value={authChoice}
                                onChange={setAuthChoice}
                                options={authOptions}
                                placeholder="Select auth method..."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Key / Token</Label>
                            <Input type="password" value={authSecret} onChange={(e) => setAuthSecret(e.target.value)} placeholder="Paste API key or token" className="font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label>Wizard flow</Label>
                            <RichSelect
                                value={flow}
                                onChange={setFlow}
                                options={[
                                    { value: "quickstart", label: "Quickstart", description: "Fastest path to get running" },
                                    { value: "advanced", label: "Advanced", description: "More configuration options" },
                                    { value: "manual", label: "Manual", description: "Full control over every setting" },
                                ]}
                            />
                        </div>
                    </CardContent>
                </Card>
            </Section>

            <Section title="Channels" description="Optional — configure messaging integrations.">
                <Card>
                    <CardContent className="space-y-4">
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
                    </CardContent>
                </Card>
            </Section>

            <Section title="Custom provider" description="OpenAI-compatible endpoint (Ollama, vLLM, etc).">
                <Card>
                    <CardContent className="space-y-4">
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
                                <RichSelect
                                    value={customApi}
                                    onChange={setCustomApi}
                                    options={[
                                        { value: "openai-completions", label: "openai-completions", description: "Chat Completions API" },
                                        { value: "openai-responses", label: "openai-responses", description: "Responses API" },
                                    ]}
                                />
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
                    </CardContent>
                </Card>
            </Section>

            <Separator />

            <div className="flex items-center gap-2">
                <Button onClick={handleRun} disabled={running}>
                    {running ? "Running..." : "Run setup"}
                </Button>
                <Button variant="ghost" onClick={handleReset}>Reset</Button>
            </div>
            <LogOutput>{log}</LogOutput>

            {dialog && <ConfirmDialog open {...dialog} />}
        </div>
    );
}
