
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { useAuth } from "../contexts/AuthContext";
import "./Highlights.css"; // We'll create this CSS file or use inline/main css

interface HighlightItem {
    id: number;
    name: string;
    iconUrl: string;
    reason: string;
}

interface MarketAnalysis {
    timestamp: number;
    highMargin: HighlightItem[];
    highVolume: HighlightItem[];
    priceSpikes: HighlightItem[];
    priceDrops: HighlightItem[];
    summary: string;
}

export const Highlights: React.FC = () => {
    const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { fetchWithAuth } = useAuth();

    useEffect(() => {
        fetchWithAuth(`${API_BASE_URL}/api/highlights`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch highlights");
                return res.json();
            })
            .then((data) => {
                setAnalysis(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setError("Unable to load market highlights");
                setLoading(false);
            });
    }, [fetchWithAuth]);

    if (loading) return <div className="highlights-loading">Loading daily market insights...</div>;
    if (error) return null; // Don't show if failed, just hide section
    if (!analysis) return null;

    return (
        <div className="highlights-container">
            <div className="highlights-header">
                <h2>
                    <span className="header-icon">📊</span>
                    <span className="header-title-text">Daily Market Analysis</span>
                </h2>
                <span className="highlights-timestamp">
                    Updated: {new Date(analysis.timestamp).toLocaleString()}
                </span>
            </div>

            <div className="highlights-summary-box">
                <p className="ai-summary">{analysis.summary}</p>
                <div className="ai-badge">AI Analysis</div>
            </div>

            <div className="highlights-grid">
                <HighlightSection title="💰 Mid Price Profit" items={analysis.highMargin} type="success" />
                <HighlightSection title="📈 Spikes" items={analysis.priceSpikes} type="warning" />
                <HighlightSection title="📉 Drops" items={analysis.priceDrops} type="danger" />
                <HighlightSection title="📦 Bulk Profit" items={analysis.highVolume} type="info" />
            </div>
        </div>
    );
};

const HighlightSection: React.FC<{
    title: string;
    items: HighlightItem[];
    type: "success" | "warning" | "danger" | "info";
}> = ({ title, items, type }) => (
    <div className={`highlight-card highlight-${type}`}>
        <h3>{title}</h3>
        <ul className="highlight-list">
            {items.map((item) => (
                <li key={item.id}>
                    <Link to={`/item/${item.id}`} state={{ from: 'highlights' }} className="highlight-item-link">
                        <img src={item.iconUrl} alt={item.name} className="highlight-icon" />
                        <div className="highlight-info">
                            <span className="highlight-name">{item.name}</span>
                            <span className="highlight-reason">{item.reason}</span>
                        </div>
                    </Link>
                </li>
            ))}
        </ul>
    </div>
);
