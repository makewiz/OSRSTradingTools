import express from "express";
import { z } from "zod";
import { authenticateToken } from "../auth";
import {
    addPortfolioItem,
    getUserPortfolio,
    getPortfolioItemById,
    updatePortfolioItem,
    deletePortfolioItem,
    addAgentTrigger,
    getDiscordUserByUserId
} from "../database";
import { getLatestItems } from "../scheduler";
import { CombinedItem } from "../osrsClient";
import { calculateTax } from "../tax";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();
router.use(authenticateToken);

const createPortfolioSchema = z.object({
    itemId: z.number().int().positive(),
    itemName: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    buyPrice: z.number().int().positive(),
    targetSellPrice: z.number().int().positive().optional(),
    stopLossPrice: z.number().int().positive().optional(),
    agentId: z.number().int().positive().optional(),
    notes: z.string().optional()
});

const updatePortfolioSchema = z.object({
    quantity: z.number().int().positive().optional(),
    buyPrice: z.number().int().positive().optional(),
    targetSellPrice: z.number().int().positive().optional(),
    stopLossPrice: z.number().int().positive().nullable().optional(),
    status: z.enum(['buying', 'holding', 'selling', 'completed', 'cancelled']).optional(),
    notes: z.string().nullable().optional()
});

/**
 * GET /api/portfolio
 * List active portfolio items enriched with live GE prices & tax-adjusted PnL
 */
router.get("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const portfolio = await getUserPortfolio(userId);
        const latestItems = await getLatestItems();
        const itemMap = new Map(latestItems.map((i: CombinedItem) => [i.id, i]));

        const enriched = portfolio.map(pos => {
            const geItem = itemMap.get(pos.item_id);
            const currentBuyPrice = geItem?.buyPrice ?? geItem?.sellPrice ?? null;
            const currentSellPrice = geItem?.sellPrice ?? null;

            // Calculate profit after OSRS GE tax on sell (2% rate, 5M max cap, <50gp threshold, exempt items)
            let taxPerItem = 0;
            let currentProfitPerItem = 0;
            let currentRoi = 0;
            if (currentBuyPrice && pos.buy_price) {
                taxPerItem = calculateTax(currentBuyPrice, pos.item_name);
                const netSell = currentBuyPrice - taxPerItem;
                currentProfitPerItem = netSell - pos.buy_price;
                currentRoi = (currentProfitPerItem / pos.buy_price) * 100;
            }

            const totalNetWorth = currentBuyPrice ? (currentBuyPrice * pos.quantity) : (pos.buy_price * pos.quantity);
            const totalCurrentProfit = currentProfitPerItem * pos.quantity;

            return {
                ...pos,
                currentBuyPrice,
                currentSellPrice,
                taxPerItem,
                currentProfitPerItem,
                totalNetWorth,
                totalCurrentProfit,
                currentRoi,
                iconUrl: geItem?.iconUrl
            };
        });

        res.json({ portfolio: enriched });
    } catch (err: any) {
        logger.error("Error fetching user portfolio:", err);
        res.status(500).json({ error: "Failed to fetch portfolio" });
    }
});

/**
 * POST /api/portfolio
 * Add item to portfolio & automatically register sell watch trigger
 */
router.post("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const parseResult = createPortfolioSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.issues[0].message });
        }

        const { itemId, itemName, quantity, buyPrice, targetSellPrice, stopLossPrice, agentId, notes } = parseResult.data;

        const item = await addPortfolioItem(
            userId,
            itemId,
            itemName,
            quantity,
            buyPrice,
            targetSellPrice,
            agentId,
            notes,
            stopLossPrice
        );

        // Auto-create a sell price trigger if agentId is linked
        if (agentId) {
            try {
                await addAgentTrigger(
                    agentId,
                    itemId,
                    itemName,
                    "sell_price_above",
                    targetSellPrice || buyPrice,
                    600 // 10 min cooldown
                );
            } catch (trigErr) {
                logger.error(`Failed to auto-create sell trigger for agent ${agentId}:`, trigErr);
            }
        }

        res.status(201).json({ item, message: "Added item to portfolio and set sell watch trigger." });
    } catch (err: any) {
        logger.error("Error adding portfolio item:", err);
        res.status(500).json({ error: "Failed to add portfolio item" });
    }
});

/**
 * PUT /api/portfolio/:id
 * Update portfolio item status or pricing targets
 */
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user!.id;
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const parseResult = updatePortfolioSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.issues[0].message });
        }

        const updated = await updatePortfolioItem(id, userId, parseResult.data as any);
        if (!updated) {
            return res.status(404).json({ error: "Portfolio position not found or unauthorized" });
        }

        res.json({ item: updated, message: "Portfolio position updated." });
    } catch (err: any) {
        logger.error(`Error updating portfolio item ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to update portfolio position" });
    }
});

/**
 * DELETE /api/portfolio/:id
 * Delete portfolio position
 */
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user!.id;
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const deleted = await deletePortfolioItem(id, userId);
        if (!deleted) {
            return res.status(404).json({ error: "Portfolio position not found or unauthorized" });
        }

        res.json({ success: true, message: "Position removed from portfolio." });
    } catch (err: any) {
        logger.error(`Error deleting portfolio item ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to delete portfolio position" });
    }
});

export default router;
