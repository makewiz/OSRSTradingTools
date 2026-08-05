import { getProfitableRecipes } from "../database/recipes";
import { ArbitrageService } from "../services/arbitrageService";
import { itemService } from "../services/itemService";
import { fetchWikiDescription, CombinedItem } from "../osrsClient";
import { getLatestItems } from "../scheduler";
import { NewsService } from "../news";
import {
    getUserFavorites,
    addFavorite,
    removeFavorite,
    getBackendWatches,
    addBackendWatch,
    removeBackendWatch,
    getDiscordUserByUserId,
    getAdvancedWatches,
    addAdvancedWatch
} from "../database";
import { logger } from "@osrstradingtools/shared";

export interface ContextUser {
    id: number;
    username: string;
    is_admin?: boolean;
}

export const geminiTools = [
    {
        name: "get_recipes",
        description: "Fetch and filter profitable processing and crafting recipes in OSRS (e.g., Smithing, Herblore, Fletching, Cooking).",
        parameters: {
            type: "OBJECT",
            properties: {
                minProfit: { type: "NUMBER", description: "Minimum profit per action in GP after GE tax." },
                minVolume: { type: "NUMBER", description: "Minimum 24h item volume." },
                limit: { type: "NUMBER", description: "Maximum number of recipes to return (default 10)." }
            }
        }
    },
    {
        name: "get_set_arbitrage",
        description: "Fetch set packing and unpacking arbitrage opportunities (e.g., buying armor set parts to assemble into sets or vice versa for profit).",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "get_decant_arbitrage",
        description: "Fetch potion decanting arbitrage opportunities (e.g., buying lower dose potions and decanting into 4-dose potions for profit).",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "search_items",
        description: "Search and filter OSRS items based on trading metrics like margin, ROI, volume, price, or item name.",
        parameters: {
            type: "OBJECT",
            properties: {
                query: { type: "STRING", description: "Item name search string (e.g. 'Dragon', 'Rune', 'Shark')." },
                minMargin: { type: "NUMBER", description: "Minimum margin in GP." },
                minRoi: { type: "NUMBER", description: "Minimum ROI percentage (e.g., 5 for 5%)." },
                minVolume: { type: "NUMBER", description: "Minimum 24-hour trading volume." },
                limit: { type: "NUMBER", description: "Maximum number of items to return (default 10)." }
            }
        }
    },
    {
        name: "get_item_detail",
        description: "Get detailed current market snapshot (buy/sell prices, margin, tax, volume, buy limit) and Wiki summary for a specific item.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of the item if ID is not known." }
            }
        }
    },
    {
        name: "get_latest_news",
        description: "Fetch recent official Old School RuneScape game updates, news posts, and system announcements to analyze price impact.",
        parameters: {
            type: "OBJECT",
            properties: {
                limit: { type: "NUMBER", description: "Maximum number of news items to fetch (default 5)." }
            }
        }
    },
    {
        name: "get_wiki_summary",
        description: "Fetch the official OSRS Wiki intro extract for an item, boss, skill, or game topic to understand its in-game utility, combat use, quest relevance, or demand drivers.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemName: { type: "STRING", description: "The item or topic name to look up on the OSRS Wiki." }
            }
        }
    },
    {
        name: "get_favorites",
        description: "List all favorited items for the logged-in user.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "add_favorite",
        description: "Add an item to the logged-in user's favorites list.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of the item if ID is unknown." }
            }
        }
    },
    {
        name: "remove_favorite",
        description: "Remove an item from the logged-in user's favorites list.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of the item if ID is unknown." }
            }
        }
    },
    {
        name: "get_watches",
        description: "Get all active price watch alerts for the logged-in user.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "add_watch",
        description: "Set a price change watch alert for an item for the logged-in user.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of item if ID is unknown." },
                threshold: { type: "NUMBER", description: "Percentage change threshold (e.g. 5 for 5%). Default 5." },
                period: { type: "STRING", description: "Time period window e.g. '24h', '1h'." },
                cooldown: { type: "NUMBER", description: "Notification cooldown in minutes. Default 60." }
            }
        }
    },
    {
        name: "remove_watch",
        description: "Remove a price watch alert for an item.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of item if ID is unknown." }
            }
        }
    },
    {
        name: "get_advanced_watches",
        description: "Get the user's advanced market watch filters.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "add_advanced_watch",
        description: "Create a custom advanced watch filter.",
        parameters: {
            type: "OBJECT",
            properties: {
                name: { type: "STRING", description: "Watch title/name." },
                minMargin: { type: "NUMBER", description: "Minimum margin filter." },
                minRoi: { type: "NUMBER", description: "Minimum ROI filter." },
                minVolume: { type: "NUMBER", description: "Minimum 24h volume filter." }
            }
        }
    }
];

