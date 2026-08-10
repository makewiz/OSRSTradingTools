import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import { AgentChatWorkspace } from "./AgentChatWorkspace";

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

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents`);
            if (!res.ok) throw new Error("Failed to load trading agents");
            const data = await res.json();
            const fetchedAgents: TradingAgent[] = data.agents || [];
            setAgents(fetchedAgents);

            if (fetchedAgents.length > 0 && (!selectedAgentId || !fetchedAgents.some(a => a.id === selectedAgentId))) {
                setSelectedAgentId(fetchedAgents[0].id);
            }
        } catch (err: any) {
            setError(err.message || "Failed to load trading agents");
        } finally {
            setLoading(false);
        }
    };

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
        return <div className="text-center py-12 text-gray-400">Loading AI Trading Agents...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Agent Selector Header Tabs (Only when agents exist) */}
            {agents.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                        {agents.map((agent) => {
                            const isSelected = agent.id === selectedAgentId;
                            return (
                                <button
                                    key={agent.id}
                                    onClick={() => setSelectedAgentId(agent.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                        isSelected
                                            ? "bg-indigo-600 text-white shadow-lg border border-indigo-400"
                                            : "bg-slate-900/80 text-gray-300 hover:text-white border border-slate-700"
                                    }`}
                                >
                                    <span>🤖</span>
                                    <span>{agent.name}</span>
                                    <span
                                        className={`w-2 h-2 rounded-full ${
                                            agent.status === "running"
                                                ? "bg-amber-400 animate-ping"
                                                : agent.enabled
                                                ? "bg-emerald-400"
                                                : "bg-gray-500"
                                        }`}
                                    />
                                </button>
                            );
                        })}
                    </div>

                    <button
                        onClick={handleDeployNewAgent}
                        disabled={agents.length >= 3 || submitting}
                        className="px-3.5 py-2 bg-indigo-600/90 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-colors shadow flex items-center gap-1.5"
                    >
                        <span>+ Deploy New Agent</span>
                        <span className="text-[11px] text-indigo-200">({agents.length}/3)</span>
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
