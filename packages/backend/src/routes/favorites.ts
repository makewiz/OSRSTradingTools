import express from "express";
import { authenticateToken } from "../auth";
import { logger } from "@osrstradingtools/shared";
import { getUserFavorites, addFavorite, removeFavorite } from "../database";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

/**
 * Get all favorites for current user
 * GET /api/favorites
 */
router.get("/", async (req, res) => {
    const userId = req.user!.id;
    try {
        const favorites = await getUserFavorites(userId);
        res.json({ favorites });
    } catch (err) {
        logger.error("Failed to fetch favorites:", err);
        res.status(500).json({ error: "Failed to fetch favorites" });
    }
});

/**
 * Add a favorite
 * POST /api/favorites
 */
router.post("/", async (req, res) => {
    const userId = req.user!.id;
    const { itemId } = req.body;

    if (!itemId || typeof itemId !== "number") {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        await addFavorite(userId, itemId);
        res.status(201).json({ success: true, itemId });
    } catch (err) {
        logger.error("Failed to add favorite:", err);
        res.status(500).json({ error: "Failed to add favorite" });
    }
});

/**
 * Remove a favorite
 * DELETE /api/favorites/:itemId
 */
router.delete("/:itemId", async (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        await removeFavorite(userId, itemId);
        res.json({ success: true, itemId });
    } catch (err) {
        logger.error("Failed to remove favorite:", err);
        res.status(500).json({ error: "Failed to remove favorite" });
    }
});

export default router;
