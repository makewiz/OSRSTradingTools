
import { CombinedItem, fetchWikiDescription } from "./osrsClient";
import { getLatestItems } from "./scheduler";
import { NewsService, NewsItem } from "./news";
import dotenv from "dotenv";

dotenv.config();

// Extend CombinedItem so HighlightItem has ALL fields
export interface HighlightItem extends CombinedItem {
    reason: string;
}

export interface MarketAnalysis {
    timestamp: number;
    highMargin: HighlightItem[];
    highVolume: HighlightItem[];
    priceSpikes: HighlightItem[];
    priceDrops: HighlightItem[];
    summary: string;
    news?: NewsItem[];
    itemContext?: Record<string, string>;
}

export class AnalysisService {
    private static lastAnalysis: MarketAnalysis | null = null;
    private static lastAnalysisTime: number = 0;
    private static CACHE_TTL = 60 * 60 * 1000; // 1 hour

    public static async getAnalysis(): Promise<MarketAnalysis> {
        const now = Date.now();
        if (this.lastAnalysis && now - this.lastAnalysisTime < this.CACHE_TTL) {
            return this.lastAnalysis;
        }

        const items = await getLatestItems();

        // Fetch news
        const news = await NewsService.fetchNewestNews();

        // High Margin -> Mid Price logic
        const highMargin = items
            .filter(i =>
                (i.volume || 0) >= 100 &&
                (i.buyPrice || 0) <= 10000000
            )
            .sort((a, b) => (b.profit || 0) - (a.profit || 0))
            .slice(0, 5)
            .map(i => {
                return {
                    ...i,
                    // redundant safety check, though ...i should cover it if i is CombinedItem
                    reason: `Profit: ${i.profit?.toLocaleString()}gp, Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()}`
                } as HighlightItem;
            });

        const highVolume = items
            .filter(i =>
                (i.volume || 0) >= 1000000
            )
            .sort((a, b) => (b.potentialProfit || 0) - (a.potentialProfit || 0))
            .slice(0, 5)
            .map(i => ({
                ...i,
                reason: `Pot. Profit: ${i.potentialProfit?.toLocaleString()}gp, Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()}`
            } as HighlightItem));

        const priceSpikes = items
            .filter(i => {
                if (!i.dayChange) return false;
                if (i.dayChange < 0) return false;
                const highVolumeCheck = (i.buyPrice || 0) > 100 && (i.volume || 0) > 1000000;
                const highValueCheck = (i.buyPrice || 0) > 1000000 && (i.volume || 0) > 100;

                return highVolumeCheck || highValueCheck;
            })
            .sort((a, b) => (b.dayChange || 0) - (a.dayChange || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `Spike: +${i.dayChange?.toFixed(1)}% (Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()})` } as HighlightItem));

        const priceDrops = items
            .filter(i => {
                if (!i.dayChange) return false;
                if (i.dayChange > 0) return false;
                const highVolumeCheck = (i.buyPrice || 0) > 100 && (i.volume || 0) > 1000000;
                const highValueCheck = (i.buyPrice || 0) > 1000000 && (i.volume || 0) > 100;

                return highVolumeCheck || highValueCheck;
            })
            .sort((a, b) => (a.dayChange || 0) - (b.dayChange || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `Drop: ${i.dayChange?.toFixed(1)}% (Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()})` } as HighlightItem));

        // Fetch Wiki context for top items
        const itemsToFetch = new Set<string>();
        if (highMargin.length > 0) itemsToFetch.add(highMargin[0].name);
        if (highVolume.length > 0) itemsToFetch.add(highVolume[0].name);
        if (priceSpikes.length > 0) itemsToFetch.add(priceSpikes[0].name);
        if (priceDrops.length > 0) itemsToFetch.add(priceDrops[0].name);

        const itemContext: Record<string, string> = {};
        await Promise.all(Array.from(itemsToFetch).map(async (name) => {
            const desc = await fetchWikiDescription(name);
            if (desc) {
                // Truncate to save tokens, keep first 300 chars usually contains the "uses"
                itemContext[name] = desc.length > 300 ? desc.substring(0, 300) + "..." : desc;
            }
        }));

        const summary = await this.generateSummary(highMargin, highVolume, priceSpikes, priceDrops, news, itemContext);

        this.lastAnalysis = {
            timestamp: now,
            highMargin,
            highVolume,
            priceSpikes,
            priceDrops,
            summary,
            news,
            itemContext
        };
        this.lastAnalysisTime = now;

        return this.lastAnalysis;
    }

    private static async generateSummary(
        highMargin: HighlightItem[],
        bulk: HighlightItem[],
        spikes: HighlightItem[],
        drops: HighlightItem[],
        news: NewsItem[],
        itemContext?: Record<string, string>
    ): Promise<string> {
        const apiKey = process.env.GEMINI_API_KEY;

        // Construct full data context for the AI
        const marketContext = {
            highMargin: highMargin.map(i => ({ ...i, reason: undefined })), // Send raw data, AI can deduce "reason"
            highVolume: bulk.map(i => ({ ...i, reason: undefined })),
            spikes: spikes.map(i => ({ ...i, reason: undefined })),
            drops: drops.map(i => ({ ...i, reason: undefined })),
            news: news.slice(0, 5)
        };

        let promptContext = `
You are an expert Old School RuneScape (OSRS) trading assistant.
Your goal is to summarize the market highlights based on the DETAILED data provided below.
You MUST apply the principles of the Merchanting Guide (e.g. checking volume, ROI, limits) to identify the best opportunities.

${MERCHANTING_GUIDE}

**Market Data (JSON):**
\`\`\`json
${JSON.stringify(marketContext, null, 2)}
\`\`\`
`;

        // --- Add Item Context from Wiki ---
        if (itemContext && Object.keys(itemContext).length > 0) {
            promptContext += `\n**Item Wiki Context (Uses/Lore):**\n`;
            for (const [name, desc] of Object.entries(itemContext)) {
                if (desc) {
                    promptContext += `- **${name}**: ${desc}\n`;
                }
            }
        }

        // Add prompt instruction
        promptContext += `
\n**Instructions:**
1. Summarize the market highlights in 2-3 concise, engaging sentences.
2. **Be specific**: Mention item names, exact profit numbers, or ROI percentages from the JSON data.
3. Use the Wiki Context to explain *why* an item is good (e.g. "high volume due to new boss").
4. If news is relevant, mention it briefly.
5. Focus on the best trading opportunities found in the "highMargin" and "highVolume" sections.
`;

        if (apiKey) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: promptContext }]
                        }]
                    })
                });

                const data = await response.json();
                if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }
            } catch (error) {
                console.error("Error generating AI summary:", error);
            }
        }

        // Fallback (same as before)
        const parts = [];
        if (highMargin.length > 0) {
            parts.push(`Today's top mid price flip is ${highMargin[0].name}.`);
        } else {
            parts.push("No significant mid price items found currently.");
        }

        if (bulk.length > 0) {
            parts.push(`For bulk trading, ${bulk[0].name} offers the best potential profit.`);
        }

        if (spikes.length > 0) {
            parts.push(`We are seeing significant volatility in ${spikes[0].name}.`);
        }

        if (drops.length > 0) {
            parts.push(`${drops[0].name} has dropped significantly in price.`);
        }

        if (parts.length === 0) {
            return "Market is currently stable with no major outliers detected.";
        }

        parts.push("Check the details below for more opportunities.");
        return parts.join(" ");
    }
}

export const MERCHANTING_GUIDE = `
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
