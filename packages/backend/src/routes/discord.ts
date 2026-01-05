import express from "express";
import { authenticateToken } from "../auth";
import {
    linkDiscordUser,
    getDiscordUserByUserId,
    updateDiscordSettings,
    addBackendWatch,
    removeBackendWatch,
    getBackendWatches
} from "../database";
import { exchangeCodeForToken, getDiscordUser } from "../oauth";
import { getCombinedItems } from "../osrsClient";
import { getLatestItems } from "../scheduler";

const router = express.Router();

/**
 * Public Config (Client ID)
 * GET /api/discord/config
 */
router.get("/config", (req, res) => {
    res.json({ clientId: process.env.DISCORD_CLIENT_ID });
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
        res.json({ success: true });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Link OAuth Error:", err.message);
        // eslint-disable-next-line no-console
        if (err.response) console.error(err.response.data);

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
        // Note: In a production app with DB "items" table, we would JOIN. 
        // Here we fetch from cache.
        // Here we fetch from cache.
        let allItems = getLatestItems();
        if (!allItems || allItems.length === 0) {
            allItems = await getCombinedItems();
        }
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
        console.error(err);
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
        console.error(err);
        res.status(500).json({ error: "Failed to update settings" });
    }
});

/**
 * Add a Watch
 * POST /api/discord/watch
 */
router.post("/watch", async (req, res) => {
    const userId = req.user!.id;
    const { itemId, threshold } = req.body;

    if (!itemId || typeof itemId !== "number") {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        await addBackendWatch(discordUser.discord_id, itemId, threshold || 5.0);
        res.status(201).json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to add watch" });
    }
});

/**
 * Update Watch Threshold
 * PUT /api/discord/watch/:itemId
 */
router.put("/watch/:itemId", async (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);
    const { threshold } = req.body;

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }
    if (typeof threshold !== "number") {
        return res.status(400).json({ error: "Invalid threshold" });
    }

    try {
        const discordUser = await getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        await addBackendWatch(discordUser.discord_id, itemId, threshold);
        res.json({ success: true, itemId, threshold });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
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
            // If not linked, maybe they are just trying to clean up? But we can't do anything.
            return res.status(404).json({ error: "No Discord account linked" });
        }

        await removeBackendWatch(discordUser.discord_id, itemId);
        res.json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to remove watch" });
    }
});

export default router;
