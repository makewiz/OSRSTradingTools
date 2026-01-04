import cron from "node-cron";
import { getCombinedItems } from "./osrsClient";
import { insertBuyPrice, insertSellPrice, insertVolume, pool } from "./database";

let isRunning = false;

/**
 * Fetch and store current prices in the database
 */
async function fetchAndStorePrices(): Promise<void> {
  if (isRunning) {
    // eslint-disable-next-line no-console
    console.log("[Scheduler] Previous fetch still running, skipping...");
    return;
  }

  isRunning = true;
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  try {
    // eslint-disable-next-line no-console
    console.log(`[Scheduler] Fetching prices at ${new Date().toISOString()}...`);

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

    // eslint-disable-next-line no-console
    console.log(`[Scheduler] Stored ${items.length} item prices successfully`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Scheduler] Error fetching/storing prices:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Run data retention and downsampling policies
 * 1. Downsample data > 24h to hourly resolution
 * 2. Delete data > 1 year
 */
async function runRetentionPolicy(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[Scheduler] Running retention policy...");
  const client = await pool.connect();
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;
    const oneYearAgo = now - 365 * 24 * 60 * 60;

    // 1. Downsample Prices > 24h: Keep only the latest price per hour
    // Delete rows where timestamp is NOT the max timestamp of that hour
    const downsamplePricesQuery = (table: string) => `
      DELETE FROM ${table} t1
      WHERE timestamp < $1
      AND timestamp NOT IN (
        SELECT MAX(timestamp)
        FROM ${table}
        WHERE timestamp < $1
        GROUP BY item_id, FLOOR(timestamp / 3600)
      )
    `;

    await client.query(downsamplePricesQuery('item_buy_prices'), [oneDayAgo]);
    await client.query(downsamplePricesQuery('item_sell_prices'), [oneDayAgo]);

    // 2. Downsample Volumes > 24h: Sum volumes per hour, save at :00, delete others
    // Step A: Upsert aggregated hourly volumes
    // Note: We use (timestamp / 3600) * 3600 to floor to hour
    await client.query(`
      INSERT INTO item_volumes (item_id, timestamp, buy_volume, sell_volume)
      SELECT 
        item_id, 
        CAST(FLOOR(timestamp / 3600) * 3600 AS BIGINT) as hour_ts, 
        SUM(buy_volume), 
        SUM(sell_volume)
      FROM item_volumes
      WHERE timestamp < $1
      GROUP BY item_id, hour_ts
      ON CONFLICT (item_id, timestamp) DO UPDATE SET
        buy_volume = EXCLUDED.buy_volume,
        sell_volume = EXCLUDED.sell_volume
    `, [oneDayAgo]);

    // Step B: Delete non-hourly rows older than 24h
    await client.query(`
      DELETE FROM item_volumes 
      WHERE timestamp < $1 
      AND timestamp % 3600 != 0
    `, [oneDayAgo]);

    // 3. Prune Data > 1 Year
    await client.query("DELETE FROM item_buy_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_sell_prices WHERE timestamp < $1", [oneYearAgo]);
    await client.query("DELETE FROM item_volumes WHERE timestamp < $1", [oneYearAgo]);

    // eslint-disable-next-line no-console
    console.log("[Scheduler] Retention policy completed.");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Scheduler] Retention policy failed:", err);
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
    // eslint-disable-next-line no-console
    console.error("[Scheduler] Initial fetch failed:", err);
  });

  // Run every minute
  cron.schedule("* * * * *", () => {
    fetchAndStorePrices().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Scheduler] Scheduled fetch failed:", err);
    });
  });

  // Schedule retention policy to run once every hour
  cron.schedule("0 * * * *", () => {
    runRetentionPolicy().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Scheduler] Scheduled retention policy failed:", err);
    });
  });

  // eslint-disable-next-line no-console
  console.log("[Scheduler] Price fetcher started (runs every minute)");
  // eslint-disable-next-line no-console
  console.log("[Scheduler] Retention policy started (runs every hour)");
}
