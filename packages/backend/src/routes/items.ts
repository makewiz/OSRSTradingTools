import express from "express";
import { getCombinedItems } from "../osrsClient";
import { getLatestItems, touchActivity, getLastFetchTime } from "../scheduler";
import { getPriceHistory, getLatestPrice } from "../database";
import { generateForecast } from "../prediction";
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

    touchActivity();

    let items = getLatestItems();
    if (!items || items.length === 0 || Date.now() - getLastFetchTime() > 120000) {
      items = await getCombinedItems();
    }
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

/**
 * Get price forecast for an item
 * GET /:id/forecast?lookback=86400
 */
router.get("/:id/forecast", async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const now = Math.floor(Date.now() / 1000);
    // Default to analyzing last 24h
    const lookback = req.query.lookback ? parseInt(req.query.lookback as string, 10) : 24 * 60 * 60;
    const startTime = now - lookback;

    // Fetch history to base the forecast on
    const history = await getPriceHistory(itemId, startTime, now);

    // Prepare data points for regression
    // We separate buy and sell streams to detect spread trends

    const buyPoints: { x: number, y: number }[] = [];
    const sellPoints: { x: number, y: number }[] = [];

    // Flatten history into simple points
    history.buy.forEach(p => {
      if (p.price) buyPoints.push({ x: p.timestamp, y: p.price });
    });
    // Sort buyPoints by time
    buyPoints.sort((a, b) => a.x - b.x);

    history.sell.forEach(p => {
      if (p.price) sellPoints.push({ x: p.timestamp, y: p.price });
    });
    // Sort sellPoints by time
    sellPoints.sort((a, b) => a.x - b.x);

    const buyForecast = generateForecast(buyPoints);
    const sellForecast = generateForecast(sellPoints);

    res.json({
      itemId,
      forecast: {
        buy: buyForecast,
        sell: sellForecast
      }
    });

  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "Failed to generate forecast" });
  }
});

export default router;



