import { useState, useEffect, useCallback, useRef } from 'react';

export function useAutoRefresh(callback: () => void, intervalMs: number = 60000) {
    const [isEnabled, setIsEnabled] = useState(true);
    const [timeLeft, setTimeLeft] = useState(intervalMs / 1000);
    const callbackRef = useRef(callback);

    // Keep ref updated to avoid stale closures in setInterval
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!isEnabled) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    // Trigger refresh
                    callbackRef.current();
                    return intervalMs / 1000;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isEnabled, intervalMs]);

    const triggerRefresh = useCallback(() => {
        callbackRef.current();
        setTimeLeft(intervalMs / 1000);
    }, [intervalMs]);

    const toggle = useCallback(() => {
        setIsEnabled((prev) => !prev);
    }, []);

    return {
        isEnabled,
        timeLeft,
        triggerRefresh,
        toggle
    };
}
