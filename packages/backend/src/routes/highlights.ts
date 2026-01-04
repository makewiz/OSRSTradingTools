
import { Router } from "express";
import { AnalysisService } from "../analysis";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const analysis = await AnalysisService.getAnalysis();
        res.json(analysis);
    } catch (error) {
        console.error("Error fetching analysis:", error);
        res.status(500).json({ error: "Failed to fetch market analysis" });
    }
});

export default router;
