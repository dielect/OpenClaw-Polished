import Lottie from "lottie-react";
import lobsterAnimation from "../assets/lobster.json";
import SetupForm from "./SetupForm";


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

            <SetupForm status={status} />

            {/* ── Quick config patches (only when configured) ── */}
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
        </div>
    );
}
