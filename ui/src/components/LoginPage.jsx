import { useState } from "react";
import { verifyAuth, setAuth } from "../api";
import { Button, Input, Card, CardContent } from "./ui";

export default function LoginPage({ onLogin }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password.trim()) return;
        setLoading(true);
        setError("");
        try {
            const ok = await verifyAuth(password);
            if (ok) {
                setAuth(password);
                onLogin();
            } else {
                setError("Invalid password");
            }
        } catch (err) {
            setError(`Connection error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center font-sans">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight">OpenClaw</h1>
                    <p className="text-sm text-muted-foreground mt-2">Enter your setup password to continue</p>
                </div>

                <Card>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">Password</label>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="SETUP_PASSWORD"
                                    autoFocus
                                    className="font-mono"
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-destructive">{error}</p>
                            )}

                            <Button type="submit" disabled={loading || !password.trim()} className="w-full">
                                {loading ? "Verifying..." : "Sign in"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <p className="text-xs text-muted-foreground text-center mt-6">
                    Set <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs">SETUP_PASSWORD</code> in Railway Variables
                </p>
            </div>
        </div>
    );
}
