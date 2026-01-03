import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const Header: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <header className="app-header">
            <div className="user-nav">
                {user ? (
                    <>
                        <span>{user.username}</span>
                        <button className="logout-button" onClick={handleLogout}>
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link to="/login">Login</Link>
                        <Link to="/register">Register</Link>
                    </>
                )}
            </div>
            <h1>
                <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>
                    OSRS Trading Tools
                </Link>
            </h1>
            <p>Browse GE items, sort by margin & volume, and track your favourites.</p>
        </header>
    );
};
