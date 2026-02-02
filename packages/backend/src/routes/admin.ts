import express from "express";
import { z } from "zod";
import {
    createUser,
    getUserByUsername,
    setSystemSetting,
    getAllSystemSettings
} from "../database";
import { requireAdmin } from "../middleware/admin";
import { authenticateToken, hashPassword } from "../auth";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

// Apply authentication and admin check to all routes in this router
router.use(authenticateToken, requireAdmin);

// Schemas
const userCreateSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(6),
    email: z.string().email().optional().or(z.literal("")),
    is_admin: z.boolean().optional().default(false),
});

const settingsUpdateSchema = z.object({
    bot_sleep_start: z.string().regex(/^(-1|([01]?\d|2[0-3]))$/, "Must be an integer hour (0-23) or -1/disable").optional(),
    bot_sleep_end: z.string().regex(/^(-1|([01]?\d|2[0-3]))$/, "Must be an integer hour (0-23) or -1/disable").optional(),
    discord_highlights_channel_id: z.string().regex(/^\d+$/, "Must be a numeric Discord ID").optional(),
});

// GET /settings
router.get("/settings", async (req, res) => {
    try {
        const settings = await getAllSystemSettings();
        // reduce array to object
        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, string>);

        res.json({ settings: settingsMap });
    } catch (err) {
        logger.error("Failed to fetch settings:", err);
        res.status(500).json({ error: "Failed to fetch settings" });
    }
});

// POST /settings
router.post("/settings", async (req, res) => {
    const result = settingsUpdateSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
    }

    try {
        const { bot_sleep_start, bot_sleep_end, discord_highlights_channel_id } = result.data;

        if (bot_sleep_start !== undefined) {
            await setSystemSetting("bot_sleep_start", bot_sleep_start);
        }

        if (bot_sleep_end !== undefined) {
            await setSystemSetting("bot_sleep_end", bot_sleep_end);
        }

        if (discord_highlights_channel_id !== undefined) {
            await setSystemSetting("discord_highlights_channel_id", discord_highlights_channel_id);
        }

        res.json({ success: true, message: "Settings updated" });
    } catch (err) {
        logger.error("Failed to update settings:", err);
        res.status(500).json({ error: "Failed to update settings" });
    }
});


// POST /users
router.post("/users", async (req, res) => {
    const result = userCreateSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { username, password, email, is_admin } = result.data;

    try {
        const existing = await getUserByUsername(username);
        if (existing) {
            return res.status(409).json({ error: "Username already exists" });
        }

        const hash = await hashPassword(password);
        const user = await createUser(username, hash, email || null, is_admin);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...safeUser } = user;
        res.status(201).json({ user: safeUser });



    } catch (err) {
        logger.error("Failed to create user:", err);
        res.status(500).json({ error: "Failed to create user" });
    }
});

import { historyService } from "../services/historyService";

// POST /history/backfill
router.post("/history/backfill", async (req, res) => {
    try {
        const { retentionDays } = req.body;
        const days = retentionDays ? parseInt(retentionDays, 10) : 365;

        // Async trigger
        historyService.backfillHistory(days).catch(err => {
            logger.error("Error triggering backfill:", err);
        });

        res.json({ success: true, message: `Backfill process started for ${days} days retention.` });
    } catch (err) {
        if (err instanceof Error && err.message === "Backfill already in progress") {
            return res.status(409).json({ error: "Backfill already in progress" });
        }
        logger.error("Failed to start backfill:", err);
        res.status(500).json({ error: "Failed to start backfill" });
    }
});

// GET /history/status
router.get("/history/status", (req, res) => {
    res.json(historyService.getStatus());
});

export default router;
