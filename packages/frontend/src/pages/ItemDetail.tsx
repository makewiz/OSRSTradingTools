import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PriceChart } from "../components/PriceChart";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
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
  limit: number | null;
  lastBuyTime: number | null;
  lastSellTime: number | null;
  lastBuyVolume: number | null;
  lastSellVolume: number | null;
  roi: number | null;
  profit: number | null;
  tax: number | null;
  potentialProfit: number | null;
}

interface PriceHistoryPoint {
  timestamp: number;
  buyPrice: number | null;
  sellPrice: number | null;
  volume: number | null;
}

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return "-";
  const seconds = Math.floor((Date.now() / 1000) - timestamp);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const ItemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token, fetchWithAuth } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [priceHistory, setPriceHistory] = useState<any>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  // Watch logic
  const [watches, setWatches] = useState<number[]>([]);
  const [discordLinked, setDiscordLinked] = useState(false);

  // Favorites logic
  const [favorites, setFavorites] = useState<number[]>([]);

  useEffect(() => {
    const loadFavorites = async () => {
      if (user && token) {
        // Fetch from API
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/api/favorites`);
          if (res.ok) {
            const data = await res.json();
            setFavorites(data.favorites);
          }
        } catch (err) {
          // console.error("Failed to fetch favorites", err);
        }
      } else {
        // Load from localStorage
        const saved = localStorage.getItem("favorites");
        if (saved) {
          setFavorites(JSON.parse(saved));
        }
      }
    };
    loadFavorites();
  }, [user, token]);

  // Sync favorites to localStorage only if NOT logged in
  useEffect(() => {
    if (!user) {
      localStorage.setItem("favorites", JSON.stringify(favorites));
    }
  }, [favorites, user]);

  const toggleFavorite = async () => {
    if (!item) return;

    const isFav = favorites.includes(item.id);

    // Optimistic update
    const newFavs = isFav
      ? favorites.filter((id) => id !== item.id)
      : [...favorites, item.id];
    setFavorites(newFavs);

    if (user && token) {
      try {
        const method = isFav ? "DELETE" : "POST";
        const url = isFav ? `${API_BASE_URL}/api/favorites/${item.id}` : `${API_BASE_URL}/api/favorites`;
        const body = isFav ? undefined : JSON.stringify({ itemId: item.id });

        await fetchWithAuth(url, {
          method,
          headers: {
            "Content-Type": "application/json"
          },
          body
        });
      } catch (err) {
        // console.error("Failed to sync favorite", err);
      }
    } else {
      localStorage.setItem("favorites", JSON.stringify(newFavs));
    }
  };

  // Load watches
  useEffect(() => {
    const loadWatches = async () => {
      if (user && token && id) {
        try {
          const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/settings`);
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
        const res = await fetchWithAuth(`${API_BASE_URL}/api/items/${id}`);
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

        const timeRanges: Record<string, number> = {
          "24h": 24 * 60 * 60,
          "7d": 7 * 24 * 60 * 60,
          "30d": 30 * 24 * 60 * 60,
        };
        const rangeSeconds = timeRanges[timeRange] || timeRanges["7d"];
        const startTime = now - rangeSeconds;

        const url = `${API_BASE_URL}/api/items/${id}/history?startTime=${startTime}&endTime=${now}`;
        const res = await fetchWithAuth(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();

        // Always expect high fidelity format (split arrays)
        if (data.highFidelity) {
          setPriceHistory(data);
        } else {
          // Fallback for any legacy cached responses
          setPriceHistory(data.history || []);
        }
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
      const url = isWatched ? `${API_BASE_URL}/api/discord/watch/${itemId}` : `${API_BASE_URL}/api/discord/watch`;
      const body = isWatched ? undefined : JSON.stringify({ itemId: itemId, threshold: 5.0 });

      await fetchWithAuth(url, {
        method,
        headers: {
          "Content-Type": "application/json"
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
        <Link to="/items" className="back-link">
          ← Back to items
        </Link>
      </div>
    );
  }

  const isWatched = watches.includes(item.id);
  const isFavorite = favorites.includes(item.id);

  return (
    <main className="app-main">
      <div className="item-detail-container">
        <Link to="/items" className="back-link">
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
              <button
                className="fav-button"
                onClick={toggleFavorite}
                style={{ fontSize: '1.5rem' }}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                {isFavorite ? "♥" : "♡"}
              </button>
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
            <div className="stat-subtext">
              {formatTimeAgo(item.lastBuyTime)} • {item.lastBuyVolume !== null ? `${item.lastBuyVolume} vol (5m)` : "-"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Sell Price</div>
            <div className="stat-value">
              {item.sellPrice?.toLocaleString() ?? "-"}
            </div>
            <div className="stat-subtext">
              {formatTimeAgo(item.lastSellTime)} • {item.lastSellVolume !== null ? `${item.lastSellVolume} vol (5m)` : "-"}
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


          <div className="stat-card">
            <div className="stat-label">Buy Limit</div>
            <div className="stat-value">
              {item.limit?.toLocaleString() ?? "-"}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label" title="2% tax on Sell Price (capped at 5m)">Tax (2%) ⓘ</div>
            <div className="stat-value text-muted">
              {item.tax !== null ? `-${item.tax.toLocaleString()}` : "-"}
            </div>
          </div>

          <div className="stat-card highlight-card">
            <div className="stat-label" title="(Sell Price - Tax) - Buy Price">Net Profit ⓘ</div>
            <div className="stat-value" style={{ color: (item.profit || 0) > 0 ? '#4caf50' : '#f44336' }}>
              {item.profit?.toLocaleString() ?? "-"}
            </div>
          </div>

          <div className="stat-card highlight-card">
            <div className="stat-label" title="Net Profit / Buy Price * 100">ROI ⓘ</div>
            <div className="stat-value" style={{ color: (item.roi || 0) > 5 ? '#4caf50' : (item.roi || 0) > 0 ? '#ff9800' : '#f44336' }}>
              {item.roi?.toFixed(2)}%
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label" title="Net Profit * Buy Limit">Potential Profit ⓘ</div>
            <div className="stat-value text-gold">
              {item.potentialProfit?.toLocaleString() ?? "-"}
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
            <PriceChart data={priceHistory} isHighFidelity={!(Array.isArray(priceHistory) && priceHistory.length > 0 && 'buyPrice' in priceHistory[0])} />
          </div>
        </div>
      </div>
    </main>
  );
};
