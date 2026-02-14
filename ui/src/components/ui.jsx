// shadcn/ui-inspired primitives — hand-rolled, no dependency.

export function PageTitle({ children, description }) {
    return (
        <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{children}</h1>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
    );
}

export function Section({ title, description, children }) {
    return (
        <div className="mb-8">
            {title && <h2 className="text-base font-semibold tracking-tight mb-1">{title}</h2>}
            {description && <p className="text-sm text-muted-foreground mb-3">{description}</p>}
            {children}
        </div>
    );
}

export function Card({ children, className = "" }) {
    return (
        <div className={`rounded-lg border border-border bg-card shadow-sm ${className}`}>
            {children}
        </div>
    );
}

export function CardHeader({ title, description }) {
    return (
        <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
    );
}

export function CardContent({ children, className = "" }) {
    return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

export function CardRow({ label, description, children }) {
    return (
        <div className="flex items-center justify-between px-6 py-3 border-b border-border last:border-b-0">
            <div className="space-y-0.5">
                <div className="text-sm font-medium leading-none">{label}</div>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            <div className="shrink-0 ml-4">{children}</div>
        </div>
    );
}

const btnBase =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer";

const btnVariants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
};

const btnSizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
};

export function Button({ children, variant = "default", size = "default", className = "", ...props }) {
    return (
        <button
            className={`${btnBase} ${btnVariants[variant] || btnVariants.default} ${btnSizes[size] || btnSizes.default} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}

export function Input({ className = "", ...props }) {
    return (
        <input
            className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            {...props}
        />
    );
}

export function Textarea({ className = "", ...props }) {
    return (
        <textarea
            className={`flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono ${className}`}
            {...props}
        />
    );
}

export function Select({ value, onChange, options, className = "" }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${className}`}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}

export function Label({ children, className = "", ...props }) {
    return (
        <label className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props}>
            {children}
        </label>
    );
}

export function Badge({ children, variant = "default" }) {
    const variants = {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-border text-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        success: "bg-emerald-100 text-emerald-800",
    };
    return (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${variants[variant] || variants.default}`}>
            {children}
        </span>
    );
}

export function Separator() {
    return <div className="h-px bg-border my-4" />;
}

export function LogOutput({ children }) {
    if (!children) return null;
    return (
        <pre className="mt-3 rounded-md border border-border bg-muted p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto text-foreground/80">
            {children}
        </pre>
    );
}

export function Code({ children }) {
    return (
        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
            {children}
        </code>
    );
}
