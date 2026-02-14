import { useState, useRef, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";

function Check() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 4L5.5 9.5L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/**
 * Combobox with optional free-text input.
 *
 * Props:
 *   freeSolo – if true, the user can type arbitrary values (not just pick from options)
 */
export default function Combobox({ value, onChange, options, placeholder = "Search...", freeSolo = false }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);

    const filtered = options.filter((o) => {
        const q = search.toLowerCase();
        return o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
    });

    const selected = options.find((o) => o.value === value);
    // For freeSolo: display the raw value if it doesn't match any option
    const displayLabel = selected ? selected.label : (freeSolo && value ? value : "");

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
            if (freeSolo) {
                // Pre-fill search with current value for easy editing
                setSearch(value || "");
            }
        }
    }, [open]);

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && freeSolo && search.trim()) {
            onChange(search.trim());
            setOpen(false);
            setSearch("");
        }
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer text-left"
                >
                    <span className={displayLabel ? "text-foreground" : "text-muted-foreground"}>
                        {displayLabel || placeholder}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-50 shrink-0 ml-2">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-white shadow-md"
                    sideOffset={4}
                    align="start"
                >
                    <div className="p-2 border-b border-border">
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={freeSolo ? "Type or search..." : placeholder}
                            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filtered.length === 0 && !freeSolo && (
                            <div className="py-2 px-3 text-sm text-muted-foreground">No results</div>
                        )}
                        {filtered.length === 0 && freeSolo && search.trim() && (
                            <button
                                type="button"
                                onClick={() => {
                                    onChange(search.trim());
                                    setOpen(false);
                                    setSearch("");
                                }}
                                className="flex w-full cursor-pointer select-none items-center rounded-sm py-2 px-3 text-sm text-left outline-none hover:bg-accent"
                            >
                                Use "<span className="font-mono font-medium">{search.trim()}</span>"
                            </button>
                        )}
                        {filtered.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                    setSearch("");
                                }}
                                className="relative flex w-full cursor-pointer select-none items-start rounded-sm py-2 pl-8 pr-3 text-sm text-left outline-none hover:bg-accent"
                            >
                                <span className="absolute left-2 top-2.5 flex h-4 w-4 items-center justify-center">
                                    {opt.value === value && <Check />}
                                </span>
                                <div>
                                    <div className={opt.value === value ? "font-medium" : ""}>{opt.label}</div>
                                    {opt.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
