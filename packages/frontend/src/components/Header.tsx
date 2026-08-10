import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export const Header: React.FC = () => {
    const { user, logout, registrationEnabled } = useAuth();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    const handleLogout = () => {
        logout();
        setIsMenuOpen(false);
        navigate("/login");
    };

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const closeMenu = () => {
        setIsMenuOpen(false);
    };

    return (
        <header className="app-header">
            <div className="header-container">
                <div className="brand">
                    <h1>
                        <Link to="/" style={{ color: "inherit", textDecoration: "none" }} onClick={closeMenu}>
                            OSRS Trading Tools
                        </Link>
                    </h1>
                    <button className="menu-toggle" onClick={toggleMenu} aria-label="Toggle Navigation">
                        ☰
                    </button>
                </div>

                <nav className={`main-nav ${isMenuOpen ? 'open' : ''}`}>
                    <Link to="/" className="nav-link" onClick={closeMenu}>Highlights</Link>
                    <Link to="/game" className="nav-link font-bold text-amber-400" onClick={closeMenu}>Trading Game 🏆</Link>
                    <Link to="/recipes" className="nav-link" onClick={closeMenu}>Recipes</Link>
                    <Link to="/arbitrage" className="nav-link" onClick={closeMenu}>Arbitrage</Link>
                    <Link to="/items" className="nav-link" onClick={closeMenu}>Items</Link>


                    {user ? (
                        <>
                            <Link to="/favorites" className="nav-link" onClick={closeMenu}>Favorites</Link>
                            <Link to="/watches" className="nav-link" onClick={closeMenu}>Watches</Link>
                            {user.is_admin && (
                                <Link to="/admin" className="nav-link" onClick={closeMenu}>Admin</Link>
                            )}
                            <div className="nav-divider"></div>
                            <Link to="/profile" className="nav-link profile-link" onClick={closeMenu}>
                                Profile ({user.username})
                            </Link>
                            <button className="logout-button nav-link" onClick={handleLogout}>
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="nav-divider"></div>
                            <Link to="/login" className="nav-link" onClick={closeMenu}>Login</Link>
                            {registrationEnabled && (
                                <Link to="/register" className="nav-link" onClick={closeMenu}>Register</Link>
                            )}
                        </>
                    )}
                </nav>
            </div>
            <p className="header-tagline">Browse GE items, sort by margin & volume, and track your favourites.</p>
        </header>
    );
};
