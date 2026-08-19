import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import { AgentChatWorkspace } from "./AgentChatWorkspace";
import "./AgentChatWorkspace.css";

interface TradingAgent {
    id: number;
    user_id: number;
    name: string;
    goal: string;
    cash_stack: number;
    enabled: boolean;
    status: "idle" | "running" | "error";
    last_run_at: number | null;
    next_run_at: number | null;
    error_message: string | null;
}

export const TradingAgentsSection: React.FC = () => {
    const { fetchWithAuth } = useAuth();
    const [agents, setAgents] = useState<TradingAgent[]>([]);
    const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);

    const fetchAgents = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents`);
            if (!res.ok) throw new Error("Failed to load trading agents");
            const data = await res.json();
            const fetchedAgents: TradingAgent[] = data.agents || [];
            setAgents(fetchedAgents);

            if (fetchedAgents.length > 0 && (!selectedAgentId || !fetchedAgents.some(a => a.id === selectedAgentId))) {
                setSelectedAgentId(fetchedAgents[0].id);
            }
        } catch (err: any) {
            if (!silent) setError(err.message || "Failed to load trading agents");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents(false);

        const interval = setInterval(() => {
            fetchAgents(true);
        }, 10000);

        return () => clearInterval(interval);
    }, [selectedAgentId]);

    const handleDeployNewAgent = async () => {
        if (agents.length >= 3 || submitting) return;
        setSubmitting(true);
        setError(null);

        try {
            const newName = `GE Master Agent ${agents.length + 1}`;
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newName,
                    goal: "Play the OSRS Trading Game for maximum net worth growth! Manage 8 GE slots, flip high-volume consumables & arbitrage, respect 4-hour buy limits, and re-evaluate every 15m to dominate the leaderboard.",
                    cashStack: 10000000
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to deploy trading agent");
            }

            const createdData = await res.json();
            await fetchAgents();

            if (createdData?.agent?.id) {
                setSelectedAgentId(createdData.agent.id);
            }
        } catch (err: any) {
            setError(err.message || "Failed to deploy agent");
        } finally {
            setSubmitting(false);
        }
    };

    const selectedAgent = agents.find(a => a.id === selectedAgentId);

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '48px 0', color: '#a1a1aa' }}>Loading AI Trading Agents...</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Agent Selector Header Tabs (Only when agents exist) */}
            {agents.length > 0 && (
                <div className="agent-selector-bar">
                    <div className="agent-selector-list">
                        {agents.map((agent) => {
                            const isSelected = agent.id === selectedAgentId;
                            return (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`agent-tab-btn ${isSelected ? "selected" : ""}`}
                                >
                                    <span>🤖</span>
                                    <span>{agent.name}</span>
                                    <span
                                        className={`agent-status-dot ${
                                            agent.status === "running"
                                                ? "running"
                                                : agent.enabled
                                                ? "active"
                                                : "paused"
                                        }`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={handleDeployNewAgent}
                        disabled={agents.length >= 3 || submitting}
                        className="agent-deploy-btn"
                    >
                        <span>+ Deploy New Agent</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>({agents.length}/3)</span>
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-900/50 border border-red-700 text-red-200 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {/* Empty State */}
            {agents.length === 0 ? (
                <div className="text-center py-16 bg-slate-800/40 rounded-2xl border border-dashed border-slate-700 p-8 space-y-4">
                    <div className="text-5xl">🤖</div>
                    <h3 className="text-xl font-bold text-white">No Trading Agents Deployed</h3>
                    <p className="text-gray-400 text-sm max-w-md mx-auto">
                        Deploy your autonomous AI trading agent to monitor market prices in the background, analyze 7-day dips, and send trade alerts directly to Discord.
                    </p>
                    <button
                        onClick={handleDeployNewAgent}
                        disabled={submitting}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-colors shadow-lg"
                    >
                        {submitting ? "Deploying Agent..." : "Deploy Your First AI Agent"}
                    </button>
                </div>
            ) : selectedAgent ? (
                /* Chat-First Agent Workspace */
                <AgentChatWorkspace
                    agent={selectedAgent}
                    onAgentUpdated={fetchAgents}
                    onAgentDeleted={() => {
                        setSelectedAgentId(null);
                        fetchAgents();
                    }}
                />
            ) : null}
        </div>
    );
};
