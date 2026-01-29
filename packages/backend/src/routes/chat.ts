
import express from "express";
import { AnalysisService } from "../analysis";
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

        const MERCHANTING_GUIDE = `
**OSRS Merchanting Guide (Wiki Summary):**

**1. Types of Merchanting**
- **Flipping**: Short-term buying low and selling high. Exploits the "bid-ask spread" created by impatient players.
- **Investing (Speculation)**: Long-term prediction of price trends based on game updates (e.g., new boss release = demand for specific gear). Safer when changes are predictable.
- **Bulk Flipping**: High volume, low margin (1-3gp profit). Requires large capital (20m+) but scales well. (e.g., Runes, Arrows, Food).

**2. Grand Exchange Mechanics**
- **Instant Trades**: If you buy above market price, it instantly fills at the lowest available sell offer.
- **Limits**: Most items have a buy limit every 4 hours (e.g., 11k darts, 70 barrows equipment).
- **Guide Price vs. Real Price**: "Guide Price" is a lagging average. Real "Street Price" or "Active Price" is determined by live buyers/sellers.

**3. Determining Prices (The Buy/Sell Test)**
- **To find Margins**: Buy 1 item high (Instant Buy Price), Sell 1 item low (Instant Sell Price).
- **The Spread**: The difference between these two numbers is your potential profit margin per item.
- *Warning*: Do not test expensive low-volume items (3rd Age, expensive armor) as the spread might be huge, causing a loss.

**4. Strategy & Psychology**
- **Volume vs Price**: High volume items (scales, runes) move fast. Low volume items (armor) move slow but have higher margins.
- **Diversification**: Spread wealth across 4-6 items to mitigate risk of a crash.
- **Patience**: If an item crashes, you can often wait for it to rebound. Panic selling locks in losses.
- **Updates**: Read game news. If a new "Dragon" quest comes out, Dragon items might rise.

**Common High-Volume Categories**:
- Ammunition (Darts, Arrows)
- Runes (Chaos, Death, Blood)
- Consumables (Food, Potions)
- Resources (Ores, Bars, Logs, Hides)
`;

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
