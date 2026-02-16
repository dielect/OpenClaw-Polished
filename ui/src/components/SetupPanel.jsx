import Lottie from "lottie-react";
import lobsterAnimation from "../assets/lobster.json";
import SetupForm from "./SetupForm";

/* ── Main Setup ── */
export default function SetupPanel({ status }) {
    const { data, error, loading } = status;

    /* First load — show Lottie animation instead of skeleton */
    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Lottie animationData={lobsterAnimation} loop autoplay style={{ width: 200, height: 200 }} />
                <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <SetupForm status={status} />
        </div>
    );
}
