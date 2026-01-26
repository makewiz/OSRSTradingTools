import cron from "node-cron";
import { getCombinedItems, CombinedItem, get5m, Osrs5mItem } from "./osrsClient";
import { insertItemHistory, bulkInsertItemHistory, pool } from "./database";
import { maintainPartitions } from "./db/partitions";
import { logger } from "@osrstradingtools/shared";

let isRunningLatest = false;
let isRunningHistory = false;
let latestItemsCache: CombinedItem[] = [];

// Activity Tracking
let lastActivityTimestamp = Date.now();
let lastFetchTimestamp = 0;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function touchActivity() {
  lastActivityTimestamp = Date.now();
}

export function isSystemActive(): boolean {
  return Date.now() - lastActivityTimestamp < INACTIVITY_TIMEOUT_MS;
}

export function getLastFetchTime(): number {
  return lastFetchTimestamp;
}

/**
 * Get the latest cached items
 */
export function getLatestItems(): CombinedItem[] {
  return latestItemsCache;
}

/**
 * Fetch and store 5m history (Always runs)
 */
async function fetchHistoryJob(): Promise<void> {
  if (isRunningHistory) return;
  isRunningHistory = true;

  try {
    logger.debug(`[Scheduler] Fetching specific 5m prices for history...`);
    const response = await get5m();
    const data = response.data;
    const timestamp = response.timestamp;

    if (!timestamp) {
      logger.warn("[Scheduler] 5m data missing timestamp, skipping history insert.");
      return;
    }

    // Prepare items for bulk insert
    const historyPoints = [];
    for (const [idStr, itemVal] of Object.entries(data)) {
      const item = itemVal as Osrs5mItem;
      const itemId = parseInt(idStr, 10);
      if (
        item.avgHighPrice !== null ||
        item.avgLowPrice !== null ||
        item.highPriceVolume !== null ||
        item.lowPriceVolume !== null
      ) {
        historyPoints.push({
          itemId,
          timestamp,
          avgHighPrice: item.avgHighPrice,
          avgLowPrice: item.avgLowPrice,
          highPriceVolume: item.highPriceVolume,
          lowPriceVolume: item.lowPriceVolume
        });
      }
    }

    if (historyPoints.length > 0) {
      // Split into chunks of 1000
      const chunkSize = 1000;
      for (let i = 0; i < historyPoints.length; i += chunkSize) {
        await bulkInsertItemHistory("item_history_5m", historyPoints.slice(i, i + chunkSize));
      }
      logger.debug(`[Scheduler] Stored ${historyPoints.length} item prices (5m resolution)`);
    }
  } catch (error) {
    logger.error("[Scheduler] Error in history job:", error);
  } finally {
    isRunningHistory = false;
  }
}

/**
 * Fetch latest prices (Runs only if active)
 */
async function fetchLatestJob(): Promise<void> {
  if (isRunningLatest) return;

  // Check activity
  if (!isSystemActive()) {
    // We do not log this every minute to avoid spam, but we skip fetching
    return;
  }

  isRunningLatest = true;
  try {
    const items = await getCombinedItems();
    latestItemsCache = items;
    lastFetchTimestamp = Date.now();
    // logger.debug(`[Scheduler] Updated latest items cache (${items.length} items)`);
  } catch (error) {
    logger.error("[Scheduler] Error in latest fetch job:", error);
  } finally {
    isRunningLatest = false;
  }
}

/**
 * Run data retention and downsampling policies
 * Downsample: 5m -> 1h -> 6h -> 24h
 */
