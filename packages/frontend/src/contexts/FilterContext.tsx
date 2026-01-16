
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { FilterState, SavedFilter } from "../types/item";
import { useAuth } from "./AuthContext";
import { API_BASE_URL } from "../config";

const LOCAL_STORAGE_KEY_PRESETS = "osrs_saved_filters";

const defaultFilterState: FilterState = {
    search: "",
    minBuy: "", maxBuy: "",
    minSell: "", maxSell: "",
    minMargin: "", maxMargin: "",
    minVolume: "", maxVolume: "",
    minDayChange: "", maxDayChange: "",
    minMarginVolume: "", maxMarginVolume: "",
    minLimit: "", maxLimit: "",
    minPotentialProfit: "", maxPotentialProfit: "",
    membersFilter: "all",
    sortKey: "marginVolume",
    sortDir: "desc",
    page: 1,
    pageSize: 50
};

interface FilterContextType {
    filterState: FilterState;
    setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
    savedPresets: SavedFilter[];
    savePreset: (name: string) => Promise<void>;
    loadPreset: (preset: SavedFilter) => void;
    deletePreset: (id: number | string) => Promise<void>;
    resetFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user, token, fetchWithAuth } = useAuth();

    // Initial state: try to see if we want to restore "current" state? 
    // For now, let's just default to clean state. 
    // Ideally we might want to stash "current session" in session storage or similar, 
    // but the requirement is mainly about "moving back from selected item wont lose filters". 
    // Since this Provider will be high up in App, state will be preserved in memory as long as we don't reload.
    const [filterState, setFilterState] = useState<FilterState>(defaultFilterState);
    const [savedPresets, setSavedPresets] = useState<SavedFilter[]>([]);

    // Fetch presets on mount or login
    useEffect(() => {
        const loadPresets = async () => {
            if (user && token) {
                try {
                    const res = await fetchWithAuth(`${API_BASE_URL}/api/filters`);
                    if (res.ok) {
                        const data = await res.json();
                        setSavedPresets(data.filters);
                    }
                } catch (err) {
                    console.error("Failed to load saved filters", err);
                }
            } else {
                // Load from local storage
                try {
                    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PRESETS);
                    if (raw) {
                        setSavedPresets(JSON.parse(raw));
                    }
                } catch { } // ignore
            }
        };
        loadPresets();
    }, [user, token, fetchWithAuth]);

    const savePreset = useCallback(async (name: string) => {
        if (user && token) {
            try {
                const res = await fetchWithAuth(`${API_BASE_URL}/api/filters`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, config: filterState })
                });
                if (res.ok) {
                    const data = await res.json();
                    setSavedPresets(prev => [data.filter, ...prev]);
                }
            } catch (err) {
                console.error("Failed to save filter", err);
                alert("Failed to save filter to server.");
            }
        } else {
            // Local save
            const newFilter: SavedFilter = {
                id: crypto.randomUUID(),
                name,
                config: filterState
            };
            const newPresets = [newFilter, ...savedPresets];
            setSavedPresets(newPresets);
            localStorage.setItem(LOCAL_STORAGE_KEY_PRESETS, JSON.stringify(newPresets));
        }
    }, [user, token, filterState, savedPresets, fetchWithAuth]);

    const deletePreset = useCallback(async (id: number | string) => {
        if (user && token && typeof id === 'number') {
            try {
                await fetchWithAuth(`${API_BASE_URL}/api/filters/${id}`, { method: "DELETE" });
                setSavedPresets(prev => prev.filter(p => p.id !== id));
            } catch (err) {
                console.error("Failed to delete filter", err);
            }
        } else {
            const newPresets = savedPresets.filter(p => p.id !== id);
            setSavedPresets(newPresets);
            localStorage.setItem(LOCAL_STORAGE_KEY_PRESETS, JSON.stringify(newPresets));
        }
    }, [user, token, savedPresets, fetchWithAuth]);

    const loadPreset = useCallback((preset: SavedFilter) => {
        setFilterState(preset.config);
    }, []);

    const resetFilters = useCallback(() => {
        setFilterState(defaultFilterState);
    }, []);

    return (
        <FilterContext.Provider value={{
            filterState,
            setFilterState,
            savedPresets,
            savePreset,
            loadPreset,
            deletePreset,
            resetFilters
        }}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilters = () => {
    const context = useContext(FilterContext);
    if (!context) {
        throw new Error("useFilters must be used within a FilterProvider");
    }
    return context;
};
