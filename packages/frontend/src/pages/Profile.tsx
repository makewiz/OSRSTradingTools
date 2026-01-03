import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface Watch {
    id: number;
    discord_id: string;
    item_id: number;
    day_change_threshold: number;
    enabled: boolean;
    created_at: number;
    last_notified_at: number | null;
}

const REDIRECT_URI = window.location.origin + "/auth/discord/callback";

export const Profile: React.FC = () => {
    const { user, token } = useAuth();
    const [discordId, setDiscordId] = useState("");
    const [isLinked, setIsLinked] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [watches, setWatches] = useState<Watch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    useEffect(() => {
        if (token) fetchSettings();
    }, [token]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/discord/settings", {
                headers: { Authorization: `Bearer ${token}` }
            });
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
        fetch("/api/discord/config")
            .then(res => res.json())
            .then(data => {
                const clientId = data.clientId;
                if (!clientId) {
                    alert("Discord Client ID not configured on backend.");
                    return;
                }
                const scope = encodeURIComponent("identify email");
                const state = encodeURIComponent("link"); // Different state for linking
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
            // Optimistic updatte
            setNotificationsEnabled(newState);

            const res = await fetch("/api/discord/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ enabled: newState })
            });

            if (!res.ok) throw new Error("Failed to update settings");
        } catch (err) {
            setNotificationsEnabled(!newState); // Revert
            setError("Failed to update settings");
        }
    };

    const handleRemoveWatch = async (itemId: number) => {
        try {
            // Optimistic update
            setWatches(prev => prev.filter(w => w.item_id !== itemId));

            const res = await fetch(`/api/discord/watch/${itemId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to remove watch");
        } catch (err) {
            setError("Failed to remove watch");
            fetchSettings(); // Revert/Refresh
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
                            <table className="items-table" style={{ marginTop: '10px', minWidth: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th>Item ID</th>
                                        <th>Threshold</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {watches.map(w => (
                                        <tr key={w.id}>
                                            <td>
                                                <Link to={`/item/${w.item_id}`} className="item-name-link">
                                                    Item {w.item_id}
                                                </Link>
                                            </td>
                                            <td>{w.day_change_threshold.toFixed(1)}%</td>
                                            <td>
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
        </div>
    );
};
