import cron from "node-cron";
import { getCombinedItems, CombinedItem } from "./osrsClient";
import { insertBuyPrice, insertSellPrice, insertVolume, pool } from "./database";
import { logger } from "@osrstradingtools/shared";

let isRunning = false;
let latestItemsCache: CombinedItem[] = [];

/**
 * Get the latest cached items
 */
export function getLatestItems(): CombinedItem[] {
  return latestItemsCache;
}

/**
 * Fetch and store current prices in the database
 */
async function fetchAndStorePrices(): Promise<void> {
  if (isRunning) {
    logger.debug("[Scheduler] Previous fetch still running, skipping...");
    return;
  }

  isRunning = true;

  try {
    logger.debug(`[Scheduler] Fetching prices...`);

    const items = await getCombinedItems();
    latestItemsCache = items;

    // Store each item's price and volume data
    for (const item of items) {
      const promises = [];

      // 1. High Fidelity Buy Price
      if (item.lastBuyTime && item.buyPrice !== null) {
        promises.push(insertBuyPrice(item.id, item.lastBuyTime, item.buyPrice));
      }

      // 2. High Fidelity Sell Price
      if (item.lastSellTime && item.sellPrice !== null) {
        promises.push(insertSellPrice(item.id, item.lastSellTime, item.sellPrice));
      }

      // 3. High Fidelity Volume (using the 5m timestamp)
      if (item.fiveMinTimestamp) {
        // Only insert if we have actual volume data
        if (item.lastBuyVolume !== null || item.lastSellVolume !== null) {
          promises.push(insertVolume(
            item.id,
            item.fiveMinTimestamp,
            item.lastBuyVolume,
            item.lastSellVolume
          ));
        }
      }

      await Promise.all(promises);
    }

    logger.debug(`[Scheduler] Stored ${items.length} item prices successfully`);
  } catch (error) {
    logger.error("[Scheduler] Error fetching/storing prices:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Run data retention and downsampling policies
 * 1. Downsample data > 24h to hourly resolution
 * 2. Delete data > 1 year
 */
export async function runRetentionPolicy(): Promise<void> {
  logger.info("[Scheduler] Running retention policy...");
  const client = await pool.connect();
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const oneYearAgo = now - 365 * 24 * 60 * 60;

    // Helper: Downsample prices (keep max timestamp per interval)
    // OPTIMIZED: Uses DELETE ... USING for better performance on large sets
    const processPriceRetention = async (table: string, endTs: number, startTs: number, interval: number) => {
      await client.query(`
        DELETE FROM ${table} p
        USING (
          SELECT item_id, MAX(timestamp) AS keep_ts
          FROM ${table}
          WHERE timestamp < $1 AND timestamp >= $2
          GROUP BY item_id, FLOOR(timestamp / $3)
        ) k
        WHERE p.item_id = k.item_id
        AND FLOOR(p.timestamp / $3) = FLOOR(k.keep_ts / $3)
        AND p.timestamp <> k.keep_ts
      `, [endTs, startTs, interval]);
    };

    // Helper: Downsample volumes (sum volumes per interval)
    // OPTIMIZED: Only updates rows if values actually changed
    const processVolumeRetention = async (endTs: number, startTs: number, interval: number) => {
      // 1. Upsert aggregated volumes
      await client.query(`
        INSERT INTO item_volumes (item_id, timestamp, buy_volume, sell_volume)
        SELECT 
          item_id, 
          CAST(FLOOR(timestamp / $3) * $3 AS BIGINT) as bucket_ts, 
          SUM(buy_volume), 
          SUM(sell_volume)
        FROM item_volumes
        WHERE timestamp < $1 AND timestamp >= $2
        GROUP BY item_id, bucket_ts
        ON CONFLICT (item_id, timestamp) DO UPDATE SET
          buy_volume = EXCLUDED.buy_volume,
          sell_volume = EXCLUDED.sell_volume
        WHERE item_volumes.buy_volume IS DISTINCT FROM EXCLUDED.buy_volume
           OR item_volumes.sell_volume IS DISTINCT FROM EXCLUDED.sell_volume
      `, [endTs, startTs, interval]);

      // 2. Delete non-aligned timestamps in this range
      await client.query(`
        DELETE FROM item_volumes 
        WHERE timestamp < $1 AND timestamp >= $2
        AND timestamp % $3 != 0
      `, [endTs, startTs, interval]);
    };

    // 1. Delete Data > 1 Year (Hard delete, no downsampling)
    await client.query("DELETE FROM item_buy_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_sell_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_volumes WHERE timestamp < $1", [oneYearAgo]);

    // Optimization: Define a "processing window" for historical tiers.
    // Instead of scanning the full historical range every hour (which re-processes static data),
    // we only scan the "entry" zone where data moves from one tier to another.
    // 2 days (172800s) is a safe overlap to catch any data transition.

    const TWO_DAYS = 2 * 24 * 60 * 60;

    // 2. Tier: 30 days to 1 year -> 24h resolution (86400s)
    // Scan window: [30 days ago - 2 days, 30 days ago)
    const tier2Start = thirtyDaysAgo - TWO_DAYS;
    await processPriceRetention('item_buy_prices', thirtyDaysAgo, tier2Start, 86400);
    await processPriceRetention('item_sell_prices', thirtyDaysAgo, tier2Start, 86400);
    await processVolumeRetention(thirtyDaysAgo, tier2Start, 86400);

    // 3. Tier: 7 days to 30 days -> 6h resolution (21600s)
    // Scan window: [7 days ago - 2 days, 7 days ago)
    const tier3Start = sevenDaysAgo - TWO_DAYS;
    await processPriceRetention('item_buy_prices', sevenDaysAgo, tier3Start, 21600);
    await processPriceRetention('item_sell_prices', sevenDaysAgo, tier3Start, 21600);
    await processVolumeRetention(sevenDaysAgo, tier3Start, 21600);

    // 4. Tier: 24 hours to 7 days -> 1h resolution (3600s)
    // Scan window: [1 day ago - 2 days, 1 day ago)
    const tier4Start = oneDayAgo - TWO_DAYS;
    await processPriceRetention('item_buy_prices', oneDayAgo, tier4Start, 3600);
    await processPriceRetention('item_sell_prices', oneDayAgo, tier4Start, 3600);
    await processVolumeRetention(oneDayAgo, tier4Start, 3600);

    // 5. Tier: < 24 hours -> 5m resolution (300s)
    // This is the active tier, keep scanning full last 24h to ensure consistency.
    await processPriceRetention('item_buy_prices', now, oneDayAgo, 300);
    await processPriceRetention('item_sell_prices', now, oneDayAgo, 300);

    logger.info("[Scheduler] Retention policy completed.");
  } catch (err) {
    logger.error("[Scheduler] Retention policy failed:", err);
  } finally {
    client.release();
  }
}

/**
 * Start the scheduled price fetcher (runs every minute)
 */
export function startPriceScheduler(): void {
  // Run immediately on startup
  fetchAndStorePrices().catch((err) => {
    logger.error("[Scheduler] Initial fetch failed:", err);
  });

  // Run every minute
  cron.schedule("* * * * *", () => {
    fetchAndStorePrices().catch((err) => {
      logger.error("[Scheduler] Scheduled fetch failed:", err);
    });
  });

  // Schedule retention policy to run once every hour
  cron.schedule("0 * * * *", () => {
    runRetentionPolicy().catch((err) => {
      logger.error("[Scheduler] Scheduled retention policy failed:", err);
    });
  });

  // Run retention policy immediately on startup
  runRetentionPolicy().catch((err) => {
    logger.error("[Scheduler] Initial retention policy failed:", err);
  });

  logger.info("[Scheduler] Price fetcher started (runs every minute)");
  logger.info("[Scheduler] Retention policy started (runs every hour)");
}

