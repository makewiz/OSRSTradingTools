import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface Watch {
    id: number;
    enabled: boolean;
}

const REDIRECT_URI = window.location.origin + "/auth/discord/callback";

import { API_BASE_URL } from "../config";

export const ChangePasswordForm: React.FC = () => {
    const { fetchWithAuth } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match");
            return;
        }

        if (newPassword.length < 6) {
            setError("New password must be at least 6 characters");
            return;
        }

        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to change password");
            }

            setSuccess("Password changed successfully!");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} style={{ maxWidth: "400px" }}>
            {error && <div className="error-message" style={{ marginBottom: "15px" }}>{error}</div>}
            {success && <div className="success-message" style={{ color: "#4caf50", marginBottom: "15px" }}>{success}</div>}

            <div className="form-group" style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Current Password</label>
                <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#222", color: "white" }}
                />
            </div>
            <div className="form-group" style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", marginBottom: "5px" }}>New Password</label>
                <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#222", color: "white" }}
                />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", marginBottom: "5px" }}>Confirm New Password</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#222", color: "white" }}
                />
            </div>
            <button
                type="submit"
                disabled={loading}
                className="page-button"
                style={{ width: "100%", padding: "10px", background: "#4caf50", fontWeight: "bold", opacity: loading ? 0.7 : 1 }}
            >
                {loading ? "Updating..." : "Update Password"}
            </button>
        </form>
    );
};

export const Profile: React.FC = () => {
    const { user, token, logout, login, fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    // const [discordId, setDiscordId] = useState("");
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

            // Fetch latest user data (to get has_password)
            try {
                const userRes = await fetchWithAuth(`${API_BASE_URL}/api/auth/me`);
                if (userRes.ok) {
                    const userData = await userRes.json();
                    if (userData.user && token) {
                        // Update context if data changed (checking has_password specifically or just simple equality)
                        // simpler to just always update if we have data to ensure freshness
                        login(token, userData.user);
                    }
                }
            } catch (ignore) {
                // Ignore user fetch errors, proceed to settings
            }

            const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/settings`);
            if (!res.ok) throw new Error("Failed to fetch settings");

            const data = await res.json();
            if (data.linked) {
                setIsLinked(true);
                // setDiscordId(data.discordId);
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
        fetch(`${API_BASE_URL}/api/discord/config`) // Public endpoint, no auth needed
            .then(res => res.json())
            .then(data => {
                const clientId = data.clientId;
                if (!clientId) {
                    alert("Discord Client ID not configured on backend.");
                    return;
                }
                const scope = encodeURIComponent("identify");
                const state = encodeURIComponent("link");
                const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}&prompt=none`;
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
            const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/settings`, {
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
                            {/* <span>Discord ID: <code>{discordId}</code></span> */}
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
                        <p>
                            <Link to="/watches" className="page-button" style={{ background: '#2196f3', textDecoration: 'none' }}>Manage My Watches</Link>
                        </p>
                        {watches.length === 0 && (
                            <p style={{ color: '#888', marginTop: '10px' }}>No items are currently being watched.</p>
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

            {user.has_password && (
                <div className="section" style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
                    <h2>Security</h2>
                    <ChangePasswordForm />
                </div>
            )}

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
                            const res = await fetchWithAuth(`${API_BASE_URL}/api/auth/account`, {
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
