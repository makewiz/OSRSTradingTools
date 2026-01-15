import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { AutoRefreshControls } from "../components/AutoRefreshControls";
import { useAuth } from "../contexts/AuthContext";
import { useFilters } from "../contexts/FilterContext";
import { API_BASE_URL } from "../config";
import { Item, SortKey } from "../types/item";

const FAVORITES_KEY = "osrs_trading_favorites";

interface ItemListProps {
    defaultShowFavorites?: boolean;
}

export const ItemList: React.FC<ItemListProps> = ({ defaultShowFavorites = false }) => {
    const { user, token, fetchWithAuth } = useAuth();
    const {
        filterState, setFilterState,
        savedPresets, savePreset, loadPreset, deletePreset, resetFilters
    } = useFilters();

    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [favorites, setFavorites] = useState<number[]>([]);
    const [watches, setWatches] = useState<number[]>([]);
    const [discordLinked, setDiscordLinked] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    // UI state for saving presets
    const [isSaving, setIsSaving] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");

    // Destructure filter state for easier access
    const {
        search, sortKey, sortDir, page, pageSize,
        minBuy, maxBuy, minSell, maxSell, minMargin, maxMargin,
        minVolume, maxVolume, minDayChange, maxDayChange,
        minMarginVolume, maxMarginVolume, minLimit, maxLimit,
        membersFilter
    } = filterState;

    // Load favorites logic
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
                    console.error("Failed to fetch favorites", err);
                }
            } else {
                // Load from localStorage
                try {
                    const raw = window.localStorage.getItem(FAVORITES_KEY);
                    if (raw) {
                        setFavorites(JSON.parse(raw));
                    }
                } catch {
                    // ignore
                }
            }
        };

        loadFavorites();
    }, [user, token, fetchWithAuth]);

    // Load watches logic
    useEffect(() => {
        const loadWatches = async () => {
            if (user && token) {
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
                    console.error("Failed to fetch watches", err);
                }
            } else {
                setWatches([]);
                setDiscordLinked(false);
            }
        };
        loadWatches();
    }, [user, token, fetchWithAuth]);


    // Sync favorites to localStorage only if NOT logged in
    useEffect(() => {
        if (!user) {
            window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        }
    }, [favorites, user]);

    const fetchItems = useCallback(async (isAutoRefresh = false) => {
        if (!isAutoRefresh) setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/items`);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            setItems(data.items ?? []);
        } catch (err) {
            if (!isAutoRefresh) setError("Failed to load items. Try again in a moment.");
            console.error(err);
        } finally {
            if (!isAutoRefresh) setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const toggleFavorite = async (id: number) => {
        const isFav = favorites.includes(id);

        // Optimistic update
        const newFavorites = isFav
            ? favorites.filter((x) => x !== id)
            : [...favorites, id];
        setFavorites(newFavorites);

        if (user && token) {
            try {
                const method = isFav ? "DELETE" : "POST";
                const url = isFav ? `${API_BASE_URL}/api/favorites/${id}` : `${API_BASE_URL}/api/favorites`;
                const body = isFav ? undefined : JSON.stringify({ itemId: id });

                await fetchWithAuth(url, {
                    method,
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body
                });
            } catch (err) {
                console.error("Failed to sync favorite", err);
            }
        }
    };

    const toggleWatch = async (id: number) => {
        if (!user || !discordLinked) {
            alert("Please login and link your Discord account in Profile to use watches.");
            return;
        }

        const isWatched = watches.includes(id);
        const newWatches = isWatched
            ? watches.filter(x => x !== id)
            : [...watches, id];
        setWatches(newWatches);

        try {
            const method = isWatched ? "DELETE" : "POST";
            const url = isWatched ? `${API_BASE_URL}/api/discord/watch/${id}` : `${API_BASE_URL}/api/discord/watch`;
            const body = isWatched ? undefined : JSON.stringify({ itemId: id, threshold: 5.0 });

            await fetchWithAuth(url, {
                method,
                headers: {
                    "Content-Type": "application/json"
                },
                body
            });
        } catch (err) {
            console.error("Failed to sync watch", err);
        }
    };

    // Helper to update partial filter state
    const updateFilter = (updates: Partial<typeof filterState>) => {
        setFilterState(prev => ({ ...prev, ...updates, page: 1 }));
    };

    const handleSortChange = (key: SortKey) => {
        if (key === sortKey) {
            setFilterState(prev => ({ ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" }));
        } else {
            setFilterState(prev => ({ ...prev, sortKey: key, sortDir: key === "name" ? "asc" : "desc" }));
        }
    };

    const handleSavePreset = async () => {
        if (!newPresetName.trim()) return;
        await savePreset(newPresetName);
        setNewPresetName("");
        setIsSaving(false);
    };

    const filteredAndSorted = useMemo(() => {
        let list = items;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(
                (i) =>
                    i.name.toLowerCase().includes(q) ||
                    i.examine.toLowerCase().includes(q)
            );
        }

        if (defaultShowFavorites) {
            list = list.filter((i) => favorites.includes(i.id));
        }

        const checkRange = (val: number | null, min: number | "", max: number | "") => {
            if (val === null) return false;
            if (min !== "" && val < min) return false;
            if (max !== "" && val > max) return false;
            return true;
        };

        if (membersFilter !== "all") {
            list = list.filter((i) => membersFilter === "members" ? i.members : !i.members);
        }

        if (minBuy !== "" || maxBuy !== "") {
            list = list.filter((i) => checkRange(i.buyPrice, minBuy, maxBuy));
        }
        if (minSell !== "" || maxSell !== "") {
            list = list.filter((i) => checkRange(i.sellPrice, minSell, maxSell));
        }
        if (minMargin !== "" || maxMargin !== "") {
            list = list.filter((i) => checkRange(i.margin, minMargin, maxMargin));
        }
        if (minVolume !== "" || maxVolume !== "") {
            list = list.filter((i) => checkRange(i.volume, minVolume, maxVolume));
        }
        if (minDayChange !== "" || maxDayChange !== "") {
            list = list.filter((i) => checkRange(i.dayChange, minDayChange, maxDayChange));
        }
        if (minMarginVolume !== "" || maxMarginVolume !== "") {
            list = list.filter((i) => checkRange(i.marginVolume, minMarginVolume, maxMarginVolume));
        }
        if (minLimit !== "" || maxLimit !== "") {
            list = list.filter((i) => checkRange(i.limit, minLimit, maxLimit));
        }

        list = [...list].sort((a, b) => {
            const dir = sortDir === "asc" ? 1 : -1;
            const getVal = (item: Item) => {
                switch (sortKey) {
                    case "name":
                        return item.name.toLowerCase();
                    case "buyPrice":
                        return item.buyPrice ?? -Infinity;
                    case "sellPrice":
                        return item.sellPrice ?? -Infinity;
                    case "margin":
                        return item.margin ?? -Infinity;
                    case "volume":
                        return item.volume ?? -Infinity;
                    case "dayChange":
                        return item.dayChange ?? -Infinity;
                    case "marginVolume":
                        return item.marginVolume ?? -Infinity;
                    case "limit":
                        return item.limit ?? -Infinity;
                }
            };

            const va = getVal(a);
            const vb = getVal(b);

            if (typeof va === "string" && typeof vb === "string") {
                return va.localeCompare(vb) * dir;
            }

            return ((va as number) - (vb as number)) * dir;
        });

        return list;
    }, [items, search, sortKey, sortDir, favorites, defaultShowFavorites, minBuy, maxBuy, minSell, maxSell, minMargin, maxMargin, minVolume, maxVolume, minDayChange, maxDayChange, minMarginVolume, maxMarginVolume, minLimit, maxLimit, membersFilter]);

    const totalItems = filteredAndSorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = filteredAndSorted.slice(
        startIndex,
        startIndex + pageSize
    );

    return (
        <main className="app-main">
            <section className="controls">
                <input
                    className="search-input"
                    placeholder="Search items by name or examine..."
                    value={search}
                    onChange={(e) => updateFilter({ search: e.target.value })}
                />
            </section>

            <section className="controls" style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px' }}>
                <AutoRefreshControls onRefresh={() => fetchItems(true)} />
            </section>

            <section className="filters-section">
                <div className="filters-header">
                    <div onClick={() => setShowFilters(!showFilters)} style={{ cursor: 'pointer' }}>
                        <h3>Advanced Filters {showFilters ? "▼" : "▶"}</h3>
                    </div>

                    <div className="filter-actions">
                        {showFilters && (
                            <>
                                <div className="saved-filters-dropdown">
                                    <select
                                        onChange={(e) => {
                                            const preset = savedPresets.find(p => p.id.toString() === e.target.value);
                                            if (preset) loadPreset(preset);
                                        }}
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Load Saved Filter...</option>
                                        {savedPresets.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {isSaving ? (
                                    <div className="save-controls">
                                        <input
                                            type="text"
                                            placeholder="Filter Name"
                                            value={newPresetName}
                                            onChange={e => setNewPresetName(e.target.value)}
                                            className="save-input"
                                        />
                                        <button onClick={handleSavePreset} className="page-button">Save</button>
                                        <button onClick={() => setIsSaving(false)} className="page-button" style={{ background: '#666' }}>Cancel</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setIsSaving(true)} className="page-button">Save Current</button>
                                )}

                                <button className="clear-filters" onClick={resetFilters}>Clear Filters</button>
                            </>
                        )}
                    </div>
                </div>

                {showFilters && (
                    <div className="filters-grid">
                        <div className="filter-group">
                            <label>Buy Price</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minBuy} onChange={e => updateFilter({ minBuy: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxBuy} onChange={e => updateFilter({ maxBuy: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Sell Price</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minSell} onChange={e => updateFilter({ minSell: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxSell} onChange={e => updateFilter({ maxSell: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Margin</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minMargin} onChange={e => updateFilter({ minMargin: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxMargin} onChange={e => updateFilter({ maxMargin: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Volume</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minVolume} onChange={e => updateFilter({ minVolume: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxVolume} onChange={e => updateFilter({ maxVolume: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>24h Change (%)</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minDayChange} onChange={e => updateFilter({ minDayChange: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxDayChange} onChange={e => updateFilter({ maxDayChange: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Margin × Volume</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minMarginVolume} onChange={e => updateFilter({ minMarginVolume: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxMarginVolume} onChange={e => updateFilter({ maxMarginVolume: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Limit</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minLimit} onChange={e => updateFilter({ minLimit: e.target.value ? Number(e.target.value) : "" })} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxLimit} onChange={e => updateFilter({ maxLimit: e.target.value ? Number(e.target.value) : "" })} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Members</label>
                            <select className="filter-select" value={membersFilter} onChange={(e) => updateFilter({ membersFilter: e.target.value as any })}>
                                <option value="all">All</option>
                                <option value="members">Members</option>
                                <option value="f2p">Free to Play</option>
                            </select>
                        </div>
                    </div>
                )}
            </section>

            <section className="controls">
                <div className="pagination-controls">
                    <span className="pagination-info">
                        Showing {totalItems === 0 ? 0 : startIndex + 1}-
                        {Math.min(startIndex + pageSize, totalItems)} of {totalItems} items
                    </span>
                    <button
                        className="page-button"
                        onClick={() => setFilterState(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
                        disabled={currentPage === 1}
                    >
                        Prev
                    </button>
                    <span className="pagination-info">
                        Page {currentPage} / {totalPages}
                    </span>
                    <button
                        className="page-button"
                        onClick={() => setFilterState(p => ({ ...p, page: Math.min(totalPages, p.page + 1) }))}
                        disabled={currentPage === totalPages}
                    >
                        Next
                    </button>
                    <select
                        className="page-size-select"
                        value={pageSize}
                        onChange={(e) => setFilterState(p => ({ ...p, pageSize: Number(e.target.value), page: 1 }))}
                    >
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={250}>250 / page</option>
                    </select>
                </div>
            </section>

            {loading && <p>Loading latest Grand Exchange data…</p>}
            {error && <p className="error">{error}</p>}

            {!loading && !error && (
                <div className="table-wrapper">
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th></th>
                                <th onClick={() => handleSortChange("name")}>
                                    Name {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th>Members</th>
                                <th onClick={() => handleSortChange("buyPrice")}>
                                    Buy {sortKey === "buyPrice" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th onClick={() => handleSortChange("sellPrice")}>
                                    Sell {sortKey === "sellPrice" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th onClick={() => handleSortChange("margin")}>
                                    Margin {sortKey === "margin" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th onClick={() => handleSortChange("volume")}>
                                    Volume {sortKey === "volume" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th onClick={() => handleSortChange("dayChange")}>
                                    24h Change {sortKey === "dayChange" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th onClick={() => handleSortChange("marginVolume")}>
                                    Margin×Vol {sortKey === "marginVolume" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>

                                <th onClick={() => handleSortChange("limit")}>
                                    Limit {sortKey === "limit" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                </th>
                                <th>Watch</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pageItems.map((item) => {
                                const isFav = favorites.includes(item.id);
                                const isWatched = watches.includes(item.id);
                                return (
                                    <tr key={item.id} className={isFav ? "fav-row" : undefined}>
                                        <td>
                                            <button
                                                className="fav-button"
                                                onClick={() => toggleFavorite(item.id)}
                                                aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
                                            >
                                                {isFav ? "♥" : "♡"}
                                            </button>
                                        </td>
                                        <td className="name-cell">
                                            <img
                                                src={item.iconUrl}
                                                alt={item.name}
                                                className="item-icon"
                                                loading="lazy"
                                            />
                                            <div>
                                                <Link to={`/item/${item.id}`} className="item-name-link">
                                                    {item.name}
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="members-cell">{item.members ? "★" : ""}</td>
                                        <td>{item.buyPrice?.toLocaleString() ?? "-"}</td>
                                        <td>{item.sellPrice?.toLocaleString() ?? "-"}</td>
                                        <td>{item.margin?.toLocaleString() ?? "-"}</td>
                                        <td>{item.volume?.toLocaleString() ?? "-"}</td>
                                        <td
                                            className={
                                                item.dayChange !== null
                                                    ? item.dayChange > 0
                                                        ? "day-change positive"
                                                        : item.dayChange < 0
                                                            ? "day-change negative"
                                                            : "day-change"
                                                    : ""
                                            }
                                        >
                                            {item.dayChange !== null
                                                ? `${item.dayChange > 0 ? "+" : ""}${item.dayChange.toFixed(2)}%`
                                                : "-"}
                                        </td>
                                        <td>
                                            {item.marginVolume !== null
                                                ? item.marginVolume.toLocaleString()
                                                : "-"}
                                        </td>

                                        <td>
                                            {item.limit?.toLocaleString() ?? "-"}
                                        </td>
                                        <td>
                                            {discordLinked ? (
                                                <button
                                                    className="watch-button"
                                                    style={{
                                                        background: isWatched ? '#5865f2' : 'transparent',
                                                        color: isWatched ? '#fff' : '#5865f2',
                                                        border: '1px solid #5865f2'
                                                    }}
                                                    onClick={() => toggleWatch(item.id)}
                                                    title={isWatched ? "Unwatch" : "Watch (5% threshold)"}
                                                >
                                                    {isWatched ? "🔔" : "🔕"}
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
                                                    Copy
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
};
