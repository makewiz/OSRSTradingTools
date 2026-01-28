import { Router } from "express";
import { getProfitableRecipes } from "../database/recipes";
import { recipeService } from "../services/recipeService";
import { authenticateToken } from "../auth";
import { logger } from "@osrstradingtools/shared";

const router = Router();

// Apply auth middleware if strictly required, or handle optional auth inside.
// User requested "same authentication to recipes as other routes".
// If "other routes" means favorites/discord, they are PROECTED.
// If "other routes" means items, it is OPTIONAL.
// Given "sync admin only", it implies some role check.
// Let's assume the user wants the recipes to be protected like favorites/discord since they are a "feature".
// However, the user said "same authentication to recipes as other routes".
// In index.ts, `items` has optional auth. `favorites` has strict auth.
// I will assume strict auth is safer for now if the user compares it to "favorites". 
// BUT, usually public viewing is nice.
// Let's look at index.ts again... `app.use("/api/auth", authRouter);`, `app.use("/api/favorites", favoritesRouter);`.
// Favorites is strictly protected.
// Items is optionally protected based on env var.
// I'll make it optionally protected if env var set, otherwise public? 
// Or just apply `authenticateToken` if `REQUIRE_AUTH` is set?
// Let's follow the `items` pattern in `index.ts` but applying it at router level is cleaner if we can.
// Actually, let's just use `authenticateToken` on all routes if the user wants "same as other routes" and usually apps protect features.
// However, I suspect they mean "Same as Items" or "Same as Favorites".
// Let's look at `index.ts` again. `items` logic:
/*
  if (process.env.REQUIRE_AUTH === "true") {
    await authenticateToken(req, res, next);
  } else {
    next();
  }
*/
// I will implement similar logic here for GET, but STRICT logic for POST (Sync).
// Actually, `authenticateToken` does not enforce admin. I need to check admin inside.

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

export default router;
