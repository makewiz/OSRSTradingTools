import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { FilterProvider } from "./contexts/FilterContext";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ItemList } from "./pages/ItemList";
import { ItemDetail } from "./pages/ItemDetail";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Profile } from "./pages/Profile";
import { Admin } from "./pages/Admin";
import { DiscordCallback } from "./pages/DiscordCallback";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Watches } from "./pages/Watches";
import { Favorites } from "./pages/Favorites";
import { HighlightsPage } from "./pages/HighlightsPage";
import { Recipes } from "./pages/Recipes";

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <FilterProvider>
        <div className="app">
          <Header />
          <Routes>
            <Route path="/" element={<HighlightsPage />} />
            <Route path="/recipes" element={<Recipes />} />
            <Route path="/items" element={<ItemList />} />
            <Route path="/item/:id" element={<ItemDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/auth/discord/callback" element={<DiscordCallback />} />
            <Route path="/watches" element={<Watches />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/highlights" element={<HighlightsPage />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
          <Footer />
        </div>
      </FilterProvider>
    </AuthProvider>
  );
};
