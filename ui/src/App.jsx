import { useState, useEffect, useCallback } from "react";
import LoginPage from "./components/LoginPage";
import DashboardPanel from "./components/DashboardPanel";
import ApprovalsPanel from "./components/ApprovalsPanel";
import ConsolePanel from "./components/ConsolePanel";
import ConfigPanel from "./components/ConfigPanel";
import DataPanel from "./components/DataPanel";
import { useStatus } from "./hooks/useStatus";
import { isAuthed, restoreAuth, clearAuth } from "./api";

function StatusLight({ active, loading }) {
    if (loading) {
        return (
            <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inset-0 rounded-full bg-muted-foreground/30 animate-pulse" />
            </span>
        );
    }
    return (
        <span className="relative flex h-2.5 w-2.5">
            {active && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
        </span>
    );
}

const NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "approvals", label: "Approvals" },
    { id: "terminal", label: "Terminal" },
    { id: "config", label: "Config" },
    { id: "data", label: "Data" },
];

export default function App() {
    const [authed, setAuthed] = useState(() => restoreAuth() && isAuthed());
    const [tab, setTab] = useState("dashboard");
    const [pendingPatch, setPendingPatch] = useState(null);
    const status = useStatus(authed);
    const configured = status.data?.configured;

    const navigateToConfig = useCallback((patch) => {
        setPendingPatch(patch);
        setTab("config");
    }, []);

    const navigateToData = useCallback(() => {
        setTab("data");
    }, []);

    // (no longer gating tabs on configured state)

    useEffect(() => {
        const handler = () => setAuthed(false);
        window.addEventListener("openclaw:auth_expired", handler);
        return () => window.removeEventListener("openclaw:auth_expired", handler);
    }, []);

    if (!authed) {
        return <LoginPage onLogin={() => setAuthed(true)} />;
    }

    const isFullBleed = tab === "terminal" || tab === "config";

    return (
        <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Sidebar */}
            <aside className="w-52 shrink-0 border-r border-border flex flex-col">
                <div className="h-14 flex items-center px-6 border-b border-border">
                    <span className="text-sm font-semibold tracking-tight">OpenClaw</span>
                </div>
                <nav className="flex-1 py-2 px-3 space-y-1">
                    {NAV.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={`w-full flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === item.id
                                ? "bg-accent text-accent-foreground cursor-pointer"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
                <div className="p-3 border-t border-border">
                    <button
                        onClick={() => { clearAuth(); setAuthed(false); }}
                        className="w-full flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto flex flex-col min-h-0">
                {!isFullBleed && (
                    <div className="h-14 flex items-center justify-between px-8 border-b border-border shrink-0">
                        <h2 className="text-sm font-semibold">{NAV.find((n) => n.id === tab)?.label}</h2>
                        {tab === "dashboard" && (
                            <div className="flex items-center gap-5">
                                <div className="flex items-center gap-2">
                                    <StatusLight active={configured && status.data?.gatewayReachable} loading={status.loading} />
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {status.loading
                                            ? "Connecting..."
                                            : !configured
                                                ? "Not configured"
                                                : status.data?.gatewayReachable
                                                    ? "Running"
                                                    : "Unhealthy"}
                                    </span>
                                </div>
                                {configured && status.data?.openclawVersion && status.data.openclawVersion.length <= 50 && (
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                                        {status.data.openclawVersion}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {tab === "terminal" ? (
                    <ConsolePanel />
                ) : tab === "config" ? (
                    <ConfigPanel pendingPatch={pendingPatch} onPatchConsumed={() => setPendingPatch(null)} />
                ) : tab === "approvals" ? (
                    <ApprovalsPanel />
                ) : tab === "data" ? (
                    <DataPanel status={status} />
                ) : (
                    <div className="max-w-3xl mx-auto px-8 py-6 w-full">
                        <DashboardPanel status={status} onNavigateConfig={navigateToConfig} onNavigateData={navigateToData} />
                    </div>
                )}
            </main>
        </div>
    );
}
