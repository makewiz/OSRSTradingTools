import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import "./TradingGame.css";

interface TradingGameAccount {
  id: number;
  user_id: number | null;
  agent_id: number | null;
  cash_stack: number;
  created_at: number;
  updated_at: number;
  username?: string;
  agent_name?: string;
  is_agent?: boolean;
}

interface TradingGameOffer {
  id: number;
  account_id: number;
  slot: number;
  item_id: number;
  item_name: string;
  type: "BUY" | "SELL";
  target_quantity: number;
  filled_quantity: number;
  price: number;
  total_escrow: number;
  claimed_gp: number;
  claimed_items: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  created_at: number;
  updated_at: number;
}

interface TradingGameInventoryItem {
  id: number;
  account_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  avg_buy_price: number;
  updated_at: number;
}

interface AccountGameState {
  account: TradingGameAccount;
  offers: TradingGameOffer[];
  inventory: TradingGameInventoryItem[];
  netWorth: number;
  monthlyProfit: number;
  claimedUncollectedGP: number;
  claimedUncollectedItemsCount: number;
}

interface LeaderboardEntry {
  rank: number;
  accountId: number;
  name: string;
  isAgent: boolean;
  netWorth: number;
  profit: number;
  cashStack: number;
  activeOffersCount: number;
}

interface CombinedItem {
  id: number;
  name: string;
  iconUrl: string;
  buyPrice: number | null;
  sellPrice: number | null;
  limit: number | null;
}

