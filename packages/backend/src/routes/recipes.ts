import { Router } from "express";
import { getProfitableRecipes, getAllRecipesForExport, importRecipes } from "../database/recipes";
import { recipeService } from "../services/recipeService";
import { authenticateToken } from "../auth";
import { logger } from "@osrstradingtools/shared";

const router = Router();

// Authentication Strategy:
// GET /recipes: Conditionally authenticated based on REQUIRE_AUTH env var to allow flexible public/private access.
// POST /recipes/*: Strictly authenticated and requires Admin role for sensitive operations (Sync, Import, Export).

// Helper for conditional auth
const conditionalAuth = async (req: any, res: any, next: any) => {
    if (process.env.REQUIRE_AUTH === "true") {
        await authenticateToken(req, res, next);
    } else {
        next();
    }
};

// GET /recipes - Profitable recipes
// Use conditional auth so we can track usage or restrict if needed, but allow public access if configured.
router.get("/", conditionalAuth, async (req, res) => {
    try {
        const minProfit = req.query.minProfit ? parseInt(req.query.minProfit as string) : Number.MIN_SAFE_INTEGER;
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
        const minVolume = req.query.minVolume ? parseInt(req.query.minVolume as string) : 0;

        const recipes = await getProfitableRecipes(minProfit, limit, minVolume);
        res.json(recipes);
    } catch (err) {
        logger.error("Failed to get recipes", err);
        res.status(500).json({ error: "Failed to fetch recipes" });
    }
});

// POST /recipes/sync - Trigger sync (Admin only)
router.post("/sync", authenticateToken, async (req, res) => {
    // Check if user is admin
    if (!req.user?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
    }

    try {
        // Run in background to avoid timeout
        recipeService.syncRecipes().catch(err => logger.error("Background sync failed", err));
        res.json({ message: "Sync started" });
    } catch (err) {
        res.status(500).json({ error: "Failed to start sync" });
    }
});

// GET /recipes/sync/status - Check sync status (Admin only)
router.get("/sync/status", authenticateToken, async (req, res) => {
    // Check if user is admin
    if (!req.user?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
    }
    res.json(recipeService.getSyncStatus());
});

// GET /recipes/export - Export all recipes as JSON (Admin only)
router.get("/export", authenticateToken, async (req, res) => {
    if (!req.user?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
    }

    try {
        const recipes = await getAllRecipesForExport();
        res.setHeader("Content-Disposition", "attachment; filename=recipes.json");
        res.setHeader("Content-Type", "application/json");
        res.json(recipes);
    } catch (err) {
        logger.error("Failed to export recipes", err);
        res.status(500).json({ error: "Failed to export recipes" });
    }
});

// POST /recipes/import - Import recipes from JSON (Admin only)
router.post("/import", authenticateToken, async (req, res) => {
    if (!req.user?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
    }

    try {
        const recipes = req.body;
        if (!Array.isArray(recipes)) {
            return res.status(400).json({ error: "Invalid format: Expected array of recipes" });
        }

        await importRecipes(recipes);
        res.json({ message: `Successfully imported ${recipes.length} recipes` });
    } catch (err) {
        logger.error("Failed to import recipes", err);
        res.status(500).json({ error: "Failed to import recipes" });
    }
});

export default router;
