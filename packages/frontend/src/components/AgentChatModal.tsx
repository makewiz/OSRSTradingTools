import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
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
    const navigate = useNavigate();
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [promptText, setPromptText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatFeedRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const userHasScrolledUpRef = useRef<boolean>(false);

    const formatContentWithItemLinks = (content: string) => {
        if (!content) return "";
        let formatted = content.replace(
            /(?<!\[)(?:[•\-\*#\d\.]*\s*)?(?:\*\*)?([A-Za-z0-9'\s\-]{3,40}?)(?:\*\*)?\s*(?:\(ID:\s*(\d+)\)|ID:\s*(\d+)|id:\s*(\d+))/gi,
            (match, name, id1, id2, id3) => {
                const id = id1 || id2 || id3;
                const rawName = name ? name.trim().replace(/^\*+|\*+$/g, '') : `Item ${id}`;
                if (match.includes("](") || match.includes("[")) return match;
                return `[${rawName} (ID: ${id})](/item/${id})`;
            }
        );
        return formatted;
    };

    const renderMarkdownLink = ({ href, children }: any) => {
        if (href && (href.startsWith("/item/") || href.startsWith("#/item/"))) {
            const itemPath = href.replace(/^#/, "");
            return (
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                        navigate(itemPath);
                    }}
                    className="osrs-item-link-btn"
                    title="View item detail page"
                >
                    <span>🗡️</span>
                    <span>{children}</span>
                </button>
            );
        }
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-indigo-400 hover:text-indigo-300">
                {children}
            </a>
        );
    };

    const handleFeedScroll = () => {
        const el = chatFeedRef.current;
        if (!el) return;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        userHasScrolledUpRef.current = !isAtBottom;
    };

    const fetchMessages = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agentId}/messages`);
            if (!res.ok) throw new Error("Failed to load agent chat messages");
            const data = await res.json();
            const newMsgs: AgentMessage[] = data.messages || [];

            setMessages(prev => {
                if (prev.length === newMsgs.length) {
                    const isIdentical = prev.every((m, i) => m.id === newMsgs[i]?.id);
                    if (isIdentical) return prev;
                }
                return newMsgs;
            });
        } catch (err: any) {
            if (!silent) setError(err.message || "Failed to load chat messages");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        userHasScrolledUpRef.current = false;
        fetchMessages(false);

        const interval = setInterval(() => {
            if (!sending) {
                fetchMessages(true);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [agentId, sending]);

    useEffect(() => {
        if (!userHasScrolledUpRef.current && chatFeedRef.current) {
            chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
        }
    }, [messages, sending]);

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
        if (!msg || !msg.content || msg.sender === "user") return [];
        const recs: Array<{
            itemId: number;
            itemName: string;
            buyPrice: number;
            targetSellPrice: number;
            quantity: number;
            rationale?: string;
        }> = [];

        // Check structured tradeSuggestions in metadata
        if (msg.metadata && Array.isArray(msg.metadata.tradeSuggestions) && msg.metadata.tradeSuggestions.length > 0) {
            for (const s of msg.metadata.tradeSuggestions) {
                if (s.itemId || s.itemName) {
                    recs.push({
                        itemId: s.itemId || 0,
                        itemName: s.itemName || `Item ${s.itemId}`,
                        buyPrice: s.buyPrice || 0,
                        targetSellPrice: s.targetSellPrice || 0,
                        quantity: s.quantity || 1,
                        rationale: s.rationale
                    });
                }
            }
            if (recs.length > 0) return recs;
        }

        // Check actionsTaken metadata
        if (msg.metadata && Array.isArray(msg.metadata.actionsTaken)) {
            for (const a of msg.metadata.actionsTaken) {
                if (a.action === "suggest_trade_actions" && Array.isArray(a.suggestions)) {
                    for (const s of a.suggestions) {
                        recs.push({
                            itemId: s.itemId || 0,
                            itemName: s.itemName || `Item ${s.itemId}`,
                            buyPrice: s.buyPrice || 0,
                            targetSellPrice: s.targetSellPrice || 0,
                            quantity: s.quantity || 1,
                            rationale: s.rationale
                        });
                    }
                } else if (a.action === "set_price_trigger" && a.trigger) {
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

    const extractQuestions = (msg: AgentMessage) => {
        if (!msg || msg.sender === "user" || !msg.metadata) return [];
        if (Array.isArray(msg.metadata.questions) && msg.metadata.questions.length > 0) {
            return msg.metadata.questions;
        }
        if (Array.isArray(msg.metadata.actionsTaken)) {
            const qs: any[] = [];
            for (const a of msg.metadata.actionsTaken) {
                if (a.action === "ask_user_question" && a.question) {
                    qs.push({
                        question: a.question,
                        options: a.options || [],
                        allowCustomInput: a.allowCustomInput,
                        multiSelect: a.multiSelect
                    });
                }
            }
            return qs;
        }
        return [];
    };

    const extractFollowupOptions = (msg: AgentMessage) => {
        if (!msg || msg.sender === "user" || !msg.metadata) return [];
        if (Array.isArray(msg.metadata.followupOptions) && msg.metadata.followupOptions.length > 0) {
            return msg.metadata.followupOptions;
        }
        if (Array.isArray(msg.metadata.actionsTaken)) {
            const opts: string[] = [];
            for (const a of msg.metadata.actionsTaken) {
                if (a.action === "suggest_followup_options" && Array.isArray(a.options)) {
                    opts.push(...a.options);
                }
            }
            return opts;
        }
        return [];
    };

    const handleSendPromptText = async (text: string) => {
        if (!text.trim() || sending) return;
        setPromptText(text);
        setSending(true);
        setError(null);

        const optimisticMsg: AgentMessage = {
            id: Date.now(),
            agent_id: agentId,
            sender: "user",
            content: text.trim(),
            metadata: {},
            created_at: Math.floor(Date.now() / 1000)
        };
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agentId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text.trim() })
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
            if (onPortfolioUpdated) onPortfolioUpdated();
            handleSendPromptText(`I added ${rec.itemName} (${rec.quantity.toLocaleString()}x @ ${rec.buyPrice.toLocaleString()} GP, target sell: ${rec.targetSellPrice.toLocaleString()} GP) to my portfolio. Please watch this position and notify me if the price spikes or hits target sell.`);
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
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/40" ref={chatFeedRef} onScroll={handleFeedScroll}>
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
                            const questions = !isUser ? extractQuestions(msg) : [];
                            const followups = !isUser ? extractFollowupOptions(msg) : [];

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

                                        <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                            <ReactMarkdown components={{ a: renderMarkdownLink }}>
                                                {formatContentWithItemLinks(msg.content)}
                                            </ReactMarkdown>
                                        </div>

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
                                                            {rec.rationale && (
                                                                <div className="text-[11px] text-gray-400 mt-1">{rec.rationale}</div>
                                                            )}
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

                                        {/* Interactive Questions */}
                                        {questions.length > 0 && (
                                            <div className="pt-2 border-t border-slate-700/80 space-y-2">
                                                {questions.map((q: any, qIdx: number) => (
                                                    <div key={qIdx} className="bg-indigo-950/40 p-3 rounded-lg border border-indigo-500/30 space-y-2">
                                                        <div className="text-xs font-bold text-indigo-300">
                                                            ❓ {q.question}
                                                        </div>
                                                        {Array.isArray(q.options) && q.options.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {q.options.map((opt: string, optIdx: number) => (
                                                                    <button
                                                                        key={optIdx}
                                                                        onClick={() => handleSendPromptText(opt)}
                                                                        disabled={sending}
                                                                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md transition-colors shadow"
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Suggested Follow-up Quick Reply Chips */}
                                        {followups.length > 0 && (
                                            <div className="pt-2 border-t border-slate-700/80 space-y-1.5">
                                                <div className="text-[11px] text-gray-400">Suggested Follow-ups:</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {followups.map((opt: string, optIdx: number) => (
                                                        <button
                                                            key={optIdx}
                                                            onClick={() => handleSendPromptText(opt)}
                                                            disabled={sending}
                                                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-indigo-200 text-xs font-medium rounded-md transition-colors border border-slate-600"
                                                        >
                                                            💡 {opt}
                                                        </button>
                                                    ))}
                                                </div>
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
