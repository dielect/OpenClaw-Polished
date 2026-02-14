import { useState, useEffect, useCallback } from "react";
import { getStatus, getHealth } from "../api";

export function useStatus(authed) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!authed) return;
        setLoading(true);
        Promise.all([getStatus(), getHealth()])
            .then(([status, health]) => {
                setData({
                    ...status,
                    gatewayReachable: health?.gateway?.reachable ?? false,
                });
                setError(null);
            })
            .catch((e) => setError(String(e)))
            .finally(() => setLoading(false));
    }, [authed]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, error, loading, refresh };
}
