
import React from "react";
import { Highlights as HighlightsComponent } from "../components/Highlights";

export const HighlightsPage: React.FC = () => {
    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
            <HighlightsComponent />
        </div>
    );
};
