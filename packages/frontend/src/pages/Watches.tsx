
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";

interface Watch {
    id: number;
    discord_id: string;
    item_id: number;
    itemName?: string;
    day_change_threshold: number | null;
    one_hour_change_threshold: number | null;
    cooldown_seconds: number | null;
    enabled: boolean;
    created_at: number;
    last_notified_at: number | null;
    last_notified_1h_at: number | null;
}

export const Watches: React.FC = () => {
    const { token, fetchWithAuth } = useAuth();
    const [watches, setWatches] = useState<Watch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edit state
    const [editingWatchId, setEditingWatchId] = useState<number | null>(null);
    const [editThreshold, setEditThreshold] = useState<string>("");
    const [editPeriod, setEditPeriod] = useState<'1h' | '24h'>('1h');
    const [editCooldown, setEditCooldown] = useState<string>("");

    useEffect(() => {
        if (token) fetchWatches();
    }, [token]);

    const fetchWatches = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/settings`);
            if (!res.ok) throw new Error("Failed to fetch settings");
            const data = await res.json();
            setWatches(data.watches || []);
        } catch (err: any) {
            setError(err.message || "Failed to load watches");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveWatch = async (itemId: number) => {
        if (!confirm("Are you sure you want to stop watching this item?")) return;
        try {
            setWatches(prev => prev.filter(w => w.item_id !== itemId));
            await fetchWithAuth(`${API_BASE_URL}/api/discord/watch/${itemId}`, { method: "DELETE" });
        } catch (err) {
            setError("Failed to remove watch");
            fetchWatches();
        }
    };

    const startEditing = (watch: Watch) => {
        setEditingWatchId(watch.item_id);
        // Determine active period to show
        if (watch.one_hour_change_threshold !== null) {
            setEditPeriod('1h');
            setEditThreshold(watch.one_hour_change_threshold.toString());
        } else {
            setEditPeriod('24h');
            setEditThreshold(watch.day_change_threshold?.toString() || "");
        }
        setEditCooldown((watch.cooldown_seconds || 3600).toString());
    };

    const saveEdit = async (itemId: number) => {
        const threshold = parseFloat(editThreshold);
        const cooldown = parseInt(editCooldown, 10);

        if (isNaN(threshold) || threshold < 0) {
            alert("Invalid threshold");
            return;
        }
        if (isNaN(cooldown) || cooldown < 0) {
            alert("Invalid cooldown");
            return;
        }

        try {
            // Optimistic update
            setWatches(prev => prev.map(w => {
                if (w.item_id === itemId) {
                    return {
                        ...w,
                        cooldown_seconds: cooldown,
                        one_hour_change_threshold: editPeriod === '1h' ? threshold : null,
                        day_change_threshold: editPeriod === '24h' ? threshold : null
                    };
                }
                return w;
            }));
            setEditingWatchId(null);

            await fetchWithAuth(`${API_BASE_URL}/api/discord/watch/${itemId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threshold, period: editPeriod, cooldown })
            });
        } catch (err) {
            setError("Failed to update watch");
            fetchWatches();
        }
    };

    return (
        <div className="watches-page app-main" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h1>My Price Alerts</h1>
            {error && <div className="error-message">{error}</div>}

            {loading ? <p>Loading...</p> : (
                <div className="section" style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
                    {watches.length === 0 ? (
                        <p>You have no active watches. Use the Discord bot or item detail page to add one!</p>
                    ) : (
                        <table className="items-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Period</th>
                                    <th>Threshold</th>
                                    <th>Cooldown (s)</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {watches.map(w => {
                                    const isEditing = editingWatchId === w.item_id;
                                    // Display logic: prioritize showing 1h if both exist? Or just show what is set. 
                                    // Usually they are exclusive in UI but DB supports both.
                                    // Let's rely on what we inferred during startEditing for 'active' period if editing.
                                    // Otherwise, multiple rows? Item ID should be unique per watcher list here for simplicity.

                                    const activePeriod = w.one_hour_change_threshold !== null ? '1H' : '24H';
                                    const activeThreshold = w.one_hour_change_threshold !== null ? w.one_hour_change_threshold : w.day_change_threshold;

                                    return (
                                        <tr key={w.id}>
                                            <td>
                                                <Link to={`/item/${w.item_id}`} className="item-name-link">
                                                    {w.itemName || `Item ${w.item_id}`}
                                                </Link>
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <select
                                                        value={editPeriod}
                                                        onChange={(e) => setEditPeriod(e.target.value as '1h' | '24h')}
                                                        className="dark-input"
                                                    >
                                                        <option value="1h">1H</option>
                                                        <option value="24h">24H</option>
                                                    </select>
                                                ) : <span className="tag" style={{ background: activePeriod === '1H' ? '#4caf50' : '#2196f3' }}>{activePeriod}</span>}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={editThreshold}
                                                        onChange={e => setEditThreshold(e.target.value)}
                                                        className="dark-input"
                                                        style={{ width: '60px' }}
                                                        step="0.1"
                                                    />
                                                ) : `${activeThreshold?.toFixed(1)}%`}
                                            </td>
                                            <td>
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={editCooldown}
                                                        onChange={e => setEditCooldown(e.target.value)}
                                                        className="dark-input"
                                                        style={{ width: '80px' }}
                                                    />
                                                ) : `${w.cooldown_seconds || 3600}s`}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {isEditing ? (
                                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                        <button className="page-button" style={{ background: '#4caf50', padding: '4px 8px' }} onClick={() => saveEdit(w.item_id)}>✓</button>
                                                        <button className="page-button" style={{ background: '#777', padding: '4px 8px' }} onClick={() => setEditingWatchId(null)}>✕</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                        <button className="page-button icon-btn" onClick={() => startEditing(w)}>✎</button>
                                                        <button className="page-button icon-btn" style={{ color: '#f44336' }} onClick={() => handleRemoveWatch(w.item_id)}>🗑</button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};
