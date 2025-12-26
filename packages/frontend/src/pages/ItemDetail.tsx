import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PriceChart } from "../components/PriceChart";

interface Item {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  wikiUrl: string;
  iconUrl: string;
  buyPrice: number | null;
  sellPrice: number | null;
  margin: number | null;
  volume: number | null;
  dayChange: number | null;
  marginVolume: number | null;
}

interface PriceHistoryPoint {
  timestamp: number;
  buyPrice: number | null;
  sellPrice: number | null;
  volume: number | null;
}

export const ItemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  useEffect(() => {
    const fetchItem = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/items/${id}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setItem(data.item);
      } catch (err) {
        setError("Failed to load item details");
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [id]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!id) return;

      try {
        const now = Math.floor(Date.now() / 1000);
        let startTime: number;
        let granularity: "minute" | "hour" | "day" = "hour";

        switch (timeRange) {
          case "24h":
            startTime = now - 24 * 60 * 60;
            granularity = "minute";
            break;
          case "7d":
            startTime = now - 7 * 24 * 60 * 60;
            granularity = "hour";
            break;
          case "30d":
            startTime = now - 30 * 24 * 60 * 60;
            granularity = "day";
            break;
        }

        const res = await fetch(
          `/api/items/${id}/history?startTime=${startTime}&endTime=${now}&granularity=${granularity}`
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setPriceHistory(data.history || []);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to load price history:", err);
      }
    };

    fetchHistory();
  }, [id, timeRange]);

  if (loading) {
    return (
      <div className="app">
        <div className="item-detail-container">
          <p>Loading item details...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="app">
        <div className="item-detail-container">
          <p className="error">{error || "Item not found"}</p>
          <Link to="/" className="back-link">
            ← Back to items
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>OSRS Trading Tools</h1>
      </header>
      <main className="app-main">
        <div className="item-detail-container">
          <Link to="/" className="back-link">
            ← Back to items
          </Link>

          <div className="item-header">
            <img
              src={item.iconUrl}
              alt={item.name}
              className="item-detail-icon"
            />
            <div className="item-header-info">
              <h2>{item.name}</h2>
              <p className="item-examine">{item.examine}</p>
              <div className="item-meta">
                {item.members && <span className="members-badge">Members</span>}
                <a
                  href={item.wikiUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="wiki-link"
                >
                  View on Wiki →
                </a>
              </div>
            </div>
          </div>

          <div className="item-stats-grid">
            <div className="stat-card">
              <div className="stat-label">Buy Price</div>
              <div className="stat-value">
                {item.buyPrice?.toLocaleString() ?? "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sell Price</div>
              <div className="stat-value">
                {item.sellPrice?.toLocaleString() ?? "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Margin</div>
              <div className="stat-value">
                {item.margin?.toLocaleString() ?? "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Volume</div>
              <div className="stat-value">
                {item.volume?.toLocaleString() ?? "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">24h Change</div>
              <div
                className={`stat-value ${
                  item.dayChange !== null
                    ? item.dayChange > 0
                      ? "positive"
                      : item.dayChange < 0
                      ? "negative"
                      : ""
                    : ""
                }`}
              >
                {item.dayChange !== null
                  ? `${item.dayChange > 0 ? "+" : ""}${item.dayChange.toFixed(2)}%`
                  : "-"}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Margin × Volume</div>
              <div className="stat-value">
                {item.marginVolume?.toLocaleString() ?? "-"}
              </div>
            </div>
          </div>

          <div className="price-history-section">
            <div className="price-history-header">
              <h3>Price History</h3>
              <div className="time-range-selector">
                <button
                  className={`time-range-btn ${timeRange === "24h" ? "active" : ""}`}
                  onClick={() => setTimeRange("24h")}
                >
                  24h
                </button>
                <button
                  className={`time-range-btn ${timeRange === "7d" ? "active" : ""}`}
                  onClick={() => setTimeRange("7d")}
                >
                  7d
                </button>
                <button
                  className={`time-range-btn ${timeRange === "30d" ? "active" : ""}`}
                  onClick={() => setTimeRange("30d")}
                >
                  30d
                </button>
              </div>
            </div>
            <div className="chart-container">
              <PriceChart data={priceHistory} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

