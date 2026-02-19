import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

const ToastContext = createContext(null);

export function useToast() {
    return useContext(ToastContext);
}

/* ── Parse long error into summary + collapsible detail ── */
function parseSummary(msg) {
    const str = String(msg);
    const httpMatch = str.match(/HTTP\s+(\d+)/);
    const moduleMatch = str.match(/Error:\s*(Cannot find module\s+'[^']+')/);
    let summary = "";
    if (httpMatch) summary += `HTTP ${httpMatch[1]}`;
    if (moduleMatch) {
        summary += summary ? " — " : "";
        summary += moduleMatch[1];
    }
    if (!summary) {
        const brief = str.replace(/^Error:\s*Error:\s*|^Error:\s*/, "").replace(/\{.*/, "").trim();
        summary = brief.length > 80 ? brief.slice(0, 80) + "…" : brief;
    }
    const hasDetail = str.length > summary.length + 20;
    return { summary, detail: hasDetail ? str : null };
}

/* ── Single toast card ── */
function ToastItem({ toast, onDismiss }) {
    const [visible, setVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const hovered = useRef(false);
    const timerRef = useRef(null);

    useEffect(() => {
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleDismiss = useCallback(() => {
        setVisible(false);
        setTimeout(() => onDismiss(toast.id), 150);
    }, [onDismiss, toast.id]);

    const startTimer = useCallback(() => {
        if (!toast.duration) return;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (!hovered.current) handleDismiss();
        }, toast.duration);
    }, [toast.duration, handleDismiss]);

    useEffect(() => {
        startTimer();
        return () => clearTimeout(timerRef.current);
    }, [startTimer]);

    const onMouseEnter = () => {
        hovered.current = true;
        clearTimeout(timerRef.current);
    };

    const onMouseLeave = () => {
        hovered.current = false;
        startTimer();
    };

    const isError = toast.variant === "error";
    const { summary, detail } = isError ? parseSummary(toast.message) : { summary: toast.message, detail: null };

    return (
        <div
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            className={`pointer-events-auto w-[360px] rounded-md border border-border bg-card text-card-foreground shadow-md transition-all duration-150 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
        >
            <div className="grid grid-cols-[1fr_auto] items-start gap-3 p-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium leading-snug">
                        {isError ? "Something went wrong" : "Notification"}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed break-words">
                        {summary}
                    </p>
                </div>
                <button
                    onClick={handleDismiss}
                    className="rounded-sm opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                    aria-label="Dismiss"
                >
                    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3.5 3.5l8 8M11.5 3.5l-8 8" />
                    </svg>
                </button>
            </div>
            {detail && (
                <div className="border-t border-border px-4 py-2">
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                        {expanded ? "Hide details" : "Show details"}
                    </button>
                    {expanded && (
                        <pre className="mt-2 rounded-md bg-muted p-3 text-[11px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto text-muted-foreground leading-relaxed">
                            {detail}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Provider + container ── */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const idRef = useRef(0);

    const dismissAll = useCallback(() => setToasts([]), []);

    const toast = useCallback((message, { variant = "default", duration = 6000 } = {}) => {
        const id = ++idRef.current;
        setToasts((prev) => [...prev, { id, message, variant, duration }]);
    }, []);

    toast.dismissAll = dismissAll;

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
