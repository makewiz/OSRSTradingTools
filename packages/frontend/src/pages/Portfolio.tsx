import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
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
    notes: string | null;
    created_at: number;
    updated_at: number;
    currentBuyPrice: number | null;
    currentSellPrice: number | null;
    currentProfitPerItem: number;
    totalNetWorth: number;
    totalCurrentProfit: number;
    currentRoi: number;
    iconUrl?: string;
}

interface ItemSearchResult {
    id: number;
    name: string;
    iconUrl: string;
    buyPrice: number | null;
    sellPrice: number | null;
}

export const Portfolio: React.FC = () => {
    const { token, fetchWithAuth } = useAuth();
    const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Add Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<ItemSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ItemSearchResult | null>(null);
    const [addQuantity, setAddQuantity] = useState<number>(1);
    const [addBuyPrice, setAddBuyPrice] = useState<number>(0);
    const [submittingAdd, setSubmittingAdd] = useState(false);

    // Edit Modal State
    const [editingPosition, setEditingPosition] = useState<PortfolioPosition | null>(null);
    const [editQuantity, setEditQuantity] = useState<number>(1);
    const [editBuyPrice, setEditBuyPrice] = useState<number>(0);
    const [submittingEdit, setSubmittingEdit] = useState(false);

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (token) {
            fetchPortfolio();
        } else {
            setLoading(false);
        }
    }, [token]);

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

    // Item Search Logic
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                setSearching(true);
                const res = await fetchWithAuth(`${API_BASE_URL}/api/items?search=${encodeURIComponent(searchQuery)}&pageSize=10`);
                if (res.ok) {
                    const data = await res.json();
                    const q = searchQuery.trim().toLowerCase();
                    const matches = (data.items || [])
                        .filter((i: ItemSearchResult) => i.name.toLowerCase().includes(q))
                        .slice(0, 10);
                    setSearchResults(matches);
                }
            } catch (err) {
                console.error("Failed to search items", err);
            } finally {
                setSearching(false);
            }
        }, 250);

        return () => {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        };
    }, [searchQuery, fetchWithAuth]);

    const handleOpenAddModal = () => {
        setSelectedItem(null);
        setSearchQuery("");
        setSearchResults([]);
        setAddQuantity(1);
        setAddBuyPrice(0);
        setShowAddModal(true);
    };

    const handleSelectItem = (item: ItemSearchResult) => {
        setSelectedItem(item);
        setSearchQuery(item.name);
        setSearchResults([]);
        setAddBuyPrice(item.buyPrice || item.sellPrice || 0);
    };

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) {
            alert("Please search and select an item first.");
            return;
        }

        setSubmittingAdd(true);
        setError(null);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: selectedItem.id,
                    itemName: selectedItem.name,
                    quantity: addQuantity,
                    buyPrice: addBuyPrice
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to add item to portfolio");
            }

            setShowAddModal(false);
            await fetchPortfolio();
        } catch (err: any) {
            alert(err.message || "Error adding item to portfolio");
        } finally {
            setSubmittingAdd(false);
        }
    };

    const handleOpenEditModal = (pos: PortfolioPosition) => {
        setEditingPosition(pos);
        setEditQuantity(pos.quantity);
        setEditBuyPrice(pos.buy_price);
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingPosition) return;

        setSubmittingEdit(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio/${editingPosition.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    quantity: editQuantity,
                    buyPrice: editBuyPrice
                })
            });

            if (!res.ok) throw new Error("Failed to update item");

            setEditingPosition(null);
            await fetchPortfolio();
        } catch (err: any) {
            alert(err.message || "Failed to update item");
        } finally {
            setSubmittingEdit(false);
        }
    };

    const handleDeleteItem = async (id: number) => {
        if (!confirm("Are you sure you want to remove this item from your portfolio?")) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio/${id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete item");
            await fetchPortfolio();
        } catch (err: any) {
            alert(err.message || "Failed to delete item");
        }
    };

    // Calculate Summary Metrics
    const totalNetWorth = portfolio.reduce((acc, p) => acc + (p.totalNetWorth || (p.buy_price * p.quantity)), 0);
    const totalProfitAfterTax = portfolio.reduce((acc, p) => acc + (p.totalCurrentProfit || 0), 0);

    if (loading) {
        return (
            <main className="app-main">
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#888" }}>
                    Loading Trading Portfolio...
                </div>
            </main>
        );
    }

    if (!token) {
        return (
            <main className="app-main">
                <div className="empty-portfolio-card" style={{ maxWidth: "500px", margin: "60px auto" }}>
                    <div className="empty-icon">📦</div>
                    <h3>Trading Portfolio</h3>
                    <p>Log in to track your items, live Grand Exchange net worth, and tax-adjusted profit.</p>
                    <Link to="/login" className="primary-btn">
                        Log In to Access Portfolio
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="app-main">
            <div>
                {/* Header & Top Banner */}
                <div className="portfolio-header">
                    <div>
                        <h1>📦 Trading Portfolio</h1>
                        <p>Track your bought items, live net worth, and profit after Grand Exchange 2% tax rules.</p>
                    </div>

                    {/* Show button in header ONLY if items exist to prevent duplicate buttons on empty state */}
                    {portfolio.length > 0 && (
                        <button onClick={handleOpenAddModal} className="primary-btn">
                            + Add Item to Portfolio
                        </button>
                    )}
                </div>

                {/* Summary Metrics Cards */}
                <div className="portfolio-stats-grid">
                    <div className="portfolio-stat-card">
                        <div className="stat-label">Total Portfolio Net Worth</div>
                        <div className="stat-value">
                            {totalNetWorth.toLocaleString()} <span style={{ fontSize: "0.9rem", color: "var(--primary-color)" }}>GP</span>
                        </div>
                        <div className="stat-subtext">Based on latest GE instant buy prices</div>
                    </div>

                    <div className="portfolio-stat-card">
                        <div className="stat-label">Total Profit (After 2% Tax)</div>
                        <div
                            className="stat-value"
                            style={{ color: totalProfitAfterTax >= 0 ? "var(--success-color)" : "var(--error-color)" }}
                        >
                            {totalProfitAfterTax >= 0 ? "+" : ""}{totalProfitAfterTax.toLocaleString()} <span style={{ fontSize: "0.9rem" }}>GP</span>
                        </div>
                        <div className="stat-subtext">After 2% GE tax deduction on sale</div>
                    </div>

                    <div className="portfolio-stat-card">
                        <div className="stat-label">Items in Portfolio</div>
                        <div className="stat-value" style={{ color: "var(--link-color)" }}>
                            {portfolio.length} <span style={{ fontSize: "0.9rem", color: "#aaa" }}>entries</span>
                        </div>
                        <div className="stat-subtext">Unique item positions tracked</div>
                    </div>
                </div>

                {error && (
                    <div className="error-message" style={{ marginBottom: "20px" }}>
                        {error}
                    </div>
                )}

                {/* Main Content Area */}
                {portfolio.length === 0 ? (
                    <div className="empty-portfolio-card">
                        <div className="empty-icon">📦</div>
                        <h3>Your Portfolio is Empty</h3>
                        <p>
                            Start adding items you have bought to monitor their current Grand Exchange prices, total net worth, and profits after taxes.
                        </p>
                        <button onClick={handleOpenAddModal} className="primary-btn">
                            + Add Item to Portfolio
                        </button>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="items-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Count Bought</th>
                                    <th title="Average price paid per item when purchased">Average Buy Price</th>
                                    <th title="Current GE Instant Buy Price (high price) at which your item can be sold">Latest Instant Buy</th>
                                    <th title="Current market value based on Instant Buy Price × Count">Total Net Worth</th>
                                    <th title="Estimated profit after 2% GE tax deduction on sale">Profit (After 2% Tax)</th>
                                    <th style={{ textAlign: "right" }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.map((item) => {
                                    const instantBuyPrice = item.currentBuyPrice;
                                    const netWorth = item.totalNetWorth;
                                    const profit = item.totalCurrentProfit;

                                    return (
                                        <tr key={item.id}>
                                            <td>
                                                <div className="name-cell">
                                                    {item.iconUrl ? (
                                                        <img src={item.iconUrl} alt={item.item_name} className="item-icon" />
                                                    ) : (
                                                        <div className="item-icon" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>📦</div>
                                                    )}
                                                    <Link to={`/item/${item.item_id}`} className="item-name-link">
                                                        {item.item_name}
                                                    </Link>
                                                </div>
                                            </td>
                                            <td style={{ fontWeight: 600, color: "#fff" }}>
                                                {item.quantity.toLocaleString()}
                                            </td>
                                            <td style={{ color: "var(--primary-color)", fontWeight: 500 }}>
                                                {item.buy_price.toLocaleString()} GP
                                            </td>
                                            <td style={{ color: "#e0e0e0" }}>
                                                {instantBuyPrice ? `${instantBuyPrice.toLocaleString()} GP` : "-"}
                                            </td>
                                            <td style={{ fontWeight: 600, color: "#fff" }}>
                                                {netWorth ? `${netWorth.toLocaleString()} GP` : "-"}
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 700, color: profit >= 0 ? "var(--success-color)" : "var(--error-color)" }}>
                                                    {profit >= 0 ? "+" : ""}{profit.toLocaleString()} GP
                                                </div>
                                                {item.currentRoi !== undefined && (
                                                    <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
                                                        {item.currentRoi >= 0 ? "+" : ""}{item.currentRoi.toFixed(1)}% ROI
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                                                    <button
                                                        onClick={() => handleOpenEditModal(item)}
                                                        className="secondary-btn"
                                                        style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteItem(item.id)}
                                                        className="danger-btn"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal: Add Item to Portfolio */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>📦 Add Item to Portfolio</h3>
                            <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                            {/* Item Search Field */}
                            <div className="suggestions-container">
                                <label style={{ display: "block", fontSize: "0.85rem", color: "#aaa", marginBottom: "5px" }}>
                                    Search OSRS Item
                                </label>
                                <input
                                    type="text"
                                    className="search-input"
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        if (selectedItem && e.target.value !== selectedItem.name) {
                                            setSelectedItem(null);
                                        }
                                    }}
                                    placeholder="Type item name (e.g. Prayer potion, Shark)..."
                                    required
                                />

                                {searching && (
                                    <div style={{ position: "absolute", right: "10px", top: "35px", fontSize: "0.8rem", color: "var(--primary-color)" }}>
                                        Searching...
                                    </div>
                                )}

                                {/* Autocomplete Suggestions List */}
                                {searchResults.length > 0 && !selectedItem && (
                                    <ul className="suggestions-list">
                                        {searchResults.map((item) => (
                                            <li
                                                key={item.id}
                                                className="suggestion-item"
                                                onClick={() => handleSelectItem(item)}
                                            >
                                                <img src={item.iconUrl} alt={item.name} className="suggestion-icon" />
                                                <span className="suggestion-text" style={{ flex: 1 }}>{item.name}</span>
                                                <span style={{ fontSize: "0.8rem", color: "var(--primary-color)" }}>
                                                    {item.buyPrice ? `${item.buyPrice.toLocaleString()} GP` : ""}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {selectedItem && (
                                    <div
                                        style={{
                                            marginTop: "10px",
                                            padding: "10px 12px",
                                            background: "#1e1e1e",
                                            borderRadius: "6px",
                                            border: "1px solid var(--primary-color)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px"
                                        }}
                                    >
                                        <img src={selectedItem.iconUrl} alt={selectedItem.name} className="suggestion-icon" />
                                        <div>
                                            <div style={{ fontWeight: 700, color: "#fff" }}>{selectedItem.name}</div>
                                            <div style={{ fontSize: "0.8rem", color: "#aaa" }}>
                                                Instant Buy: <span style={{ color: "var(--primary-color)", fontWeight: 600 }}>{selectedItem.buyPrice ? selectedItem.buyPrice.toLocaleString() + " GP" : "N/A"}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Quantity & Buy Price */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.85rem", color: "#aaa", marginBottom: "5px" }}>
                                        Count Bought
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="filter-input"
                                        value={addQuantity}
                                        onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.85rem", color: "#aaa", marginBottom: "5px" }}>
                                        Buy Price (GP)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="filter-input"
                                        value={addBuyPrice}
                                        onChange={(e) => setAddBuyPrice(Math.max(1, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => setShowAddModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={submittingAdd || !selectedItem}
                                >
                                    {submittingAdd ? "Adding..." : "Add to Portfolio"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Edit Portfolio Item */}
            {editingPosition && (
                <div className="modal-overlay" onClick={() => setEditingPosition(null)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>✏️ Edit Portfolio Item</h3>
                            <button className="modal-close-btn" onClick={() => setEditingPosition(null)}>
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                            <div
                                style={{
                                    padding: "10px 12px",
                                    background: "#1e1e1e",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-color)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px"
                                }}
                            >
                                {editingPosition.iconUrl && (
                                    <img src={editingPosition.iconUrl} alt={editingPosition.item_name} className="suggestion-icon" />
                                )}
                                <div>
                                    <div style={{ fontWeight: 700, color: "#fff" }}>{editingPosition.item_name}</div>
                                    <div style={{ fontSize: "0.8rem", color: "#aaa" }}>Item ID: {editingPosition.item_id}</div>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.85rem", color: "#aaa", marginBottom: "5px" }}>
                                        Count Bought
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="filter-input"
                                        value={editQuantity}
                                        onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "0.85rem", color: "#aaa", marginBottom: "5px" }}>
                                        Average Buy Price (GP)
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        className="filter-input"
                                        value={editBuyPrice}
                                        onChange={(e) => setEditBuyPrice(Math.max(1, parseInt(e.target.value) || 0))}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={() => setEditingPosition(null)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={submittingEdit}
                                >
                                    {submittingEdit ? "Updating..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
};
