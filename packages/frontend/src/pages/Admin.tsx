import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";

export const Admin: React.FC = () => {
    const { user, fetchWithAuth, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [settings, setSettings] = useState<{ bot_sleep_start?: string; bot_sleep_end?: string; discord_highlights_channel_id?: string }>({});
    const [loading, setLoading] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

    const [userError, setUserError] = useState<string | null>(null);
    const [userSuccess, setUserSuccess] = useState<string | null>(null);

    // New User State
    const [newUserUsername, setNewUserUsername] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) {
            navigate("/login");
            return;
        }

        if (user && !user.is_admin) {
            navigate("/");
            return;
        }

        fetchSettings();
    }, [user, isAuthenticated]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/settings`);
            if (res.ok) {
                const data = await res.json();
                setSettings(data.settings || {});
            } else {
                setSettingsError("Failed to fetch settings");
            }
        } catch (err) {
            setSettingsError("Error fetching settings");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsError(null);
        setSettingsSuccess(null);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                setSettingsSuccess("Settings updated successfully");
            } else {
                const data = await res.json();
                setSettingsError(data.error || "Failed to update settings");
            }
        } catch (err) {
            setSettingsError("Error saving settings");
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setUserError(null);
        setUserSuccess(null);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: newUserUsername,
                    password: newUserPassword,
                    email: newUserEmail || undefined,
                    is_admin: newUserIsAdmin
                })
            });

            if (res.ok) {
                setUserSuccess(`User ${newUserUsername} created successfully`);
                setNewUserUsername("");
                setNewUserPassword("");
                setNewUserEmail("");
                setNewUserIsAdmin(false);
            } else {
                const data = await res.json();
                setUserError(data.error || "Failed to create user");
            }
        } catch (err) {
            setUserError("Error creating user");
        }
    };

    if (!user || !user.is_admin) {
        return <div className="page-container">Access Denied</div>;
    }

    return (
        <div className="page-container">
            <h1>Admin Dashboard</h1>

            <div className="admin-section">
                <h2>Bot Configuration</h2>
                {settingsError && <div className="error-message">{settingsError}</div>}
                {settingsSuccess && <div className="success-message">{settingsSuccess}</div>}
                <form onSubmit={handleSaveSettings} className="admin-form">
                    <div className="form-group">
                        <label>Bot Sleep Start Hour (0-23 UTC)</label>
                        <input
                            type="number"
                            min="0"
                            max="23"
                            value={settings.bot_sleep_start || ""}
                            onChange={(e) => setSettings({ ...settings, bot_sleep_start: e.target.value })}
                            placeholder="e.g. 1"
                        />
                    </div>
                    <div className="form-group">
                        <label>Bot Sleep End Hour (0-23 UTC)</label>
                        <input
                            type="number"
                            min="0"
                            max="23"
                            value={settings.bot_sleep_end || ""}
                            onChange={(e) => setSettings({ ...settings, bot_sleep_end: e.target.value })}
                            placeholder="e.g. 6"
                        />
                    </div>
                    <div className="form-group">
                        <label>Highlights Channel ID</label>
                        <input
                            type="text"
                            value={settings.discord_highlights_channel_id || ""}
                            onChange={(e) => setSettings({ ...settings, discord_highlights_channel_id: e.target.value })}
                            placeholder="Discord Channel ID"
                        />
                    </div>
                    <button type="submit" disabled={loading}>Save Settings</button>
                </form>
            </div>

            <hr />

            <div className="admin-section">
                <h2>Create User</h2>
                {userError && <div className="error-message">{userError}</div>}
                {userSuccess && <div className="success-message">{userSuccess}</div>}
                <form onSubmit={handleCreateUser} className="admin-form">
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={newUserUsername}
                            onChange={(e) => setNewUserUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Email (Optional)</label>
                        <input
                            type="email"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                        />
                    </div>
                    <div className="form-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={newUserIsAdmin}
                                onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                            />
                            Is Admin?
                        </label>
                    </div>
                    <button type="submit" disabled={loading}>Create User</button>
                </form>
            </div>

            <style>{`
                .admin-section {
                    background: #2a2a2a;
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .admin-form {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    max-width: 400px;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }
                .form-group input {
                    padding: 8px;
                    border-radius: 4px;
                    border: 1px solid #444;
                    background: #1a1a1a;
                    color: white;
                }
                .checkbox-group label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                }
                .checkbox-group input {
                    width: auto;
                }
                button {
                    padding: 10px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                }
                button:disabled {
                    background: #555;
                }
                .error-message {
                    color: #ff6b6b;
                    margin-bottom: 10px;
                }
                .success-message {
                    color: #51cf66;
                    margin-bottom: 10px;
                }
            `}</style>
        </div>
    );
};
