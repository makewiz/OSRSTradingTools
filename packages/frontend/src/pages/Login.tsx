import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const REDIRECT_URI = window.location.origin + "/auth/discord/callback";

import { API_BASE_URL } from "../config";

export const Login: React.FC = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const { login, registrationEnabled } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || "/";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                let errorMessage = "Login failed";
                try {
                    const data = await res.json();
                    errorMessage = data.error || errorMessage;
                } catch (e) {
                    // Start of response might be text
                    // errorMessage = await res.text(); // Optional: read text if needed, but might correspond to the Unexpected token T issue directly
                }
                throw new Error(errorMessage);
            }

            const data = await res.json();

            login(data.token, data.user);
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDiscordLogin = () => {
        fetch(`${API_BASE_URL}/api/discord/config`)
            .then(res => res.json())
            .then(data => {
                const clientId = data.clientId;
                if (!clientId) {
                    alert("Discord Client ID not configured on backend.");
                    return;
                }
                const scope = encodeURIComponent("identify");
                const state = encodeURIComponent("login");
                const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}&prompt=none`;
                window.location.href = url;
            })
            .catch(err => {
                console.error(err);
                alert("Failed to get Discord config");
            });
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <h2>Login</h2>
                {error && <div className="error-message">{error}</div>}

                <button
                    type="button"
                    className="discord-login-button"
                    onClick={handleDiscordLogin}
                    disabled={loading}
                    style={{ background: '#5865f2', color: 'white', border: 'none', width: '100%', padding: '10px', borderRadius: '4px', marginBottom: '15px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Login with Discord
                </button>

                <div className="divider" style={{ textAlign: 'center', margin: '10px 0', color: '#888' }}>OR</div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Username</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" disabled={loading}>
                        {loading ? "Logging in..." : "Login"}
                    </button>
                </form>
                {registrationEnabled && (
                    <p>
                        Don't have an account? <Link to="/register">Register here</Link>
                    </p>
                )}
            </div>
        </div >
    );
};