// Helper to look up item by name or id
async function resolveItemId(itemId?: number, itemName?: string): Promise<{ id: number; name: string } | null> {
    const allItems = await getLatestItems();
    if (itemId) {
        const item = allItems.find((i: CombinedItem) => i.id === itemId);
        if (item) return { id: item.id, name: item.name };
    }
    if (itemName) {
        const queryLower = itemName.toLowerCase().trim();
        const exact = allItems.find((i: CombinedItem) => i.name.toLowerCase() === queryLower);
        if (exact) return { id: exact.id, name: exact.name };
        const partial = allItems.find((i: CombinedItem) => i.name.toLowerCase().includes(queryLower));
        if (partial) return { id: partial.id, name: partial.name };
    }
    return null;
}

// Helper to get Discord ID for user or virtual string fallback
async function getEffectiveDiscordId(user: ContextUser): Promise<string> {
    const discordUser = await getDiscordUserByUserId(user.id);
    if (discordUser) {
        return discordUser.discord_id;
    }
    return `user_${user.id}`;
}

export async function executeGeminiTool(
    name: string,
    args: Record<string, any>,
    user?: ContextUser
): Promise<any> {
    logger.info(`Executing Gemini tool '${name}' with args:`, args);

    try {
        switch (name) {
            case "get_recipes": {
                const minProfit = args.minProfit ?? Number.MIN_SAFE_INTEGER;
                const limit = args.limit ?? 10;
                const minVolume = args.minVolume ?? 0;
                const recipes = await getProfitableRecipes(minProfit, limit, minVolume);
                return recipes.slice(0, limit);
            }

            case "get_set_arbitrage": {
                const arbitrageSvc = new ArbitrageService(itemService);
                const results = await arbitrageSvc.getSetArbitrage();
                return results.slice(0, 10);
            }

            case "get_decant_arbitrage": {
                const arbitrageSvc = new ArbitrageService(itemService);
                const results = await arbitrageSvc.getDecantProfit();
                return results.slice(0, 10);
            }

            case "search_items": {
                const allItems = await getLatestItems();
                let filtered = allItems;

                if (args.query) {
                    const q = args.query.toLowerCase().trim();
                    filtered = filtered.filter((i: CombinedItem) => i.name.toLowerCase().includes(q));
                }
                if (typeof args.minMargin === "number") {
                    filtered = filtered.filter((i: CombinedItem) => (i.margin ?? 0) >= args.minMargin);
                }
                if (typeof args.minRoi === "number") {
                    filtered = filtered.filter((i: CombinedItem) => (i.roi ?? 0) >= args.minRoi);
                }
                if (typeof args.minVolume === "number") {
                    filtered = filtered.filter((i: CombinedItem) => (i.volume ?? 0) >= args.minVolume);
                }

                const limit = args.limit ?? 10;
                return filtered.slice(0, limit).map((i: CombinedItem) => ({
                    id: i.id,
                    name: i.name,
                    buyPrice: i.buyPrice,
                    sellPrice: i.sellPrice,
                    margin: i.margin,
                    roi: i.roi,
                    volume: i.volume,
                    limit: i.limit,
                    tax: i.tax
                }));
            }

            case "get_item_detail": {
                const found = await resolveItemId(args.itemId, args.itemName);
                if (!found) {
                    return { error: `Item not found matching ${args.itemName || args.itemId}` };
                }
                const allItems = await getLatestItems();
                const item = allItems.find((i: CombinedItem) => i.id === found.id);
                if (!item) {
                    return { error: "Item price data not available." };
                }
                const wikiExtract = await fetchWikiDescription(item.name);
                return {
                    id: item.id,
                    name: item.name,
                    buyPrice: item.buyPrice,
                    sellPrice: item.sellPrice,
                    margin: item.margin,
                    profit: item.profit,
                    roi: item.roi,
                    volume: item.volume,
                    limit: item.limit,
                    tax: item.tax,
                    members: item.members,
                    iconUrl: item.iconUrl,
                    wikiUrl: item.wikiUrl,
                    wikiExtract: wikiExtract || "No wiki summary extract available."
                };
            }

            case "get_latest_news": {
                const limit = typeof args.limit === "number" ? args.limit : 5;
                const newsItems = await NewsService.fetchNewestNews();
                return { news: newsItems.slice(0, limit) };
            }

            case "get_wiki_summary": {
                const title = args.itemName || args.query || args.title;
                if (!title || typeof title !== "string") {
                    return { error: "itemName is required for get_wiki_summary" };
                }
                const extract = await fetchWikiDescription(title);
                return {
                    title,
                    extract: extract || "No wiki extract found.",
                    wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(title.replace(/ /g, "_"))}`
                };
            }

            case "get_favorites": {
                if (!user) {
                    return { error: "User is not logged in. Cannot fetch favorites." };
                }
                const favIds = await getUserFavorites(user.id);
                const allItems = await getLatestItems();
                const favItems = favIds
                    .map(id => allItems.find((i: CombinedItem) => i.id === id))
                    .filter(Boolean)
                    .map((i: any) => ({
                        id: i!.id,
                        name: i!.name,
                        buyPrice: i!.buyPrice,
                        sellPrice: i!.sellPrice,
                        margin: i!.margin,
                        roi: i!.roi,
                        volume: i!.volume
                    }));
                return { favoriteIds: favIds, favorites: favItems };
            }

            case "add_favorite": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage favorites." };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: `Item not found matching ${args.itemName || args.itemId}` };
                }
                await addFavorite(user.id, target.id);
                return { success: true, message: `Successfully added ${target.name} (ID ${target.id}) to favorites.` };
            }

            case "remove_favorite": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage favorites." };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: `Item not found matching ${args.itemName || args.itemId}` };
                }
                await removeFavorite(user.id, target.id);
                return { success: true, message: `Successfully removed ${target.name} (ID ${target.id}) from favorites.` };
            }

            case "get_watches": {
                if (!user) {
                    return { error: "User is not logged in. Cannot fetch watches." };
                }
                const discordId = await getEffectiveDiscordId(user);
                const watches = await getBackendWatches(discordId);
                const allItems = await getLatestItems();
                const enriched = watches.map(w => {
                    const item = allItems.find((i: CombinedItem) => i.id === w.item_id);
                    const cooldownSeconds = (w as any).cooldown_seconds ?? 3600;
                    return {
                        ...w,
                        itemName: item ? item.name : `Item ${w.item_id}`,
                        cooldownMinutes: Math.round(cooldownSeconds / 60)
                    };
                });
                return { watches: enriched };
            }

            case "add_watch": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage watches." };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: `Item not found matching ${args.itemId || args.itemName}` };
                }
                const discordId = await getEffectiveDiscordId(user);
                const threshold = typeof args.threshold === "number" ? args.threshold : 5.0;
                const period = args.period === "1h" ? "1h" : "24h";
                const cooldownMinutes = typeof args.cooldown === "number" ? args.cooldown : 60;
                const cooldownSeconds = cooldownMinutes * 60;
                await addBackendWatch(discordId, target.id, threshold, period, cooldownSeconds, true);
                return { success: true, message: `Set price watch for ${target.name} (Threshold: ${threshold}%, Period: ${period}, Cooldown: ${cooldownMinutes} minutes).` };
            }

            case "remove_watch": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage watches." };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: `Item not found matching ${args.itemId || args.itemName}` };
                }
                const discordId = await getEffectiveDiscordId(user);
                await removeBackendWatch(discordId, target.id);
                return { success: true, message: `Removed price watch for ${target.name}.` };
            }

            case "get_advanced_watches": {
                if (!user) {
                    return { error: "User is not logged in. Cannot fetch advanced watches." };
                }
                const discordId = await getEffectiveDiscordId(user);
                const watches = await getAdvancedWatches(discordId);
                return { advancedWatches: watches };
            }

            case "add_advanced_watch": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage advanced watches." };
                }
                const discordId = await getEffectiveDiscordId(user);
                const newWatch = await addAdvancedWatch({
                    discord_id: discordId,
                    name: args.name || "Custom Gemini Watch",
                    min_margin: args.minMargin ?? null,
                    min_roi: args.minRoi ?? null,
                    min_volume: args.minVolume ?? null,
                    min_buy_price: null,
                    max_buy_price: null,
                    min_sell_price: null,
                    max_sell_price: null,
                    min_change_1h: null,
                    min_change_24h: null,
                    is_members: null,
                    min_buy_limit: null,
                    max_buy_limit: null,
                    max_margin: null,
                    min_profit: null,
                    max_profit: null,
                    min_potential_profit: null,
                    cooldown_minutes: 60,
                    order_by: "volume",
                    direction: "desc",
                    max_count: 5
                });
                return { success: true, watch: newWatch, message: `Created advanced watch '${newWatch.name}'.` };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (err: any) {
        logger.error(`Error executing tool '${name}':`, err);
        return { error: `Failed to execute tool '${name}': ${err.message || String(err)}` };
    }
}
