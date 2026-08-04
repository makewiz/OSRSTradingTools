
import { CombinedItem, fetchWikiDescription } from "./osrsClient";
import { getLatestItems } from "./scheduler";
import { NewsService, NewsItem } from "./news";
import { getBatchPriceHistory } from "./database";
import dotenv from "dotenv";
import { getGeminiClient, DEFAULT_GEMINI_MODEL } from "./gemini";

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
    topRecurring: HighlightItem[];
    topAnomalies: HighlightItem[];
    topIntraday: HighlightItem[];
    topHighAlch: HighlightItem[];
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


        const topRecurring = await this.detectSeasonality(items);
        const topAnomalies = await this.detectAnomalies(items);
        const topIntraday = await this.detectIntradayPatterns(items);

        const topHighAlch = items
            .filter(i =>
                (i.highAlchProfitPerHour || 0) > 0 &&
                (i.volume || 0) > 50 // Basic liquidity check
            )
            .sort((a, b) => (b.highAlchProfitPerHour || 0) - (a.highAlchProfitPerHour || 0))
            .slice(0, 5)
            .map(i => ({
                ...i,
                reason: `Alch Profit: ${Math.round(i.highAlchProfitPerHour || 0).toLocaleString()}gp/hr (Item Profit: ${i.highAlchProfit?.toLocaleString()}gp, Limit: ${i.limit || '?'})`
            } as HighlightItem));

        // Fetch Wiki context for top items
        const itemsToFetch = new Set<string>();
        if (highMargin.length > 0) itemsToFetch.add(highMargin[0].name);
        if (highVolume.length > 0) itemsToFetch.add(highVolume[0].name);
        if (priceSpikes.length > 0) itemsToFetch.add(priceSpikes[0].name);
        if (priceDrops.length > 0) itemsToFetch.add(priceDrops[0].name);
        if (topRecurring.length > 0) itemsToFetch.add(topRecurring[0].name);
        if (topAnomalies.length > 0) itemsToFetch.add(topAnomalies[0].name);
        if (topIntraday.length > 0) itemsToFetch.add(topIntraday[0].name);
        if (topHighAlch.length > 0) itemsToFetch.add(topHighAlch[0].name);

        const itemContext: Record<string, string> = {};
        await Promise.all(Array.from(itemsToFetch).map(async (name) => {
            const desc = await fetchWikiDescription(name);
            if (desc) {
                // Truncate to save tokens, keep first 300 chars usually contains the "uses"
                itemContext[name] = desc.length > 300 ? desc.substring(0, 300) + "..." : desc;
            }
        }));

        const summary = await this.generateSummary(highMargin, highVolume, priceSpikes, priceDrops, topRecurring, topAnomalies, topIntraday, topHighAlch, news, itemContext);

        this.lastAnalysis = {
            timestamp: now,
            highMargin,
            highVolume,
            priceSpikes,
            priceDrops,
            topRecurring,
            topAnomalies,
            topIntraday,
            topHighAlch,
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
        recurring: HighlightItem[],
        anomalies: HighlightItem[],
        intraday: HighlightItem[],
        highAlch: HighlightItem[],
        news: NewsItem[],
        itemContext?: Record<string, string>
    ): Promise<string> {
        // Construct full data context for the AI
        const marketContext = {
            highMargin: highMargin.map(i => ({ ...i, reason: undefined })), // Send raw data, AI can deduce "reason"
            highVolume: bulk.map(i => ({ ...i, reason: undefined })),
            spikes: spikes.map(i => ({ ...i, reason: undefined })),
            drops: drops.map(i => ({ ...i, reason: undefined })),
            seasonality: recurring.map(i => ({ ...i, reason: undefined })),
            anomalies: anomalies.map(i => ({ ...i, reason: undefined })),
            intraday: intraday.map(i => ({ ...i, reason: undefined })),
            highAlch: highAlch.map(i => ({ ...i, reason: undefined })),
            news: news.slice(0, 5)
        };

        let promptContext = `
You are an expert Old School RuneScape (OSRS) trading assistant.
Your goal is to summarize the market highlights based on the DETAILED data provided below.
You MUST apply the principles of the Merchanting Guide (e.g. checking volume, ROI, limits) to identify the best opportunities.
Include High Alchemy opportunities if they are exceptionally profitable.

Note: The Grand Exchange tax rate is 2%. All profit and ROI figures provided in the data are AFTER tax.

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

        const client = getGeminiClient();
        if (client) {
            try {
                const interaction = await client.interactions.create({
                    model: DEFAULT_GEMINI_MODEL,
                    input: promptContext
                });
                if (interaction.output_text) {
                    return interaction.output_text;
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

        if (recurring.length > 0) {
            parts.push(`${recurring[0].name} shows inconsistent weekend price action.`);
        }

        if (anomalies.length > 0) {
            parts.push(`Odd trading activity detected for ${anomalies[0].name}.`);
        }

        if (intraday.length > 0) {
            parts.push(`${intraday[0].name} appears to have a consistent daily cycle.`);
        }

        if (highAlch.length > 0) {
            parts.push(`High alchemy opportunity: ${highAlch[0].name}.`);
        }

        if (parts.length === 0) {
            return "Market is currently stable with no major outliers detected.";
        }

        parts.push("Check the details below for more opportunities.");
        return parts.join(" ");
    }

    private static async detectSeasonality(candidateItems: CombinedItem[]): Promise<HighlightItem[]> {
        const topVolume = candidateItems
            .filter(i => (i.volume || 0) > 50000)
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, 50);

        const ids = topVolume.map(i => i.id);
        const now = Math.floor(Date.now() / 1000);
        const eightWeeksAgo = now - (56 * 24 * 3600);

        const historyMap = await getBatchPriceHistory(ids, eightWeeksAgo, now, '24h');
        const seasonalItems: { item: CombinedItem, ratio: number }[] = [];

        for (const item of topVolume) {
            const history = historyMap[item.id];
            // Need at least 2 weeks (14 points)
            if (!history || history.length < 14) continue;

            let weekendSum = 0, weekendCount = 0;
            let weekdaySum = 0, weekdayCount = 0;

            for (const point of history) {
                const date = new Date(point.timestamp * 1000);
                const day = date.getDay(); // 0 = Sun, 6 = Sat
                // Consider Fri(5), Sat(6), Sun(0) as weekend for patterns (prices often rise friday evening)
                const isWeekend = (day === 0 || day === 6 || day === 5);

                if (isWeekend) {
                    weekendSum += point.price;
                    weekendCount++;
                } else {
                    weekdaySum += point.price;
                    weekdayCount++;
                }
            }

            if (weekendCount > 0 && weekdayCount > 0) {
                const avgWeekend = weekendSum / weekendCount;
                const avgWeekday = weekdaySum / weekdayCount;

                // Avoid division by zero
                if (avgWeekday === 0) continue;

                const ratio = avgWeekend / avgWeekday;

                // 3% average difference is significant for flipping
                if (ratio > 1.03) {
                    seasonalItems.push({ item, ratio });
                }
            }
        }

        return seasonalItems
            .sort((a, b) => b.ratio - a.ratio)
            .slice(0, 5)
            .map(x => ({
                ...x.item,
                reason: `Weekend Pump: ${(x.ratio * 100 - 100).toFixed(1)}% higher on Fri-Sun avg.`
            } as HighlightItem));
    }

    private static async detectAnomalies(candidateItems: CombinedItem[]): Promise<HighlightItem[]> {
        // Look for statistical anomalies in price relative to recent history
        const candidates = candidateItems
            .filter(i => (i.volume || 0) > 10000 && (i.buyPrice || 0) > 500)
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, 50);

        const ids = candidates.map(i => i.id);
        const now = Math.floor(Date.now() / 1000);
        const oneWeekAgo = now - (7 * 24 * 3600);

        // Usage of '6h' allows decent granularity over a week (28 points) without getting too heavy
        const historyMap = await getBatchPriceHistory(ids, oneWeekAgo, now, '6h');
        const anomalies: { item: CombinedItem, zScore: number }[] = [];

        for (const item of candidates) {
            const history = historyMap[item.id];
            if (!history || history.length < 10) continue;

            const prices = history.map(p => p.price);
            const sum = prices.reduce((a, b) => a + b, 0);
            const mean = sum / prices.length;
            const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev === 0) continue;

            const currentPrice = item.buyPrice || item.sellPrice || 0;
            if (currentPrice === 0) continue;

            // Z-score calculation
            const zScore = (currentPrice - mean) / stdDev;

            // Flag if > 2.5 sigma (98% confidence interval roughly)
            if (Math.abs(zScore) > 2.5) {
                anomalies.push({ item, zScore });
            }
        }

        return anomalies
            .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
            .slice(0, 5)
            .map(x => ({
                ...x.item,
                reason: `Anomaly: Price is ${x.zScore.toFixed(1)}σ dev from weekly avg.`
            } as HighlightItem));
    }

    private static async detectIntradayPatterns(candidateItems: CombinedItem[]): Promise<HighlightItem[]> {
        // Look for items with consistent hourly trends over the last 2 weeks
        const candidates = candidateItems
            .filter(i => (i.volume || 0) > 10000 && (i.buyPrice || 0) > 100)
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, 50);

        const ids = candidates.map(i => i.id);
        const now = Math.floor(Date.now() / 1000);
        const twoWeeksAgo = now - (14 * 24 * 3600);

        const historyMap = await getBatchPriceHistory(ids, twoWeeksAgo, now, '1h');
        const patternItems: { item: CombinedItem, swing: number, buyHour: number, sellHour: number }[] = [];

        for (const item of candidates) {
            const history = historyMap[item.id];
            if (!history || history.length < 48) continue; // Need significant data

            // Aggregates for 0-23h
            const hourSums: number[] = new Array(24).fill(0);
            const hourCounts: number[] = new Array(24).fill(0);

            for (const point of history) {
                const hour = new Date(point.timestamp * 1000).getHours();
                hourSums[hour] += point.price;
                hourCounts[hour]++;
            }

            const hourAvgs: number[] = [];
            for (let h = 0; h < 24; h++) {
                if (hourCounts[h] > 0) {
                    hourAvgs[h] = hourSums[h] / hourCounts[h];
                } else {
                    hourAvgs[h] = 0;
                }
            }

            // Find min/max hour
            let minPrice = Infinity;
            let maxPrice = -Infinity;
            let minHour = -1;
            let maxHour = -1;

            for (let h = 0; h < 24; h++) {
                if (hourAvgs[h] === 0) continue;
                if (hourAvgs[h] < minPrice) {
                    minPrice = hourAvgs[h];
                    minHour = h;
                }
                if (hourAvgs[h] > maxPrice) {
                    maxPrice = hourAvgs[h];
                    maxHour = h;
                }
            }

            if (minHour !== -1 && maxHour !== -1 && minPrice > 0) {
                const ratio = maxPrice / minPrice;
                if (ratio > 1.02) { // 2% daily swing on average
                    patternItems.push({
                        item,
                        swing: ratio,
                        buyHour: minHour,
                        sellHour: maxHour
                    });
                }
            }
        }

        return patternItems
            .sort((a, b) => b.swing - a.swing)
            .slice(0, 5)
            .map(x => ({
                ...x.item,
                reason: `Daily Cycle: Buy ~${x.buyHour}:00, Sell ~${x.sellHour}:00 (Avg +${(x.swing * 100 - 100).toFixed(1)}%)`
            } as HighlightItem));
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
