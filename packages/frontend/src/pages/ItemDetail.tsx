import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PriceChart } from "../components/PriceChart";
import { useAuth } from "../contexts/AuthContext";
// Header import removed as it is handled by App.tsx

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
  const { user, token } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  // Watch logic
  const [watches, setWatches] = useState<number[]>([]);
  const [discordLinked, setDiscordLinked] = useState(false);

  // Load watches
  useEffect(() => {
    const loadWatches = async () => {
      if (user && token && id) {
        try {
          const res = await fetch("/api/discord/settings", {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data.linked) {
              setDiscordLinked(true);
              setWatches(data.watches ? data.watches.map((w: any) => w.item_id) : []);
            } else {
              setDiscordLinked(false);
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to fetch watches", err);
        }
      }
    };
    loadWatches();
  }, [user, token, id]);

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

  const toggleWatch = async () => {
    if (!item || !user || !discordLinked) {
      if (!discordLinked && user) {
        alert("Please link your Discord account in Profile to use watches.");
      }
      return;
    }

    const itemId = item.id;
    const isWatched = watches.includes(itemId);
    const newWatches = isWatched
      ? watches.filter(x => x !== itemId)
      : [...watches, itemId];
    setWatches(newWatches);

    try {
      const method = isWatched ? "DELETE" : "POST";
      const url = isWatched ? `/api/discord/watch/${itemId}` : "/api/discord/watch";
      const body = isWatched ? undefined : JSON.stringify({ itemId: itemId, threshold: 5.0 });

      await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to sync watch", err);
    }
  };

  if (loading) {
    return (
      <div className="item-detail-container">
        <p>Loading item details...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="item-detail-container">
        <p className="error">{error || "Item not found"}</p>
        <Link to="/" className="back-link">
          ← Back to items
        </Link>
      </div>
    );
  }

  const isWatched = watches.includes(item.id);

  return (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2>{item.name}</h2>
              {discordLinked ? (
                <button
                  className="watch-button"
                  style={{
                    background: isWatched ? '#5865f2' : 'transparent',
                    color: isWatched ? '#fff' : '#5865f2',
                    border: '1px solid #5865f2',
                    fontSize: '1.2rem',
                    padding: '5px 10px'
                  }}
                  onClick={toggleWatch}
                  title={isWatched ? "Unwatch" : "Watch (5% threshold)"}
                >
                  {isWatched ? "🔔 Watching" : "🔕 Watch"}
                </button>
              ) : (
                <button
                  className="watch-button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `/watch ${item.id} // ${item.name}`
                    )
                  }
                  title="Login and link Discord to enable 1-click watch"
                >
                  Copy /watch
                </button>
              )}
            </div>

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
              className={`stat-value ${item.dayChange !== null
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
  );
};
