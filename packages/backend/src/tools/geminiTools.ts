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
    addAdvancedWatch,
    getUserPortfolio,
    addPortfolioItem,
    deletePortfolioItem
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
                minRoi: { type: "NUMBER", description: "Minimum ROI percentage." },
                minVolume: { type: "NUMBER", description: "Minimum 24h trading volume." },
                maxBuyPrice: { type: "NUMBER", description: "Maximum Instant Buy Price (high price) threshold in GP." },
                maxSellPrice: { type: "NUMBER", description: "Maximum Instant Sell Price (low price) threshold in GP." },
                sortBy: { type: "STRING", description: "Property to sort results by: 'margin', 'roi', 'volume', 'profit'." },
                sortOrder: { type: "STRING", description: "Sort direction: 'desc' or 'asc' (default 'desc')." },
                limit: { type: "NUMBER", description: "Max results to return (default 10)." }
            }
        }
    },
    {
        name: "get_item_detail",
        description: "Get detailed current market snapshot (Instant Buy Price [high], Instant Sell Price [low], margin, tax, volume, buy limit) and Wiki summary for a specific item.",
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
        name: "get_user_portfolio",
        description: "Fetch the user's active trading portfolio items (bought items, quantities, average buy prices, current instant buy prices, net worth, and tax-adjusted profit). ALWAYS call this first when checking user holdings or before recommending repeat purchases.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "add_to_portfolio",
        description: "Add an item entry into the user's trading portfolio. Requires itemId or itemName, quantity, and buyPrice paid per item.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric OSRS item ID." },
                itemName: { type: "STRING", description: "Name of the item." },
                quantity: { type: "NUMBER", description: "Quantity of items bought (e.g. 1000)." },
                buyPrice: { type: "NUMBER", description: "Average purchase price paid per item in GP (cost basis)." },
                targetSellPrice: { type: "NUMBER", description: "Target sell price per item in GP (Instant Buy / High price target)." },
                notes: { type: "STRING", description: "Trade notes or strategy." }
            },
            required: ["quantity", "buyPrice"]
        }
    },
    {
        name: "remove_from_portfolio",
        description: "Remove an item from the user's trading portfolio by position ID or item ID/name.",
        parameters: {
            type: "OBJECT",
            properties: {
                positionId: { type: "NUMBER", description: "Numeric ID of the portfolio position to delete." },
                itemId: { type: "NUMBER", description: "Numeric item ID to remove if positionId is unknown." },
                itemName: { type: "STRING", description: "Name of item to remove if positionId is unknown." }
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
        description: "Set a price change or specific price point watch alert for an item for the logged-in user.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric item ID." },
                itemName: { type: "STRING", description: "Name of item if ID is unknown." },
                threshold: { type: "NUMBER", description: "Percentage change threshold (e.g. 5 for 5%)." },
                period: { type: "STRING", description: "Time period window e.g. '24h', '1h'." },
                targetPriceAbove: { type: "NUMBER", description: "Target high price in GP (alert when price >= target)." },
                targetPriceBelow: { type: "NUMBER", description: "Target low price in GP (alert when price <= target)." },
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
    },
    {
        name: "suggest_trade_actions",
        description: "Provide structured trade recommendations and actionable buy/sell signals to the user. Call this tool whenever recommending specific OSRS items to buy, sell, or flip.",
        parameters: {
            type: "OBJECT",
            properties: {
                suggestions: {
                    type: "ARRAY",
                    description: "List of recommended trade actions.",
                    items: {
                        type: "OBJECT",
                        properties: {
                            itemId: { type: "NUMBER", description: "Numeric OSRS item ID." },
                            itemName: { type: "STRING", description: "Name of the item." },
                            buyPrice: { type: "NUMBER", description: "Recommended buy price (Instant Sell / Low price) in GP." },
                            targetSellPrice: { type: "NUMBER", description: "Target sell price (Instant Buy / High price) in GP." },
                            quantity: { type: "NUMBER", description: "Recommended quantity to buy/sell." },
                            rationale: { type: "STRING", description: "Brief rationale or trade logic." }
                        },
                        required: ["itemName", "buyPrice", "targetSellPrice", "quantity"]
                    }
                }
            },
            required: ["suggestions"]
        }
    },
    {
        name: "suggest_followup_options",
        description: "Provide a list of suggested quick-reply prompt options or next steps for the user to click in chat (e.g. 'Show recipes for Herblore', 'Set watch alert for Armadyl Godsword').",
        parameters: {
            type: "OBJECT",
            properties: {
                options: {
                    type: "ARRAY",
                    description: "List of clickable follow-up option prompts for the user.",
                    items: { type: "STRING" }
                }
            },
            required: ["options"]
        }
    },
    {
        name: "ask_user_question",
        description: "Ask the user a structured question with interactive choice options or for clarifying input (e.g. risk level, target ROI, specific skill). The user can click an option button to reply.",
        parameters: {
            type: "OBJECT",
            properties: {
                question: { type: "STRING", description: "The question text to display to the user." },
                options: {
                    type: "ARRAY",
                    description: "Selectable answer option buttons for the user to click.",
                    items: { type: "STRING" }
                },
                allowCustomInput: { type: "BOOLEAN", description: "Whether the user can also type a custom answer (default true)." },
                multiSelect: { type: "BOOLEAN", description: "Whether the user can select multiple options (default false)." }
            },
            required: ["question"]
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
                if (typeof args.maxBuyPrice === "number") {
                    filtered = filtered.filter((i: CombinedItem) => (i.buyPrice ?? 0) <= args.maxBuyPrice);
                }
                if (typeof args.maxSellPrice === "number") {
                    filtered = filtered.filter((i: CombinedItem) => (i.sellPrice ?? 0) <= args.maxSellPrice);
                }

                // Sorting
                const sortBy = args.sortBy || "margin";
                const isAsc = args.sortOrder === "asc";
                filtered.sort((a: CombinedItem, b: CombinedItem) => {
                    let valA = (a as any)[sortBy] ?? 0;
                    let valB = (b as any)[sortBy] ?? 0;
                    if (valA === valB) return 0;
                    return isAsc ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
                });

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

            case "get_user_portfolio": {
                if (!user) {
                    return { error: "User is not logged in. Cannot fetch portfolio." };
                }
                const portfolio = await getUserPortfolio(user.id);
                const items = await getLatestItems();
                const itemMap = new Map(items.map((i: CombinedItem) => [i.id, i]));

                const enriched = portfolio.map(p => {
                    const ge = itemMap.get(p.item_id);
                    return {
                        id: p.id,
                        itemId: p.item_id,
                        itemName: p.item_name,
                        quantity: p.quantity,
                        buyPrice: p.buy_price,
                        targetSellPrice: p.target_sell_price,
                        status: p.status,
                        notes: p.notes,
                        currentBuyPrice: ge?.buyPrice ?? null,
                        currentSellPrice: ge?.sellPrice ?? null,
                        currentMargin: ge?.margin ?? null
                    };
                });
                return { portfolio: enriched };
            }

            case "add_to_portfolio": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage portfolio." };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: `Item not found matching ${args.itemName || args.itemId}` };
                }
                const targetSell = args.targetSellPrice ?? args.buyPrice;
                const item = await addPortfolioItem(
                    user.id,
                    target.id,
                    target.name,
                    args.quantity,
                    args.buyPrice,
                    targetSell,
                    undefined,
                    args.notes
                );
                return { success: true, item, message: `Added ${target.name} (${args.quantity}x @ ${args.buyPrice} GP) to user portfolio.` };
            }

            case "remove_from_portfolio": {
                if (!user) {
                    return { error: "User is not logged in. Cannot manage portfolio." };
                }
                if (args.positionId) {
                    await deletePortfolioItem(args.positionId, user.id);
                    return { success: true, message: `Removed portfolio position ID ${args.positionId}.` };
                }
                const target = await resolveItemId(args.itemId, args.itemName);
                if (!target) {
                    return { error: "Must specify positionId, itemId, or itemName to remove from portfolio." };
                }
                const portfolio = await getUserPortfolio(user.id);
                const match = portfolio.find(p => p.item_id === target.id);
                if (!match) {
                    return { error: `No active portfolio position found for ${target.name}.` };
                }
                await deletePortfolioItem(match.id, user.id);
                return { success: true, message: `Removed ${target.name} from portfolio.` };
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
                const threshold = typeof args.threshold === "number" ? args.threshold : null;
                const period = args.period === "24h" ? "24h" : "1h";
                const cooldownMinutes = typeof args.cooldown === "number" ? args.cooldown : 60;
                const cooldownSeconds = cooldownMinutes * 60;
                const targetPriceAbove = typeof args.targetPriceAbove === "number" ? args.targetPriceAbove : null;
                const targetPriceBelow = typeof args.targetPriceBelow === "number" ? args.targetPriceBelow : null;

                await addBackendWatch(
                    discordId,
                    target.id,
                    threshold,
                    period,
                    cooldownSeconds,
                    true,
                    targetPriceAbove,
                    targetPriceBelow
                );
                return {
                    success: true,
                    message: `Set price watch for ${target.name} (Threshold: ${threshold ? threshold + '%' : 'N/A'}, Target Above: ${targetPriceAbove ? targetPriceAbove.toLocaleString() + ' gp' : 'N/A'}, Target Below: ${targetPriceBelow ? targetPriceBelow.toLocaleString() + ' gp' : 'N/A'}, Cooldown: ${cooldownMinutes} minutes).`
                };
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

            case "suggest_trade_actions": {
                const rawList = Array.isArray(args.suggestions) ? args.suggestions : [];
                const resolvedList = [];
                for (const item of rawList) {
                    const resolved = await resolveItemId(item.itemId, item.itemName);
                    resolvedList.push({
                        itemId: resolved ? resolved.id : (item.itemId || 0),
                        itemName: resolved ? resolved.name : (item.itemName || "Unknown Item"),
                        buyPrice: typeof item.buyPrice === "number" ? item.buyPrice : 0,
                        targetSellPrice: typeof item.targetSellPrice === "number" ? item.targetSellPrice : 0,
                        quantity: typeof item.quantity === "number" ? item.quantity : 1,
                        rationale: item.rationale || ""
                    });
                }
                return { success: true, suggestions: resolvedList, message: `Provided ${resolvedList.length} trade action suggestions.` };
            }

            case "suggest_followup_options": {
                const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o)) : [];
                return { success: true, options, message: `Provided ${options.length} follow-up options.` };
            }

            case "ask_user_question": {
                const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o)) : [];
                return {
                    success: true,
                    question: args.question || "",
                    options,
                    allowCustomInput: args.allowCustomInput !== false,
                    multiSelect: args.multiSelect === true,
                    message: `Asked question: "${args.question}"`
                };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (err: any) {
        logger.error(`Error executing tool '${name}':`, err);
        return { error: `Failed to execute tool '${name}': ${err.message || String(err)}` };
    }
}
