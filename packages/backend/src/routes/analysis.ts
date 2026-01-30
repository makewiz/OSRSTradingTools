
import { Router } from "express";
import { authenticateToken } from "../auth";
import { getCombinedItems, fetchWikiDescription } from "../osrsClient";
import { getPriceHistory, getBatchPriceHistory } from "../database";
import { MERCHANTING_GUIDE } from "../analysis";
import { NewsService } from "../news";
import { logger } from "@osrstradingtools/shared";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

if (process.env.REQUIRE_AUTH === "true") {
    router.use(authenticateToken);
}

interface RiskAnalysisCache {
    [itemId: number]: {
        data: RiskAnalysisResponse;
        timestamp: number;
    };
}

interface RiskAnalysisResponse {
    riskScore: number;
    rating: string;
    reasoning: string;
}

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const analysisCache: RiskAnalysisCache = {};

router.get("/risk/:id", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: "AI service unavailable (missing API key)" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    // Check Cache
    const now = Date.now();
    if (analysisCache[id] && now - analysisCache[id].timestamp < CACHE_TTL) {
        return res.json(analysisCache[id].data);
    }

    try {
        // 1. Gather Data
        const allItems = await getCombinedItems();
        const item = allItems.find((i) => i.id === id);

        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }

        // Get 30 days of history for high-level context
        const endTime = Math.floor(now / 1000);
        const startTime30d = endTime - 30 * 24 * 60 * 60;
        const historyData = await getPriceHistory(id, startTime30d, endTime);

        // Get 7 days of 6h granular history for detailed trend analysis
        const startTime7d = endTime - 7 * 24 * 60 * 60;
        const granularHistoryMap = await getBatchPriceHistory([id], startTime7d, endTime, '6h');
        const granularHistory = granularHistoryMap[id] || [];

        // Fetch latest news
        const news = await NewsService.fetchNewestNews();
        const recentNews = news.slice(0, 3);

        // Combine buy/sell/volume into flat array for analysis
        const buyPrices = historyData.buy.map(b => b.price);
        const sellPrices = historyData.sell.map(s => s.price);
        const closes = [...buyPrices, ...sellPrices];
        const volumes = historyData.volume.map(v => (v.buy_volume || 0) + (v.sell_volume || 0));

        if (closes.length === 0) {
            return res.json({
                riskScore: 5,
                rating: "Unknown",
                reasoning: "Insufficient price history data to perform analysis."
            });
        }

        const highPrice = Math.max(...closes);
        const lowPrice = Math.min(...closes);

        const avgVolume = volumes.length > 0
            ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length
            : 0;

        // Calculate simple volatility (standard deviation estimate)
        const meanPrice = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;

        let volatilityPercent = 0;
        if (meanPrice > 0) {
            const variance = closes.reduce((a: number, b: number) => a + Math.pow(b - meanPrice, 2), 0) / closes.length;
            const stdDev = Math.sqrt(variance);
            volatilityPercent = (stdDev / meanPrice) * 100;
        }

        const wikiDescription = await fetchWikiDescription(item.name);

        const context = {
            item: {
                ...item, // Include full combined item data
                wikiDescription: wikiDescription ? (wikiDescription.length > 500 ? wikiDescription.substring(0, 500) + "..." : wikiDescription) : "No description available.",
                priceVolatility30d: `${volatilityPercent.toFixed(2)}%`,
                priceRange30d: `${lowPrice} - ${highPrice}`,
                avgDailyVolume: Math.round(avgVolume),
            },
            history7d_6h: granularHistory.map(p => ({
                time: new Date(p.timestamp * 1000).toISOString(),
                price: p.price
            })),
            recentNews: recentNews.map(n => ({ title: n.title, date: n.date, category: n.category }))
        };

        const prompt = `
      You are a conservative expert financial risk advisor for Old School RuneScape (OSRS) flipping.
      Analyze the following item data and determine the risk profile for a short-term flip (1-2 days).
      
      You must strictly follow the principles in the **Merchanting Guide** below.

      ${MERCHANTING_GUIDE}

      **Item Analysis Context (JSON):**
      ${JSON.stringify(context, null, 2)}

      **Instructions:**
      1. Use the 'wikiDescription' to understand the item's actual utility (e.g. is it a useful weapon, a quest item, or junk?).
      2. Analyze the 'history7d_6h' to see recent trends. Are prices crashing or spiking?
      3. Check 'recentNews' to see if any updates might affect this item (e.g. game updates).
      4. Consider the item's liquidity (volume) and margins.

      **Risk Rules:**
      1. High Volatility (>10%) is risky but profitable.
      2. Low Volume (<100/day) is VERY risky (hard to sell).
      3. Negative trends or massive recent spikes are red flags.
      4. Low ROI (<1%) is "Safe" but low reward.
      5. GE tax rate is 2%.
      6. GE tax is 0 for items that sell for less than 50 gp.
      7. GE tax is capped at 5 million gp per item.
      8. ROI is calculated after tax.

      Respond ONLY with valid JSON in this format:
      {
        "riskScore": number (1-10, 10=Extreme Risk),
        "rating": string ("Safe", "Moderate", "High Risk"),
        "reasoning": string (Max 2 short sentences explaining why, citing specific data like volume, volatility, or news)
      }
    `;

        // 3. Call Google Gemini
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        const aiData = await response.json();

        // Debug logging
        if (!response.ok || !aiData.candidates) {
            logger.error("Gemini API Error:", JSON.stringify(aiData, null, 2));
        }

        let result: RiskAnalysisResponse;

        try {
            const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) throw new Error("No content in AI response");

            // Clean up markdown code blocks if present (Gemini often wraps JSON in ```json ... ```)
            const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

            result = JSON.parse(cleanContent);
        } catch (parseError) {
            logger.error("AI Parse Error", parseError);
            // Fallback if AI fails to return JSON
            result = {
                riskScore: 5,
                rating: "Unknown",
                reasoning: "AI analysis failed to format response. Check charts manually."
            };
        }

        // 4. Cache and Return
        analysisCache[id] = {
            data: result,
            timestamp: now
        };

        res.json(result);

    } catch (error) {
        logger.error("Risk Analysis Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
