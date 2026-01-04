import express from "express";
import { getCombinedItems } from "../osrsClient";
import { getPriceHistory, getLatestPrice } from "../database";
import { authenticateToken } from "../auth";

const router = express.Router();
if (process.env.REQUIRE_AUTH === "true") {
  router.use(authenticateToken);
}

/**
 * Get single item details
 */
router.get("/:id", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const items = await getCombinedItems();
    const item = items.find((i) => i.id === itemId);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ item });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(502).json({ error: "Failed to fetch item details" });
  }
});

/**
 * Get price history for an item
 * Query params:
 * - startTime: Unix timestamp (seconds) - defaults to 7 days ago
 * - endTime: Unix timestamp (seconds) - defaults to now
 * - granularity: 'minute' | 'hour' | 'day' - defaults to 'hour'
 */
router.get("/:id/history", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;

    const startTime = req.query.startTime
      ? parseInt(req.query.startTime as string, 10)
      : sevenDaysAgo;
    const endTime = req.query.endTime
      ? parseInt(req.query.endTime as string, 10)
      : now;
    const granularity = (req.query.granularity as "minute" | "hour" | "day") || "hour";

    if (isNaN(startTime) || isNaN(endTime)) {
      return res.status(400).json({ error: "Invalid timestamp" });
    }

    const history = await getPriceHistory(itemId, startTime, endTime);

    // Frontend expects { buy: [], sell: [], volume: [] }
    // Or if it expects legacy array, I need to map it?
    // User said "Everything should use the new tables".
    // Frontend updated to handle "HighFidelityData" if fidelity=high.
    // I should now make "fidelity=high" the standard response structure everywhere.
    // So I return the split structure.

    res.json({
      itemId,
      highFidelity: true, // Signal to frontend
      buy: history.buy,
      sell: history.sell,
      volume: history.volume
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(502).json({ error: "Failed to fetch price history" });
  }
});

export default router;



