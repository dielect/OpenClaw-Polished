import { useState, useEffect } from "react";
import LoginPage from "./components/LoginPage";
import SetupPanel from "./components/SetupPanel";
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
    { id: "setup", label: "Setup", description: "Configure gateway connection and check service health" },
    { id: "approvals", label: "Approvals", description: "Review and manage pending device approval requests" },
    { id: "terminal", label: "Terminal" },
    {
        id: "files", label: "Files Config", children: [
            { id: "file-config", label: "openclaw", ext: ".json" },
            { id: "file-env", label: "env", ext: ".env" },
        ]
    },
    { id: "data", label: "Backup & Restore", description: "Manage volume data, backups and restore points" },
];

export default function App() {
    const [authed, setAuthed] = useState(() => restoreAuth() && isAuthed());
    const [tab, setTab] = useState("setup");
    const status = useStatus(authed);
    const configured = status.data?.configured;

    useEffect(() => {
        const handler = () => setAuthed(false);
        window.addEventListener("openclaw:auth_expired", handler);
        return () => window.removeEventListener("openclaw:auth_expired", handler);
    }, []);

    if (!authed) {
        return <LoginPage onLogin={() => setAuthed(true)} />;
    }

    const isFullBleed = tab === "terminal" || tab === "file-config" || tab === "file-env";

    // Find the label and description for the current tab (including children)
    const findTab = (id) => {
        for (const item of NAV) {
            if (item.id === id) return item;
            if (item.children) {
                const child = item.children.find((c) => c.id === id);
                if (child) return child;
            }
        }
        return {};
    };

    return (
        <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Sidebar */}
            <aside className="w-60 shrink-0 border-r border-border flex flex-col">
                <div className="h-14 flex items-center gap-2 px-5 border-b border-border">
                    <span className="text-base font-semibold tracking-widest uppercase">OpenClaw</span>
                    {configured && status.data?.openclawVersion && status.data.openclawVersion.length <= 50 && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground leading-none">
                            {status.data.openclawVersion}
                        </span>
                    )}
                </div>
                {configured && (
                    <div className="px-3 pt-3">
                        <a
                            href={`/openclaw?token=${encodeURIComponent(status.data?.gatewayToken || "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground hover:shadow-sm"
                        >
                            <span className="transition-transform group-hover:scale-110 group-hover:-rotate-6">🦞</span>
                            <span className="flex-1">Open UI</span>
                            <span className="text-xs opacity-0 -translate-x-1 transition-all group-hover:opacity-60 group-hover:translate-x-0">→</span>
                        </a>
                    </div>
                )}
                <nav className="flex-1 py-3 px-3 space-y-0.5">
                    {NAV.map((item) =>
                        item.children ? (
                            <div key={item.id} className="pt-3 first:pt-0">
                                <span className="block px-3 pb-1 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
                                    {item.label}
                                </span>
                                <div className="space-y-1 pl-1">
                                    {item.children.map((child) => (
                                        <button
                                            key={child.id}
                                            onClick={() => setTab(child.id)}
                                            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] tracking-wide font-medium transition-all ${tab === child.id
                                                ? "bg-gradient-to-r from-accent to-transparent text-foreground font-semibold cursor-pointer"
                                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground cursor-pointer"
                                                }`}
                                        >
                                            <svg className="w-4 h-4 shrink-0 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                            </svg>
                                            <span className="font-mono text-[12px]">{child.label}</span>
                                            {child.ext && (
                                                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground leading-none">
                                                    {child.ext}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <button
                                key={item.id}
                                onClick={() => setTab(item.id)}
                                className={`w-full flex items-center rounded-lg px-3 py-2.5 text-[13px] tracking-wide font-medium transition-all ${tab === item.id
                                    ? "bg-gradient-to-r from-accent to-transparent text-foreground font-semibold cursor-pointer"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground cursor-pointer"
                                    }`}
                            >
                                {item.label}
                            </button>
                        )
                    )}
                </nav>
                <div className="p-3 border-t border-border">
                    <button
                        onClick={() => { clearAuth(); setAuthed(false); }}
                        className="w-full flex items-center rounded-md px-3 py-2.5 text-[13px] tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto flex flex-col min-h-0">
                {!isFullBleed && (
                    <div className="h-14 flex items-center justify-between px-8 border-b border-border shrink-0">
                        <p className="text-sm text-muted-foreground">{findTab(tab).description || findTab(tab).label}</p>
                        {tab === "setup" && (
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
                        )}
                    </div>
                )}
                {tab === "terminal" ? (
                    <ConsolePanel />
                ) : tab === "file-config" ? (
                    <ConfigPanel key="config" fileId="config" />
                ) : tab === "file-env" ? (
                    <ConfigPanel key="env" fileId="env" />
                ) : tab === "approvals" ? (
                    <ApprovalsPanel />
                ) : tab === "data" ? (
                    <DataPanel status={status} />
                ) : (
                    <div className="max-w-3xl mx-auto px-8 py-6 w-full">
                        <SetupPanel status={status} />
                    </div>
                )}
            </main>
        </div>
    );
}
