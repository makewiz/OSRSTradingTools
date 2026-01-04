
import { getCombinedItems, CombinedItem } from "./osrsClient";
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
}

// Heuristic Constants
const MIN_ROI = 5; // 5%
const MIN_VOLUME_FOR_MARGIN = 500;
const MIN_PROFIT = 5000;

const HIGH_VOLUME_THRESHOLD = 50000;
const MIN_MARGIN_FOR_VOLUME = 10;

const PRICE_SPIKE_THRESHOLD = 15; // +15%
const PRICE_DROP_THRESHOLD = -15; // -15%
const MIN_PRICE_FOR_CHANGE = 100; // Ignore cheap items for drops/spikes

export class AnalysisService {
    private static lastAnalysis: MarketAnalysis | null = null;
    private static lastAnalysisTime: number = 0;
    private static CACHE_TTL = 60 * 60 * 1000; // 1 hour

    public static async getAnalysis(): Promise<MarketAnalysis> {
        const now = Date.now();
        if (this.lastAnalysis && now - this.lastAnalysisTime < this.CACHE_TTL) {
            return this.lastAnalysis;
        }

        const items = await getCombinedItems();

        // Sort logic can be improved, for now just filtering
        const highMargin = items
            .filter(i =>
                (i.roi || 0) >= MIN_ROI &&
                (i.volume || 0) >= MIN_VOLUME_FOR_MARGIN &&
                (i.profit || 0) >= MIN_PROFIT
            )
            .sort((a, b) => (b.potentialProfit || 0) - (a.potentialProfit || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `High Margin: ${i.roi?.toFixed(1)}% ROI with ${i.profit?.toLocaleString()}gp profit per item` }));

        const highVolume = items
            .filter(i =>
                (i.volume || 0) >= HIGH_VOLUME_THRESHOLD &&
                (i.margin || 0) >= MIN_MARGIN_FOR_VOLUME
            )
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `High Volume: ${i.volume?.toLocaleString()} daily trades` }));

        const priceSpikes = items
            .filter(i =>
                (i.dayChange || 0) >= PRICE_SPIKE_THRESHOLD &&
                (i.buyPrice || 0) > MIN_PRICE_FOR_CHANGE
            )
            .sort((a, b) => (b.dayChange || 0) - (a.dayChange || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `Spike: +${i.dayChange?.toFixed(1)}% in 24h` }));

        const priceDrops = items
            .filter(i =>
                (i.dayChange || 0) <= PRICE_DROP_THRESHOLD &&
                (i.buyPrice || 0) > MIN_PRICE_FOR_CHANGE
            )
            .sort((a, b) => (a.dayChange || 0) - (b.dayChange || 0))
            .slice(0, 5)
            .map(i => ({ ...i, reason: `Drop: ${i.dayChange?.toFixed(1)}% in 24h` }));

        const summary = await this.generateSummary(highMargin, priceSpikes, priceDrops);

        this.lastAnalysis = {
            timestamp: now,
            highMargin,
            highVolume,
            priceSpikes,
            priceDrops,
            summary
        };
        this.lastAnalysisTime = now;

        return this.lastAnalysis;
    }

    private static async generateSummary(
        highMargin: HighlightItem[],
        spikes: HighlightItem[],
        drops: HighlightItem[]
    ): Promise<string> {
        const apiKey = process.env.OPENAI_API_KEY;

        const topMargin = highMargin[0]?.name || "N/A";
        const topSpike = spikes[0]?.name || "N/A";
        const topDrop = drops[0]?.name || "N/A";

        const promptContext = `
      Market Report:
      Top Money Maker: ${topMargin} (${highMargin[0]?.roi?.toFixed(1)}% ROI)
      Top Spike: ${topSpike} (+${spikes[0]?.dayChange?.toFixed(1)}%)
      Top Drop: ${topDrop} (${drops[0]?.dayChange?.toFixed(1)}%)
      
      Other notable items: ${highMargin.slice(1, 3).map(i => i.name).join(", ")}.
    `;

        if (apiKey) {
            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [
                            { role: "system", content: "You are a specialized OSRS trading assistant. Summarize the market highlights in 2-3 concise, engaging sentences." },
                            { role: "user", content: promptContext }
                        ]
                    })
                });

                const data = await response.json();
                if (data.choices && data.choices[0]?.message?.content) {
                    return data.choices[0].message.content;
                }
            } catch (error) {
                console.error("Error generating AI summary:", error);
            }
        }

        // Fallback template
        return `Today's top money maker is ${topMargin}. We are seeing significant volatility in ${topSpike}, while ${topDrop} has dropped in price. Check the details below for more opportunities.`;
    }
}
