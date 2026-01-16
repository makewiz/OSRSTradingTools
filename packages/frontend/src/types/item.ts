export interface Item {
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
    potentialProfit: number | null;
}

export type SortKey =
    | "name"
    | "buyPrice"
    | "sellPrice"
    | "margin"
    | "volume"
    | "dayChange"
    | "marginVolume"
    | "limit"
    | "potentialProfit";

export interface FilterState {
    search: string;
    minBuy: number | "";
    maxBuy: number | "";
    minSell: number | "";
    maxSell: number | "";
    minMargin: number | "";
    maxMargin: number | "";
    minVolume: number | "";
    maxVolume: number | "";
    minDayChange: number | "";
    maxDayChange: number | "";
    minMarginVolume: number | "";
    maxMarginVolume: number | "";
    minLimit: number | "";
    maxLimit: number | "";
    minPotentialProfit: number | "";
    maxPotentialProfit: number | "";
    membersFilter: "all" | "members" | "f2p";
    sortKey: SortKey;
    sortDir: "asc" | "desc";
    page: number;
    pageSize: number;
}

export interface SavedFilter {
    id: number | string; // string for local (generated GUID or similar), number for DB
    name: string;
    config: FilterState;
}
