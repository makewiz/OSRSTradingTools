
import { Router } from "express";
import { authenticateToken } from "../auth";
import { createSavedFilter, getSavedFilters, deleteSavedFilter } from "../database";
import { logger } from "@osrstradingtools/shared";

const router = Router();

// Get all saved filters for the authenticated user
router.get("/", authenticateToken, async (req: any, res) => {
    try {
        const filters = await getSavedFilters(req.user.id);
        res.json({ filters });
    } catch (err) {
        logger.error("Failed to fetch saved filters", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Create a new saved filter
router.post("/", authenticateToken, async (req: any, res) => {
    try {
        const { name, config } = req.body;
        if (!name || !config) {
            return res.status(400).json({ error: "Missing name or config" });
        }

        const filter = await createSavedFilter(req.user.id, name, config);
        res.status(201).json({ filter });
    } catch (err) {
        logger.error("Failed to create saved filter", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Delete a saved filter
router.delete("/:id", authenticateToken, async (req: any, res) => {
    try {
        const filterId = parseInt(req.params.id);
        if (isNaN(filterId)) {
            return res.status(400).json({ error: "Invalid filter ID" });
        }

        await deleteSavedFilter(req.user.id, filterId);
        res.status(204).send();
    } catch (err) {
        logger.error("Failed to delete saved filter", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
