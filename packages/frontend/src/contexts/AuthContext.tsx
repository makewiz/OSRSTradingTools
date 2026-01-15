import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

interface User {
    id: number;
    username: string;
    email: string | null;
    created_at: number;
    has_password?: boolean;
    is_admin?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    registrationEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../config";

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem("auth_user");
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [token, setToken] = useState<string | null>(() => localStorage.getItem("auth_token"));
    const [isLoading, setIsLoading] = useState(false);
    const [registrationEnabled, setRegistrationEnabled] = useState(false);
    const navigate = useNavigate();

    // Fetch public config on mount
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/config`)
            .then(res => res.json())
            .then(data => {
                if (typeof data.registrationEnabled === 'boolean') {
                    setRegistrationEnabled(data.registrationEnabled);
                }
            })
            .catch(console.error);
    }, []);

    const login = useCallback((newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem("auth_token", newToken);
        localStorage.setItem("auth_user", JSON.stringify(newUser));
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        navigate("/login");
    }, [navigate]);

    const fetchWithAuth = useCallback(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        const config: RequestInit = {
            ...init,
            headers
        };

        const response = await fetch(input, config);

        if (response.status === 401) {
            logout();
        }

        return response;
    }, [token, logout]);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!user,
                isLoading,
                login,
                logout,
                fetchWithAuth,
                registrationEnabled
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
