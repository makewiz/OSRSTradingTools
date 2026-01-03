import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { Header } from "./components/Header";
import { ItemList } from "./pages/ItemList";
import { ItemDetail } from "./pages/ItemDetail";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Profile } from "./pages/Profile";
import { DiscordCallback } from "./pages/DiscordCallback";

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="app">
        <Header />
        <Routes>
          <Route path="/" element={<ItemList />} />
          <Route path="/item/:id" element={<ItemDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/auth/discord/callback" element={<DiscordCallback />} />
        </Routes>
      </div>
    </AuthProvider>
  );
};
