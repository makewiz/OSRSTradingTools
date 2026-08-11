import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";
import "./AgentChatWorkspace.css";

interface AgentMessage {
    id: number;
    agent_id: number;
    sender: 'user' | 'agent' | 'system';
    content: string;
    metadata: any;
    created_at: number;
}

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

interface AgentChatWorkspaceProps {
    agent: TradingAgent;
    onBack?: () => void;
    onAgentUpdated?: () => void;
    onAgentDeleted?: () => void;
}

export const AgentChatWorkspace: React.FC<AgentChatWorkspaceProps> = ({
    agent,
    onBack,
    onAgentUpdated,
    onAgentDeleted
}) => {
    const { fetchWithAuth } = useAuth();
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [promptText, setPromptText] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Quick-start prompt templates
    const premadePrompts = [
        {
            title: "🏆 Grand Exchange Master Trader (Trading Game)",
            prompt: "Play the OSRS Trading Game for maximum net worth growth! First, call 'game_get_account' to inspect your 10M cash stack, 8 GE slots, and inventory. Collect any completed slots ('game_collect_slot') and cancel stale un-filled offers older than 1 hour ('game_cancel_offer'). Scan high-volume consumables (Zulrah scales, Chinchompas, Runes, Food, Potions) and decant/set arbitrage for high-ROI items after 2% GE tax. Place BUY offers across open GE slots ('game_place_offer') at instant-sell prices while respecting 4-hour buy limits. Once bought, place SELL offers at instant-buy prices. Re-evaluate the market and schedule your next run in 15 minutes."
        },
        {
            title: "⚡ High-Volume Consumable Flipper",
            prompt: "Focus exclusively on flipping high-volume consumables in the Trading Game (Zulrah scales, Chinchompas, Runes, Cannonballs, High-tier Food/Potions). Max out 4-hour buy limits by placing buy offers at current low prices, then relist completed items at high prices minus 2% GE tax for rapid compound growth."
        },
        {
            title: "⚗️ Decanting & Set Arbitrage Specialist",
            prompt: "Check 1-dose, 2-dose, and 3-dose potion decanting margins against 4-dose potions, as well as Barrows and Dragon armor sets in the Trading Game. Execute component buy orders, collect filled items, perform conversions, and sell completed sets/potions to lock in risk-free profit."
        },
        {
            title: "📈 Medium-Term Dip Investments",
            prompt: "Find me medium term investments. Filter items by max sell price 10,000,000 and min volume 100, then sort by highest margin. Check if the current price is a dip compared to recent averages. Tell me what to buy and sell and when for maximum profit on a 1-day investment time. Set sell watches for the best items."
        }
    ];

    const chatFeedRef = useRef<HTMLDivElement>(null);
    const userHasScrolledUpRef = useRef<boolean>(false);

    const handleFeedScroll = () => {
        const el = chatFeedRef.current;
        if (!el) return;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        userHasScrolledUpRef.current = !isAtBottom;
    };

    const fetchMessages = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}/messages`);
            if (!res.ok) throw new Error("Failed to load agent chat history");
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
            if (!silent) setError(err.message || "Failed to load chat history");
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
    }, [agent.id, sending]);

    useEffect(() => {
        if (!userHasScrolledUpRef.current && chatFeedRef.current) {
            chatFeedRef.current.scrollTop = chatFeedRef.current.scrollHeight;
        }
    }, [messages, sending]);

    const handleSendPrompt = async (textToSend?: string) => {
        const text = textToSend || promptText;
        if (!text.trim() || sending) return;

        const userMsgText = text.trim();
        setPromptText("");
        setSending(true);
        setError(null);

        // Optimistic append user message
        const optimisticMsg: AgentMessage = {
            id: Date.now(),
            agent_id: agent.id,
            sender: "user",
            content: userMsgText,
            metadata: {},
            created_at: Math.floor(Date.now() / 1000)
        };
        setMessages(prev => [...prev, optimisticMsg]);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsgText })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to send prompt to agent");
            }

            const data = await res.json();
            setMessages(data.messages || []);
            if (onAgentUpdated) onAgentUpdated();
        } catch (err: any) {
            setError(err.message || "Error sending prompt");
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendPrompt();
        }
    };

    const handleRunNow = async () => {
        if (sending) return;
        setSending(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}/run`, {
                method: "POST"
            });
            if (!res.ok) throw new Error("Failed to run agent");
            await fetchMessages();
            if (onAgentUpdated) onAgentUpdated();
        } catch (err: any) {
            setError(err.message || "Error running agent");
        } finally {
            setSending(false);
        }
    };

    const handleToggleEnable = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !agent.enabled })
            });
            if (!res.ok) throw new Error("Failed to update agent status");
            if (onAgentUpdated) onAgentUpdated();
        } catch (err: any) {
            alert(err.message || "Failed to toggle agent status");
        }
    };

    const handleDeleteAgent = async () => {
        if (!confirm(`Are you sure you want to delete agent '${agent.name}'?`)) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}`, {
                method: "DELETE"
            });
            if (!res.ok) throw new Error("Failed to delete agent");
            if (onAgentDeleted) onAgentDeleted();
        } catch (err: any) {
            alert(err.message || "Failed to delete agent");
        }
    };

    const [addedItemIds, setAddedItemIds] = useState<Set<number>>(new Set());
    const [addedWatchItemIds, setAddedWatchItemIds] = useState<Set<number>>(new Set());

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
                    agentId: agent.id,
                    notes: `Recommended by Agent ${agent.name}`
                })
            });

            if (!res.ok) throw new Error("Failed to add position to portfolio");
            setAddedItemIds(prev => new Set(prev).add(rec.itemId));
            alert(`Added ${rec.itemName} to your Trading Portfolio with sell target ${rec.targetSellPrice.toLocaleString()} GP!`);
        } catch (err: any) {
            alert(err.message || "Error adding to portfolio");
        }
    };

    const handleSetWatchAlert = async (rec: {
        itemId: number;
        itemName: string;
        buyPrice: number;
        targetSellPrice: number;
    }) => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/agents/${agent.id}/triggers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    itemId: rec.itemId,
                    itemName: rec.itemName,
                    triggerType: "buy_price_above",
                    targetValue: rec.targetSellPrice,
                    cooldownSeconds: 600
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to set watch alert");
            }

            try {
                await fetchWithAuth(`${API_BASE_URL}/api/discord/watch`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        itemId: rec.itemId,
                        threshold: 5.0,
                        period: "1h"
                    })
                });
            } catch (dErr) {
                // Ignore if Discord is not linked
            }

            setAddedWatchItemIds(prev => new Set(prev).add(rec.itemId));
            alert(`Set watch alert for ${rec.itemName} at target price ${rec.targetSellPrice.toLocaleString()} GP!`);
        } catch (err: any) {
            alert(err.message || "Error setting watch alert");
        }
    };

    const extractRecommendations = (msg: AgentMessage) => {
        if (!msg || !msg.content || msg.sender === "user") return [];

        const recsMap = new Map<number, {
            itemId: number;
            itemName: string;
            buyPrice: number;
            targetSellPrice: number;
            quantity: number;
        }>();

        const text = msg.content;

        // 1. Text Parsing: Match "Item Name (ID: 1234)" or "Item Name - ID: 1234"
        const idRegex = /(?:[•\-\*#\d\.]*\s*)?(?:\*\*)?([A-Za-z0-9'\s\-]{3,40}?)(?:\*\*)?\s*(?:\(ID:\s*(\d+)\)|ID:\s*(\d+)|id:\s*(\d+))/gi;
        let m: RegExpExecArray | null;

        while ((m = idRegex.exec(text)) !== null) {
            const rawName = m[1].trim().replace(/^\*+|\*+$/g, '');
            const idStr = m[2] || m[3] || m[4];
            if (!idStr) continue;
            const itemId = parseInt(idStr, 10);
            if (isNaN(itemId) || itemId <= 0) continue;

            const lowerName = rawName.toLowerCase();
            if (["agent", "user", "id", "item", "goal", "recommendation", "note"].includes(lowerName)) continue;

            const snippet = text.slice(m.index, m.index + 250);

            let buyPrice = 0;
            const buyMatch = snippet.match(/(?:buy|purchase|cost|entry|low|sell_price)\s*(?:price|at|@)?\s*:?\s*GP?\s*([\d,]+)/i) ||
                             snippet.match(/(?:buy|purchase)\s*:\s*([\d,]+)/i);
            if (buyMatch) {
                buyPrice = parseInt(buyMatch[1].replace(/,/g, ''), 10);
            }

            let targetSellPrice = 0;
            const sellMatch = snippet.match(/(?:target\s*)?(?:sell|exit|high|target|buy_price)\s*(?:price|at|@)?\s*:?\s*GP?\s*([\d,]+)/i) ||
                              snippet.match(/(?:sell|target)\s*:\s*([\d,]+)/i);
            if (sellMatch) {
                targetSellPrice = parseInt(sellMatch[1].replace(/,/g, ''), 10);
            }

            let quantity = 1000;
            const qtyMatch = snippet.match(/(?:quantity|qty|amount)\s*:?\s*([\d,]+)/i) ||
                             snippet.match(/([\d,]+)x/i);
            if (qtyMatch) {
                const parsedQty = parseInt(qtyMatch[1].replace(/,/g, ''), 10);
                if (!isNaN(parsedQty) && parsedQty > 0) quantity = parsedQty;
            }

            if (buyPrice > 0 || targetSellPrice > 0) {
                if (buyPrice > 0 && targetSellPrice === 0) targetSellPrice = Math.round(buyPrice * 1.05);
                if (targetSellPrice > 0 && buyPrice === 0) buyPrice = Math.round(targetSellPrice * 0.95);

                recsMap.set(itemId, {
                    itemId,
                    itemName: rawName,
                    buyPrice,
                    targetSellPrice,
                    quantity
                });
            }
        }

        // 2. Metadata Fallback: Extract items from actionsTaken if present
        if (msg.metadata && Array.isArray(msg.metadata.actionsTaken)) {
            for (const a of msg.metadata.actionsTaken) {
                if (a.action === "set_price_trigger" && a.trigger) {
                    const t = a.trigger;
                    const id = t.item_id || 563;
                    if (!recsMap.has(id)) {
                        recsMap.set(id, {
                            itemId: id,
                            itemName: t.item_name || `Item ${id}`,
                            buyPrice: Math.round(t.target_value * 0.95),
                            targetSellPrice: t.target_value,
                            quantity: 1000
                        });
                    }
                } else if (a.action === "get_item_detail" && a.args?.itemId) {
                    const id = a.args.itemId;
                    const name = a.args.itemName || `Item ${id}`;
                    if (!recsMap.has(id)) {
                        recsMap.set(id, {
                            itemId: id,
                            itemName: name,
                            buyPrice: 10000,
                            targetSellPrice: 11000,
                            quantity: 1000
                        });
                    }
                }
            }
        }

        return Array.from(recsMap.values());
    };

    return (
        <div className="agent-chat-container">
            {/* Header Bar */}
            <div className="agent-chat-header">
                <div className="agent-chat-header-info">
                    {onBack && (
                        <button onClick={onBack} className="agent-btn agent-btn-secondary">
                            ← Back
                        </button>
                    )}
                    <div>
                        <h2 className="agent-chat-header-title">
                            <span>🤖</span>
                            <span>{agent.name}</span>
                            <span
                                className={`agent-status-badge ${
                                    sending || agent.status === "running"
                                        ? "running"
                                        : agent.enabled
                                        ? "active"
                                        : "paused"
                                }`}
                            >
                                {sending || agent.status === "running" ? "Analyzing Market..." : agent.enabled ? "Active" : "Paused"}
                            </span>
                        </h2>
                        <div className="agent-chat-header-meta">
                            Next automated run:{" "}
                            <strong>
                                {agent.next_run_at ? new Date(agent.next_run_at * 1000).toLocaleTimeString() : "Pending"}
                            </strong>
                        </div>
                    </div>
                </div>

                <div className="agent-chat-header-actions">
                    <button onClick={handleRunNow} disabled={sending} className="agent-btn agent-btn-primary">
                        ▶ Run Now
                    </button>
                    <button onClick={handleToggleEnable} className="agent-btn agent-btn-secondary">
                        {agent.enabled ? "⏸ Pause" : "▶ Resume"}
                    </button>
                    <button onClick={handleDeleteAgent} className="agent-btn agent-btn-danger">
                        🗑 Delete
                    </button>
                </div>
            </div>

            {/* Scrollable Messages Feed */}
            <div className="agent-chat-messages" ref={chatFeedRef} onScroll={handleFeedScroll}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#a1a1aa' }}>Loading agent conversation history...</div>
                ) : messages.length === 0 ? (
                    <div className="agent-empty-workspace">
                        <div style={{ fontSize: '2.5rem' }}>🤖</div>
                        <h3>AI Agent Workspace Chat</h3>
                        <p>
                            Type any strategy prompt below to steer your agent, specify cash stack or price limits, or pick a quick start strategy chip below!
                        </p>
                        <div className="premade-chips-grid">
                            {premadePrompts.map((p, i) => (
                                <button key={i} onClick={() => setPromptText(p.prompt)} className="premade-chip-btn">
                                    <div className="premade-chip-title">{p.title}</div>
                                    <div className="premade-chip-desc">{p.prompt}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isUser = msg.sender === "user";
                        const recs = !isUser ? extractRecommendations(msg) : [];
                        const actions = msg.metadata?.actionsTaken || [];

                        return (
                            <div key={msg.id} className={`agent-message-row ${isUser ? "user" : "agent"}`}>
                                <div className="agent-message-bubble">
                                    <div className="agent-message-meta">
                                        <span>{isUser ? "👤 You" : `🤖 ${agent.name}`}</span>
                                        <span>{new Date(msg.created_at * 1000).toLocaleTimeString()}</span>
                                    </div>

                                    <div className="agent-message-text">{msg.content}</div>

                                    {/* Inline Executed Actions */}
                                    {actions.length > 0 && (
                                        <div className="agent-actions-executed">
                                            <div className="agent-actions-title">⚡ Actions Executed:</div>
                                            <div className="agent-actions-tags">
                                                {actions.map((act: any, idx: number) => (
                                                    <span key={idx} className="agent-action-tag">
                                                        {act.action === "search_items"
                                                            ? `🔍 Search (${act.args?.sortBy || "margin"})`
                                                            : act.action === "set_price_trigger"
                                                            ? `🎯 Set Watch Trigger`
                                                            : act.action === "send_discord_notification"
                                                            ? `📢 Discord Alert`
                                                            : `⚙️ ${act.action}`}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Actionable Trade Cards */}
                                    {recs.length > 0 && (
                                        <div className="agent-trade-recs">
                                            <div className="agent-actions-title">💡 Recommended Trade Actions:</div>
                                            {recs.map((rec, idx) => {
                                                const isAddedPortfolio = addedItemIds.has(rec.itemId);
                                                const isAddedWatch = addedWatchItemIds.has(rec.itemId);

                                                return (
                                                    <div key={idx} className="agent-trade-card">
                                                        <div style={{ flex: 1 }}>
                                                            <div className="agent-trade-info-title">
                                                                {rec.itemName} <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 'normal' }}>(ID: {rec.itemId})</span>
                                                            </div>
                                                            <div className="agent-trade-info-details">
                                                                Buy @ <strong style={{ color: '#fbbf24' }}>{rec.buyPrice.toLocaleString()} GP</strong> | Target Sell @ <strong style={{ color: '#34d399' }}>{rec.targetSellPrice.toLocaleString()} GP</strong> | Qty: {rec.quantity.toLocaleString()}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                            <button
                                                                onClick={() => handleAddRecommendationToPortfolio(rec)}
                                                                disabled={isAddedPortfolio}
                                                                className="agent-trade-btn"
                                                                style={isAddedPortfolio ? { background: '#065f46', cursor: 'default', opacity: 0.8 } : undefined}
                                                            >
                                                                {isAddedPortfolio ? "✓ In Portfolio" : "✅ Add to Portfolio"}
                                                            </button>
                                                            <button
                                                                onClick={() => handleSetWatchAlert(rec)}
                                                                disabled={isAddedWatch}
                                                                className="agent-trade-btn"
                                                                style={{
                                                                    background: isAddedWatch ? '#1e3a8a' : '#3b82f6',
                                                                    ...(isAddedWatch ? { cursor: 'default', opacity: 0.8 } : {})
                                                                }}
                                                            >
                                                                {isAddedWatch ? "✓ Watch Active" : "🔔 Set Watch Alert"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}

                {sending && (
                    <div className="agent-message-row agent">
                        <div className="agent-message-bubble" style={{ background: '#1f1f23', border: '1px border #3f3f46', color: '#818cf8' }}>
                            ⚙️ Agent is evaluating OSRS market trends and processing your prompt...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderTop: '1px solid #ef4444', padding: '10px 24px', fontSize: '0.85rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Bottom Input Area */}
            <div className="agent-chat-input-area">
                {messages.length > 0 && (
                    <div className="agent-chat-quick-chips">
                        {premadePrompts.map((p, idx) => (
                            <button key={idx} onClick={() => setPromptText(p.prompt)} className="agent-quick-chip">
                                {p.title}
                            </button>
                        ))}
                    </div>
                )}

                <form onSubmit={(e) => { e.preventDefault(); handleSendPrompt(); }} className="agent-chat-form">
                    <textarea
                        value={promptText}
                        onChange={(e) => setPromptText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Type instructions for ${agent.name} (Shift+Enter for newline, Enter to send)...`}
                        disabled={sending}
                        className="agent-chat-textarea"
                        rows={2}
                    />
                    <button
                        type="submit"
                        disabled={sending || !promptText.trim()}
                        className="agent-chat-send-btn"
                    >
                        <span>Send</span>
                        <span>➔</span>
                    </button>
                </form>
            </div>
        </div>
    );
};
