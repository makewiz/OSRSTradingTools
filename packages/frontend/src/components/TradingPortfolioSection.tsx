import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";

export interface PortfolioPosition {
    id: number;
    user_id: number;
    agent_id: number | null;
    item_id: number;
    item_name: string;
    quantity: number;
    buy_price: number;
    target_sell_price: number;
    stop_loss_price: number | null;
    status: 'buying' | 'holding' | 'selling' | 'completed' | 'cancelled';
    notes: string | null;
    created_at: number;
    updated_at: number;
    currentBuyPrice: number | null;
    currentSellPrice: number | null;
    currentProfitPerItem: number;
    totalCurrentProfit: number;
    currentRoi: number;
    targetProfitPerItem: number;
    totalTargetProfit: number;
    targetRoi: number;
    progressPct: number;
    iconUrl?: string;
}

export const TradingPortfolioSection: React.FC = () => {
    const { fetchWithAuth } = useAuth();
    const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state for Add / Edit
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [itemId, setItemId] = useState<number>(0);
    const [itemName, setItemName] = useState("");
    const [quantity, setQuantity] = useState<number>(1000);
    const [buyPrice, setBuyPrice] = useState<number>(0);
    const [targetSellPrice, setTargetSellPrice] = useState<number>(0);
    const [status, setStatus] = useState<'buying' | 'holding' | 'selling' | 'completed' | 'cancelled'>('holding');
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchPortfolio();
    }, []);

    const fetchPortfolio = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio`);
            if (!res.ok) throw new Error("Failed to load portfolio");
            const data = await res.json();
            setPortfolio(data.portfolio || []);
        } catch (err: any) {
            setError(err.message || "Failed to load portfolio");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setEditingId(null);
        setItemId(563);
        setItemName("Law rune");
        setQuantity(5000);
        setBuyPrice(140);
        setTargetSellPrice(155);
        setStatus("holding");
        setNotes("Flipping high volume runes");
        setShowModal(true);
    };

    const handleOpenEditModal = (pos: PortfolioPosition) => {
        setEditingId(pos.id);
        setItemId(pos.item_id);
        setItemName(pos.item_name);
        setQuantity(pos.quantity);
        setBuyPrice(pos.buy_price);
        setTargetSellPrice(pos.target_sell_price);
        setStatus(pos.status);
        setNotes(pos.notes || "");
        setShowModal(true);
    };

    const handleSavePosition = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            if (editingId) {
                const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ quantity, buyPrice, targetSellPrice, status, notes })
                });
                if (!res.ok) throw new Error("Failed to update position");
            } else {
                const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ itemId, itemName, quantity, buyPrice, targetSellPrice, notes })
                });
                if (!res.ok) throw new Error("Failed to add position");
            }

            setShowModal(false);
            await fetchPortfolio();
        } catch (err: any) {
            setError(err.message || "Failed to save position");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeletePosition = async (id: number) => {
        if (!confirm("Are you sure you want to delete this trade from your portfolio?")) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio/${id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete position");
            await fetchPortfolio();
        } catch (err: any) {
            alert(err.message || "Failed to delete position");
        }
    };

    const handleQuickComplete = async (pos: PortfolioPosition) => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio/${pos.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "completed" })
            });
            if (!res.ok) throw new Error("Failed to mark trade completed");
            await fetchPortfolio();
        } catch (err: any) {
            alert(err.message || "Error updating position");
        }
    };

    // Calculate Portfolio Summary Metrics
    const activePositions = portfolio.filter(p => p.status === 'holding' || p.status === 'buying' || p.status === 'selling');
    const totalInvested = activePositions.reduce((acc, p) => acc + (p.buy_price * p.quantity), 0);
    const totalCurrentProfit = activePositions.reduce((acc, p) => acc + p.totalCurrentProfit, 0);
    const totalTargetProfit = activePositions.reduce((acc, p) => acc + p.totalTargetProfit, 0);

    if (loading) {
        return <div className="text-center py-8 text-gray-400">Loading Trading Portfolio...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header & Stats Banner */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-800/80 p-5 rounded-xl border border-slate-700">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        📦 Live Trading Portfolio
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Track active merchanting positions, monitor target sell points, and let AI agents manage sell alerts.
                    </p>
                </div>
                <button
                    onClick={handleOpenAddModal}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow-lg flex items-center gap-2"
                >
                    + Add Active Trade
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Active Capital</div>
                    <div className="text-xl font-bold text-white mt-1">
                        {totalInvested.toLocaleString()} <span className="text-xs text-amber-400">GP</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{activePositions.length} Active Positions</div>
                </div>

                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Current PnL (After 2% Tax)</div>
                    <div className={`text-xl font-bold mt-1 ${totalCurrentProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalCurrentProfit >= 0 ? "+" : ""}{totalCurrentProfit.toLocaleString()} <span className="text-xs">GP</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Live market value</div>
                </div>

                <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Target Projected Profit</div>
                    <div className="text-xl font-bold text-indigo-300 mt-1">
                        +{totalTargetProfit.toLocaleString()} <span className="text-xs text-amber-400">GP</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">If all sell targets hit</div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-900/50 border border-red-700 text-red-200 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {portfolio.length === 0 ? (
                <div className="text-center py-12 bg-slate-800/40 rounded-xl border border-dashed border-slate-700 p-8">
                    <div className="text-4xl mb-3">📦</div>
                    <h3 className="text-lg font-semibold text-white">No Positions in Trading Portfolio</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto mt-1 mb-6">
                        Add items you are currently buying or holding. AI agents will monitor your holdings and send Discord alerts when target sell prices are reached!
                    </p>
                    <button
                        onClick={handleOpenAddModal}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors shadow"
                    >
                        Add Your First Trade Position
                    </button>
                </div>
            ) : (
                <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead>
                                <tr className="bg-slate-900/60 text-gray-400 border-b border-slate-700 text-xs uppercase tracking-wider">
                                    <th className="p-3.5">Item</th>
                                    <th className="p-3.5">Qty</th>
                                    <th className="p-3.5">Buy Price</th>
                                    <th className="p-3.5">Target Sell</th>
                                    <th className="p-3.5">Current GE Sell</th>
                                    <th className="p-3.5">Current PnL (Net)</th>
                                    <th className="p-3.5">Target Progress</th>
                                    <th className="p-3.5">Status</th>
                                    <th className="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/60">
                                {portfolio.map((pos) => (
                                    <tr key={pos.id} className="hover:bg-slate-700/30 transition-colors">
                                        <td className="p-3.5 font-semibold text-white">
                                            <div className="flex items-center gap-2">
                                                {pos.iconUrl && <img src={pos.iconUrl} alt={pos.item_name} className="w-6 h-6 object-contain" />}
                                                <span>{pos.item_name}</span>
                                            </div>
                                            {pos.notes && <div className="text-[11px] text-gray-400 font-normal italic mt-0.5">{pos.notes}</div>}
                                        </td>
                                        <td className="p-3.5 text-gray-200">{pos.quantity.toLocaleString()}</td>
                                        <td className="p-3.5 text-amber-300 font-medium">{pos.buy_price.toLocaleString()} GP</td>
                                        <td className="p-3.5 text-indigo-300 font-medium">{pos.target_sell_price.toLocaleString()} GP</td>
                                        <td className="p-3.5 text-gray-300">
                                            {pos.currentSellPrice ? `${pos.currentSellPrice.toLocaleString()} GP` : "-"}
                                        </td>
                                        <td className="p-3.5">
                                            <div className={`font-bold ${pos.totalCurrentProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                                {pos.totalCurrentProfit >= 0 ? "+" : ""}{pos.totalCurrentProfit.toLocaleString()} GP
                                            </div>
                                            <div className="text-[11px] text-gray-400">
                                                {pos.currentRoi >= 0 ? "+" : ""}{pos.currentRoi.toFixed(1)}% ROI
                                            </div>
                                        </td>
                                        <td className="p-3.5 min-w-[130px]">
                                            <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                                                <span>Progress</span>
                                                <span>{pos.progressPct.toFixed(0)}%</span>
                                            </div>
                                            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700">
                                                <div
                                                    className={`h-full transition-all ${
                                                        pos.progressPct >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                                                    }`}
                                                    style={{ width: `${Math.min(100, Math.max(0, pos.progressPct))}%` }}
                                                />
                                            </div>
                                        </td>
                                        <td className="p-3.5">
                                            <span
                                                className={`text-xs px-2 py-0.5 rounded font-medium ${
                                                    pos.status === 'holding'
                                                        ? "bg-indigo-900/60 text-indigo-200 border border-indigo-700/50"
                                                        : pos.status === 'completed'
                                                        ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50"
                                                        : pos.status === 'selling'
                                                        ? "bg-amber-900/60 text-amber-300 border border-amber-700/50"
                                                        : "bg-slate-700 text-gray-300"
                                                }`}
                                            >
                                                {pos.status}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-right space-x-1.5">
                                            {pos.status !== 'completed' && (
                                                <button
                                                    onClick={() => handleQuickComplete(pos)}
                                                    title="Mark Complete"
                                                    className="px-2 py-1 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 text-xs rounded font-medium border border-emerald-700/40"
                                                >
                                                    ✓ Done
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleOpenEditModal(pos)}
                                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-gray-200 text-xs rounded font-medium"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeletePosition(pos.id)}
                                                className="px-2 py-1 bg-red-900/40 hover:bg-red-800/60 text-red-300 text-xs rounded font-medium border border-red-700/40"
                                            >
                                                🗑
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal: Add / Edit Position */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? "Edit Trade Position" : "Add Trade Position to Portfolio"}
                            </h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-white text-xl font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSavePosition} className="space-y-4">
                            {!editingId && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-300 mb-1">Item ID</label>
                                            <input
                                                type="number"
                                                value={itemId}
                                                onChange={(e) => setItemId(Number(e.target.value))}
                                                required
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-300 mb-1">Item Name</label>
                                            <input
                                                type="text"
                                                value={itemName}
                                                onChange={(e) => setItemName(e.target.value)}
                                                required
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Quantity</label>
                                    <input
                                        type="number"
                                        value={quantity}
                                        onChange={(e) => setQuantity(Number(e.target.value))}
                                        required
                                        min={1}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Buy Price (GP)</label>
                                    <input
                                        type="number"
                                        value={buyPrice}
                                        onChange={(e) => setBuyPrice(Number(e.target.value))}
                                        required
                                        min={1}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Target Sell (GP)</label>
                                    <input
                                        type="number"
                                        value={targetSellPrice}
                                        onChange={(e) => setTargetSellPrice(Number(e.target.value))}
                                        required
                                        min={1}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Trade Status</label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as any)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                    >
                                        <option value="buying">Buying</option>
                                        <option value="holding">Holding</option>
                                        <option value="selling">Selling</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1">Notes / Strategy</label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                                        placeholder="e.g. Buying during weekend Slayer peak"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-gray-200 text-sm font-medium rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                                >
                                    {submitting ? "Saving..." : editingId ? "Update Position" : "Add to Portfolio"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
