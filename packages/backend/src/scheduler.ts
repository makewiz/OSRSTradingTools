import cron from "node-cron";
import { getCombinedItems } from "./osrsClient";
import { insertBuyPrice, insertSellPrice, insertVolume, pool } from "./database";
import { logger } from "@osrstradingtools/shared";

let isRunning = false;

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
    const processPriceRetention = async (table: string, endTs: number, startTs: number, interval: number) => {
      // Delete rows in range [startTs, endTs) that are NOT the max timestamp in their bucket
      await client.query(`
        DELETE FROM ${table}
        WHERE timestamp < $1 AND timestamp >= $2
        AND (item_id, timestamp) NOT IN (
          SELECT item_id, MAX(timestamp)
          FROM ${table}
          WHERE timestamp < $1 AND timestamp >= $2
          GROUP BY item_id, FLOOR(timestamp / $3)
        )
      `, [endTs, startTs, interval]);
    };

    // Helper: Downsample volumes (sum volumes per interval)
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
      `, [endTs, startTs, interval]);

      // 2. Delete non-aligned timestamps in this range
      await client.query(`
        DELETE FROM item_volumes 
        WHERE timestamp < $1 AND timestamp >= $2
        AND timestamp % $3 != 0
      `, [endTs, startTs, interval]);
    };

    // 1. Delete Data > 1 Year
    await client.query("DELETE FROM item_buy_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_sell_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_volumes WHERE timestamp < $1", [oneYearAgo]);

    // 2. Tier: 30 days to 1 year -> 24h resolution (86400s)
    await processPriceRetention('item_buy_prices', thirtyDaysAgo, oneYearAgo, 86400);
    await processPriceRetention('item_sell_prices', thirtyDaysAgo, oneYearAgo, 86400);
    await processVolumeRetention(thirtyDaysAgo, oneYearAgo, 86400);

    // 3. Tier: 7 days to 30 days -> 6h resolution (21600s)
    await processPriceRetention('item_buy_prices', sevenDaysAgo, thirtyDaysAgo, 21600);
    await processPriceRetention('item_sell_prices', sevenDaysAgo, thirtyDaysAgo, 21600);
    await processVolumeRetention(sevenDaysAgo, thirtyDaysAgo, 21600);

    // 4. Tier: 24 hours to 7 days -> 1h resolution (3600s)
    await processPriceRetention('item_buy_prices', oneDayAgo, sevenDaysAgo, 3600);
    await processPriceRetention('item_sell_prices', oneDayAgo, sevenDaysAgo, 3600);
    await processVolumeRetention(oneDayAgo, sevenDaysAgo, 3600);

    // 5. Tier: < 24 hours -> 5m resolution (300s)
    // Only for prices. Volumes are naturally 5m resolution.
    // Note: We scan from 'now' back to 'oneDayAgo'
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

