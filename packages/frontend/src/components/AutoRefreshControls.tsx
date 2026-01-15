import React, { memo } from 'react';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

interface AutoRefreshControlsProps {
    onRefresh: () => void;
    intervalMs?: number;
}

export const AutoRefreshControls: React.FC<AutoRefreshControlsProps> = memo(({ onRefresh, intervalMs = 60000 }) => {
    const { timeLeft, isEnabled, toggle, triggerRefresh } = useAutoRefresh(onRefresh, intervalMs);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#94a3b8' }}>
                <span>Auto-refresh:</span>
                <label className="switch">
                    <input type="checkbox" checked={isEnabled} onChange={toggle} />
                    <span className="slider round"></span>
                </label>
                <span style={{ minWidth: "80px" }}>{isEnabled ? `Updates in ${timeLeft}s` : "Paused"}</span>
            </div>
            <button
                onClick={triggerRefresh}
                style={{
                    background: 'transparent',
                    border: '1px solid #3b82f6',
                    color: '#3b82f6',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                }}
            >
                Refresh Now
            </button>
        </div>
    );
});
