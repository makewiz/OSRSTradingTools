import express from "express";
import { authenticateToken } from "../auth";
import { getUserFavorites, addFavorite, removeFavorite } from "../database";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

/**
 * Get all favorites for current user
 * GET /api/favorites
 */
router.get("/", (req, res) => {
    const userId = req.user!.id;
    try {
        const favorites = getUserFavorites(userId);
        res.json({ favorites });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to fetch favorites" });
    }
});

/**
 * Add a favorite
 * POST /api/favorites
 */
router.post("/", (req, res) => {
    const userId = req.user!.id;
    const { itemId } = req.body;

    if (!itemId || typeof itemId !== "number") {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        addFavorite(userId, itemId);
        res.status(201).json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to add favorite" });
    }
});

/**
 * Remove a favorite
 * DELETE /api/favorites/:itemId
 */
router.delete("/:itemId", (req, res) => {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
    }

    try {
        removeFavorite(userId, itemId);
        res.json({ success: true, itemId });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to remove favorite" });
    }
});

export default router;
