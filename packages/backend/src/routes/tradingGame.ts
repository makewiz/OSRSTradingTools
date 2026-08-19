import express from "express";
import { z } from "zod";
import { authenticateToken } from "../auth";
import { TradingGameEngine } from "../services/tradingGameEngine";
import { get4HourBoughtQuantity } from "../database";
import { getCombinedItems } from "../osrsClient";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

// Authenticate all routes
router.use(authenticateToken);

const createOfferSchema = z.object({
  slot: z.number().int().min(0).max(7),
  itemId: z.number().int().positive(),
  type: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive(),
  price: z.number().int().positive(),
  agentId: z.number().int().optional()
});

/**
 * GET /api/game/account
 * Get trading game account state for current user or optional agent
 */
router.get("/account", async (req, res) => {
  try {
    const userId = req.user!.id;
    const agentIdParam = req.query.agentId ? parseInt(req.query.agentId as string, 10) : null;

    const gameState = await TradingGameEngine.getGameState(
      agentIdParam ? null : userId,
      agentIdParam
    );

    res.json(gameState);
  } catch (err: any) {
    logger.error("Error fetching game state:", err);
    res.status(500).json({ error: err.message || "Failed to fetch game state" });
  }
});

/**
 * POST /api/game/offers
 * Create buy or sell offer in GE slot (0-7)
 */
router.post("/offers", async (req, res) => {
  try {
    const userId = req.user!.id;
    const parseResult = createOfferSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.issues[0].message });
    }

    const { slot, itemId, type, quantity, price, agentId } = parseResult.data;

    const offer = await TradingGameEngine.createOffer(
      agentId ? null : userId,
      agentId || null,
      slot,
      itemId,
      type,
      quantity,
      price
    );

    res.status(201).json({ offer, message: "Offer placed successfully." });
  } catch (err: any) {
    logger.error("Error creating game offer:", err);
    res.status(400).json({ error: err.message || "Failed to create offer" });
  }
});

/**
 * POST /api/game/offers/:id/cancel
 * Cancel active GE offer
 */
router.post("/offers/:id/cancel", async (req, res) => {
  try {
    const userId = req.user!.id;
    const offerId = parseInt(req.params.id, 10);
    const agentIdParam = req.body.agentId ? parseInt(req.body.agentId, 10) : null;

    if (isNaN(offerId)) {
      return res.status(400).json({ error: "Invalid offer ID" });
    }

    const offer = await TradingGameEngine.cancelOffer(
      agentIdParam ? null : userId,
      agentIdParam,
      offerId
    );

    res.json({ offer, message: "Offer cancelled." });
  } catch (err: any) {
    logger.error("Error cancelling offer:", err);
    res.status(400).json({ error: err.message || "Failed to cancel offer" });
  }
});

/**
 * POST /api/game/offers/:id/collect
 * Collect GP or items from completed/filled GE offer
 */
router.post("/offers/:id/collect", async (req, res) => {
  try {
    const userId = req.user!.id;
    const offerId = parseInt(req.params.id, 10);
    const agentIdParam = req.body.agentId ? parseInt(req.body.agentId, 10) : null;

    if (isNaN(offerId)) {
      return res.status(400).json({ error: "Invalid offer ID" });
    }

    const offer = await TradingGameEngine.collectSlot(
      agentIdParam ? null : userId,
      agentIdParam,
      offerId
    );

    res.json({ offer, message: "Slot collected." });
  } catch (err: any) {
    logger.error("Error collecting slot:", err);
    res.status(400).json({ error: err.message || "Failed to collect slot" });
  }
});

/**
 * GET /api/game/leaderboard
 * Fetch trading game leaderboards
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const type = (req.query.type as 'current' | 'last_month' | 'all_time') || 'current';
    const leaderboard = await TradingGameEngine.getLeaderboard(type);
    res.json({ leaderboard });
  } catch (err: any) {
    logger.error("Error fetching leaderboard:", err);
    res.status(500).json({ error: err.message || "Failed to fetch leaderboard" });
  }
});

/**
 * GET /api/game/limits/:itemId
 * Fetch 4-hour buy limit status for an item
 */
router.get("/limits/:itemId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const itemId = parseInt(req.params.itemId, 10);
    const agentIdParam = req.query.agentId ? parseInt(req.query.agentId as string, 10) : null;

    if (isNaN(itemId)) return res.status(400).json({ error: "Invalid item ID" });

    const state = await TradingGameEngine.getGameState(agentIdParam ? null : userId, agentIdParam);
    const items = await getCombinedItems();
    const item = items.find(i => i.id === itemId);

    const bought4h = await get4HourBoughtQuantity(state.account.id, itemId);
    const itemLimit = item?.limit || 10000;
    const remainingLimit = Math.max(0, itemLimit - bought4h);

    res.json({
      itemId,
      itemName: item?.name || "Unknown Item",
      boughtInLast4Hours: bought4h,
      buyLimit: itemLimit,
      remainingLimit
    });
  } catch (err: any) {
    logger.error("Error fetching item limits:", err);
    res.status(500).json({ error: err.message || "Failed to fetch limits" });
  }
});

export default router;
