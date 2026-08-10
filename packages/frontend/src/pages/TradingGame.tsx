import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";

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
      // Fetch user's agents
      const agentRes = await fetchWithAuth(`${API_BASE_URL}/api/agents`);
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgents(agentData.agents || []);
      }

      // Fetch items for offer modal search
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
    return <div className="text-center py-20 text-gray-400 text-lg">Loading Grand Exchange Trading Game...</div>;
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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 p-6 rounded-2xl border border-amber-500/30 shadow-2xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-amber-400 tracking-wide font-serif">
                OSRS Grand Exchange Trading Game
              </h1>
              <span className="bg-amber-500/20 text-amber-300 text-xs px-3 py-1 rounded-full font-mono border border-amber-500/40">
                10M Starting Stack
              </span>
            </div>
            <p className="text-gray-300 text-sm mt-1 max-w-2xl">
              Buy low, sell high using authentic Grand Exchange 8-slot mechanics & 4-hour trade limits matched in real time against live OSRS trade volumes!
            </p>
          </div>

          {/* Account/Agent Switcher */}
          <div className="flex items-center gap-2 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700">
            <button
              onClick={() => setSelectedAgentId(null)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                selectedAgentId === null
                  ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                  : "text-gray-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              🎮 You ({user?.username || "Player"})
            </button>

            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`px-3 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
                  selectedAgentId === agent.id
                    ? "bg-purple-600 text-white shadow-md font-bold"
                    : "text-purple-300 hover:text-white hover:bg-purple-900/40"
                }`}
              >
                🤖 {agent.name}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Strip */}
        {gameState && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Cash Stack</div>
              <div className="text-2xl font-bold text-amber-400 font-mono mt-1">
                {gameState.account.cash_stack.toLocaleString()} GP
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Net Worth</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                {gameState.netWorth.toLocaleString()} GP
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Monthly Profit</div>
              <div className={`text-2xl font-bold font-mono mt-1 ${gameState.monthlyProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {gameState.monthlyProfit >= 0 ? "+" : ""}{gameState.monthlyProfit.toLocaleString()} GP
              </div>
            </div>

            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800/80">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">Reset Schedule</div>
              <div className="text-sm font-semibold text-gray-300 mt-1">
                1st of Next Month (00:00 UTC)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white font-bold text-lg">×</button>
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl flex items-center justify-between">
          <span>✅ {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white font-bold text-lg">×</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-4 text-sm font-semibold">
        <button
          onClick={() => setActiveTab("ge")}
          className={`pb-3 px-4 transition-colors relative ${
            activeTab === "ge"
              ? "text-amber-400 border-b-2 border-amber-400 font-bold"
              : "text-gray-400 hover:text-white"
          }`}
        >
          🏛️ GE Slots (8 Max)
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 px-4 transition-colors relative ${
            activeTab === "inventory"
              ? "text-amber-400 border-b-2 border-amber-400 font-bold"
              : "text-gray-400 hover:text-white"
          }`}
        >
          🎒 Bank & Inventory ({gameState?.inventory.length || 0})
        </button>
        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`pb-3 px-4 transition-colors relative ${
            activeTab === "leaderboard"
              ? "text-amber-400 border-b-2 border-amber-400 font-bold"
              : "text-gray-400 hover:text-white"
          }`}
        >
          🏆 Leaderboards
        </button>
      </div>

      {/* TAB 1: GE 8-SLOT GRID */}
      {activeTab === "ge" && gameState && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-200">
              Active Trade Offers ({gameState.offers.filter(o => o.status === "ACTIVE").length} / 8 Slots Used)
            </h2>
            <span className="text-xs text-gray-400">
              Offers fill automatically when live OSRS trades occur at your price or better.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, slotIndex) => {
              const offer = activeOffersMap.get(slotIndex);
              const hasClaimable = offer && (offer.claimed_gp > 0 || offer.claimed_items > 0);
              const progressPct = offer ? Math.min(100, Math.round((offer.filled_quantity / offer.target_quantity) * 100)) : 0;

              return (
                <div
                  key={slotIndex}
                  className={`rounded-2xl border p-5 flex flex-col justify-between transition-all min-h-[220px] relative overflow-hidden ${
                    offer
                      ? offer.type === "BUY"
                        ? "bg-slate-900/90 border-blue-500/40 shadow-lg shadow-blue-950/20"
                        : "bg-slate-900/90 border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                      : "bg-slate-900/40 border-slate-800 hover:border-amber-500/40 border-dashed"
                  }`}
                >
                  {offer ? (
                    <>
                      {/* Slot Header */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wider">
                            Slot #{slotIndex + 1}
                          </span>
                          <span
                            className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                              offer.type === "BUY" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            }`}
                          >
                            {offer.type}
                          </span>
                        </div>

                        <div className="font-bold text-lg text-gray-100 truncate mt-1">
                          {offer.item_name}
                        </div>

                        <div className="text-sm font-mono text-gray-300 mt-1">
                          {offer.filled_quantity.toLocaleString()} / {offer.target_quantity.toLocaleString()} @ {offer.price.toLocaleString()} GP
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden mt-3 p-0.5 border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              offer.type === "BUY" ? "bg-blue-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="text-right text-xs font-mono text-gray-400 mt-1">
                          {progressPct}% Filled
                        </div>
                      </div>

                      {/* Slot Action Footer */}
                      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-2">
                        {hasClaimable ? (
                          <button
                            onClick={() => handleCollectSlot(offer.id)}
                            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-1.5"
                          >
                            🎁 Collect ({offer.claimed_items > 0 ? `${offer.claimed_items} Items` : `${offer.claimed_gp.toLocaleString()} GP`})
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelOffer(offer.id)}
                            className="w-full py-2 px-3 bg-slate-800 hover:bg-rose-900/60 text-gray-300 hover:text-rose-200 border border-slate-700 rounded-xl text-xs font-medium transition-all"
                          >
                            Cancel Offer
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Empty Slot */
                    <div className="flex flex-col items-center justify-center h-full my-auto text-center space-y-3 py-6">
                      <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-gray-500 font-bold text-xl border border-slate-700">
                        {slotIndex + 1}
                      </div>
                      <div className="text-sm text-gray-400 font-medium">Empty GE Slot</div>
                      <button
                        onClick={() => openCreateOfferModal(slotIndex, "BUY")}
                        className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-semibold rounded-xl text-xs transition-all"
                      >
                        + Create Offer
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: INVENTORY & BANK */}
      {activeTab === "inventory" && gameState && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-200">
              Held Items ({gameState.inventory.length} Unique Items)
            </h2>
            <span className="text-xs text-gray-400">
              Items acquired from completed buy offers.
            </span>
          </div>

          {gameState.inventory.length === 0 ? (
            <div className="bg-slate-900/60 p-12 rounded-2xl border border-slate-800 text-center text-gray-400">
              No items in your bank inventory yet. Complete buy offers in GE to accumulate items!
            </div>
          ) : (
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="bg-slate-950 text-xs text-gray-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-4">Item Name</th>
                    <th className="px-6 py-4 text-right">Quantity</th>
                    <th className="px-6 py-4 text-right">Avg Buy Price</th>
                    <th className="px-6 py-4 text-right">Total Invested</th>
                    <th className="px-6 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {gameState.inventory.map(inv => {
                    const totalInvested = Math.round(inv.quantity * inv.avg_buy_price);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-6 py-4 font-bold text-gray-100">{inv.item_name}</td>
                        <td className="px-6 py-4 text-right font-mono font-semibold">{inv.quantity.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-gray-300">{Math.round(inv.avg_buy_price).toLocaleString()} GP</td>
                        <td className="px-6 py-4 text-right font-mono text-amber-400 font-semibold">{totalInvested.toLocaleString()} GP</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => {
                              const marketItem = allMarketItems.find(i => i.id === inv.item_id);
                              // Find empty slot
                              const emptySlot = Array.from({ length: 8 }).findIndex((_, idx) => !activeOffersMap.has(idx));
                              if (emptySlot === -1) {
                                setError("All 8 GE slots are full. Cancel an offer first to sell.");
                                return;
                              }
                              setActiveTab("ge");
                              openCreateOfferModal(emptySlot, "SELL", marketItem, inv.quantity, marketItem?.sellPrice || Math.round(inv.avg_buy_price * 1.02));
                            }}
                            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold border border-emerald-500/40 rounded-lg text-xs transition-all"
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
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Timeframe Switcher */}
            <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setLeaderboardTimeframe("current")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  leaderboardTimeframe === "current" ? "bg-amber-500 text-slate-950" : "text-gray-400 hover:text-white"
                }`}
              >
                Current Month
              </button>
              <button
                onClick={() => setLeaderboardTimeframe("last_month")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  leaderboardTimeframe === "last_month" ? "bg-amber-500 text-slate-950" : "text-gray-400 hover:text-white"
                }`}
              >
                Last Month Top Traders
              </button>
              <button
                onClick={() => setLeaderboardTimeframe("all_time")}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  leaderboardTimeframe === "all_time" ? "bg-amber-500 text-slate-950" : "text-gray-400 hover:text-white"
                }`}
              >
                All-Time Cumulative
              </button>
            </div>

            {/* Entity Filter */}
            <div className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setLeaderboardFilter("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  leaderboardFilter === "all" ? "bg-slate-700 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setLeaderboardFilter("humans")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  leaderboardFilter === "humans" ? "bg-slate-700 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                🎮 Humans
              </button>
              <button
                onClick={() => setLeaderboardFilter("agents")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  leaderboardFilter === "agents" ? "bg-slate-700 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                🤖 AI Agents
              </button>
            </div>
          </div>

          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-slate-950 text-xs text-gray-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 w-16 text-center">Rank</th>
                  <th className="px-6 py-4">Trader</th>
                  <th className="px-6 py-4 text-right">Net Worth</th>
                  <th className="px-6 py-4 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      No leaderboard data for this category.
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map((entry) => (
                    <tr key={entry.accountId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4 text-center font-bold font-mono">
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-100 flex items-center gap-2">
                        <span>{entry.isAgent ? "🤖" : "🎮"}</span>
                        <span>{entry.name}</span>
                        {entry.isAgent && (
                          <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-full font-mono">
                            AI Agent
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-400 font-bold">
                        {entry.netWorth.toLocaleString()} GP
                      </td>
                      <td className={`px-6 py-4 text-right font-mono font-bold ${entry.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-xl font-bold text-amber-400 font-serif">
                Place Offer in GE Slot #{modalSlot + 1}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white text-xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePlaceOffer} className="space-y-4">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setOfferType("BUY")}
                  className={`py-2 text-sm font-bold rounded-lg transition-all ${
                    offerType === "BUY" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Buy Offer
                </button>
                <button
                  type="button"
                  onClick={() => setOfferType("SELL")}
                  className={`py-2 text-sm font-bold rounded-lg transition-all ${
                    offerType === "SELL" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Sell Offer
                </button>
              </div>

              {/* Item Search */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                  Search Item
                </label>
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => {
                    setItemSearchQuery(e.target.value);
                    setSelectedItem(null);
                  }}
                  placeholder="e.g. Shark, Zulrah's scale, Abyssal whip..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-gray-100 focus:outline-none focus:border-amber-500 text-sm"
                />

                {matchingItems.length > 0 && !selectedItem && (
                  <div className="mt-1 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-800">
                    {matchingItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="p-3 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-sm"
                      >
                        <span className="font-semibold text-gray-200">{item.name}</span>
                        <span className="text-xs font-mono text-amber-400">
                          {offerType === "BUY" ? `Buy: ${item.buyPrice?.toLocaleString() || "?"} GP` : `Sell: ${item.sellPrice?.toLocaleString() || "?"} GP`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedItem && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-gray-300">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Buy Price:</span>
                    <span className="font-mono text-amber-400">{selectedItem.buyPrice?.toLocaleString() || "?"} GP</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Market Sell Price:</span>
                    <span className="font-mono text-emerald-400">{selectedItem.sellPrice?.toLocaleString() || "?"} GP</span>
                  </div>
                  {itemLimitInfo && (
                    <div className="flex justify-between pt-1 border-t border-slate-800/80">
                      <span className="text-gray-400">4-Hour Buy Limit:</span>
                      <span className="font-mono text-blue-400">
                        {itemLimitInfo.boughtInLast4Hours} / {itemLimitInfo.buyLimit} used ({itemLimitInfo.remainingLimit} remaining)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity & Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-gray-100 font-mono text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                    Price per item (GP)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={price}
                    onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-gray-100 font-mono text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Total Escrow Calculation */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between text-sm">
                <span className="text-gray-400 font-medium">Total Escrow Cost:</span>
                <span className="font-mono font-bold text-amber-400 text-base">
                  {(quantity * price).toLocaleString()} GP
                </span>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 font-semibold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedItem}
                  className={`w-1/2 py-2.5 font-bold rounded-xl text-sm transition-all shadow-md ${
                    offerType === "BUY"
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  } disabled:opacity-50`}
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
