import { useState, useEffect } from "react";
import LoginPage from "./components/LoginPage";
import StatusPanel from "./components/StatusPanel";
import SetupPanel from "./components/SetupPanel";
import ConsolePanel from "./components/ConsolePanel";
import ConfigPanel from "./components/ConfigPanel";
import { useStatus } from "./hooks/useStatus";
import { isAuthed, restoreAuth, clearAuth } from "./api";

const NAV = [
    { id: "status", label: "Status" },
    { id: "setup", label: "Setup" },
    { id: "console", label: "Console" },
    { id: "config", label: "Config" },
];

export default function App() {
    const [authed, setAuthed] = useState(() => restoreAuth() && isAuthed());
    const [tab, setTab] = useState("status");
    const status = useStatus(authed);

    useEffect(() => {
        const handler = () => setAuthed(false);
        window.addEventListener("openclaw:auth_expired", handler);
        return () => window.removeEventListener("openclaw:auth_expired", handler);
    }, []);

    if (!authed) {
        return <LoginPage onLogin={() => setAuthed(true)} />;
    }

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
                            className={`w-full flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${tab === item.id
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
            <main className="flex-1 overflow-y-auto">
                <div className="h-14 flex items-center px-8 border-b border-border">
                    <h2 className="text-sm font-semibold">{NAV.find((n) => n.id === tab)?.label}</h2>
                </div>
                <div className="max-w-3xl mx-auto px-8 py-6">
                    {tab === "status" && <StatusPanel status={status} />}
                    {tab === "setup" && <SetupPanel status={status} />}
                    {tab === "console" && <ConsolePanel />}
                    {tab === "config" && <ConfigPanel />}
                </div>
            </main>
        </div>
    );
}
