import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "../config";
import "./ChatWidget.css"; // [NEW] Import CSS

interface Message {
    role: "user" | "ai";
    content: string;
}

export const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        { role: "ai", content: "Hello! I'm your OSRS Trading Assistant. I have access to real-time market data alongside the Merchanting Guide! \n\nAsk me about high margin flips, volume spikes, or safe investments." }
    ]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        setInput("");
        setMessages(prev => [...prev, { role: "user", content: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch(`${API_BASE_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMsg })
            });

            if (!res.ok) throw new Error("Failed to fetch response");

            const data = await res.json();
            setMessages(prev => [...prev, { role: "ai", content: data.response }]);
        } catch (err) {
            console.error(err);
            setMessages(prev => [...prev, { role: "ai", content: "Sorry, I encountered an error. Please try again later." }]);
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
                <div className="chat-tooltip">Need Help?</div>
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
                        <span>Live Market Data</span>
                    </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="close-btn" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            <div className="chat-messages custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message ${msg.role}`}>
                        <div className="message-bubble">
                            {msg.role === "ai" ? (
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
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
                        placeholder="Ask about prices..."
                        className="chat-input"
                        disabled={loading}
                        autoFocus
                    />
                    <button
                        onClick={handleSend}
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
