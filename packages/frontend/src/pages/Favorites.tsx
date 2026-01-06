
import React from "react";
import { ItemList } from "./ItemList";

export const Favorites: React.FC = () => {
    return (
        <div style={{ padding: "0" }}>
            <h1 style={{ textAlign: "center", marginTop: "20px" }}>My Favorites</h1>
            <ItemList defaultShowFavorites={true} />
        </div>
    );
};
