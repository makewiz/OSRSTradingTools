import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "@osrstradingtools/shared";

export interface NewsItem {
    title: string;
    date: string;
    category: string;
    link: string;
}

export class NewsService {
    private static NEWS_URL = "https://secure.runescape.com/m=news/latest_news.rss?oldschool=true";

    public static async fetchNewestNews(): Promise<NewsItem[]> {
        try {
            const response = await axios.get(this.NEWS_URL, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                },
                responseType: "text"
            });

            const $ = cheerio.load(response.data, { xmlMode: true });
            const newsItems: NewsItem[] = [];

            $("item").each((i, el) => {
                if (i >= 5) return false;

                const title = $(el).find("title").text().trim();
                const link = $(el).find("link").text().trim();
                const date = $(el).find("pubDate").text().trim();
                const category = $(el).find("category").text().trim();

                if (title && link) {
                    newsItems.push({
                        title: title.replace(/\s+/g, " ").trim(),
                        date,
                        category,
                        link
                    });
                }
            });

            logger.info(`Fetched ${newsItems.length} news items from RSS.`);
            return newsItems;
        } catch (error) {
            logger.error("Error fetching OSRS news:", error);
            return [];
        }
    }
}
