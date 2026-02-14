import { useEffect, useRef } from "react";
import { Button } from "./ui";

/**
 * Modal confirm dialog — replaces native confirm()/alert().
 *
 * Props:
 *   open        – boolean, whether to show
 *   title       – heading text
 *   description – body text
 *   confirmLabel – button text (default "Confirm")
 *   variant     – button variant (default "default", use "destructive" for dangerous actions)
 *   onConfirm   – called when user confirms
 *   onCancel    – called when user cancels (or presses Escape)
 *   alertOnly   – if true, only show a single "OK" button (replaces alert())
 */
export default function ConfirmDialog({
    open,
    title = "Are you sure?",
    description,
    confirmLabel = "Confirm",
    variant = "default",
    onConfirm,
    onCancel,
    alertOnly = false,
}) {
    const confirmRef = useRef(null);

    useEffect(() => {
        if (open) confirmRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === "Escape") onCancel?.();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
            {/* Dialog */}
            <div className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg animate-in">
                <h3 className="text-base font-semibold leading-none tracking-tight">{title}</h3>
                {description && (
                    <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    {alertOnly ? (
                        <Button ref={confirmRef} variant="default" size="sm" onClick={onCancel}>
                            OK
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" size="sm" onClick={onCancel}>
                                Cancel
                            </Button>
                            <Button ref={confirmRef} variant={variant} size="sm" onClick={onConfirm}>
                                {confirmLabel}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
