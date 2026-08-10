import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";

interface AgentMessage {
    id: number;
    agent_id: number;
    sender: 'user' | 'agent' | 'system';
    content: string;
    metadata: any;
    created_at: number;
}

interface AgentChatModalProps {
    agentId: number;
    agentName: string;
    onClose: () => void;
    onPortfolioUpdated?: () => void;
}

export const AgentChatModal: React.FC<AgentChatModalProps> = ({
    agentId,
    agentName,
    onClose,
    onPortfolioUpdated
}) => {
    const { fetchWithAuth } = useAuth();
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [promptText, setPromptText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchMessages();
    }, [agentId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agentId}/messages`);
            if (!res.ok) throw new Error("Failed to load agent chat messages");
            const data = await res.json();
            setMessages(data.messages || []);
        } catch (err: any) {
            setError(err.message || "Failed to load chat messages");
        } finally {
            setLoading(false);
        }
    };

    const handleSendPrompt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!promptText.trim() || sending) return;

        const userMsg = promptText.trim();
        setPromptText("");
        setSending(true);
        setError(null);

        // Optimistic append user message
        const optimisticMsg: AgentMessage = {
            id: Date.now(),
            agent_id: agentId,
            sender: "user",
            content: userMsg,
            metadata: {},
            created_at: Math.floor(Date.now() / 1000)
        };
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agentId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to send message to agent");
            }

            const data = await res.json();
            setMessages(data.messages || []);
        } catch (err: any) {
            setError(err.message || "Error sending message");
        } finally {
            setSending(false);
        }
    };

    // Extract trade recommendations from message content / actions metadata
    const extractRecommendations = (msg: AgentMessage) => {
        const recs: Array<{
            itemId: number;
            itemName: string;
            buyPrice: number;
            targetSellPrice: number;
            quantity: number;
        }> = [];

        // Check actions_taken metadata
        if (msg.metadata && Array.isArray(msg.metadata.actionsTaken)) {
            for (const a of msg.metadata.actionsTaken) {
                if (a.action === "set_price_trigger" && a.trigger) {
                    const t = a.trigger;
                    recs.push({
                        itemId: t.item_id || 563,
                        itemName: t.item_name || `Item ${t.item_id}`,
                        buyPrice: Math.round(t.target_value * 0.95),
                        targetSellPrice: t.target_value,
                        quantity: 1000
                    });
                }
            }
        }

        return recs;
    };

    const handleAddRecommendationToPortfolio = async (rec: {
        itemId: number;
        itemName: string;
        buyPrice: number;
        targetSellPrice: number;
        quantity: number;
    }) => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/portfolio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: rec.itemId,
                    itemName: rec.itemName,
                    quantity: rec.quantity,
                    buyPrice: rec.buyPrice,
                    targetSellPrice: rec.targetSellPrice,
                    agentId: agentId,
                    notes: `Recommended by Agent ${agentName}`
                })
            });

            if (!res.ok) throw new Error("Failed to add position to portfolio");
            alert(`Added ${rec.itemName} to your Trading Portfolio with sell target ${rec.targetSellPrice.toLocaleString()} GP!`);
            if (onPortfolioUpdated) onPortfolioUpdated();
        } catch (err: any) {
            alert(err.message || "Error adding to portfolio");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center bg-slate-900/80 px-6 py-4 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🤖</span>
                        <div>
                            <h3 className="text-lg font-bold text-white">{agentName}</h3>
                            <p className="text-xs text-indigo-300 font-medium">Interactive Strategy & Steering Prompt Window</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl font-bold transition-colors"
                    >
                        &times;
                    </button>
                </div>

                {/* Message Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/40">
                    {loading ? (
                        <div className="text-center py-12 text-gray-400 text-sm">Loading chat history...</div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-sm">
                            No messages yet. Send an instruction below to steer your agent or answer its questions!
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isUser = msg.sender === "user";
                            const recs = !isUser ? extractRecommendations(msg) : [];

                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm space-y-3 ${
                                            isUser
                                                ? "bg-indigo-600 text-white rounded-br-none shadow"
                                                : "bg-slate-800 border border-slate-700 text-gray-200 rounded-bl-none shadow-md"
                                        }`}
                                    >
                                        <div className="flex justify-between items-center gap-4 text-[11px] opacity-75 font-medium border-b border-white/10 pb-1 mb-1">
                                            <span>{isUser ? "You" : agentName}</span>
                                            <span>{new Date(msg.created_at * 1000).toLocaleTimeString()}</span>
                                        </div>

                                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                                        {/* Actionable 1-Click Recommendation Cards */}
                                        {recs.length > 0 && (
                                            <div className="pt-2 border-t border-slate-700/80 space-y-2">
                                                <div className="text-xs font-bold text-indigo-300">
                                                    💡 Agent Recommendations:
                                                </div>
                                                {recs.map((rec, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="bg-slate-900/90 p-3 rounded-lg border border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-white">{rec.itemName}</div>
                                                            <div className="text-xs text-gray-300">
                                                                Buy @ <span className="text-amber-300">{rec.buyPrice.toLocaleString()} GP</span> | Sell @ <span className="text-emerald-300">{rec.targetSellPrice.toLocaleString()} GP</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleAddRecommendationToPortfolio(rec)}
                                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-md transition-colors shadow flex items-center gap-1.5"
                                                        >
                                                            <span>✅ Add to Portfolio & Set Sell Watch</span>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {sending && (
                        <div className="flex justify-start">
                            <div className="bg-slate-800 border border-slate-700 text-indigo-300 px-4 py-3 rounded-2xl rounded-bl-none text-sm animate-pulse flex items-center gap-2">
                                <span className="text-base">🤖</span>
                                <span>Agent is evaluating market data and processing prompt...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {error && (
                    <div className="px-6 py-2 bg-red-900/50 border-t border-red-700 text-red-200 text-xs">
                        ⚠️ {error}
                    </div>
                )}

                {/* Input Prompt Box */}
                <form onSubmit={handleSendPrompt} className="p-4 bg-slate-900 border-t border-slate-700 flex gap-3">
                    <input
                        type="text"
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        placeholder={`Send prompt to steer ${agentName} (e.g. 'I bought 5,000 Prayer pots at 9,200 GP, monitor sell point')...`}
                        disabled={sending}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={sending || !promptText.trim()}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-colors shadow flex items-center gap-2"
                    >
                        <span>Send</span>
                        <span>➔</span>
                    </button>
                </form>
            </div>
        </div>
    );
};
