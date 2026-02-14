import { useState, useRef, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";

function Check() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 4L5.5 9.5L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function Combobox({ value, onChange, options, placeholder = "Search..." }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);

    const filtered = options.filter((o) => {
        const q = search.toLowerCase();
        return o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q);
    });

    const selected = options.find((o) => o.value === value);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer text-left"
                >
                    <span className={selected ? "text-foreground" : "text-muted-foreground"}>
                        {selected ? selected.label : placeholder}
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
                            placeholder={placeholder}
                            className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                        />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filtered.length === 0 && (
                            <div className="py-2 px-3 text-sm text-muted-foreground">No results</div>
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
