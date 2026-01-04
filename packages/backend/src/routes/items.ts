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

    const history = await getPriceHistory(itemId, startTime, endTime, granularity);

    res.json({
      itemId,
      history: history.map((h) => ({
        timestamp: h.timestamp,
        buyPrice: h.buy_price,
        sellPrice: h.sell_price,
        volume: h.volume
      }))
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(502).json({ error: "Failed to fetch price history" });
  }
});

export default router;



