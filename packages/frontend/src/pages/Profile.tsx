import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface Watch {
    id: number;
    discord_id: string;
    item_id: number;
    itemName?: string; // Enriched from backend
    day_change_threshold: number;
    enabled: boolean;
    created_at: number;
    last_notified_at: number | null;
}

const REDIRECT_URI = window.location.origin + "/auth/discord/callback";

export const Profile: React.FC = () => {
    const { user, token, logout, fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const [discordId, setDiscordId] = useState("");
    const [isLinked, setIsLinked] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [watches, setWatches] = useState<Watch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Edit state
    const [editingWatchId, setEditingWatchId] = useState<number | null>(null);
    const [editThreshold, setEditThreshold] = useState<string>("");

    useEffect(() => {
        if (token) fetchSettings();
    }, [token]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth("/api/discord/settings");
            if (!res.ok) throw new Error("Failed to fetch settings");

            const data = await res.json();
            if (data.linked) {
                setIsLinked(true);
                setDiscordId(data.discordId);
                setNotificationsEnabled(!!data.notificationsEnabled);
                setWatches(data.watches || []);
            } else {
                setIsLinked(false);
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            setError("Failed to load Discord settings");
        } finally {
            setLoading(false);
        }
    };

    const handleConnectDiscord = () => {
        fetch("/api/discord/config") // Public endpoint, no auth needed
            .then(res => res.json())
            .then(data => {
                const clientId = data.clientId;
                if (!clientId) {
                    alert("Discord Client ID not configured on backend.");
                    return;
                }
                const scope = encodeURIComponent("identify email");
                const state = encodeURIComponent("link");
                const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}`;
                window.location.href = url;
            })
            .catch(err => {
                console.error(err);
                alert("Failed to get Discord config");
            });
    };

    const handleToggleNotifications = async () => {
        const newState = !notificationsEnabled;
        try {
            setNotificationsEnabled(newState);
            const res = await fetchWithAuth("/api/discord/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ enabled: newState })
            });

            if (!res.ok) throw new Error("Failed to update settings");
        } catch (err) {
            setNotificationsEnabled(!newState);
            setError("Failed to update settings");
        }
    };

    const handleRemoveWatch = async (itemId: number) => {
        if (!confirm("Are you sure you want to stop watching this item?")) return;
        try {
            setWatches(prev => prev.filter(w => w.item_id !== itemId));
            const res = await fetchWithAuth(`/api/discord/watch/${itemId}`, {
                method: "DELETE"
            });

            if (!res.ok) throw new Error("Failed to remove watch");
        } catch (err) {
            setError("Failed to remove watch");
            fetchSettings();
        }
    };

    const startEditing = (watch: Watch) => {
        setEditingWatchId(watch.item_id);
        setEditThreshold(watch.day_change_threshold.toString());
    };

    const cancelEditing = () => {
        setEditingWatchId(null);
        setEditThreshold("");
    };

    const saveThreshold = async (itemId: number) => {
        const newThreshold = parseFloat(editThreshold);
        if (isNaN(newThreshold) || newThreshold < 0) {
            alert("Please enter a valid positive number.");
            return;
        }

        try {
            // Optimistic update
            setWatches(prev => prev.map(w =>
                w.item_id === itemId ? { ...w, day_change_threshold: newThreshold } : w
            ));
            setEditingWatchId(null);

            const res = await fetchWithAuth(`/api/discord/watch/${itemId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ threshold: newThreshold })
            });

            if (!res.ok) throw new Error("Failed to update threshold");
            setSuccessMsg("Threshold updated!");
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err) {
            setError("Failed to update threshold");
            fetchSettings();
        }
    };

    if (!user) {
        return <div className="profile-page"><p>Please log in.</p></div>;
    }

    return (
        <div className="profile-page app-main" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h1>User Profile: {user.username}</h1>

            <div className="section" style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h2>Discord Integration</h2>
                {error && <div className="error-message">{error}</div>}
                {successMsg && <div className="success-message" style={{ color: '#4caf50', marginBottom: '10px' }}>{successMsg}</div>}

                {loading ? (
                    <p>Loading settings...</p>
                ) : isLinked ? (
                    <div>
                        <div className="status-row" style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                            <span style={{ color: '#4caf50', fontWeight: 'bold' }}>✓ Linked</span>
                            <span>Discord ID: <code>{discordId}</code></span>
                        </div>

                        <div className="form-group chain-notifications" style={{ marginBottom: '20px' }}>
                            <label className="checkbox-label" style={{ fontSize: '1.1rem' }}>
                                <input
                                    type="checkbox"
                                    checked={notificationsEnabled}
                                    onChange={handleToggleNotifications}
                                />
                                Enable Discord Notifications
                            </label>
                        </div>

                        <h3>Active Watches ({watches.length})</h3>
                        {watches.length === 0 ? (
                            <p style={{ color: '#888' }}>No items are currently being watched.</p>
                        ) : (
                            <table className="items-table" style={{ marginTop: '10px', minWidth: 'auto', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Item</th>
                                        <th style={{ width: '160px' }}>Threshold</th>
                                        <th style={{ width: '100px', textAlign: 'right' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {watches.map(w => (
                                        <tr key={w.id}>
                                            <td>
                                                <Link to={`/item/${w.item_id}`} className="item-name-link">
                                                    {w.itemName || `Item ${w.item_id}`}
                                                </Link>
                                            </td>
                                            <td>
                                                {editingWatchId === w.item_id ? (
                                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                        <input
                                                            type="number"
                                                            value={editThreshold}
                                                            onChange={e => setEditThreshold(e.target.value)}
                                                            style={{ width: '60px', padding: '4px' }}
                                                            step="0.1"
                                                        />
                                                        <span>%</span>
                                                        <button
                                                            className="page-button"
                                                            style={{ background: '#4caf50', padding: '4px 8px' }}
                                                            onClick={() => saveThreshold(w.item_id)}
                                                        >
                                                            ✓
                                                        </button>
                                                        <button
                                                            className="page-button"
                                                            style={{ background: '#777', padding: '4px 8px' }}
                                                            onClick={cancelEditing}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span>{w.day_change_threshold.toFixed(1)}%</span>
                                                        <button
                                                            className="page-button"
                                                            style={{
                                                                background: 'transparent',
                                                                border: '1px solid #555',
                                                                padding: '2px 6px',
                                                                fontSize: '0.8rem'
                                                            }}
                                                            onClick={() => startEditing(w)}
                                                        >
                                                            Edit
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="page-button"
                                                    style={{ background: '#f44336', border: 'none' }}
                                                    onClick={() => handleRemoveWatch(w.item_id)}
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    <div>
                        <p>Link your Discord account to receive price alerts via DM.</p>
                        <button
                            className="page-button"
                            style={{ background: '#5865f2', color: 'white', fontWeight: 'bold' }}
                            onClick={handleConnectDiscord}
                        >
                            Connect Discord
                        </button>
                    </div>
                )}
            </div>

            <div className="section" style={{ background: 'rgba(139,0,0,0.15)', padding: '20px', borderRadius: '8px', marginTop: '20px', border: '1px solid rgba(139,0,0,0.3)' }}>
                <h2 style={{ color: '#ff6b6b' }}>Danger Zone</h2>
                <p style={{ color: '#ccc', marginBottom: '15px' }}>
                    Once you delete your account, there is no going back. This will permanently delete your profile, favorites, and Discord link.
                </p>
                <button
                    className="page-button"
                    style={{ background: '#d32f2f', border: 'none', fontWeight: 'bold' }}
                    onClick={async () => {
                        const confirmed = confirm(
                            "Are you sure you want to delete your account? This action cannot be undone.\n\n" +
                            "All your data will be permanently deleted:\n" +
                            "- Your user profile\n" +
                            "- All favorites\n" +
                            "- Discord link and notification settings"
                        );

                        if (!confirmed) return;

                        const doubleCheck = confirm("This is your last chance. Are you absolutely sure?");
                        if (!doubleCheck) return;

                        try {
                            const res = await fetchWithAuth("/api/auth/account", {
                                method: "DELETE"
                            });

                            if (!res.ok) throw new Error("Failed to delete account");

                            alert("Your account has been deleted.");
                            logout();
                            navigate("/");
                        } catch (err) {
                            alert("Failed to delete account. Please try again.");
                        }
                    }}
                >
                    Delete Account
                </button>
            </div>
        </div>
    );
};
