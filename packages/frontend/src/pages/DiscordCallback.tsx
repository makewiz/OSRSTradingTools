import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const DiscordCallback: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { login, token } = useAuth();
    const [error, setError] = useState<string | null>(null);

    const processed = React.useRef(false); // Add ref to track if already processed

    useEffect(() => {
        if (processed.current) return; // Skip if already processed

        const code = searchParams.get("code");
        const state = searchParams.get("state"); // "login" or "link"

        if (!code) {
            setError("No authorization code found.");
            return;
        }

        processed.current = true; // Mark as processed

        const handleCallback = async () => {
            try {
                if (state === "link") {
                    // Linking flow
                    if (!token) {
                        throw new Error("You must be logged in to link an account.");
                    }
                    const res = await fetch("/api/discord/link-oauth", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({ code })
                    });

                    if (!res.ok) throw new Error("Failed to link account.");

                    navigate("/profile");
                } else {
                    // Login flow (default)
                    const res = await fetch("/api/auth/discord/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code })
                    });

                    if (!res.ok) throw new Error("Failed to login with Discord.");

                    const data = await res.json();
                    // Fix argument order: login(token, user)
                    login(data.token, data.user);
                    navigate("/");
                }
            } catch (err: any) {
                setError(err.message || "An unknown error occurred.");
                processed.current = false; // Allow retry if it failed? Or maybe not.
            }
        };

        handleCallback();
    }, [searchParams, token, login, navigate]);

    return (
        <div className="app-main" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
            {error ? (
                <div style={{ color: "red", textAlign: "center" }}>
                    <h2>Error</h2>
                    <p>{error}</p>
                    <button onClick={() => navigate("/")} className="page-button">Go Home</button>
                </div>
            ) : (
                <div style={{ textAlign: "center" }}>
                    <h2>Processing Discord Login...</h2>
                    <div className="loading-spinner" style={{ margin: "20px auto" }}></div>
                </div>
            )}
        </div>
    );
};
