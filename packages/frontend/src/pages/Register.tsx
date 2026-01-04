import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

import { API_BASE_URL } from "../config";

export const Register: React.FC = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, email: email || undefined })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Registration failed");
            }

            login(data.token, data.user);
            navigate("/");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDiscordSignup = () => {
        fetch("/api/discord/config")
            .then(res => res.json())
            .then(data => {
                const clientId = data.clientId;
                if (!clientId) {
                    alert("Discord Client ID not configured on backend.");
                    return;
                }
                const scope = encodeURIComponent("identify email");
                const state = encodeURIComponent("login");
                const redirectUri = window.location.origin + "/auth/discord/callback";
                const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${state}`;
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
                <h2>Register</h2>
                {error && <div className="error-message">{error}</div>}

                <button
                    type="button"
                    className="discord-signup-button"
                    onClick={handleDiscordSignup}
                    disabled={loading}
                    style={{ background: '#5865f2', color: 'white', border: 'none', width: '100%', padding: '10px', borderRadius: '4px', marginBottom: '15px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Sign up with Discord
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
                            minLength={3}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="email">Email (Optional)</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
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
                            minLength={6}
                        />
                    </div>
                    <button type="submit" disabled={loading}>
                        {loading ? "Creating Account..." : "Register"}
                    </button>
                </form>
                <p>
                    Already have an account? <Link to="/login">Login here</Link>
                </p>
            </div>
        </div>
    );
};
