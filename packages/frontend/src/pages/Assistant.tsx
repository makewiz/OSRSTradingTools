
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

import { API_BASE_URL } from "../config";

interface Message {
    role: "user" | "ai";
    content: string;
}

const Assistant: React.FC = () => {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([
        { role: "ai", content: "Hello! I'm your OSRS Trading Assistant. I have access to real-time market data, high margin flips, and volume spikes. \n\nAsk me anything! e.g., *\"What's the best flip right now?\"* or *\"Why is the Abyssal Whip dropping?\"*" }
    ]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

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

    return (
        <div className="container mx-auto p-4 max-w-4xl h-[calc(100vh-100px)] flex flex-col">
            <h1 className="text-3xl font-bold mb-4 text-amber-400 drop-shadow-md font-osrs">Trading Assistant</h1>

            <div className="flex-1 overflow-y-auto bg-stone-900/80 rounded-lg p-6 mb-4 border border-stone-700 shadow-inner custom-scrollbar">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] p-4 rounded-lg ${msg.role === "user"
                            ? "bg-amber-700 text-white rounded-br-none"
                            : "bg-stone-800 text-stone-200 rounded-bl-none border border-stone-600"
                            }`}>
                            {msg.role === "ai" ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start mb-4">
                        <div className="bg-stone-800 p-4 rounded-lg rounded-bl-none border border-stone-600">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about flips, high volume items, or market trends..."
                    className="flex-1 p-4 rounded-lg bg-stone-900 border border-stone-600 text-stone-200 focus:outline-none focus:border-amber-500 transition-colors"
                    disabled={loading}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default Assistant;
