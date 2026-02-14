import * as SelectPrimitive from "@radix-ui/react-select";

function ChevronDown() {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-50">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function Check() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M11 4L5.5 9.5L3 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function RichSelect({ value, onChange, options, placeholder = "Select...", className = "" }) {
    return (
        <SelectPrimitive.Root value={value} onValueChange={onChange}>
            <SelectPrimitive.Trigger
                className={`flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            >
                <SelectPrimitive.Value placeholder={placeholder} />
                <SelectPrimitive.Icon>
                    <ChevronDown />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>

            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    className="relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-white shadow-md animate-in fade-in-0 zoom-in-95"
                    position="popper"
                    sideOffset={4}
                >
                    <SelectPrimitive.Viewport className="p-1">
                        {options.map((opt) => (
                            <SelectPrimitive.Item
                                key={opt.value}
                                value={opt.value}
                                textValue={opt.label}
                                className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                            >
                                <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                                    <SelectPrimitive.ItemIndicator>
                                        <Check />
                                    </SelectPrimitive.ItemIndicator>
                                </span>
                                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                                {opt.description && (
                                    <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                                )}
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}

export function RichSelectGroup({ value, onChange, groups, placeholder = "Select..." }) {
    return (
        <SelectPrimitive.Root value={value} onValueChange={onChange}>
            <SelectPrimitive.Trigger
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
                <SelectPrimitive.Value placeholder={placeholder} />
                <SelectPrimitive.Icon>
                    <ChevronDown />
                </SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>

            <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                    className="relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border border-border bg-white shadow-md animate-in fade-in-0 zoom-in-95"
                    position="popper"
                    sideOffset={4}
                >
                    <SelectPrimitive.Viewport className="p-1">
                        {groups.map((group, i) => (
                            <SelectPrimitive.Group key={group.label}>
                                {i > 0 && <SelectPrimitive.Separator className="h-px bg-border my-1 mx-1" />}
                                <SelectPrimitive.Label className="px-8 py-1.5 text-xs font-semibold text-muted-foreground">
                                    {group.label}
                                </SelectPrimitive.Label>
                                {group.options.map((opt) => (
                                    <SelectPrimitive.Item
                                        key={opt.value}
                                        value={opt.value}
                                        textValue={opt.label}
                                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none hover:bg-accent focus:bg-accent"
                                    >
                                        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                                            <SelectPrimitive.ItemIndicator>
                                                <Check />
                                            </SelectPrimitive.ItemIndicator>
                                        </span>
                                        <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                                        {opt.description && (
                                            <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
                                        )}
                                    </SelectPrimitive.Item>
                                ))}
                            </SelectPrimitive.Group>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}
