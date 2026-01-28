import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import { AutoRefreshControls } from "../components/AutoRefreshControls";

interface RecipeInput {
    itemId: number;
    quantity: number;
    name: string;
    price: number;

}

interface RecipeOutput {
    itemId: number;
    quantity: number;
    subtxt?: string;
    name: string;
    price: number;
}

interface ProfitableRecipe {
    id: number;
    name: string;
    skill: string;
    level: number;
    ticks: number | null;
    inputs: RecipeInput[];
    outputs: RecipeOutput[];
    facilities: string | null;
    tools: string | null;
    members: boolean;
    xp_: number | null;
    wikiUrl?: string;
    cost: number;
    revenue: number;
    profit: number;
    profitPerItem: number;
    roi: number;
    potentialProfitPerHour: number | null;
    dailyVolume?: number | null;
}

type SortKey = "skill" | "level" | "name" | "cost" | "profitPerItem" | "roi" | "dailyVolume" | "potentialProfitPerHour" | "xp";

export const Recipes: React.FC = () => {
    const { fetchWithAuth } = useAuth();
    const [recipes, setRecipes] = useState<ProfitableRecipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [skillFilter, setSkillFilter] = useState("All");
    const [minProfit, setMinProfit] = useState(0);
    const [minVolume, setMinVolume] = useState(0);
    const [hideUntradables, setHideUntradables] = useState(false);
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>("potentialProfitPerHour");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");



    // NEW: Filter by stats toggle
    const [filterByStats, setFilterByStats] = useState(false);
    const [username, setUsername] = useState(() => localStorage.getItem("rec_username") || "");
    const [playerStats, setPlayerStats] = useState<Record<string, number>>(() => {
        try {
            return JSON.parse(localStorage.getItem("rec_player_stats") || "{}");
        } catch {
            return {};
        }
    });
    const [fetchingStats, setFetchingStats] = useState(false);
    const [showStats, setShowStats] = useState(() => {
        // Auto-show if we have stats
        try {
            const stats = JSON.parse(localStorage.getItem("rec_player_stats") || "{}");
            return Object.keys(stats).length > 0;
        } catch {
            return false;
        }
    });

    // Persist to local storage
    useEffect(() => {
        localStorage.setItem("rec_username", username);
    }, [username]);

    useEffect(() => {
        localStorage.setItem("rec_player_stats", JSON.stringify(playerStats));
    }, [playerStats]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const fetchRecipes = async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        try {
            // Fetch more items to allow client-side filtering/pagination effectively
            const res = await fetchWithAuth(`${API_BASE_URL}/api/recipes?minProfit=${minProfit}&minVolume=${minVolume}&limit=2000`);
            if (!res.ok) throw new Error("Failed to fetch recipes");
            const data = await res.json();
            setRecipes(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError("Failed to load recipes.");
        } finally {
            if (!isRefresh) setLoading(false);
        }
    };

    const clearFilters = () => {
        setSearch("");
        setSkillFilter("All");
        setMinProfit(0);
        setMinVolume(0);
        setHideUntradables(false);
        setFilterByStats(false);
    };

    const clearStats = () => {
        setPlayerStats({});
        setUsername("");
        // Optionally keep the section open or close it. Keeping it open for now.
    };

    const fetchUserStats = async () => {
        if (!username) return;
        setFetchingStats(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/hiscores/${encodeURIComponent(username)}`);
            if (res.ok) {
                const data = await res.json();
                setPlayerStats(data.skills);
                setShowStats(true);
            } else {
                alert("Failed to fetch user stats. Please check username.");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setFetchingStats(false);
        }
    };

    useEffect(() => {
        fetchRecipes();
    }, [minProfit, minVolume]);

    useEffect(() => {
        setCurrentPage(1);
    }, [skillFilter, search, minProfit, minVolume, hideUntradables, playerStats, sortKey, sortDir, filterByStats]); // Adjust pagination when filters/sort change

    const skills = useMemo(() => {
        const s = new Set(recipes.map(r => r.skill).filter(Boolean));
        return ["All", ...Array.from(s).sort()];
    }, [recipes]);

    const handleSortChange = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const filteredRecipes = useMemo(() => {
        let list = recipes.filter(r => {
            if (skillFilter !== "All" && r.skill !== skillFilter) return false;
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;

            // Skill Specific Check (Player Stats)
            // Only apply if we have a stat for this skill AND filtering is enabled
            if (filterByStats && playerStats[r.skill] !== undefined) {
                if (r.level > playerStats[r.skill]) return false;
            }

            return true;
        });

        if (minVolume > 0) {
            list = list.filter(r => (r.dailyVolume || 0) >= minVolume);
        }

        if (hideUntradables) {
            list = list.filter(r => !r.inputs.some(i => i.itemId === 0));
        }

        return list.sort((a, b) => {
            const dir = sortDir === "asc" ? 1 : -1;
            const getVal = (item: ProfitableRecipe) => {
                switch (sortKey) {
                    case "skill": return item.skill;
                    case "level": return item.level;
                    case "name": return item.name.toLowerCase();
                    case "cost": return item.cost;
                    case "profitPerItem": return item.profit;
                    case "roi": return item.roi;
                    case "dailyVolume": return item.dailyVolume ?? -Infinity;
                    case "potentialProfitPerHour": return item.potentialProfitPerHour ?? -Infinity;
                    case "xp": return item.xp_ ?? -Infinity;
                    default: return 0;
                }
            };

            const va = getVal(a);
            const vb = getVal(b);

            if (typeof va === "string" && typeof vb === "string") {
                return va.localeCompare(vb) * dir;
            }

            return ((va as number) - (vb as number)) * dir;
        });
    }, [recipes, skillFilter, search, playerStats, minVolume, hideUntradables, sortKey, sortDir, filterByStats]);

    // Pagination Logic ...
    const totalItems = filteredRecipes.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const paginatedRecipes = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredRecipes.slice(start, start + pageSize);
    }, [filteredRecipes, currentPage, pageSize]);

    return (
        <main className="app-main">
            <section className="controls">
                <h2>Profitable Recipes</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginBottom: "15px" }}>
                    <input
                        type="text"
                        placeholder="Search recipe..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="filter-input"
                        style={{ maxWidth: "200px" }}
                    />
                    <select
                        value={skillFilter}
                        onChange={e => setSkillFilter(e.target.value)}
                        className="page-size-select"
                    >
                        {skills.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <label>Min Profit:</label>
                        <input
                            type="number"
                            placeholder="0"
                            value={minProfit || ""}
                            onChange={e => setMinProfit(Number(e.target.value))}
                            className="filter-input"
                            style={{ width: "100px" }}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <label>Min Volume:</label>
                        <input
                            type="number"
                            min="0"
                            placeholder="0"
                            className="filter-input"
                            style={{ width: "100px" }}
                            value={minVolume || ""}
                            onChange={(e) => setMinVolume(Number(e.target.value))}
                        />
                    </div>
                    <div style={{ display: "flex", alignItems: "center" }}>
                        <label title="Hides recipes that require items with no GE price (e.g. quest items, untradables)" style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={hideUntradables}
                                onChange={(e) => setHideUntradables(e.target.checked)}
                                style={{ marginRight: "5px" }}
                            />
                            Hide Untradables
                        </label>
                    </div>

                    <div style={{ display: "flex", alignItems: "center" }}>
                        <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={filterByStats}
                                onChange={e => setFilterByStats(e.target.checked)}
                                style={{ marginRight: "5px" }}
                            />
                            Filter using stats
                        </label>
                    </div>



                    <button
                        className="page-button"
                        onClick={() => setShowStats(!showStats)}
                        style={{ background: showStats ? "#444" : "var(--secondary-color)" }}
                    >
                        {showStats ? "Hide Stats" : "Player Stats"}
                    </button>

                    <button
                        className="page-button"
                        onClick={clearFilters}
                        style={{ backgroundColor: "#666" }}
                    >
                        Clear Filters
                    </button>

                    <AutoRefreshControls onRefresh={() => fetchRecipes(true)} />
                </div>

                {showStats && (
                    <div className="filters-section" style={{ marginTop: "10px" }}>
                        <div style={{ display: "flex", gap: "10px", marginBottom: "15px", alignItems: "center" }}>
                            <input
                                type="text"
                                placeholder="OSRS Username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="filter-input"
                                onKeyDown={e => e.key === 'Enter' && fetchUserStats()}
                            />
                            <button className="page-button" onClick={fetchUserStats} disabled={fetchingStats}>
                                {fetchingStats ? "Fetching..." : "Fetch Hiscores"}
                            </button>

                            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
                                <button
                                    className="page-button"
                                    onClick={clearStats}
                                    style={{ backgroundColor: "#883333", fontSize: "0.9em", padding: "5px 10px" }}
                                >
                                    Clear Stats
                                </button>
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "10px" }}>
                            {/* Relevant skills for recipes */}
                            {["Smithing", "Crafting", "Fletching", "Herblore", "Cooking", "Construction", "Farming", "Magic", "Runecraft"].map(skill => (
                                <div key={skill} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <label style={{ fontSize: "0.8em", color: "#aaa" }}>{skill}</label>
                                    <input
                                        type="number"
                                        value={playerStats[skill] || ""}
                                        placeholder="99"
                                        onChange={e => setPlayerStats({ ...playerStats, [skill]: Number(e.target.value) })}
                                        className="filter-input"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pagination Controls */}
                <div className="pagination-controls" style={{ marginTop: 0, marginBottom: "10px" }}>
                    <span className="pagination-info">
                        Showing {totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
                        {Math.min(currentPage * pageSize, totalItems)} of {totalItems} recipes
                    </span>
                    <button
                        className="page-button"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        Prev
                    </button>
                    <span className="pagination-info">
                        Page {currentPage} / {totalPages}
                    </span>
                    <button
                        className="page-button"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                    >
                        Next
                    </button>
                    <select
                        className="page-size-select"
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                    >
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={500}>500 / page</option>
                    </select>
                </div>
            </section>

            {loading && <p>Loading recipes...</p>}
            {error && <p className="error">{error}</p>}

            {
                !loading && !error && (
                    <div className="table-wrapper">
                        <table className="items-table recipe-table">
                            <thead>
                                <tr>
                                    <th onClick={() => handleSortChange("skill")} style={{ cursor: "pointer" }}>
                                        Skill {sortKey === "skill" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("level")} style={{ cursor: "pointer" }}>
                                        Lvl {sortKey === "level" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("name")} style={{ cursor: "pointer" }}>
                                        Item / Output {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th>Inputs</th>
                                    <th onClick={() => handleSortChange("cost")} style={{ cursor: "pointer" }}>
                                        Input Cost {sortKey === "cost" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("profitPerItem")} style={{ cursor: "pointer" }}>
                                        Profit/Item {sortKey === "profitPerItem" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("roi")} style={{ cursor: "pointer" }}>
                                        ROI {sortKey === "roi" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("dailyVolume")} style={{ cursor: "pointer" }}>
                                        Volume (Daily) {sortKey === "dailyVolume" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("potentialProfitPerHour")} style={{ cursor: "pointer" }}>
                                        Profit/Hr {sortKey === "potentialProfitPerHour" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                    <th onClick={() => handleSortChange("xp")} style={{ cursor: "pointer" }}>
                                        Exp {sortKey === "xp" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRecipes.map(recipe => (
                                    <tr key={recipe.id}>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                {/* Could add skill icons here if available */}
                                                {recipe.skill}
                                            </div>
                                        </td>
                                        <td>{recipe.level}</td>
                                        <td>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                {recipe.outputs.map((out, idx) => (
                                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                        <img
                                                            src={`https://static.runelite.net/cache/item/icon/${out.itemId}.png`}
                                                            alt=""
                                                            className="item-icon"
                                                            style={{ width: 24, height: 24 }}
                                                        />
                                                        <Link
                                                            to={`/item/${out.itemId}`}
                                                            className="item-name-link"
                                                            state={{ fromRecipes: true }}
                                                        >
                                                            {out.quantity > 1 ? `${out.quantity}x ` : ""}{recipe.name}
                                                        </Link>
                                                        {out.subtxt && <span style={{ fontSize: "0.8em", color: "#aaa" }}>({out.subtxt})</span>}
                                                    </div>
                                                ))}
                                                {recipe.facilities && <span style={{ fontSize: "0.8em", color: "#888" }}>@ {recipe.facilities}</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontSize: "0.9em", display: "flex", flexDirection: "column", gap: "2px" }}>
                                                {recipe.inputs.map((inpt, idx) => (
                                                    <div key={idx} style={{ display: "flex", alignItems: "center", minHeight: "24px" }}>
                                                        {inpt.quantity}x&nbsp;
                                                        {inpt.itemId > 0 ? (
                                                            <Link
                                                                to={`/item/${inpt.itemId}`}
                                                                className="item-name-link"
                                                                style={{ textDecoration: 'underline' }}
                                                                state={{ fromRecipes: true }}
                                                            >
                                                                {inpt.name ? inpt.name : `Item ${inpt.itemId}`}
                                                            </Link>
                                                        ) : (
                                                            <span title="Untradable / No GE Price" style={{ color: "#aaa" }}>
                                                                {inpt.name || "Unknown Item"}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            {recipe.cost.toLocaleString()} gp
                                        </td>
                                        <td className={recipe.profit > 0 ? "day-change positive" : "day-change negative"}>
                                            {recipe.profit.toLocaleString()} gp
                                        </td>
                                        <td className={recipe.roi > 0 ? "day-change positive" : "day-change"}>
                                            {recipe.roi.toFixed(1)}%
                                        </td>
                                        <td style={{ fontSize: "0.9em", color: "#aaa" }}>
                                            {recipe.dailyVolume ? recipe.dailyVolume.toLocaleString() : "-"}
                                        </td>
                                        <td style={{ fontWeight: "bold", color: recipe.potentialProfitPerHour && recipe.potentialProfitPerHour > 0 ? "#4caf50" : "inherit" }}>
                                            {recipe.potentialProfitPerHour
                                                ? `${Math.round(recipe.potentialProfitPerHour).toLocaleString()} gp`
                                                : "-"}
                                        </td>
                                        <td>
                                            {recipe.xp_ ? `${recipe.xp_} xp` : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <style>{`
                        .recipe-table td {
                            vertical-align: top;
                            padding: 8px 10px;
                        }
                        .recipe-table .item-name-link {
                            text-decoration: none;
                            color: inherit;
                        }
                        .recipe-table .item-name-link:hover {
                            text-decoration: underline;
                        }
                    `}</style>
                    </div>
                )
            }
        </main >
    );
};
