
import { Router } from "express";
import { AnalysisService } from "../analysis";
import { authenticateToken } from "../auth";
import { logger } from "@osrstradingtools/shared";

const router = Router();

// Protect all routes in this router
if (process.env.REQUIRE_AUTH === "true") {
    router.use(authenticateToken);
}

router.get("/", async (req, res) => {
    try {
        const analysis = await AnalysisService.getAnalysis();
        res.json(analysis);
    } catch (error) {
        logger.error("Error fetching analysis:", error);
        res.status(500).json({ error: "Failed to fetch market analysis" });
    }
});

export default router;
