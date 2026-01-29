
import express from "express";
import { AnalysisService, MERCHANTING_GUIDE } from "../analysis";
import { CombinedItem } from "../osrsClient";
import { getLatestItems } from "../scheduler";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

// Helper to simple search items
// Helper to clean strings for better matching
const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");

// Common stop words to ignore in search to reduce noise
const STOP_WORDS = new Set(["the", "a", "an", "are", "is", "test", "hello", "hi", "how", "what", "where", "when", "why", "who", "do", "you", "still", "popular", "good", "bad", "buy", "sell", "price", "margin", "flip", "trading", "investment", "worth"]);

// Robust search with scoring
const searchItems = (query: string, allItems: CombinedItem[]): CombinedItem[] => {
    if (!query || query.length < 2) return [];

    // 1. Prepare query variants
    const cleanQuery = normalize(query).trim();
    if (!cleanQuery) return [];

    // Tokenize and filter stop words
    const queryTokens = cleanQuery.split(" ")
        .filter(t => t.length > 1 && !STOP_WORDS.has(t));

    // 2. Score items
    const matches = allItems
        .map(item => {
            const nameOriginal = item.name.toLowerCase();
            const nameClean = normalize(item.name);
            let score = 0;

            // -- Exact Matches --
            if (nameOriginal === query.toLowerCase()) score += 1000;
            else if (nameClean === cleanQuery) score += 500;

            // -- Starts With --
            else if (nameOriginal.startsWith(cleanQuery)) score += 200;
            else if (nameClean.startsWith(cleanQuery)) score += 150;

            // -- Token Matching --
            let matchedTokens = 0;
            queryTokens.forEach(token => {
                // Handle plurals (simple 's' stripper)
                const singular = token.endsWith("s") ? token.slice(0, -1) : token;

                // Check exact token, singular version, or if item name contains it
                const tokenMatches =
                    nameClean.includes(token) ||
                    (token.length > 3 && nameClean.includes(singular));

                if (tokenMatches) {
                    score += 10;
                    matchedTokens++;

                    // Bonus: Word boundary start
                    if (
                        nameClean.startsWith(token) || nameClean.includes(" " + token) ||
                        nameClean.startsWith(singular) || nameClean.includes(" " + singular)
                    ) {
                        score += 5;
                    }
                }
            });

            // Boost if high percentage of significant tokens matched
            if (queryTokens.length > 0) {
                const matchRatio = matchedTokens / queryTokens.length;
                // Higher multiplier since we filtered stop words
                score += matchRatio * 80;
            }

            // -- Substring fallback --
            if (nameClean.includes(cleanQuery)) score += 20;

            return { item, score };
        })
        .filter(match => match.score > 25) // Slightly higher threshold
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(match => match.item);

    return matches;
};

router.post("/", async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: "AI service not configured (missing API key)" });
        }

        // 1. Get real-time market context
        // Get generic highlights
        const marketData = await AnalysisService.getAnalysis();

        // [NEW] Get all items for RAG
        const allItems = await getLatestItems();

        // [NEW] Search for relevant items based on user query
        const relevantItems = searchItems(message, allItems);

        // 2. Format context for the LLM
        // We act as an expert assistant.
        // We only include top items to save context window, but with FULL data.

        const context = {
            relevantItems: relevantItems.map(i => ({
                name: i.name,
                buy: i.buyPrice,
                sell: i.sellPrice,
                margin: i.margin,
                roi: i.roi,
                volume: i.volume,
                limit: i.limit,
                tax: i.tax
            })),
            marketSummary: marketData.summary,
            highMargin: marketData.highMargin.map(i => ({
                name: i.name,
                buy: i.buyPrice,
                sell: i.sellPrice,
                margin: i.margin,
                profit: i.profit,
                roi: i.roi,
                volume: i.volume,
                limit: i.limit,
                tax: i.tax
            })),
            highVolume: marketData.highVolume.map(i => ({
                name: i.name,
                buy: i.buyPrice,
                sell: i.sellPrice,
                potentialProfit: i.potentialProfit,
                volume: i.volume
            })),
            spikes: marketData.priceSpikes.map(i => ({
                name: i.name,
                change: i.dayChange,
                buy: i.buyPrice,
                volume: i.volume
            })),
            drops: marketData.priceDrops.map(i => ({
                name: i.name,
                change: i.dayChange,
                buy: i.buyPrice,
                volume: i.volume
            })),
            news: marketData.news?.slice(0, 3) // Latest 3 news items
        };

        const wikiContext = marketData.itemContext || {};


        const prompt = `
You are an expert Old School RuneScape (OSRS) flipping and trading assistant.
Your goal is to give specific, actionable advice based on the REAL-TIME market data provided below, while following the principles of the Merchanting Guide.

${MERCHANTING_GUIDE}

**Current Market Snapshot (JSON):**
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

**Item Wiki Context (Lore/Uses):**
${Object.entries(wikiContext).map(([name, desc]) => `- ${name}: ${desc}`).join("\n")}

**User Query:** "${message}"

**Instructions:**
1.  **Analyze the 'relevantItems' array first.** If the user asked about a specific item, its data will be there. Use that data to answer the question.
2.  If the user's question is general, use the other market data sections (marketSummary, highMargin, etc.).
3.  If recommending items, cite specific prices, volumes, and *why* it's good (e.g., "High ROI of 15%").
4.  Use the Wiki Context to explain demand (e.g., "Zulrah scales are high volume because they fuel the Toxic Blowpipe").
5.  Be concise but helpful. Use Markdown for formatting (bold items, lists).
6.  If the user asks about something NOT in the data, try to answer generally about OSRS trading principles or mention you don't have that specific item's live data right now.
7.  Do not hallucinate prices. Only use what is provided.
`;

        // 3. Call Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            logger.error("Gemini API error:", data);
            return res.status(502).json({ error: "Failed to get response from AI" });
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response at this time.";

        res.json({ response: reply });

    } catch (err) {
        logger.error("Error in chat endpoint:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
