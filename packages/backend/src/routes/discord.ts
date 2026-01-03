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
 * Link Discord Account
 * POST /api/discord/link
 */
router.post("/link", (req, res) => {
    const userId = req.user!.id;
    const { discordId } = req.body;

    if (!discordId || typeof discordId !== "string") {
        return res.status(400).json({ error: "Invalid Discord ID" });
    }

    try {
        linkDiscordUser(userId, discordId);
        res.json({ success: true, discordId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to link Discord account" });
    }
});

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

        linkDiscordUser(userId, discordProfile.id);
        res.json({ success: true, discordId: discordProfile.id });
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
router.get("/settings", (req, res) => {
    const userId = req.user!.id;
    try {
        const discordUser = getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.json({ linked: false });
        }

        // Get active watches
        const watches = getBackendWatches(discordUser.discord_id);

        res.json({
            linked: true,
            discordId: discordUser.discord_id,
            notificationsEnabled: discordUser.notifications_enabled,
            watches
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
router.post("/settings", (req, res) => {
    const userId = req.user!.id;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
    }

    try {
        const discordUser = getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        updateDiscordSettings(discordUser.discord_id, enabled);
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
router.post("/watch", (req, res) => {
    const userId = req.user!.id;
    const { itemId, threshold } = req.body;

    if (!itemId || typeof itemId !== "number") {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = getDiscordUserByUserId(userId);
        if (!discordUser) {
            return res.status(404).json({ error: "No Discord account linked" });
        }

        addBackendWatch(discordUser.discord_id, itemId, threshold || 5.0);
        res.status(201).json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to add watch" });
    }
});

/**
 * Remove a Watch
 * DELETE /api/discord/watch/:itemId
 */
router.delete("/watch/:itemId", (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        const discordUser = getDiscordUserByUserId(userId);
        if (!discordUser) {
            // If not linked, maybe they are just trying to clean up? But we can't do anything.
            return res.status(404).json({ error: "No Discord account linked" });
        }

        removeBackendWatch(discordUser.discord_id, itemId);
        res.json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to remove watch" });
    }
});

export default router;
