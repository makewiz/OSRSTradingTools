import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import { Highlights } from "../components/Highlights";

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
}

type SortKey =
    | "name"
    | "buyPrice"
    | "sellPrice"
    | "margin"
    | "volume"
    | "dayChange"
    | "marginVolume"
    | "limit";

const FAVORITES_KEY = "osrs_trading_favorites";

export const ItemList: React.FC = () => {
    const { user, token, fetchWithAuth } = useAuth();
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("marginVolume");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [favorites, setFavorites] = useState<number[]>([]);
    const [watches, setWatches] = useState<number[]>([]);
    const [onlyFavorites, setOnlyFavorites] = useState(false);
    const [pageSize, setPageSize] = useState(100);
    const [page, setPage] = useState(1);
    const [discordLinked, setDiscordLinked] = useState(false);

    // Filter states
    const [showFilters, setShowFilters] = useState(false);
    const [minBuy, setMinBuy] = useState<number | "">("");
    const [maxBuy, setMaxBuy] = useState<number | "">("");
    const [minSell, setMinSell] = useState<number | "">("");
    const [maxSell, setMaxSell] = useState<number | "">("");
    const [minMargin, setMinMargin] = useState<number | "">("");
    const [maxMargin, setMaxMargin] = useState<number | "">("");
    const [minVolume, setMinVolume] = useState<number | "">("");
    const [maxVolume, setMaxVolume] = useState<number | "">("");
    const [minDayChange, setMinDayChange] = useState<number | "">("");
    const [maxDayChange, setMaxDayChange] = useState<number | "">("");
    const [minMarginVolume, setMinMarginVolume] = useState<number | "">("");
    const [maxMarginVolume, setMaxMarginVolume] = useState<number | "">("");
    const [minLimit, setMinLimit] = useState<number | "">("");
    const [maxLimit, setMaxLimit] = useState<number | "">("");
    const [membersFilter, setMembersFilter] = useState<"all" | "members" | "f2p">("all");

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
    }, [user, token]);

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
    }, [user, token]);


    // Sync favorites to localStorage only if NOT logged in
    useEffect(() => {
        if (!user) {
            window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        }
    }, [favorites, user]);

    useEffect(() => {
        const fetchItems = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetchWithAuth(`${API_BASE_URL}/api/items`);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data = await res.json();
                setItems(data.items ?? []);
            } catch (err) {
                setError("Failed to load items. Try again in a moment.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, []);

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

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [
        search, sortKey, sortDir, onlyFavorites, pageSize,
        minBuy, maxBuy, minSell, maxSell, minMargin, maxMargin,
        minVolume, maxVolume, minDayChange, maxDayChange,
        minMarginVolume, maxMarginVolume, minLimit, maxLimit,
        membersFilter
    ]);

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

        if (onlyFavorites) {
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
    }, [items, search, sortKey, sortDir, favorites, onlyFavorites, minBuy, maxBuy, minSell, maxSell, minMargin, maxMargin, minVolume, maxVolume, minDayChange, maxDayChange, minMarginVolume, maxMarginVolume, minLimit, maxLimit, membersFilter]);

    const totalItems = filteredAndSorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = filteredAndSorted.slice(
        startIndex,
        startIndex + pageSize
    );

    const handleSortChange = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir(key === "name" ? "asc" : "desc");
        }
    };

    const clearFilters = () => {
        setMinBuy(""); setMaxBuy("");
        setMinSell(""); setMaxSell("");
        setMinMargin(""); setMaxMargin("");
        setMinVolume(""); setMaxVolume("");
        setMinDayChange(""); setMaxDayChange("");
        setMinMarginVolume(""); setMaxMarginVolume("");
        setMinLimit(""); setMaxLimit("");
        setMembersFilter("all");
    };

    return (
        <main className="app-main">
            <Highlights />
            <section className="controls">
                <input
                    className="search-input"
                    placeholder="Search items by name or examine..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={onlyFavorites}
                        onChange={(e) => setOnlyFavorites(e.target.checked)}
                    />
                    Show favourites only
                </label>
            </section>

            <section className="filters-section">
                <div className="filters-header" onClick={() => setShowFilters(!showFilters)}>
                    <h3>Advanced Filters {showFilters ? "▼" : "▶"}</h3>
                    {showFilters && <button className="clear-filters" onClick={(e) => { e.stopPropagation(); clearFilters(); }}>Clear Filters</button>}
                </div>

                {showFilters && (
                    <div className="filters-grid">
                        <div className="filter-group">
                            <label>Buy Price</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minBuy} onChange={e => setMinBuy(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxBuy} onChange={e => setMaxBuy(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Sell Price</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minSell} onChange={e => setMinSell(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxSell} onChange={e => setMaxSell(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Margin</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minMargin} onChange={e => setMinMargin(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxMargin} onChange={e => setMaxMargin(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Volume</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minVolume} onChange={e => setMinVolume(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxVolume} onChange={e => setMaxVolume(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>24h Change (%)</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minDayChange} onChange={e => setMinDayChange(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxDayChange} onChange={e => setMaxDayChange(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Margin × Volume</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minMarginVolume} onChange={e => setMinMarginVolume(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxMarginVolume} onChange={e => setMaxMarginVolume(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Limit</label>
                            <div className="filter-inputs">
                                <input type="number" className="filter-input" placeholder="Min" value={minLimit} onChange={e => setMinLimit(e.target.value ? Number(e.target.value) : "")} />
                                <input type="number" className="filter-input" placeholder="Max" value={maxLimit} onChange={e => setMaxLimit(e.target.value ? Number(e.target.value) : "")} />
                            </div>
                        </div>
                        <div className="filter-group">
                            <label>Members</label>
                            <select className="filter-select" value={membersFilter} onChange={(e) => setMembersFilter(e.target.value as any)}>
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
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        Prev
                    </button>
                    <span className="pagination-info">
                        Page {currentPage} / {totalPages}
                    </span>
                    <button
                        className="page-button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                    >
                        Next
                    </button>
                    <select
                        className="page-size-select"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
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