export const TradingGame: React.FC = () => {
  const { fetchWithAuth, user } = useAuth();

  const [gameState, setGameState] = useState<AccountGameState | null>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<"ge" | "inventory" | "limits" | "leaderboard">("ge");

  // Leaderboard states
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardTimeframe, setLeaderboardTimeframe] = useState<"current" | "last_month" | "all_time">("current");
  const [leaderboardFilter, setLeaderboardFilter] = useState<"all" | "humans" | "agents">("all");

  // Offer Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSlot, setModalSlot] = useState<number>(0);
  const [allMarketItems, setAllMarketItems] = useState<CombinedItem[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<CombinedItem | null>(null);
  const [offerType, setOfferType] = useState<"BUY" | "SELL">("BUY");
  const [quantity, setQuantity] = useState<number>(1);
  const [price, setPrice] = useState<number>(0);
  const [itemLimitInfo, setItemLimitInfo] = useState<{ boughtInLast4Hours: number; buyLimit: number; remainingLimit: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    fetchGameState();
  }, [selectedAgentId]);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      fetchLeaderboard();
    }
  }, [activeTab, leaderboardTimeframe]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const agentRes = await fetchWithAuth(`${API_BASE_URL}/api/agents`);
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgents(agentData.agents || []);
      }

      const itemsRes = await fetch(`${API_BASE_URL}/api/items`);
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setAllMarketItems(itemsData.items || []);
      }

      await fetchGameState();
    } catch (err: any) {
      setError(err.message || "Failed to initialize game");
    } finally {
      setLoading(false);
    }
  };

  const fetchGameState = async () => {
    try {
      const url = selectedAgentId
        ? `${API_BASE_URL}/api/game/account?agentId=${selectedAgentId}`
        : `${API_BASE_URL}/api/game/account`;
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error("Failed to load trading game state");
      const data = await res.json();
      setGameState(data);
    } catch (err: any) {
      setError(err.message || "Error fetching game state");
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/game/leaderboard?type=${leaderboardTimeframe}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err: any) {
      console.error("Leaderboard error:", err);
    }
  };

  const openCreateOfferModal = async (slot: number, defaultType: "BUY" | "SELL" = "BUY", presetItem?: CombinedItem, presetQty?: number, presetPrice?: number) => {
    setModalSlot(slot);
    setOfferType(defaultType);
    setSelectedItem(presetItem || null);
    setItemSearchQuery(presetItem ? presetItem.name : "");
    setQuantity(presetQty || 1);
    setPrice(presetPrice || presetItem?.buyPrice || 1);
    setItemLimitInfo(null);
    setIsModalOpen(true);
    setError(null);

    if (presetItem) {
      fetchItemLimit(presetItem.id);
    }
  };

  const fetchItemLimit = async (itemId: number) => {
    try {
      const url = selectedAgentId
        ? `${API_BASE_URL}/api/game/limits/${itemId}?agentId=${selectedAgentId}`
        : `${API_BASE_URL}/api/game/limits/${itemId}`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setItemLimitInfo({
          boughtInLast4Hours: data.boughtInLast4Hours,
          buyLimit: data.buyLimit,
          remainingLimit: data.remainingLimit
        });
      }
    } catch (err) {
      console.error("Failed to fetch item limit", err);
    }
  };

  const handleSelectItem = (item: CombinedItem) => {
    setSelectedItem(item);
    setItemSearchQuery(item.name);
    setPrice(offerType === "BUY" ? (item.buyPrice || 1) : (item.sellPrice || 1));
    fetchItemLimit(item.id);
  };

  const handlePlaceOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("Please select an item.");
      return;
    }
    if (quantity <= 0 || price <= 0) {
      setError("Quantity and Price must be positive integers.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const body = {
        slot: modalSlot,
        itemId: selectedItem.id,
        type: offerType,
        quantity,
        price,
        ...(selectedAgentId ? { agentId: selectedAgentId } : {})
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/api/game/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to place offer");
      }

      setIsModalOpen(false);
      setSuccessMessage(`Placed ${offerType} offer for ${quantity.toLocaleString()}x ${selectedItem.name} @ ${price.toLocaleString()} GP!`);
      await fetchGameState();
    } catch (err: any) {
      setError(err.message || "Failed to place offer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOffer = async (offerId: number) => {
    if (!confirm("Are you sure you want to cancel this offer? Unfilled escrow will be refunded.")) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/game/offers/${offerId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to cancel offer");
      }
      setSuccessMessage("Offer cancelled successfully.");
      await fetchGameState();
    } catch (err: any) {
      setError(err.message || "Failed to cancel offer");
    }
  };

  const handleCollectSlot = async (offerId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/game/offers/${offerId}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to collect slot");
      }
      setSuccessMessage("Items / GP collected into account!");
      await fetchGameState();
    } catch (err: any) {
      setError(err.message || "Failed to collect slot");
    }
  };

  if (loading && !gameState) {
    return <div style={{ textAlign: "center", padding: "80px", color: "#94a3b8", fontSize: "1.2rem" }}>Loading Grand Exchange Trading Game...</div>;
  }

  const activeOffersMap = new Map<number, TradingGameOffer>();
  if (gameState) {
    for (const offer of gameState.offers) {
      if (offer.status === "ACTIVE" || offer.claimed_gp > 0 || offer.claimed_items > 0) {
        activeOffersMap.set(offer.slot, offer);
      }
    }
  }

  const filteredLeaderboard = leaderboard.filter(e => {
    if (leaderboardFilter === "humans") return !e.isAgent;
    if (leaderboardFilter === "agents") return e.isAgent;
    return true;
  });

  const matchingItems = itemSearchQuery.trim().length >= 2
    ? allMarketItems.filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase())).slice(0, 10)
    : [];

  return (
    <div className="tg-container">
      {/* Header Banner */}
      <div className="tg-header-banner">
        <div className="tg-header-top">
          <div className="tg-title-area">
            <h1>
              <span>🏆</span>
              <span>OSRS Grand Exchange Trading Game</span>
            </h1>
            <p className="tg-subtitle">
              Buy low, sell high using authentic Grand Exchange 8-slot mechanics & 4-hour trade limits matched in real time against live OSRS trade volumes!
            </p>
          </div>

          {/* Trader Switcher */}
          <div className="tg-trader-switcher">
            <button
              onClick={() => setSelectedAgentId(null)}
              className={`tg-trader-btn ${selectedAgentId === null ? "active-human" : ""}`}
            >
              🎮 You ({user?.username || "Player"})
            </button>

            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`tg-trader-btn ${selectedAgentId === agent.id ? "active-agent" : ""}`}
              >
                🤖 {agent.name}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        {gameState && (
          <div className="tg-stats-grid">
            <div className="tg-stat-card">
              <div className="tg-stat-label">Cash Stack</div>
              <div className="tg-stat-value gold">
                {gameState.account.cash_stack.toLocaleString()} GP
              </div>
            </div>

            <div className="tg-stat-card">
              <div className="tg-stat-label">Total Net Worth</div>
              <div className="tg-stat-value emerald">
                {gameState.netWorth.toLocaleString()} GP
              </div>
            </div>

            <div className="tg-stat-card">
              <div className="tg-stat-label">Monthly Profit</div>
              <div className={`tg-stat-value ${gameState.monthlyProfit >= 0 ? "emerald" : "rose"}`}>
                {gameState.monthlyProfit >= 0 ? "+" : ""}{gameState.monthlyProfit.toLocaleString()} GP
              </div>
            </div>

            <div className="tg-stat-card">
              <div className="tg-stat-label">Reset Schedule</div>
              <div className="tg-stat-value gray">
                1st of Next Month (00:00 UTC)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="tg-alert error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="tg-alert-close">×</button>
        </div>
      )}
      {successMessage && (
        <div className="tg-alert success">
          <span>✅ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="tg-alert-close">×</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tg-tabs-bar">
        <button
          onClick={() => setActiveTab("ge")}
          className={`tg-tab-btn ${activeTab === "ge" ? "active" : ""}`}
        >
          🏛️ GE Slots (8 Max)
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`tg-tab-btn ${activeTab === "inventory" ? "active" : ""}`}
        >
          🎒 Bank & Inventory ({gameState?.inventory.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`tg-tab-btn ${activeTab === "leaderboard" ? "active" : ""}`}
        >
          🏆 Leaderboards
        </button>
      </div>

      {/* TAB 1: GE 8-SLOT GRID */}
      {activeTab === "ge" && gameState && (
        <div>
          <div className="tg-slots-header">
            <h2>
              Active Trade Offers ({gameState.offers.filter(o => o.status === "ACTIVE").length} / 8 Slots Used)
            </h2>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Offers fill automatically when live OSRS trades occur at your price or better.
            </span>
          </div>

          <div className="tg-slots-grid">
            {Array.from({ length: 8 }).map((_, slotIndex) => {
              const offer = activeOffersMap.get(slotIndex);
              const hasClaimable = offer && (offer.claimed_gp > 0 || offer.claimed_items > 0);
              const progressPct = offer ? Math.min(100, Math.round((offer.filled_quantity / offer.target_quantity) * 100)) : 0;

              return (
                <div
                  key={slotIndex}
                  className={`tg-slot-card ${
                    offer
                      ? offer.type === "BUY"
                        ? "buy"
                        : "sell"
                      : "empty"
                  }`}
                >
                  {offer ? (
                    <>
                      <div>
                        <div className="tg-slot-header">
                          <span className="tg-slot-num">SLOT #{slotIndex + 1}</span>
                          <span className={`tg-badge-type ${offer.type === "BUY" ? "buy" : "sell"}`}>
                            {offer.type}
                          </span>
                        </div>

                        <div className="tg-item-title">{offer.item_name}</div>
                        <div className="tg-item-details">
                          {offer.filled_quantity.toLocaleString()} / {offer.target_quantity.toLocaleString()} @ {offer.price.toLocaleString()} GP
                        </div>

                        <div className="tg-progress-track">
                          <div
                            className={`tg-progress-fill ${offer.type === "BUY" ? "buy" : "sell"}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="tg-progress-text">{progressPct}% Filled</div>
                      </div>

                      <div className="tg-slot-footer">
                        {hasClaimable ? (
                          <button
                            onClick={() => handleCollectSlot(offer.id)}
                            className="tg-btn-collect"
                          >
                            🎁 Collect ({offer.claimed_items > 0 ? `${offer.claimed_items} Items` : `${offer.claimed_gp.toLocaleString()} GP`})
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelOffer(offer.id)}
                            className="tg-btn-cancel"
                          >
                            Cancel Offer
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="tg-empty-number">{slotIndex + 1}</div>
                      <div style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>Empty GE Slot</div>
                      <button
                        onClick={() => openCreateOfferModal(slotIndex, "BUY")}
                        className="tg-btn-create"
                      >
                        + Create Offer
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY & BANK */}
      {activeTab === "inventory" && gameState && (
        <div>
          <div className="tg-slots-header">
            <h2>Held Items ({gameState.inventory.length} Unique Items)</h2>
            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Items acquired from completed buy offers.
            </span>
          </div>

          {gameState.inventory.length === 0 ? (
            <div className="tg-table-card" style={{ padding: "48px", textAlign: "center", color: "#64748b" }}>
              No items in your bank inventory yet. Complete buy offers in GE to accumulate items!
            </div>
          ) : (
            <div className="tg-table-card">
              <table className="tg-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th style={{ textAlign: "right" }}>Quantity</th>
                    <th style={{ textAlign: "right" }}>Avg Buy Price</th>
                    <th style={{ textAlign: "right" }}>Total Invested</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gameState.inventory.map(inv => {
                    const totalInvested = Math.round(inv.quantity * inv.avg_buy_price);
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 700 }}>{inv.item_name}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{inv.quantity.toLocaleString()}</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>{Math.round(inv.avg_buy_price).toLocaleString()} GP</td>
                        <td style={{ textAlign: "right", fontFamily: "monospace", color: "#f59e0b", fontWeight: 700 }}>{totalInvested.toLocaleString()} GP</td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => {
                              const marketItem = allMarketItems.find(i => i.id === inv.item_id);
                              const emptySlot = Array.from({ length: 8 }).findIndex((_, idx) => !activeOffersMap.has(idx));
                              if (emptySlot === -1) {
                                setError("All 8 GE slots are full. Cancel an offer first to sell.");
                                return;
                              }
                              setActiveTab("ge");
                              openCreateOfferModal(emptySlot, "SELL", marketItem, inv.quantity, marketItem?.sellPrice || Math.round(inv.avg_buy_price * 1.02));
                            }}
                            className="tg-btn-create"
                            style={{ margin: 0 }}
                          >
                            Sell in GE
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LEADERBOARDS */}
      {activeTab === "leaderboard" && (
        <div>
          <div className="tg-lb-controls">
            {/* Timeframe Switcher */}
            <div className="tg-pill-group">
              <button
                onClick={() => setLeaderboardTimeframe("current")}
                className={`tg-pill-btn ${leaderboardTimeframe === "current" ? "active" : ""}`}
              >
                Current Month
              </button>
              <button
                onClick={() => setLeaderboardTimeframe("last_month")}
                className={`tg-pill-btn ${leaderboardTimeframe === "last_month" ? "active" : ""}`}
              >
                Last Month Top Traders
              </button>
              <button
                onClick={() => setLeaderboardTimeframe("all_time")}
                className={`tg-pill-btn ${leaderboardTimeframe === "all_time" ? "active" : ""}`}
              >
                All-Time Cumulative
              </button>
            </div>

            {/* Entity Filter */}
            <div className="tg-pill-group">
              <button
                onClick={() => setLeaderboardFilter("all")}
                className={`tg-pill-btn ${leaderboardFilter === "all" ? "active" : ""}`}
              >
                All
              </button>
              <button
                onClick={() => setLeaderboardFilter("humans")}
                className={`tg-pill-btn ${leaderboardFilter === "humans" ? "active" : ""}`}
              >
                🎮 Humans
              </button>
              <button
                onClick={() => setLeaderboardFilter("agents")}
                className={`tg-pill-btn ${leaderboardFilter === "agents" ? "active" : ""}`}
              >
                🤖 AI Agents
              </button>
            </div>
          </div>

          <div className="tg-table-card">
            <table className="tg-table">
              <thead>
                <tr>
                  <th style={{ width: "60px", textAlign: "center" }}>Rank</th>
                  <th>Trader</th>
                  <th style={{ textAlign: "right" }}>Net Worth</th>
                  <th style={{ textAlign: "right" }}>Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "#64748b", padding: "32px" }}>
                      No leaderboard data for this category.
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map((entry) => (
                    <tr key={entry.accountId}>
                      <td style={{ textAlign: "center", fontWeight: 800, fontFamily: "monospace" }}>
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                      </td>
                      <td style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>{entry.isAgent ? "🤖" : "🎮"}</span>
                        <span>{entry.name}</span>
                        {entry.isAgent && (
                          <span className="tg-badge-stack" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>
                            AI Agent
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>
                        {entry.netWorth.toLocaleString()} GP
                      </td>
                      <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: entry.profit >= 0 ? "#10b981" : "#f43f5e" }}>
                        {entry.profit >= 0 ? "+" : ""}{entry.profit.toLocaleString()} GP
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: CREATE OFFER */}
      {isModalOpen && (
        <div className="tg-modal-overlay">
          <div className="tg-modal-box">
            <div className="tg-modal-header">
              <h3>Place Offer in GE Slot #{modalSlot + 1}</h3>
              <button onClick={() => setIsModalOpen(false)} className="tg-alert-close">×</button>
            </div>

            <form onSubmit={handlePlaceOffer}>
              {/* Type Switcher */}
              <div className="tg-pill-group" style={{ width: "100%", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => setOfferType("BUY")}
                  className={`tg-pill-btn ${offerType === "BUY" ? "active" : ""}`}
                  style={{ flex: 1, padding: "8px" }}
                >
                  Buy Offer
                </button>
                <button
                  type="button"
                  onClick={() => setOfferType("SELL")}
                  className={`tg-pill-btn ${offerType === "SELL" ? "active" : ""}`}
                  style={{ flex: 1, padding: "8px" }}
                >
                  Sell Offer
                </button>
              </div>

              {/* Item Search */}
              <div className="tg-form-group">
                <label className="tg-form-label">Search Item</label>
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => {
                    setItemSearchQuery(e.target.value);
                    setSelectedItem(null);
                  }}
                  placeholder="e.g. Shark, Zulrah's scale, Abyssal whip..."
                  className="tg-input"
                />

                {matchingItems.length > 0 && !selectedItem && (
                  <div className="tg-autocomplete-list">
                    {matchingItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="tg-autocomplete-item"
                      >
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "0.8rem" }}>
                          {offerType === "BUY" ? `Buy: ${item.buyPrice?.toLocaleString() || "?"} GP` : `Sell: ${item.sellPrice?.toLocaleString() || "?"} GP`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedItem && (
                <div style={{ background: "#0f131d", padding: "12px", borderRadius: "8px", border: "1px solid #1e293b", marginBottom: "16px", fontSize: "0.8rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Market Buy Price:</span>
                    <span style={{ fontFamily: "monospace", color: "#f59e0b" }}>{selectedItem.buyPrice?.toLocaleString() || "?"} GP</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Market Sell Price:</span>
                    <span style={{ fontFamily: "monospace", color: "#10b981" }}>{selectedItem.sellPrice?.toLocaleString() || "?"} GP</span>
                  </div>
                  {itemLimitInfo && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #1e293b" }}>
                      <span style={{ color: "#64748b" }}>4-Hour Buy Limit:</span>
                      <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>
                        {itemLimitInfo.boughtInLast4Hours} / {itemLimitInfo.buyLimit} used ({itemLimitInfo.remainingLimit} remaining)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity & Price */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div className="tg-form-group" style={{ margin: 0 }}>
                  <label className="tg-form-label">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="tg-input"
                    style={{ fontFamily: "monospace" }}
                  />
                </div>

                <div className="tg-form-group" style={{ margin: 0 }}>
                  <label className="tg-form-label">Price per item (GP)</label>
                  <input
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="tg-input"
                    style={{ fontFamily: "monospace" }}
                  />
                </div>
              </div>

              {/* Total Escrow Calculation */}
              <div style={{ background: "#0f131d", padding: "12px 16px", borderRadius: "8px", border: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.85rem" }}>Total Escrow Cost:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#f59e0b", fontSize: "1.1rem" }}>
                  {(quantity * price).toLocaleString()} GP
                </span>
              </div>

              <div className="tg-modal-footer">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="tg-btn-cancel-modal"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedItem}
                  className={`tg-btn-submit ${offerType === "SELL" ? "sell" : ""}`}
                  style={{ opacity: submitting || !selectedItem ? 0.5 : 1 }}
                >
                  {submitting ? "Placing..." : `Place ${offerType} Offer`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