export async function runRetentionPolicy(): Promise<void> {
  logger.info("[Scheduler] Running retention policy...");
  const client = await pool.connect();
  try {
    const now = Math.floor(Date.now() / 1000);
    const oneHour = 3600;
    const sixHours = 6 * 3600;
    const twentyFourHours = 24 * 3600;

    // Get configured retention limit (default to high number if not set)
    const maxRetentionDays = process.env.DATA_RETENTION_DAYS
      ? parseInt(process.env.DATA_RETENTION_DAYS, 10)
      : 3650; // Default 10 years (effectively unlimited relative to our logic)

    logger.debug(`[Scheduler] Enforcing max retention days: ${maxRetentionDays}`);

    const maxRetentionSeconds = maxRetentionDays * 24 * 3600;

    /**
     * Helper to downsample from Source Table -> Target Table
     * Aggregation:
     * - Prices: Average of non-null values
     * - Volumes: Sum
     */
    const downsample = async (
      sourceTable: string,
      targetTable: string,
      targetResolution: number,
      startTime: number,
      endTime: number
    ) => {
      // Upsert aggregated data
      await client.query(`
        INSERT INTO ${targetTable} (item_id, timestamp, avg_high_price, avg_low_price, high_price_volume, low_price_volume)
        SELECT 
          item_id,
          CAST(FLOOR(timestamp / $3) * $3 AS BIGINT) as bucket_ts,
          CAST(AVG(avg_high_price) AS INTEGER) as avg_high,
          CAST(AVG(avg_low_price) AS INTEGER) as avg_low,
          SUM(high_price_volume) as sum_high_vol,
          SUM(low_price_volume) as sum_low_vol
        FROM ${sourceTable}
        WHERE timestamp >= $1 AND timestamp < $2
        GROUP BY item_id, bucket_ts
        ON CONFLICT (item_id, timestamp) DO UPDATE SET
          avg_high_price = EXCLUDED.avg_high_price,
          avg_low_price = EXCLUDED.avg_low_price,
          high_price_volume = EXCLUDED.high_price_volume,
          low_price_volume = EXCLUDED.low_price_volume
      `, [startTime, endTime, targetResolution]);
    };

    // Optimization: Overlap windows to ensure boundary conditions are handled.
    // We process "finished" buckets.
    // E.g. for 1h resolution, we process data older than 1h (so the bucket is potentially complete).

    // 1. Downsample 5m -> 1h (Always run unless max retention is extremely low)
    // Range: [2 hours ago, 1 hour ago) - process the hour that just finished (+ overlap)
    // Actually, let's process the last 24h to be safe and ensure updates? 
    // Or just process "since last run"? Scheduler runs hourly.
    // Let's re-process the last 4 hours to be safe against downtime/delays.
    await downsample('item_history_5m', 'item_history_1h', oneHour, now - 4 * oneHour, now);

    // 2. Downsample 1h -> 6h
    // Only if we are keeping data longer than 1 week (approx 7 days)
    // If strict 7 day retention, we don't need 6h data (or it will be deleted immediately).
    // Let's safe guard it: if maxRetentionDays <= 7, skip.
    if (maxRetentionDays > 7) {
      // Process last 24h
      await downsample('item_history_1h', 'item_history_6h', sixHours, now - 24 * oneHour, now);
    }

    // 3. Downsample 6h -> 24h
    // Only if we are keeping data longer than 30 days
    if (maxRetentionDays > 30) {
      // Process last 3 days
      await downsample('item_history_6h', 'item_history_24h', twentyFourHours, now - 3 * 24 * oneHour, now);
    }

    // 4. Maintain Partitions (Create future, drop old)
    // Pass the min(default_retention, maxRetentionSeconds)

    // 5m: 24h retention default
    const retention5m = Math.min(24 * 3600, maxRetentionSeconds);
    await maintainPartitions(pool, 'item_history_5m', retention5m, 24 * 3600);

    // 1h: 7d retention default
    const retention1h = Math.min(7 * 24 * 3600, maxRetentionSeconds);
    await maintainPartitions(pool, 'item_history_1h', retention1h, 24 * 3600);

    // 6h: 30d retention default
    const retention6h = Math.min(30 * 24 * 3600, maxRetentionSeconds);
    await maintainPartitions(pool, 'item_history_6h', retention6h, 7 * 24 * 3600);

    // 24h: 365d retention default
    const retention24h = Math.min(365 * 24 * 3600, maxRetentionSeconds);
    await maintainPartitions(pool, 'item_history_24h', retention24h, 30 * 24 * 3600);

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
  // Initial run
  fetchHistoryJob().catch(err => logger.error(err));
  fetchLatestJob().catch(err => logger.error(err));

  // Run Latest fetch every minute (checked for activity inside)
  cron.schedule("* * * * *", () => {
    fetchLatestJob().catch(err => logger.error("[Scheduler] Latest job failed:", err));
  });

  // Run History fetch every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    fetchHistoryJob().catch(err => logger.error("[Scheduler] History job failed:", err));
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

