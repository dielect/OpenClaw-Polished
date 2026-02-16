import { useState } from "react";
import Lottie from "lottie-react";
import lobsterAnimation from "../assets/lobster.json";
import SetupForm from "./SetupForm";


/* ── Quick-action card (big clickable tile) ── */
function ActionCard({ icon, title, description, onClick, disabled, href }) {
    const cls = `group relative flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-8 transition-all
        ${disabled
            ? "opacity-40 cursor-not-allowed"
            : "cursor-pointer hover:border-foreground/20 hover:shadow-md hover:-translate-y-0.5"}`;

    if (href && !disabled) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
                <span className="text-3xl">{icon}</span>
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted-foreground text-center">{description}</span>
            </a>
        );
    }
    return (
        <button type="button" onClick={disabled ? undefined : onClick} className={cls}>
            <span className="text-3xl">{icon}</span>
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-xs text-muted-foreground text-center">{description}</span>
        </button>
    );
}


/* ── Quick patch preset ── */
const QUICK_PATCHES = [
    {
        icon: "🔧",
        title: "Add provider",
        description: "Insert a new provider template",
        patch: {
            op: "append",
            path: "providers",
            value: { name: "new-provider", baseURL: "https://api.example.com/v1", apiKey: "sk-xxx", models: ["model-name"] },
        },
    },
    {
        icon: "📡",
        title: "Add channel",
        description: "Insert a new channel template",
        patch: {
            op: "append",
            path: "channels",
            value: { type: "telegram", token: "BOT_TOKEN_HERE" },
        },
    },
    {
        icon: "🔌",
        title: "Enable plugin",
        description: "Add a plugin entry to the config",
        patch: {
            op: "merge",
            path: "plugins",
            value: { "plugin-name": { enabled: true } },
        },
    },
];

/* ── Main Setup ── */
export default function SetupPanel({ status, onNavigateConfig }) {
    const { data, error, loading } = status;
    const configured = data?.configured;

    const [showSetup, setShowSetup] = useState(false);

    /* First load — show Lottie animation instead of skeleton */
    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Lottie animationData={lobsterAnimation} loop autoplay style={{ width: 200, height: 200 }} />
                <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {/* ── Configured: action cards ── */}
            {configured && (
                <div className="grid grid-cols-2 gap-4">
                    <ActionCard
                        icon="🚀"
                        title="OpenClaw UI"
                        description="Open the main interface"
                        href={`/openclaw?token=${encodeURIComponent(data?.gatewayToken || "")}`}
                    />
                    <ActionCard
                        icon="⚙️"
                        title={showSetup ? "Hide setup" : "Reconfigure"}
                        description={showSetup ? "Collapse the setup form" : "Change provider, channels, or reset"}
                        onClick={() => setShowSetup((v) => !v)}
                    />
                </div>
            )}

            {/* ── Quick config patches ── */}
            {configured && (
                <div>
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick config</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {QUICK_PATCHES.map((p) => (
                            <button
                                key={p.title}
                                type="button"
                                onClick={() => onNavigateConfig(p.patch)}
                                className="flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-center transition-all hover:border-foreground/20 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer"
                            >
                                <span className="text-xl">{p.icon}</span>
                                <span className="text-xs font-semibold">{p.title}</span>
                                <span className="text-[11px] text-muted-foreground leading-tight">{p.description}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Not configured OR reconfigure: setup form ── */}
            {(!configured || showSetup) && (
                <div>
                    {configured && (
                        <div className="mb-4 h-px bg-border" />
                    )}
                    <SetupForm status={status} />
                </div>
            )}


        </div>
    );
}
