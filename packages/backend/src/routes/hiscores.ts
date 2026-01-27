import { Router } from "express";
import { hiscoreService } from "../services/hiscoreService";
import { logger } from "@osrstradingtools/shared";

const router = Router();

// GET /api/hiscores/:username
router.get("/:username", async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) {
            return res.status(400).json({ error: "Username required" });
        }

        const skills = await hiscoreService.fetchUserStats(username);
        res.json({ skills });
    } catch (err: any) {
        if (err.message === "Player not found") {
            return res.status(404).json({ error: "Player not found" });
        }
        logger.error("Failed to fetch hiscores", err);
        res.status(500).json({ error: "Failed to fetch player stats" });
    }
});

export default router;
