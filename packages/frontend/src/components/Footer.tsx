import React from "react";
import { Link } from "react-router-dom";

export const Footer: React.FC = () => {
    return (
        <footer style={{
            marginTop: '60px',
            padding: '30px 20px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            color: '#888',
            fontSize: '0.9rem'
        }}>
            <div style={{ marginBottom: '15px' }}>
                <Link to="/privacy" style={{ color: '#aaa', margin: '0 15px', textDecoration: 'none' }}>
                    Privacy Policy
                </Link>
                <span style={{ color: '#555' }}>•</span>
                <Link to="/terms" style={{ color: '#aaa', margin: '0 15px', textDecoration: 'none' }}>
                    Terms of Service
                </Link>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
                <p style={{ margin: '5px 0' }}>
                    OSRS Trading Tools is a fan-made project and is not affiliated with Jagex Ltd.
                </p>
                <p style={{ margin: '5px 0' }}>
                    Old School RuneScape is a trademark of Jagex Ltd.
                </p>
                <p style={{ margin: '10px 0 0 0' }}>
                    © {new Date().getFullYear()} OSRS Trading Tools
                </p>
            </div>
        </footer>
    );
};
