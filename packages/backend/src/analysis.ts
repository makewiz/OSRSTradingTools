
import { getCombinedItems, CombinedItem } from "./osrsClient";
import { getLatestItems } from "./scheduler";
import { NewsService, NewsItem } from "./news";
import dotenv from "dotenv";

dotenv.config();

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

        let items = getLatestItems();
        if (!items || items.length === 0) {
            items = await getCombinedItems();
        }

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
                    reason: `Profit: ${i.profit?.toLocaleString()}gp, Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()}`
                };
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
            }));

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
            .map(i => ({ ...i, reason: `Spike: +${i.dayChange?.toFixed(1)}% (Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()})` }));

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
            .map(i => ({ ...i, reason: `Drop: ${i.dayChange?.toFixed(1)}% (Buy: ${i.buyPrice?.toLocaleString()}gp, Vol: ${i.volume?.toLocaleString()})` }));

        const summary = await this.generateSummary(highMargin, highVolume, priceSpikes, priceDrops, news);

        this.lastAnalysis = {
            timestamp: now,
            highMargin,
            highVolume,
            priceSpikes,
            priceDrops,
            summary,
            news
        };
        this.lastAnalysisTime = now;

        return this.lastAnalysis;
    }

    private static async generateSummary(
        highMargin: HighlightItem[],
        bulk: HighlightItem[],
        spikes: HighlightItem[],
        drops: HighlightItem[],
        news: NewsItem[]
    ): Promise<string> {
        const apiKey = process.env.GEMINI_API_KEY;

        let promptContext = `Market Report:\n`;

        if (news.length > 0) {
            promptContext += `Recent News Updates:\n`;
            news.forEach(n => {
                promptContext += `- ${n.title} (${n.date}) - ${n.category}\n`;
            });
            promptContext += `\n`;
        }

        if (highMargin.length > 0) {
            promptContext += `Top Mid Price Profit: ${highMargin[0].name} (${highMargin[0].profit?.toLocaleString()}gp profit per item)\n`;
        }
        if (bulk.length > 0) {
            promptContext += `Top Bulk Profit: ${bulk[0].name} (${bulk[0].potentialProfit?.toLocaleString()}gp potential profit at buy limit)\n`;
        }
        if (spikes.length > 0) {
            promptContext += `Top Spike: ${spikes[0].name} (+${spikes[0].dayChange?.toFixed(1)}%)\n`;
        }
        if (drops.length > 0) {
            promptContext += `Top Drop: ${drops[0].name} (${drops[0].dayChange?.toFixed(1)}%)\n`;
        }

        const notable = highMargin.slice(1, 3).map(i => i.name).join(", ");
        if (notable) {
            promptContext += `Other notable items: ${notable}.\n`;
        }

        // Add prompt instruction
        promptContext += "\nSummarize the market highlights in 2-3 concise, engaging sentences as a specialized OSRS trading assistant.";
        if (news.length > 0) {
            promptContext += " Briefly mention if any specific recent news might be relevant to the market activity, but focus on the trading opportunities.";
        }

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

        // Fallback template
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
