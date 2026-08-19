import express from "express";
import { z } from "zod";
import { authenticateToken } from "../auth";
import {
    linkDiscordUser,
    getDiscordUserByUserId,
    updateDiscordSettings,
    addBackendWatch,
    removeBackendWatch,
    getBackendWatches,
    addAdvancedWatch,
    removeAdvancedWatch,
    getAdvancedWatches,
    updateAdvancedWatch
} from "../database";
import { exchangeCodeForToken, getDiscordUser, assignLinkedRole } from "../oauth";
import { getLatestItems } from "../scheduler";
import { AnalysisService } from "../analysis";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

/**
 * Public Config (Client ID)
 * GET /api/discord/config
 */
router.get("/config", (req, res) => {
    res.json({ clientId: process.env.DISCORD_CLIENT_ID });
});

/**
 * Bot Endpoint: Get Items
 * GET /api/discord/bot/items
 * Protected by x-bot-api-key header
 */
router.get("/bot/items", async (req, res) => {
    const apiKey = req.headers['x-bot-api-key'];

    // Simple API Key check
    if (!process.env.BOT_API_KEY || apiKey !== process.env.BOT_API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid or missing Bot API Key" });
    }

    try {
        const items = await getLatestItems();
        res.json({ items });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("[Bot API] Error fetching items:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * Bot Endpoint: Get Highlights
 * GET /api/discord/bot/highlights
 * Protected by x-bot-api-key header
 */
router.get("/bot/highlights", async (req, res) => {
    const apiKey = req.headers['x-bot-api-key'];

    // Simple API Key check
    if (!process.env.BOT_API_KEY || apiKey !== process.env.BOT_API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid or missing Bot API Key" });
    }

    try {
        const analysis = await AnalysisService.getAnalysis();
        res.json(analysis);
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("[Bot API] Error fetching highlights:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- Protected Routes ---
router.use(authenticateToken);



/**
 * Link Discord Account (OAuth)
 * POST /api/discord/link-oauth
 */
router.post("/link-oauth", async (req, res) => {
    const userId = req.user!.id;
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        const tokenData = await exchangeCodeForToken(code);
        const discordProfile = await getDiscordUser(tokenData.access_token);

        await linkDiscordUser(userId, discordProfile.id);

        // Assign "Linked User"
        await assignLinkedRole(discordProfile.id, discordProfile.username);

        res.json({ success: true });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        logger.error("Link OAuth Error:", err.message);
        // eslint-disable-next-line no-console
        if (err.response) logger.error("Link OAuth Error Response:", err.response.data);

        res.status(500).json({ error: "Failed to link Discord account" });
    }
});

/**
 * Get Discord Settings & Status
 * GET /api/discord/settings
 */
router.get("/settings", async (req, res) => {
    const userId = req.user!.id;
    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.json({ linked: false });
        }

        // Get active watches
        const watches = await getBackendWatches(discordUser.discord_id);

        // Enrich with item names
        // Fetch detailed item information from cache to enrich watches with names.
        let allItems = await getLatestItems();
        const enrichedWatches = watches.map(w => {
            const item = allItems.find(i => i.id === w.item_id);
            return {
                ...w,
                itemName: item ? item.name : `Item ${w.item_id}`
            };
        });

        res.json({
            linked: true,
            notificationsEnabled: discordUser.notifications_enabled,
            watches: enrichedWatches
        });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to fetch settings:", err);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

/**
 * Update Discord Settings
 * POST /api/discord/settings
 */
router.post("/settings", async (req, res) => {
    const userId = req.user!.id;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        await updateDiscordSettings(discordUser.discord_id, enabled);
        res.json({ success: true, enabled });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to update settings:", err);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

/**
 * Add a Watch
 * POST /api/discord/watch
 */
router.post("/watch", async (req, res) => {
    const userId = req.user!.id;
    const { itemId } = req.body;

    if (!itemId || typeof itemId !== "number") {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        const period = req.body.period || '1h';
        const cooldown = req.body.cooldown || 3600;
        const threshold = req.body.threshold !== undefined ? req.body.threshold : null;
        const targetPriceAbove = req.body.targetPriceAbove ?? req.body.target_price_above ?? null;
        const targetPriceBelow = req.body.targetPriceBelow ?? req.body.target_price_below ?? null;
        const oneHourChangeThreshold = req.body.oneHourChangeThreshold ?? req.body.one_hour_change_threshold ?? (period === '1h' ? threshold : null);
        const dayChangeThreshold = req.body.dayChangeThreshold ?? req.body.day_change_threshold ?? (period === '24h' ? threshold : null);

        await addBackendWatch(
            discordUser.discord_id,
            itemId,
            threshold,
            period,
            cooldown,
            true,
            targetPriceAbove,
            targetPriceBelow,
            oneHourChangeThreshold,
            dayChangeThreshold
        );
        res.status(201).json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to add watch:", err);
        res.status(500).json({ error: "Failed to add watch" });
    }
});

/**
 * Update Watch Threshold / Target Prices
 * PUT /api/discord/watch/:itemId
 */
router.put("/watch/:itemId", async (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        const period = req.body.period || '1h';
        const cooldown = req.body.cooldown || 3600;
        const enabled = req.body.enabled !== undefined ? req.body.enabled : true;
        const threshold = req.body.threshold !== undefined ? req.body.threshold : null;
        const targetPriceAbove = req.body.targetPriceAbove ?? req.body.target_price_above ?? null;
        const targetPriceBelow = req.body.targetPriceBelow ?? req.body.target_price_below ?? null;
        const oneHourChangeThreshold = req.body.oneHourChangeThreshold ?? req.body.one_hour_change_threshold ?? (period === '1h' ? threshold : null);
        const dayChangeThreshold = req.body.dayChangeThreshold ?? req.body.day_change_threshold ?? (period === '24h' ? threshold : null);

        await addBackendWatch(
            discordUser.discord_id,
            itemId,
            threshold,
            period,
            cooldown,
            enabled,
            targetPriceAbove,
            targetPriceBelow,
            oneHourChangeThreshold,
            dayChangeThreshold
        );
        res.json({ success: true, itemId, period, cooldown, enabled });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to update watch:", err);
        res.status(500).json({ error: "Failed to update watch" });
    }
});

/**
 * Remove a Watch
 * DELETE /api/discord/watch/:itemId
 */
router.delete("/watch/:itemId", async (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            // User not linked, cannot remove backend watches.
            return res.status(404).json({ error: "No Discord account linked" });
        }

        await removeBackendWatch(discordUser.discord_id, itemId);
        res.json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to remove watch:", err);
        res.status(500).json({ error: "Failed to remove watch" });
    }
});

/**
 * Advanced Watches Routes
 */

/**
 * Get Advanced Watches
 * GET /api/discord/advanced-watches
 */
router.get("/advanced-watches", async (req, res) => {
    const userId = req.user!.id;
    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) return res.json({ watches: [] });

        const watches = await getAdvancedWatches(discordUser.discord_id);
        res.json({ watches });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to fetch advanced watches:", err);
        res.status(500).json({ error: "Failed to fetch advanced watches" });
    }
});

/**
 * Create Advanced Watch
 * POST /api/discord/advanced-watches
 */
const createAdvancedWatchSchema = z.object({
    name: z.string().nullable().optional().transform(v => v ?? null),
    min_buy_price: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    max_buy_price: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    min_sell_price: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    max_sell_price: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    min_volume: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    min_change_1h: z.number().nullable().optional().transform(v => v ?? null),
    min_change_24h: z.number().nullable().optional().transform(v => v ?? null),
    is_members: z.boolean().nullable().optional().transform(v => v ?? null),
    min_buy_limit: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    max_buy_limit: z.number().int().nonnegative().nullable().optional().transform(v => v ?? null),
    min_margin: z.number().int().nullable().optional().transform(v => v ?? null),
    max_margin: z.number().int().nullable().optional().transform(v => v ?? null),
    min_profit: z.number().int().nullable().optional().transform(v => v ?? null),
    max_profit: z.number().int().nullable().optional().transform(v => v ?? null),
    min_roi: z.number().nullable().optional().transform(v => v ?? null),
    min_potential_profit: z.number().int().nullable().optional().transform(v => v ?? null),
    cooldown_minutes: z.number().int().min(1).default(60),
    order_by: z.enum(['profit', 'margin', 'roi', 'volume']).default('profit'),
    direction: z.enum(['asc', 'desc']).default('desc'),
    max_count: z.number().int().min(1).max(100).default(10)
});

router.post("/advanced-watches", async (req, res) => {
    const userId = req.user!.id;

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        // Validate and sanitize input
        const validationResult = createAdvancedWatchSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                error: "Invalid input",
                details: validationResult.error.format()
            });
        }

        const watchData = {
            discord_id: discordUser.discord_id,
            ...validationResult.data
        };

        const newWatch = await addAdvancedWatch(watchData);
        res.status(201).json({ success: true, watch: newWatch });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to create advanced watch:", err);
        res.status(500).json({ error: "Failed to create advanced watch" });
    }
});

/**
 * Update Advanced Watch
 * PUT /api/discord/advanced-watches/:id
 */
const updateAdvancedWatchSchema = z.object({
    name: z.string().nullable().optional(),
    min_buy_price: z.number().int().nonnegative().nullable().optional(),
    max_buy_price: z.number().int().nonnegative().nullable().optional(),
    min_sell_price: z.number().int().nonnegative().nullable().optional(),
    max_sell_price: z.number().int().nonnegative().nullable().optional(),
    min_volume: z.number().int().nonnegative().nullable().optional(),
    min_change_1h: z.number().nullable().optional(),
    min_change_24h: z.number().nullable().optional(),
    is_members: z.boolean().nullable().optional(),
    min_buy_limit: z.number().int().nonnegative().nullable().optional(),
    max_buy_limit: z.number().int().nonnegative().nullable().optional(),
    min_margin: z.number().int().nullable().optional(),
    max_margin: z.number().int().nullable().optional(),
    min_profit: z.number().int().nullable().optional(),
    max_profit: z.number().int().nullable().optional(),
    min_roi: z.number().nullable().optional(),
    min_potential_profit: z.number().int().nullable().optional(),
    cooldown_minutes: z.number().int().min(1).optional(),
    order_by: z.enum(['profit', 'margin', 'roi', 'volume']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
    max_count: z.number().int().min(1).max(100).optional(),
    enabled: z.boolean().optional()
});

router.put("/advanced-watches/:id", async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) return res.status(404).json({ error: "No Discord linked" });

        // Validate and sanitize input
        const validationResult = updateAdvancedWatchSchema.safeParse(req.body);

        if (!validationResult.success) {
            return res.status(400).json({
                error: "Invalid input",
                details: validationResult.error.format()
            });
        }

        const updated = await updateAdvancedWatch(id, discordUser.discord_id, validationResult.data);
        if (!updated) return res.status(404).json({ error: "Watch not found" });

        res.json({ success: true, watch: updated });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to update advanced watch:", err);
        res.status(500).json({ error: "Failed to update advanced watch" });
    }
});

/**
 * Delete Advanced Watch
 * DELETE /api/discord/advanced-watches/:id
 */
router.delete("/advanced-watches/:id", async (req, res) => {
    const userId = req.user!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) return res.status(404).json({ error: "No Discord linked" });

        await removeAdvancedWatch(id, discordUser.discord_id);
        res.json({ success: true, id });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to delete advanced watch:", err);
        res.status(500).json({ error: "Failed to delete advanced watch" });
    }
});


export default router;
