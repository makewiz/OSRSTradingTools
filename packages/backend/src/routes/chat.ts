
import express from "express";
import { AnalysisService, MERCHANTING_GUIDE } from "../analysis";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

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
        const marketData = await AnalysisService.getAnalysis();

        // 2. Format context for the LLM
        // We act as an expert assistant.
        // We only include top items to save context window, but with FULL data.

        const context = {
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
1.  Analyze the provided JSON data to answer the user.
2.  If recommending items, cite specific prices, volumes, and *why* it's good (e.g., "High ROI of 15%").
3.  Use the Wiki Context to explain demand (e.g., "Zulrah scales are high volume because they fuel the Toxic Blowpipe").
4.  Be concise but helpful. Use Markdown for formatting (bold items, lists).
5.  If the user asks about something NOT in the data, try to answer generally about OSRS trading principles or mention you don't have that specific item's live data right now.
6.  Do not hallucinate prices. Only use what is provided.
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
