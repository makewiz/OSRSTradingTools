import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";


const HistoryBackfillSection: React.FC = () => {
    const { fetchWithAuth } = useAuth();
    const [retentionDays, setRetentionDays] = useState(365);
    const [status, setStatus] = useState<{
        isBackfilling: boolean;
        totalItems: number;
        processedCount: number;
        currentItemName: string | null;
        lastError: string | null;
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    const fetchStatus = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/history/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (err) {
            console.error("Failed to fetch backfill status", err);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(() => {
            // Poll more frequently if active
            fetchStatus();
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleStartBackfill = async () => {
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/admin/history/backfill`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ retentionDays })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: data.message });
                fetchStatus();
            } else {
                setMsg({ type: 'error', text: data.error || "Failed to start backfill" });
            }
        } catch (err) {
            setMsg({ type: 'error', text: "Error starting backfill" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-section">
            <h2>History Backfill</h2>
            {msg && <div className={msg.type === 'error' ? "error-message" : "success-message"}>{msg.text}</div>}

            <div style={{ marginBottom: "15px" }}>
                <p style={{ color: "#aaa", fontSize: "0.9em", marginBottom: "10px" }}>
                    Force-fetches missing history data from Wiki API for all items.
                    Respects global retention cap (DATA_RETENTION_DAYS).
                </p>
                <div className="form-group" style={{ maxWidth: "200px" }}>
                    <label>Retention Days</label>
                    <input
                        type="number"
                        value={retentionDays}
                        onChange={(e) => setRetentionDays(parseInt(e.target.value) || 0)}
                    />
                </div>
                <button
                    onClick={handleStartBackfill}
                    disabled={loading || status?.isBackfilling}
                    className="page-button"
                >
                    {loading ? "Starting..." : (status?.isBackfilling ? "Backfill in Progress..." : "Start Backfill")}
                </button>
            </div>

            {status && (status.isBackfilling || status.processedCount > 0) && (
                <div style={{ background: "#222", padding: "10px", borderRadius: "5px", marginTop: "10px" }}>
                    <p><strong>Status:</strong> <span style={{ color: status.isBackfilling ? "#ffd43b" : "#51cf66" }}>
                        {status.isBackfilling ? "Running" : "Idle"}
                    </span></p>
                    <p><strong>Progress:</strong> {status.processedCount} / {status.totalItems}</p>
                    {status.currentItemName && <p><strong>Current Item:</strong> {status.currentItemName}</p>}
                    {status.lastError && <p style={{ color: "#ff6b6b" }}><strong>Last Error:</strong> {status.lastError}</p>}

                    {/* Simple Progress Bar */}
                    <div style={{ width: "100%", height: "10px", background: "#444", borderRadius: "5px", marginTop: "10px", overflow: "hidden" }}>
                        <div style={{
                            width: `${status.totalItems > 0 ? (status.processedCount / status.totalItems) * 100 : 0}%`,
                            height: "100%",
                            background: status.isBackfilling ? "#ffd43b" : "#51cf66",
                            transition: "width 0.5s ease"
                        }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export const Admin: React.FC = () => {
    const { user, fetchWithAuth, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [settings, setSettings] = useState<{ bot_sleep_start?: string; bot_sleep_end?: string; discord_highlights_channel_id?: string }>({});
    const [loading, setLoading] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

    const [userError, setUserError] = useState<string | null>(null);
    const [userSuccess, setUserSuccess] = useState<string | null>(null);

    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

    // New User State
    const [newUserUsername, setNewUserUsername] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

    const [syncStatus, setSyncStatus] = useState<{
        isSyncing: boolean;
        lastSyncStart: string | null;
        lastSyncEnd: string | null;
        lastError: string | null;
        processedCount: number;
    } | null>(null);

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
        fetchSyncStatus();
    }, [user, isAuthenticated]);

    useEffect(() => {
        let interval: any;
        if (syncStatus?.isSyncing) {
            interval = setInterval(fetchSyncStatus, 2000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [syncStatus?.isSyncing]);

    const fetchSyncStatus = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/recipes/sync/status`);
            if (res.ok) {
                const data = await res.json();
                setSyncStatus(data);
            }
        } catch (err) {
            console.error("Failed to fetch sync status", err);
        }
    };

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
                        <label>Bot Sleep Start Hour (0-23 UTC, or -1 to disable)</label>
                        <input
                            type="number"
                            min="-1"
                            max="23"
                            value={settings.bot_sleep_start || ""}
                            onChange={(e) => setSettings({ ...settings, bot_sleep_start: e.target.value })}
                            placeholder="e.g. 1"
                        />
                    </div>
                    <div className="form-group">
                        <label>Bot Sleep End Hour (0-23 UTC, or -1 to disable)</label>
                        <input
                            type="number"
                            min="-1"
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

            <hr />

            <div className="admin-section">
                <h2>Recipe Management</h2>
                {syncError && <div className="error-message">{syncError}</div>}
                {syncSuccess && <div className="success-message">{syncSuccess}</div>}
                <div style={{ marginBottom: "15px" }}>
                    {syncStatus && (
                        <div style={{ background: "#222", padding: "10px", borderRadius: "5px" }}>
                            <p><strong>Status:</strong> <span style={{ color: syncStatus.isSyncing ? "#ffd43b" : (syncStatus.lastError ? "#ff6b6b" : "#51cf66") }}>
                                {syncStatus.isSyncing ? "Syncing..." : (syncStatus.lastError ? "Error" : "Idle")}
                            </span></p>
                            <p><strong>Processed:</strong> {syncStatus.processedCount} recipes</p>
                            {syncStatus.lastSyncStart && <p><strong>Last Start:</strong> {new Date(syncStatus.lastSyncStart).toLocaleString()}</p>}
                            {syncStatus.lastSyncEnd && <p><strong>Last End:</strong> {new Date(syncStatus.lastSyncEnd).toLocaleString()}</p>}
                            {syncStatus.lastError && <p style={{ color: "#ff6b6b" }}><strong>Error:</strong> {syncStatus.lastError}</p>}
                        </div>
                    )}
                </div>
                <button
                    onClick={async () => {
                        setSyncError(null);
                        setSyncSuccess(null);
                        try {
                            const res = await fetchWithAuth(`${API_BASE_URL}/api/recipes/sync`, { method: "POST" });
                            if (res.ok) {
                                setSyncSuccess("Recipe sync started successfully.");
                                fetchSyncStatus();
                            } else {
                                const d = await res.json();
                                setSyncError(d.error || "Failed to start sync.");
                            }
                        } catch (err) {
                            setSyncError("Error starting sync.");
                        }
                    }}
                    disabled={syncStatus?.isSyncing}
                    className="page-button"
                    style={{ marginTop: 0, marginRight: "10px" }}
                >
                    {syncStatus?.isSyncing ? "Syncing..." : "Trigger Recipe Sync"}
                </button>

                <div style={{ marginTop: "20px", borderTop: "1px solid #444", paddingTop: "20px" }}>
                    <h3>Data Management</h3>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                        <button
                            onClick={async () => {
                                try {
                                    const res = await fetchWithAuth(`${API_BASE_URL}/api/recipes/export`);
                                    if (res.ok) {
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = "recipes_export.json";
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        a.remove();
                                    } else {
                                        setSyncError("Failed to export recipes");
                                    }
                                } catch (err) {
                                    setSyncError("Error exporting recipes");
                                }
                            }}
                            className="page-button"
                            style={{ marginTop: 0 }}
                        >
                            Export Recipes
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <input
                                type="file"
                                accept=".json"
                                id="import-file"
                                style={{ display: "none" }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;

                                    if (!confirm("WARNING: Importing recipes will REPLACE all existing recipes. Continue?")) {
                                        e.target.value = ""; // Reset file input
                                        return;
                                    }

                                    const reader = new FileReader();
                                    reader.onload = async (ev) => {
                                        try {
                                            const content = ev.target?.result as string;
                                            const json = JSON.parse(content);

                                            const res = await fetchWithAuth(`${API_BASE_URL}/api/recipes/import`, {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify(json)
                                            });

                                            if (res.ok) {
                                                const d = await res.json();
                                                setSyncSuccess(d.message || "Import successful");
                                                setSyncError(null);
                                            } else {
                                                const d = await res.json();
                                                setSyncError(d.error || "Import failed");
                                                setSyncSuccess(null);
                                            }
                                        } catch (err) {
                                            setSyncError("Error parsing or importing file");
                                            setSyncSuccess(null);
                                        } finally {
                                            // Reset input
                                            e.target.value = "";
                                        }
                                    };
                                    reader.readAsText(file);
                                }}
                            />
                            <label htmlFor="import-file" className="page-button" style={{
                                marginTop: 0,
                                cursor: "pointer",
                                background: "#dc3545",
                                color: "white",
                                padding: "10px",
                                borderRadius: "4px",
                                display: "inline-block",
                                textAlign: "center"
                            }}>
                                Import Recipes
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <hr />

            <HistoryBackfillSection />


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
