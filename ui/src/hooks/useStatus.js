import { useState, useEffect, useCallback } from "react";
import { getStatus } from "../api";

export function useStatus(authed) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(() => {
        if (!authed) return;
        setLoading(true);
        getStatus()
            .then((d) => {
                setData(d);
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
