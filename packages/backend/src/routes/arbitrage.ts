import { Router } from 'express';
import { ArbitrageService } from '../services/arbitrageService';
import { ItemService } from '../services/itemService';

export const createArbitrageRouter = (itemService: ItemService) => {

    const router = Router();
    const arbitrageService = new ArbitrageService(itemService);

    // Simple in-memory cache to avoid re-calculating on every request
    // Since prices update every min, a 1-min cache is fine.
    let setsCache: { data: any, timestamp: number } | null = null;
    let decantCache: { data: any, timestamp: number } | null = null;
    const CACHE_TTL = 60 * 1000; // 1 minute

    router.get('/sets', async (req, res) => {
        try {
            if (setsCache && (Date.now() - setsCache.timestamp < CACHE_TTL)) {
                return res.json(setsCache.data);
            }

            const results = await arbitrageService.getSetArbitrage();
            setsCache = { data: results, timestamp: Date.now() };
            res.json(results);
        } catch (error) {
            console.error('Error calculating set arbitrage:', error);
            res.status(500).json({ error: 'Failed to calculate set arbitrage' });
        }
    });

    router.get('/decanting', async (req, res) => {
        try {
            if (decantCache && (Date.now() - decantCache.timestamp < CACHE_TTL)) {
                return res.json(decantCache.data);
            }

            const results = await arbitrageService.getDecantProfit();
            decantCache = { data: results, timestamp: Date.now() };
            res.json(results);
        } catch (error) {
            console.error('Error calculating decanting profit:', error);
            res.status(500).json({ error: 'Failed to calculate decanting profit' });
        }
    });

    return router;
};
