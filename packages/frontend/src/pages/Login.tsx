import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

// In a real app, these should be env vars, but Vite exposes VITE_ prefixed only.
// For now, we hardcode or assume localhost if not set.
// You MUST ensure the Backend OAuth helper uses the same redirect URI.
const DISCORD_CLIENT_ID = "1324022137684066375"; // Replace or use process.env in build
// NOTE: Ideally user provides this via .env or config
// For this environment, I'll instruct user to set it or use a default if I knew it.
// I will use a placeholder and ask user to configure.
// Wait, I can't read backend .env from frontend easily without VITE_ prefix.
// Let's assume the user will configure the button action manually or I use a hardcoded ID for dev.
// The user has not provided the CLIENT_ID yet. I will use a placeholder.

const REDIRECT_URI = window.location.origin + "/auth/discord/callback";

export const Login: React.FC = () => {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state as any)?.from?.pathname || "/";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Login failed");
            }

            login(data.token, data.user);
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDiscordLogin = () => {
        // We'll use a CLIENT_ID that needs to be replaced or served by backend.
        // Option B: Redirect to backend which redirects to Discord? Safer for secrets.
        // But code flow usually starts from frontend for SPA.
        // Let's go with frontend redirect, but we need the Client ID.
        // I'll grab it from the backend if possible? No, backend is separate.
        // Let's use a generic link but warning: DISCORD_CLIENT_ID needs to be set.

        // Actually, best practice: Frontend calls Backend "GET /api/auth/discord/url", Backend returns signed URL.
        // But for simplicity in this project: I will just construct it here.
        // I will trust the user to replace the Client ID or I can setup a simple endpoint to get it.

        // Let's just assume the user will fix the config or I'll add an endpoint to get config.
        // Actually, let's create "GET /api/auth/config" to get public config like Client ID!
        // That's cleaner. For now, I'll put a placeholder and fetch it in useEffect?
        // Or just hardcode for the demo if I had it.

        // I'll try to fetch it first? No, I'll just use a placeholder button that alerts if not configured.

        // Wait, the user asked me to implement it. I should make it work.
        // I'll create a new endpoint GET /api/config/discord-client-id

        // For this step, I'll write the Login component to fetch the ID on mount?
        // Or just hardcode what I think it might be (User didn't provide it).
        // I will add a TODO or a fetch.

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
                const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scope}&state=${state}`;
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
                <p>
                    Don't have an account? <Link to="/register">Register here</Link>
                </p>
            </div>
        </div>
    );
};
