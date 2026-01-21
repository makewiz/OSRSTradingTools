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
