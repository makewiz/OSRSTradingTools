import React, { useState, useEffect, useRef } from "react";
import { Item } from "../types/item";

interface SearchWithSuggestionsProps {
    value: string;
    onChange: (value: string) => void;
    items: Item[];
    placeholder?: string;
    className?: string;
}

export const SearchWithSuggestions: React.FC<SearchWithSuggestionsProps> = ({
    value,
    onChange,
    items,
    placeholder = "Search...",
    className = "",
}) => {
    const [suggestions, setSuggestions] = useState<Item[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Filter suggestions when value changes
    useEffect(() => {
        if (!value || value.length < 2) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        const query = value.toLowerCase();
        // Simple heuristic: exact start matches first, then contains
        const matches = items
            .filter(item => item.name.toLowerCase().includes(query))
            .sort((a, b) => {
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aStarts = aName.startsWith(query);
                const bStarts = bName.startsWith(query);

                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                // Secondary sort by volume or exact length match could be good, 
                // Secondary sort can be added here if needed.
                return aName.localeCompare(bName);
            })
            .slice(0, 10); // Limit to 10 suggestions

        setSuggestions(matches);
        setIsOpen(matches.length > 0);
        setActiveIndex(-1);
    }, [value, items]);

    // Handle clicks outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : -1));
        } else if (e.key === "Enter") {
            if (activeIndex >= 0) {
                // Select suggestion
                e.preventDefault();
                handleSelect(suggestions[activeIndex]);
            } else {
                // Just submit current search (close dropdown)
                setIsOpen(false);
            }
        } else if (e.key === "Escape") {
            setIsOpen(false);
        }
    };

    const handleSelect = (item: Item) => {
        onChange(item.name);
        setSuggestions([]);
        setIsOpen(false);
    };

    return (
        <div className={`suggestions-container ${className}`} ref={wrapperRef}>
            <input
                type="text"
                className="search-input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    if (value.length >= 2 && suggestions.length > 0) {
                        setIsOpen(true);
                    }
                }}
            />

            {isOpen && suggestions.length > 0 && (
                <ul className="suggestions-list">
                    {suggestions.map((item, index) => (
                        <li
                            key={item.id}
                            className={`suggestion-item ${index === activeIndex ? "active" : ""}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setActiveIndex(index)}
                        >
                            <img src={item.iconUrl} alt="" className="suggestion-icon" />
                            <span className="suggestion-text">{item.name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
