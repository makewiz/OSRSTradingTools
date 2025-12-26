import React, { useEffect, useMemo, useState } from "react";

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

type SortKey =
  | "name"
  | "buyPrice"
  | "sellPrice"
  | "margin"
  | "volume"
  | "dayChange"
  | "marginVolume";

const FAVORITES_KEY = "osrs_trading_favorites";

export const App: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marginVolume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        setFavorites(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/items");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setItems(data.items ?? []);
      } catch (err) {
        setError("Failed to load items. Try again in a moment.");
        // eslint-disable-next-line no-console
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Reset page when filters change so we don't end up on an empty page.
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, onlyFavorites, pageSize]);

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
  }, [items, search, sortKey, sortDir, favorites, onlyFavorites]);

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>OSRS Trading Tools</h1>
        <p>Browse GE items, sort by margin & volume, and track your favourites.</p>
      </header>
      <main className="app-main">
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
                  <th>Wiki</th>
                  <th>Watch</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item) => {
                  const isFav = favorites.includes(item.id);
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
                          <div>{item.name}</div>
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
                        <a href={item.wikiUrl} target="_blank" rel="noreferrer">
                          Wiki
                        </a>
                      </td>
                      <td>
                        <button
                          className="watch-button"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              `/watch ${item.id} // ${item.name}`
                            )
                          }
                        >
                          Copy /watch
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};



