import { useState } from "react";
import { Section, Card, CardContent, Button, Input, LogOutput } from "./ui";
import Combobox from "./Combobox";
import { runConsoleCmd } from "../api";

const COMMANDS = [
    { value: "gateway.restart", label: "gateway.restart", description: "Restart the wrapper-managed gateway" },
    { value: "gateway.stop", label: "gateway.stop", description: "Stop the gateway process" },
    { value: "gateway.start", label: "gateway.start", description: "Start the gateway if stopped" },
    { value: "openclaw.status", label: "openclaw status", description: "Show current status" },
    { value: "openclaw.health", label: "openclaw health", description: "Run health check" },
    { value: "openclaw.doctor", label: "openclaw doctor", description: "Diagnose common issues" },
    { value: "openclaw.logs.tail", label: "openclaw logs --tail N", description: "Show recent log lines (arg: count)" },
    { value: "openclaw.config.get", label: "openclaw config get", description: "Read a config value (arg: path)" },
    { value: "openclaw.version", label: "openclaw --version", description: "Show OpenClaw version" },
    { value: "openclaw.devices.list", label: "openclaw devices list", description: "List pending device requests" },
    { value: "openclaw.devices.approve", label: "openclaw devices approve", description: "Approve a device (arg: requestId)" },
    { value: "openclaw.plugins.list", label: "openclaw plugins list", description: "List available plugins" },
    { value: "openclaw.plugins.enable", label: "openclaw plugins enable", description: "Enable a plugin (arg: name)" },
];

export default function ConsolePanel() {
    const [cmd, setCmd] = useState(COMMANDS[0].value);
    const [arg, setArg] = useState("");
    const [output, setOutput] = useState("");
    const [running, setRunning] = useState(false);

    const handleRun = async () => {
        setRunning(true);
        setOutput(`Running ${cmd}...\n`);
        try {
            const r = await runConsoleCmd(cmd, arg);
            setOutput(r.output || JSON.stringify(r, null, 2));
        } catch (e) {
            setOutput((p) => p + `Error: ${e}\n`);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="space-y-6">
            <Section title="Debug console" description="Run allowlisted commands for debugging and recovery.">
                <Card>
                    <CardContent className="space-y-3">
                        <div className="flex items-end gap-2">
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm font-medium">Command</label>
                                <Combobox
                                    value={cmd}
                                    onChange={setCmd}
                                    options={COMMANDS}
                                    placeholder="Search commands..."
                                />
                            </div>
                            <div className="flex-1 space-y-1.5">
                                <label className="text-sm font-medium">Argument</label>
                                <Input
                                    value={arg}
                                    onChange={(e) => setArg(e.target.value)}
                                    placeholder="Optional (e.g. 200, gateway.port)"
                                />
                            </div>
                            <Button size="sm" onClick={handleRun} disabled={running} className="shrink-0">
                                {running ? "..." : "Run"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                <LogOutput>{output}</LogOutput>
            </Section>
        </div>
    );
}
