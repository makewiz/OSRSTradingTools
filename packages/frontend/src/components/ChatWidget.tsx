import React, { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../config";
import { useAuth } from "../contexts/AuthContext";
import "./ChatWidget.css";

interface Message {
    role: "user" | "ai";
    content: string;
    tradeSuggestions?: Array<{
        itemId: number;
        itemName: string;
        buyPrice: number;
        targetSellPrice: number;
        quantity: number;
        rationale?: string;
    }>;
    questions?: Array<{
        question: string;
        options?: string[];
        allowCustomInput?: boolean;
        multiSelect?: boolean;
    }>;
    followupOptions?: string[];
}

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        { role: "ai", content: "Hello! I'm your OSRS Trading Assistant. I can check real-time market prices, search processing/crafting recipes, analyze set & decanting arbitrage, and manage your favorite items and price watches! \n\nAsk me anything like:\n- *\"Show me profitable Herblore recipes\"*\n- *\"Are there any good set arbitrage options?\"*\n- *\"Add Dragon Scimitar to my favorites\"*\n- *\"Set a price watch for Armadyl Godsword when price changes by 5%\"*" }
    ]);
    const [loading, setLoading] = useState(false);
    const [addedPortfolioIds, setAddedPortfolioIds] = useState<Set<number>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { token, fetchWithAuth } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const handleAddRecommendationToPortfolio = async (rec: {
        itemId: number;
        itemName: string;
        buyPrice: number;
        targetSellPrice: number;
        quantity: number;
    }) => {
        if (!token) {
            alert("Please log in to add items to your portfolio.");
            return;
        }
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
                    notes: "Added from Trading Assistant recommendation"
                })
            });

            if (!res.ok) throw new Error("Failed to add position to portfolio");
            setAddedPortfolioIds(prev => new Set(prev).add(rec.itemId));
            handleSend(`I added ${rec.itemName} (${rec.quantity.toLocaleString()}x @ ${rec.buyPrice.toLocaleString()} GP, target sell: ${rec.targetSellPrice.toLocaleString()} GP) to my portfolio. Please watch this position and tell me when to sell.`);
        } catch (err: any) {
            alert(err.message || "Error adding to portfolio");
        }
    };

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
                        setIsOpen(false);
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
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'underline' }}>
                {children}
            </a>
        );
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async (textToSend?: string) => {
        const text = textToSend || input;
        if (!text.trim() || loading) return;

        const userMsg = text.trim();
        setInput("");
        const newMessages = [...messages, { role: "user" as const, content: userMsg }];
        setMessages(newMessages);
        setLoading(true);

        try {
            // Include message history for multi-turn conversation support
            // Ignore the initial welcome message when sending history to API
            const historyToSend = newMessages.slice(1, -1);

            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (token) {
                headers["Authorization"] = `Bearer ${token}`;
            }

            const res = await (token ? fetchWithAuth : fetch)(`${API_BASE_URL}/api/chat`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    message: userMsg,
                    history: historyToSend,
                    currentPath: location.pathname
                })
            });

            if (!res.ok) throw new Error("Failed to fetch AI response");

            const data = await res.json();
            setMessages(prev => [...prev, {
                role: "ai",
                content: data.response,
                tradeSuggestions: data.tradeSuggestions,
                questions: data.questions,
                followupOptions: data.followupOptions
            }]);
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: "ai", content: "Sorry, I encountered an error communicating with the trading assistant. Please try again." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        setMessages([
            { role: "ai", content: "Chat reset. How can I assist you with your OSRS trades today?" }
        ]);
    };

    // 1. Toggle Button
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="chat-widget-toggle"
                aria-label="Open Trading Assistant"
            >
                {/* Chat Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
                <div className="notification-badge"></div>
                <div className="chat-tooltip">Trading Assistant</div>
            </button>
        );
    }

    // 2. Main Window
    return (
        <div className="chat-window">
            <div className="chat-header">
                <div className="chat-title">
                    <h3>Trading Assistant</h3>
                    <div className="chat-status">
                        <div className="status-dot"></div>
                        <span>Gemini Tools Harness</span>
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                        onClick={clearChat}
                        className="close-btn"
                        title="Clear conversation"
                        aria-label="Clear Chat"
                        style={{ fontSize: "12px", opacity: 0.8 }}
                    >
                        Clear
                    </button>
                    <button onClick={() => setIsOpen(false)} className="close-btn" aria-label="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>

            <div className="chat-messages custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-bubble">
                            {msg.role === "ai" ? (
                                <>
                                    <ReactMarkdown components={{ a: renderMarkdownLink }}>
                                        {formatContentWithItemLinks(msg.content)}
                                    </ReactMarkdown>

                                    {/* Trade Recommendations */}
                                    {Array.isArray(msg.tradeSuggestions) && msg.tradeSuggestions.length > 0 && (
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#a5b4fc' }}>💡 Trade Recommendations:</div>
                                            {msg.tradeSuggestions.map((rec, recIdx) => {
                                                const isAdded = addedPortfolioIds.has(rec.itemId);
                                                return (
                                                    <div key={recIdx} style={{ background: '#1e1e24', padding: '8px', borderRadius: '6px', border: '1px solid #3f3f46', fontSize: '0.75rem' }}>
                                                        <div style={{ fontWeight: 'bold', color: '#ffffff' }}>{rec.itemName}</div>
                                                        <div style={{ color: '#d1d5db', margin: '2px 0' }}>
                                                            Buy @ <span style={{ color: '#fbbf24' }}>{rec.buyPrice.toLocaleString()} GP</span> | Sell @ <span style={{ color: '#34d399' }}>{rec.targetSellPrice.toLocaleString()} GP</span>
                                                        </div>
                                                        {rec.rationale && <div style={{ color: '#9ca3af', fontSize: '0.7rem', marginBottom: '6px' }}>{rec.rationale}</div>}
                                                        <button
                                                            onClick={() => handleAddRecommendationToPortfolio(rec)}
                                                            disabled={isAdded || loading}
                                                            style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '4px',
                                                                background: isAdded ? '#065f46' : '#059669',
                                                                color: '#ffffff',
                                                                border: 'none',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600,
                                                                cursor: isAdded ? 'default' : 'pointer'
                                                            }}
                                                        >
                                                            {isAdded ? "✓ In Portfolio" : "✅ Add to Portfolio"}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Questions */}
                                    {Array.isArray(msg.questions) && msg.questions.length > 0 && (
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                            {msg.questions.map((q, qIdx) => (
                                                <div key={qIdx} style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontWeight: 'bold', color: '#a5b4fc', fontSize: '0.8rem', marginBottom: '4px' }}>
                                                        ❓ {q.question}
                                                    </div>
                                                    {Array.isArray(q.options) && q.options.length > 0 && (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {q.options.map((opt, optIdx) => (
                                                                <button
                                                                    key={optIdx}
                                                                    onClick={() => handleSend(opt)}
                                                                    disabled={loading}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        borderRadius: '4px',
                                                                        background: '#4338ca',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        fontSize: '0.75rem',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 600
                                                                    }}
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

                                    {/* Followup Options */}
                                    {Array.isArray(msg.followupOptions) && msg.followupOptions.length > 0 && (
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', width: '100%' }}>Suggested Follow-ups:</div>
                                            {msg.followupOptions.map((opt, optIdx) => (
                                                <button
                                                    key={optIdx}
                                                    onClick={() => handleSend(opt)}
                                                    disabled={loading}
                                                    style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '4px',
                                                        background: '#27272a',
                                                        color: '#c7d2fe',
                                                        border: '1px solid #3f3f46',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    💡 {opt}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p>{msg.content}</p>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="message ai">
                        <div className="message-bubble">
                            <div className="typing-indicator">
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                                <div className="typing-dot"></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
                <div className="input-wrapper">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about recipes, items, favorites..."
                        className="chat-input"
                        disabled={loading}
                        autoFocus
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={loading || !input.trim()}
                        className="send-btn"
                        aria-label="Send"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
