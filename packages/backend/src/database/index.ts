import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

import { fetchWikiTimeSeries } from "../osrsClient";
import { logger } from "@osrstradingtools/shared";
import { ensurePartitionedHistoryTable } from "./partitions";
import { createRecipeTables } from "./recipes";
import { createTradingGameTables } from "./tradingGame";
import { seedAdminUser } from "./seedAdmin";

export * from "./tradingGame";

dotenv.config();

// Ensure DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  logger.warn("DATABASE_URL is not set. Please set it in your .env file.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface ItemPriceHistory {
  id: number;
  item_id: number;
  timestamp: number;
  buy_price: number | null;
  sell_price: number | null;
  volume: number | null;
  granularity: "minute" | "hour" | "day";
}

export interface User {
  id: number;
  username: string;
  password_hash: string | null;
  email: string | null;
  created_at: number;
  is_admin: boolean;
}

export interface UserFavorite {
  user_id: number;
  item_id: number;
}

export interface DiscordUser {
  discord_id: string;
  user_id: number | null;
  notifications_enabled: boolean;
  created_at: number;
}

export interface NotificationSetting {
  id: number;
  discord_id: string;
  item_id: number;
  day_change_threshold: number | null;
  enabled: boolean;
  created_at: number;
  last_notified_at: number | null;
}

export interface SystemSetting {
  key: string;
  value: string;
}

export interface SavedFilter {
  id: number;
  user_id: number;
  name: string;
  config: any; // Using any for JSONB to avoid strict typing issues with the unpredictable filter structure
  created_at: number;
}

export interface AdvancedWatch {
  id: number;
  discord_id: string;
  name: string | null;
  min_buy_price: number | null;
  max_buy_price: number | null;
  min_sell_price: number | null;
  max_sell_price: number | null;
  min_volume: number | null;
  min_change_1h: number | null;
  min_change_24h: number | null;
  is_members: boolean | null;
  min_buy_limit: number | null;
  max_buy_limit: number | null;
  min_margin: number | null;
  max_margin: number | null;
  min_profit: number | null;
  max_profit: number | null;
  min_roi: number | null;
  min_potential_profit: number | null;
  cooldown_minutes: number;
  order_by: string;
  direction: 'asc' | 'desc';
  max_count: number;
  created_at: number;
  enabled: boolean;
}


export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        email TEXT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        is_admin BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    // Migration: Ensure password_hash is nullable (for existing databases)
    await client.query(`
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL
    `);

    // Migration: Add is_admin column if not exists
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // System Settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // ... rest of tables (favorites, discord, notifications) ...
    // User favorites table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id 
      ON user_favorites(user_id)
    `);

    // Discord users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS discord_users (
        discord_id TEXT PRIMARY KEY,
        user_id INTEGER,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Notification settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        discord_id TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        day_change_threshold REAL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        last_notified_at BIGINT,
        FOREIGN KEY (discord_id) REFERENCES discord_users(discord_id) ON DELETE CASCADE,
        UNIQUE(discord_id, item_id)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_settings_discord_id 
      ON notification_settings(discord_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notification_settings_item_id 
      ON notification_settings(item_id)
    `);

    // Migration: Add 1h change columns if not exist
    await client.query(`
      ALTER TABLE notification_settings 
      ADD COLUMN IF NOT EXISTS one_hour_change_threshold REAL,
      ADD COLUMN IF NOT EXISTS last_notified_1h_at BIGINT,
      ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER DEFAULT 3600
    `);

    // --- NEW HISTORY TABLES (PARTITIONED) ---
    // Migration and initialization handled by helper
    // Definitions:
    // 5m:  Retention 24h,  Partition 1d (86400s)
    // 1h:  Retention 7d,   Partition 1d (86400s)
    // 6h:  Retention 30d,  Partition 7d (604800s)
    // 24h: Retention 365d, Partition 30d (2592000s)

    const maxRetentionDays = process.env.DATA_RETENTION_DAYS
      ? parseInt(process.env.DATA_RETENTION_DAYS, 10)
      : 3650;
    const maxRetentionSeconds = maxRetentionDays * 24 * 3600;

    await ensurePartitionedHistoryTable(client, 'item_history_5m', Math.min(24 * 3600, maxRetentionSeconds), 24 * 3600);
    await ensurePartitionedHistoryTable(client, 'item_history_1h', Math.min(7 * 24 * 3600, maxRetentionSeconds), 24 * 3600);
    await ensurePartitionedHistoryTable(client, 'item_history_6h', Math.min(30 * 24 * 3600, maxRetentionSeconds), 7 * 24 * 3600);
    await ensurePartitionedHistoryTable(client, 'item_history_24h', Math.min(365 * 24 * 3600, maxRetentionSeconds), 30 * 24 * 3600);

    // --- ADVANCED WATCHES ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS advanced_watches (
        id SERIAL PRIMARY KEY,
        discord_id TEXT NOT NULL,
        min_buy_price INTEGER,
        max_buy_price INTEGER,
        min_sell_price INTEGER,
        max_sell_price INTEGER,
        min_volume INTEGER,
        min_change_1h REAL,
        min_change_24h REAL,
        is_members BOOLEAN,
        min_buy_limit INTEGER,
        max_buy_limit INTEGER,
        min_margin INTEGER,
        max_margin INTEGER,
        min_profit INTEGER,
        max_profit INTEGER,
        min_roi REAL,
        min_potential_profit INTEGER,
        cooldown_seconds INTEGER DEFAULT 3600,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        enabled BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS advanced_watch_history (
        watch_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        triggered_at BIGINT NOT NULL,
        PRIMARY KEY (watch_id, item_id),
        FOREIGN KEY (watch_id) REFERENCES advanced_watches(id) ON DELETE CASCADE
      )
    `);

    // Migration: Add new columns if not exist
    await client.query(`
      ALTER TABLE advanced_watches
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS order_by TEXT DEFAULT 'profit',
      ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'desc',
      ADD COLUMN IF NOT EXISTS max_count INTEGER DEFAULT 10,
      ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60
    `);


    // Saved Filters
    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        config JSONB NOT NULL,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // --- AUTONOMOUS TRADING AGENTS ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS trading_agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        cash_stack BIGINT NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        status TEXT NOT NULL DEFAULT 'idle',
        memory JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        last_run_at BIGINT,
        next_run_at BIGINT,
        runs_today INTEGER NOT NULL DEFAULT 0,
        last_run_date TEXT,
        error_message TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_triggers (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        item_id INTEGER,
        item_name TEXT,
        trigger_type TEXT NOT NULL,
        target_value REAL NOT NULL,
        cooldown_seconds INTEGER DEFAULT 300,
        last_triggered_at BIGINT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        trigger_reason TEXT NOT NULL,
        execution_summary TEXT NOT NULL,
        actions_taken JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_discord_notifications (
        id SERIAL PRIMARY KEY,
        discord_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        processed BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);

    // --- TRADING PORTFOLIO & AGENT MESSAGES ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_portfolio (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        agent_id INTEGER,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        buy_price INTEGER NOT NULL,
        target_sell_price INTEGER NOT NULL,
        stop_loss_price INTEGER,
        status TEXT NOT NULL DEFAULT 'holding',
        notes TEXT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        updated_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE SET NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE
      )
    `);

    // Recipes
    await createRecipeTables();

    // Trading Game
    await createTradingGameTables(client);

    // Seed default admin user if environment variables are set
    await seedAdminUser();

    // Deprecate cooldown_seconds (migrate data if needed, or just ignore it)
    // We will assume new watches use cooldown_minutes.



  } finally {
    client.release();
  }
}

export async function insertItemHistory(
  table: string,
  itemId: number,
  timestamp: number,
  avgHighPrice: number | null,
  avgLowPrice: number | null,
  highPriceVolume: number | null,
  lowPriceVolume: number | null
): Promise<void> {
  // Validate table name to prevent SQL injection (though this is internal use)
  const validTables = ['item_history_5m', 'item_history_1h', 'item_history_6h', 'item_history_24h'];
  if (!validTables.includes(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  const query = `
    INSERT INTO ${table} (item_id, timestamp, avg_high_price, avg_low_price, high_price_volume, low_price_volume)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (item_id, timestamp) DO UPDATE SET
      avg_high_price = COALESCE(EXCLUDED.avg_high_price, item_history_5m.avg_high_price),
      avg_low_price = COALESCE(EXCLUDED.avg_low_price, item_history_5m.avg_low_price),
      high_price_volume = COALESCE(EXCLUDED.high_price_volume, item_history_5m.high_price_volume),
      low_price_volume = COALESCE(EXCLUDED.low_price_volume, item_history_5m.low_price_volume)
  `.replace(/item_history_5m/g, table); // Dynamic table name in update clause

  await pool.query(query, [itemId, timestamp, avgHighPrice, avgLowPrice, highPriceVolume, lowPriceVolume]);
}

export async function bulkInsertItemHistory(
  table: string,
  items: {
    itemId: number;
    timestamp: number;
    avgHighPrice: number | null;
    avgLowPrice: number | null;
    highPriceVolume: number | null;
    lowPriceVolume: number | null;
  }[]
): Promise<void> {
  const validTables = ['item_history_5m', 'item_history_1h', 'item_history_6h', 'item_history_24h'];
  if (!validTables.includes(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  if (items.length === 0) return;

  const query = `
    INSERT INTO ${table} (item_id, timestamp, avg_high_price, avg_low_price, high_price_volume, low_price_volume)
    SELECT * FROM UNNEST($1::int[], $2::bigint[], $3::int[], $4::int[], $5::int[], $6::int[])
    ON CONFLICT (item_id, timestamp) DO UPDATE SET
      avg_high_price = COALESCE(EXCLUDED.avg_high_price, ${table}.avg_high_price),
      avg_low_price = COALESCE(EXCLUDED.avg_low_price, ${table}.avg_low_price),
      high_price_volume = COALESCE(EXCLUDED.high_price_volume, ${table}.high_price_volume),
      low_price_volume = COALESCE(EXCLUDED.low_price_volume, ${table}.low_price_volume)
  `;

  const itemIds = items.map(i => i.itemId);
  const timestamps = items.map(i => i.timestamp);
  const avgHighPrices = items.map(i => i.avgHighPrice);
  const avgLowPrices = items.map(i => i.avgLowPrice);
  const highPriceVolumes = items.map(i => i.highPriceVolume);
  const lowPriceVolumes = items.map(i => i.lowPriceVolume);

  await pool.query(query, [itemIds, timestamps, avgHighPrices, avgLowPrices, highPriceVolumes, lowPriceVolumes]);
}


export async function getPriceHistory(
  itemId: number,
  startTime: number,
  endTime: number,
  dailyVolume: number | null = null
): Promise<{
  buy: { timestamp: number; price: number }[];
  sell: { timestamp: number; price: number }[];
  volume: { timestamp: number; buy_volume: number | null; sell_volume: number | null }[];
}> {
  const duration = endTime - startTime;

  // Determine table based on duration
  // < 24h -> 5m
  // < 7d -> 1h
  // < 30d -> 6h
  // > 30d -> 24h
  let table = 'item_history_5m';
  if (duration > 30 * 24 * 3600) {
    table = 'item_history_24h';
  } else if (duration > 7 * 24 * 3600) {
    table = 'item_history_6h';
  } else if (duration > 24 * 3600) {
    table = 'item_history_1h'; // corrected to 1h
  }

  // If fetching very recent data (e.g. last hour), default to 5m
  if (duration < 24 * 3600) {
    table = 'item_history_5m';
  }

  const query = `
    SELECT timestamp, avg_high_price, avg_low_price, high_price_volume, low_price_volume
    FROM ${table}
    WHERE item_id = $1 AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp ASC
  `;

  const result = await pool.query(query, [itemId, startTime, endTime]);

  // Fallback to Wiki API if coverage is low (< 80%)
  let rows = result.rows;

  // Determine granularity in seconds for expected count calculation
  let stepSeconds = 300; // 5m
  let timestep = '5m';
  if (table === 'item_history_24h') {
    stepSeconds = 24 * 3600;
    timestep = '24h';
  } else if (table === 'item_history_6h') {
    stepSeconds = 6 * 3600;
    timestep = '6h';
  } else if (table === 'item_history_1h') {
    stepSeconds = 3600;
    timestep = '1h';
  }

  // Volume-adjusted expected points
  let expectedPoints = Math.ceil(duration / stepSeconds);

  if (dailyVolume !== null) {
    // If we have daily volume data, we can be smarter about coverage.
    // For low volume items, we shouldn't expect a datapoint for every time bucket.
    // We estimate the theoretical max number of buckets that could be filled.
    // We assume a minimum of 5 trades/day to ensure we still check for valid history on seemingly dead items.
    const safeVolume = Math.max(dailyVolume, 5);
    const durationDays = Math.max(duration / 86400, 1);
    const volumeBasedExpectation = Math.ceil(safeVolume * durationDays);

    if (volumeBasedExpectation < expectedPoints) {
      // logger.debug(`[PriceHistory] Low volume item ${itemId} (Vol: ${dailyVolume}). Adj exp: ${volumeBasedExpectation} vs Time exp: ${expectedPoints}`);
      expectedPoints = volumeBasedExpectation;
    }
  }

  const coverage = expectedPoints > 0 ? rows.length / expectedPoints : 1;

  if (coverage < 0.8) {
    logger.info(`[PriceHistory] Insufficient data for item ${itemId} (Coverage: ${(coverage * 100).toFixed(1)}%). Fetching from Wiki API...`);
    try {
      const apiData = await fetchWikiTimeSeries(itemId, timestep);

      // Save to database asynchronously to populate history for future requests
      // Save to database using bulk insert
      try {
        // Determine retention cutoff for the target table
        const now = Math.floor(Date.now() / 1000);
        const maxRetentionDays = process.env.DATA_RETENTION_DAYS
          ? parseInt(process.env.DATA_RETENTION_DAYS, 10)
          : 3650;
        const maxRetentionSeconds = maxRetentionDays * 24 * 3600;

        let retentionSeconds = 24 * 3600; // default 5m
        if (table === 'item_history_1h') retentionSeconds = 7 * 24 * 3600;
        else if (table === 'item_history_6h') retentionSeconds = 30 * 24 * 3600;
        else if (table === 'item_history_24h') retentionSeconds = 365 * 24 * 3600;

        // Apply global cap
        retentionSeconds = Math.min(retentionSeconds, maxRetentionSeconds);

        const retentionCutoff = now - retentionSeconds;

        // Filter points to only insert those that fit in the table's retention window
        const historyPoints = apiData
          .filter(d => d.timestamp >= retentionCutoff)
          .map(d => ({
            itemId,
            timestamp: d.timestamp,
            avgHighPrice: d.avgHighPrice,
            avgLowPrice: d.avgLowPrice,
            highPriceVolume: d.highPriceVolume,
            lowPriceVolume: d.lowPriceVolume
          }));

        // Split into chunks of 1000
        if (historyPoints.length > 0) {
          const chunkSize = 1000;
          for (let i = 0; i < historyPoints.length; i += chunkSize) {
            await bulkInsertItemHistory(table, historyPoints.slice(i, i + chunkSize));
          }
          logger.info(`[PriceHistory] Persisted ${historyPoints.length} points to ${table} from Wiki API (Filtered from ${apiData.length}).`);
        } else {
          logger.info(`[PriceHistory] All Wiki API data was older than retention for ${table}. Skiping insert.`);
        }
      } catch (persistErr) {
        logger.warn(`[PriceHistory] Failed to persist Wiki data for ${itemId} (non-fatal):`, persistErr);
      }

      // Filter and map API data to row format
      // API Timestamp is in seconds.
      const apiRows = apiData
        .filter(d => d.timestamp >= startTime && d.timestamp <= endTime)
        .map(d => ({
          timestamp: d.timestamp.toString(), // consistency with DB result (string) for parsing below
          avg_high_price: d.avgHighPrice,
          avg_low_price: d.avgLowPrice,
          high_price_volume: d.highPriceVolume,
          low_price_volume: d.lowPriceVolume
        }));

      if (apiRows.length > 0) {
        rows = apiRows;
        logger.info(`[PriceHistory] Fetched ${rows.length} points from Wiki API.`);
      } else {
        logger.warn(`[PriceHistory] Wiki API returned no data for range.`);
      }
    } catch (err) {
      logger.error(`[PriceHistory] Failed to fetch from Wiki API:`, err);
      // Proceed with existing DB rows if API fails
    }
  }

  const buy = [];
  const sell = [];
  const volume = [];

  for (const row of rows) {
    const ts = parseInt(row.timestamp);
    if (row.avg_high_price !== null && row.avg_high_price !== undefined) {
      buy.push({ timestamp: ts, price: row.avg_high_price });
    }
    if (row.avg_low_price !== null && row.avg_low_price !== undefined) {
      sell.push({ timestamp: ts, price: row.avg_low_price });
    }
    if (row.high_price_volume !== null || row.low_price_volume !== null) {
      volume.push({
        timestamp: ts,
        buy_volume: row.high_price_volume ?? null,
        sell_volume: row.low_price_volume ?? null
      });
    }
  }

  return { buy, sell, volume };
}

export async function getLatestPrice(itemId: number): Promise<{ buyPrice: number | null; sellPrice: number | null }> {
  // Use 5m history table for latest known price
  const query = `
    SELECT avg_high_price, avg_low_price 
    FROM item_history_5m 
    WHERE item_id = $1 
    ORDER BY timestamp DESC LIMIT 1
  `;

  const result = await pool.query(query, [itemId]);

  return {
    buyPrice: result.rows[0]?.avg_high_price ?? null,
    sellPrice: result.rows[0]?.avg_low_price ?? null
  };
}



// Obsolete legacy helpers (remove if unused, or keep empty if exported and used elsewhere)
// Obsolete legacy helpers (remove if unused, or keep empty if exported and used elsewhere)


async function calculatePriceChange(
  itemId: number,
  currentBuyPrice: number | null,
  currentSellPrice: number | null,
  lookbackSeconds: number
): Promise<{
  buyChange: number | null;
  sellChange: number | null;
  avgChange: number | null;
}> {
  const now = Math.floor(Date.now() / 1000);
  const timeAgo = now - lookbackSeconds;

  // Choose table based on lookback
  // For 1h/24h lookbacks, 5m or 1h table is sufficient
  let table = 'item_history_5m';
  if (lookbackSeconds > 24 * 3600) {
    table = 'item_history_1h';
  }

  // We want the price AT or BEFORE timeAgo
  const query = `
    SELECT avg_high_price, avg_low_price 
    FROM ${table}
    WHERE item_id = $1 AND timestamp <= $2
    ORDER BY timestamp DESC LIMIT 1
  `;

  const result = await pool.query(query, [itemId, timeAgo]);

  const oldBuyPrice = result.rows[0]?.avg_high_price;
  const oldSellPrice = result.rows[0]?.avg_low_price;

  let buyChange: number | null = null;
  if (currentBuyPrice !== null && oldBuyPrice) {
    buyChange = ((currentBuyPrice - oldBuyPrice) / oldBuyPrice) * 100;
  }

  let sellChange: number | null = null;
  if (currentSellPrice !== null && oldSellPrice) {
    sellChange = ((currentSellPrice - oldSellPrice) / oldSellPrice) * 100;
  }

  let avgChange: number | null = null;
  if (buyChange !== null && sellChange !== null) {
    avgChange = (buyChange + sellChange) / 2;
  } else if (buyChange !== null) {
    avgChange = buyChange;
  } else if (sellChange !== null) {
    avgChange = sellChange;
  }

  return { buyChange, sellChange, avgChange };
}

export async function calculateDayChange(
  itemId: number,
  currentBuyPrice: number | null,
  currentSellPrice: number | null
): Promise<{
  buyDayChange: number | null;
  sellDayChange: number | null;
  dayChange: number | null;
}> {
  const { buyChange, sellChange, avgChange } = await calculatePriceChange(
    itemId,
    currentBuyPrice,
    currentSellPrice,
    24 * 60 * 60
  );
  return { buyDayChange: buyChange, sellDayChange: sellChange, dayChange: avgChange };
}

export async function calculateHourChange(
  itemId: number,
  currentBuyPrice: number | null,
  currentSellPrice: number | null
): Promise<{
  buyHourChange: number | null;
  sellHourChange: number | null;
  hourChange: number | null;
}> {
  const { buyChange, sellChange, avgChange } = await calculatePriceChange(
    itemId,
    currentBuyPrice,
    currentSellPrice,
    60 * 60
  );
  return { buyHourChange: buyChange, sellHourChange: sellChange, hourChange: avgChange };
}

export async function getLatestPricesBefore(
  itemIds: number[],
  timestamp: number,
  table: string = 'item_history_5m'
): Promise<Record<number, { avgHigh: number | null, avgLow: number | null }>> {
  if (itemIds.length === 0) return {};

  // We want the most recent price for each item BEFORE or AT the timestamp.
  // Postgres DISTINCT ON is perfect for this.
  const query = `
    SELECT DISTINCT ON (item_id) item_id, avg_high_price, avg_low_price
    FROM ${table}
    WHERE item_id = ANY($1) AND timestamp <= $2
    ORDER BY item_id, timestamp DESC
  `;

  const result = await pool.query(query, [itemIds, timestamp]);

  const map: Record<number, { avgHigh: number | null, avgLow: number | null }> = {};
  for (const row of result.rows) {
    map[row.item_id] = {
      avgHigh: row.avg_high_price,
      avgLow: row.avg_low_price
    };
  }
  return map;
}

/**
 * User Management Functions
 */

// Create new user
export async function createUser(
  username: string,
  passwordHash: string | null,
  email: string | null = null,
  isAdmin: boolean = false
): Promise<User> {
  const query = `
    INSERT INTO users (username, password_hash, email, is_admin)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const result = await pool.query(query, [username, passwordHash, email, isAdmin]);
  const user = result.rows[0];

  return {
    ...user,
    created_at: parseInt(user.created_at) // Ensure bigint is parsed to number if needed
  } as User;
}

export async function updateUserPassword(userId: number, passwordHash: string): Promise<void> {
  const query = `
    UPDATE users SET password_hash = $1 WHERE id = $2
  `;
  await pool.query(query, [passwordHash, userId]);
}

// Get active watches for a discord user
export async function getBackendWatches(discordId: string): Promise<NotificationSetting[]> {
  const query = `
    SELECT * FROM notification_settings WHERE discord_id = $1 AND enabled = 1
  `;
  const result = await pool.query(query, [discordId]);
  return result.rows.map(row => ({
    ...row,
    created_at: parseInt(row.created_at)
  })) as NotificationSetting[];
}

export async function getUserCount(): Promise<number> {
  const result = await pool.query("SELECT COUNT(*) FROM users");
  return parseInt(result.rows[0].count, 10);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const query = `
    SELECT * FROM users WHERE username = $1
  `;

  const result = await pool.query(query, [username]);
  if (result.rows.length > 0) {
    const user = result.rows[0];
    return { ...user, created_at: parseInt(user.created_at) } as User;
  }
  return null;
}

export async function getUserById(id: number): Promise<User | null> {
  const query = `
    SELECT * FROM users WHERE id = $1
  `;

  const result = await pool.query(query, [id]);
  if (result.rows.length > 0) {
    const user = result.rows[0];
    return { ...user, created_at: parseInt(user.created_at) } as User;
  }
  return null;
}

// Delete user and all associated data
export async function deleteUser(userId: number): Promise<void> {
  // First, delete discord_users if linked (cascades to notification_settings)
  const deleteDiscordQuery = `
    DELETE FROM discord_users WHERE user_id = $1
  `;
  await pool.query(deleteDiscordQuery, [userId]);

  // Then delete the user (cascades to user_favorites)
  const deleteUserQuery = `
    DELETE FROM users WHERE id = $1
  `;
  await pool.query(deleteUserQuery, [userId]);
}

/**
 * Favorites Management Functions
 */

export async function getUserFavorites(userId: number): Promise<number[]> {
  const query = `
    SELECT item_id FROM user_favorites WHERE user_id = $1
  `;

  const result = await pool.query(query, [userId]);
  return result.rows.map(r => r.item_id);
}

export async function addFavorite(userId: number, itemId: number): Promise<void> {
  const query = `
    INSERT INTO user_favorites (user_id, item_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING
  `;

  await pool.query(query, [userId, itemId]);
}

export async function removeFavorite(userId: number, itemId: number): Promise<void> {
  const query = `
    DELETE FROM user_favorites WHERE user_id = $1 AND item_id = $2
  `;

  await pool.query(query, [userId, itemId]);
}

/**
 * Discord Management Functions
 */

// Link Discord ID to User ID
export async function linkDiscordUser(userId: number, discordId: string): Promise<void> {
  const query = `
    INSERT INTO discord_users (discord_id, user_id, notifications_enabled)
    VALUES ($1, $2, 1)
    ON CONFLICT(discord_id) DO UPDATE SET
      user_id = EXCLUDED.user_id
  `;
  await pool.query(query, [discordId, userId]);
}



// Get App User for a given Discord ID (for login)
export async function getUserByDiscordId(discordId: string): Promise<User | null> {
  const query = `
    SELECT u.* FROM users u
    JOIN discord_users du ON u.id = du.user_id
    WHERE du.discord_id = $1
  `;
  const result = await pool.query(query, [discordId]);
  if (result.rows.length > 0) {
    const user = result.rows[0];
    return {
      ...user,
      created_at: parseInt(user.created_at) // Ensure number
    } as User;
  }
  return null;
}

// Get Discord User for a given App User ID
export async function getDiscordUserByUserId(userId: number): Promise<DiscordUser | null> {
  const query = `
    SELECT * FROM discord_users WHERE user_id = $1
  `;
  const result = await pool.query(query, [userId]);
  if (result.rows.length > 0) {
    const dUser = result.rows[0];
    return { ...dUser, created_at: parseInt(dUser.created_at) } as DiscordUser;
  }
  return null;
}

// Update settings
export async function updateDiscordSettings(discordId: string, enabled: boolean): Promise<void> {
  const query = `
    UPDATE discord_users SET notifications_enabled = $1 WHERE discord_id = $2
  `;
  const val = enabled ? 1 : 0;
  await pool.query(query, [val, discordId]);
}

// Add/Update Watch
export async function addBackendWatch(
  discordId: string,
  itemId: number,
  threshold: number,
  period: '24h' | '1h' = '1h',
  cooldownSeconds: number = 3600,
  enabled: boolean = true
): Promise<void> {
  const is24h = period === '24h';

  // We need to handle the upsert carefully to preserve other fields if they exist,
  // or we can just set them. 
  // If user sets 24h watch, we update day_change_threshold.
  // We also update cooldown_seconds (global for the item watch).

  const enabledVal = enabled ? 1 : 0;

  if (is24h) {
    const query = `
        INSERT INTO notification_settings (discord_id, item_id, day_change_threshold, cooldown_seconds, enabled)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(discord_id, item_id) DO UPDATE SET
          day_change_threshold = EXCLUDED.day_change_threshold,
          cooldown_seconds = EXCLUDED.cooldown_seconds,
          enabled = EXCLUDED.enabled
      `;
    await pool.query(query, [discordId, itemId, threshold, cooldownSeconds, enabledVal]);
  } else {
    const query = `
        INSERT INTO notification_settings (discord_id, item_id, one_hour_change_threshold, cooldown_seconds, enabled)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(discord_id, item_id) DO UPDATE SET
          one_hour_change_threshold = EXCLUDED.one_hour_change_threshold,
          cooldown_seconds = EXCLUDED.cooldown_seconds,
          enabled = EXCLUDED.enabled
      `;
    await pool.query(query, [discordId, itemId, threshold, cooldownSeconds, enabledVal]);
  }
}

// Remove Watch
export async function removeBackendWatch(discordId: string, itemId: number): Promise<void> {
  const query = `
    DELETE FROM notification_settings WHERE discord_id = $1 AND item_id = $2
  `;
  await pool.query(query, [discordId, itemId]);
}


/**
 * Advanced Watches Management
 */

export async function addAdvancedWatch(watch: Omit<AdvancedWatch, 'id' | 'created_at' | 'enabled'>): Promise<AdvancedWatch> {
  const query = `
    INSERT INTO advanced_watches (
      discord_id, name, min_buy_price, max_buy_price, min_sell_price, max_sell_price, 
      min_volume, min_change_1h, min_change_24h, is_members, min_buy_limit, 
      max_buy_limit, min_margin, max_margin, min_profit, max_profit, 
      min_roi, min_potential_profit, cooldown_minutes, order_by, direction, max_count
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
    RETURNING *
  `;
  const params = [
    watch.discord_id, watch.name, watch.min_buy_price, watch.max_buy_price, watch.min_sell_price, watch.max_sell_price,
    watch.min_volume, watch.min_change_1h, watch.min_change_24h, watch.is_members, watch.min_buy_limit,
    watch.max_buy_limit, watch.min_margin, watch.max_margin, watch.min_profit, watch.max_profit,
    watch.min_roi, watch.min_potential_profit, watch.cooldown_minutes, watch.order_by, watch.direction, watch.max_count
  ];

  const result = await pool.query(query, params);
  return { ...result.rows[0], created_at: parseInt(result.rows[0].created_at) } as AdvancedWatch;
}

export async function getAdvancedWatches(discordId: string): Promise<AdvancedWatch[]> {
  const query = `SELECT * FROM advanced_watches WHERE discord_id = $1 ORDER BY created_at DESC`;
  const result = await pool.query(query, [discordId]);
  return result.rows.map(row => ({ ...row, created_at: parseInt(row.created_at) })) as AdvancedWatch[];
}

export async function updateAdvancedWatch(id: number, discordId: string, watch: Partial<AdvancedWatch>): Promise<AdvancedWatch | null> {
  const existing = await pool.query('SELECT * FROM advanced_watches WHERE id = $1 AND discord_id = $2', [id, discordId]);
  if (existing.rows.length === 0) return null;

  const current = existing.rows[0];
  const merged = { ...current, ...watch };

  const query = `
    UPDATE advanced_watches SET
      name = $1, min_buy_price = $2, max_buy_price = $3, min_sell_price = $4, max_sell_price = $5,
      min_volume = $6, min_change_1h = $7, min_change_24h = $8, is_members = $9, min_buy_limit = $10,
      max_buy_limit = $11, min_margin = $12, max_margin = $13, min_profit = $14, max_profit = $15,
      min_roi = $16, min_potential_profit = $17, cooldown_minutes = $18, order_by = $19, direction = $20, max_count = $21,
      enabled = $22
    WHERE id = $23 AND discord_id = $24
    RETURNING *
  `;

  const params = [
    merged.name, merged.min_buy_price, merged.max_buy_price, merged.min_sell_price, merged.max_sell_price,
    merged.min_volume, merged.min_change_1h, merged.min_change_24h, merged.is_members, merged.min_buy_limit,
    merged.max_buy_limit, merged.min_margin, merged.max_margin, merged.min_profit, merged.max_profit,
    merged.min_roi, merged.min_potential_profit, merged.cooldown_minutes, merged.order_by, merged.direction, merged.max_count,
    merged.enabled,
    id, discordId
  ];

  const result = await pool.query(query, params);
  return { ...result.rows[0], created_at: parseInt(result.rows[0].created_at) } as AdvancedWatch;
}

export async function removeAdvancedWatch(id: number, discordId: string): Promise<void> {
  const query = `DELETE FROM advanced_watches WHERE id = $1 AND discord_id = $2`;
  await pool.query(query, [id, discordId]);
}




// Close database connection gracefully
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/**
 * System Settings Management
 */

export async function getSystemSetting(key: string, defaultValue: string = ""): Promise<string> {
  const query = `SELECT value FROM system_settings WHERE key = $1`;
  const result = await pool.query(query, [key]);
  if (result.rows.length > 0) {
    return result.rows[0].value;
  }
  return defaultValue;
}

export async function setSystemSetting(key: string, value: string): Promise<void> {
  const query = `
    INSERT INTO system_settings (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await pool.query(query, [key, value]);
}

export async function getAllSystemSettings(): Promise<SystemSetting[]> {
  const query = `SELECT * FROM system_settings`;
  const result = await pool.query(query);
  return result.rows;
}

export async function createSavedFilter(userId: number, name: string, config: any): Promise<SavedFilter> {
  const query = `
    INSERT INTO saved_filters (user_id, name, config)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  const result = await pool.query(query, [userId, name, config]);
  const row = result.rows[0];
  return { ...row, created_at: parseInt(row.created_at) };
}

export async function getSavedFilters(userId: number): Promise<SavedFilter[]> {
  const query = `
    SELECT * FROM saved_filters WHERE user_id = $1 ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [userId]);
  return result.rows.map(row => ({ ...row, created_at: parseInt(row.created_at) }));
}

export async function deleteSavedFilter(userId: number, filterId: number): Promise<void> {
  const query = `
    DELETE FROM saved_filters WHERE id = $1 AND user_id = $2
  `;
  await pool.query(query, [filterId, userId]);
}

export async function getBatchPriceHistory(
  itemIds: number[],
  startTime: number,
  endTime: number,
  granularity: '5m' | '1h' | '6h' | '24h' = '24h'
): Promise<Record<number, { timestamp: number; price: number }[]>> {
  if (itemIds.length === 0) return {};

  let table = 'item_history_24h';
  if (granularity === '5m') table = 'item_history_5m';
  else if (granularity === '1h') table = 'item_history_1h';
  else if (granularity === '6h') table = 'item_history_6h';

  const query = `
    SELECT item_id, timestamp, avg_high_price, avg_low_price
    FROM ${table}
    WHERE item_id = ANY($1) AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp ASC
  `;

  const result = await pool.query(query, [itemIds, startTime, endTime]);
  const map: Record<number, { timestamp: number; price: number }[]> = {};

  for (const id of itemIds) {
    map[id] = [];
  }

  for (const row of result.rows) {
    if (!map[row.item_id]) map[row.item_id] = [];
    const price = row.avg_high_price || row.avg_low_price;
    if (price) {
      map[row.item_id].push({
        timestamp: parseInt(row.timestamp),
        price: price
      });
    }
  }

  return map;
}

// --- TRADING AGENT DATABASE HELPERS ---
export interface TradingAgent {
  id: number;
  user_id: number;
  name: string;
  goal: string;
  cash_stack: number;
  enabled: boolean;
  status: string;
  memory: any;
  created_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
  runs_today: number;
  last_run_date: string | null;
  error_message: string | null;
}

export interface AgentTrigger {
  id: number;
  agent_id: number;
  item_id: number | null;
  item_name: string | null;
  trigger_type: 'buy_price_below' | 'buy_price_above' | 'sell_price_below' | 'sell_price_above' | 'margin_above' | 'roi_above' | '1h_change' | '24h_change';
  target_value: number;
  cooldown_seconds: number;
  last_triggered_at: number | null;
  created_at: number;
  enabled: boolean;
}

export interface AgentExecutionLog {
  id: number;
  agent_id: number;
  trigger_reason: string;
  execution_summary: string;
  actions_taken: any[];
  created_at: number;
}

export async function createTradingAgent(
  userId: number,
  name: string,
  goal: string,
  cashStack: number
): Promise<TradingAgent> {
  const query = `
    INSERT INTO trading_agents (user_id, name, goal, cash_stack, memory)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const initialMemory = {
    positions: [],
    watchItems: [],
    strategyNotes: "Agent initialized and ready to analyze the market.",
    history: []
  };
  const result = await pool.query(query, [userId, name, goal, cashStack, JSON.stringify(initialMemory)]);
  const row = result.rows[0];
  return { ...row, cash_stack: parseInt(row.cash_stack), created_at: parseInt(row.created_at) };
}

export async function getUserTradingAgents(userId: number): Promise<TradingAgent[]> {
  const query = `SELECT * FROM trading_agents WHERE user_id = $1 ORDER BY created_at DESC`;
  const result = await pool.query(query, [userId]);
  return result.rows.map(row => ({
    ...row,
    cash_stack: parseInt(row.cash_stack),
    created_at: parseInt(row.created_at),
    last_run_at: row.last_run_at ? parseInt(row.last_run_at) : null,
    next_run_at: row.next_run_at ? parseInt(row.next_run_at) : null
  }));
}

export async function getTradingAgentById(agentId: number): Promise<TradingAgent | null> {
  const query = `SELECT * FROM trading_agents WHERE id = $1`;
  const result = await pool.query(query, [agentId]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    cash_stack: parseInt(row.cash_stack),
    created_at: parseInt(row.created_at),
    last_run_at: row.last_run_at ? parseInt(row.last_run_at) : null,
    next_run_at: row.next_run_at ? parseInt(row.next_run_at) : null
  };
}

export async function updateTradingAgent(
  agentId: number,
  userId: number,
  updates: Partial<TradingAgent>
): Promise<TradingAgent | null> {
  const current = await getTradingAgentById(agentId);
  if (!current || current.user_id !== userId) return null;

  const merged = { ...current, ...updates };
  const query = `
    UPDATE trading_agents SET
      name = $1, goal = $2, cash_stack = $3, enabled = $4, status = $5,
      memory = $6, last_run_at = $7, next_run_at = $8, runs_today = $9,
      last_run_date = $10, error_message = $11
    WHERE id = $12 AND user_id = $13
    RETURNING *
  `;
  const params = [
    merged.name, merged.goal, merged.cash_stack, merged.enabled, merged.status,
    typeof merged.memory === 'string' ? merged.memory : JSON.stringify(merged.memory),
    merged.last_run_at, merged.next_run_at, merged.runs_today,
    merged.last_run_date, merged.error_message,
    agentId, userId
  ];
  const result = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    cash_stack: parseInt(row.cash_stack),
    created_at: parseInt(row.created_at),
    last_run_at: row.last_run_at ? parseInt(row.last_run_at) : null,
    next_run_at: row.next_run_at ? parseInt(row.next_run_at) : null
  };
}

export async function deleteTradingAgent(agentId: number, userId: number): Promise<boolean> {
  const query = `DELETE FROM trading_agents WHERE id = $1 AND user_id = $2`;
  const result = await pool.query(query, [agentId, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function getAllActiveTradingAgents(): Promise<TradingAgent[]> {
  const query = `SELECT * FROM trading_agents WHERE enabled = TRUE`;
  const result = await pool.query(query);
  return result.rows.map(row => ({
    ...row,
    cash_stack: parseInt(row.cash_stack),
    created_at: parseInt(row.created_at),
    last_run_at: row.last_run_at ? parseInt(row.last_run_at) : null,
    next_run_at: row.next_run_at ? parseInt(row.next_run_at) : null
  }));
}

export async function addAgentTrigger(
  agentId: number,
  itemId: number | null,
  itemName: string | null,
  triggerType: string,
  targetValue: number,
  cooldownSeconds: number = 300
): Promise<AgentTrigger> {
  const query = `
    INSERT INTO agent_triggers (agent_id, item_id, item_name, trigger_type, target_value, cooldown_seconds)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await pool.query(query, [agentId, itemId, itemName, triggerType, targetValue, cooldownSeconds]);
  const row = result.rows[0];
  return { ...row, created_at: parseInt(row.created_at), last_triggered_at: row.last_triggered_at ? parseInt(row.last_triggered_at) : null };
}

export async function getAgentTriggers(agentId: number): Promise<AgentTrigger[]> {
  const query = `SELECT * FROM agent_triggers WHERE agent_id = $1 ORDER BY created_at DESC`;
  const result = await pool.query(query, [agentId]);
  return result.rows.map(row => ({
    ...row,
    created_at: parseInt(row.created_at),
    last_triggered_at: row.last_triggered_at ? parseInt(row.last_triggered_at) : null
  }));
}

export async function removeAgentTrigger(triggerId: number, agentId: number): Promise<void> {
  const query = `DELETE FROM agent_triggers WHERE id = $1 AND agent_id = $2`;
  await pool.query(query, [triggerId, agentId]);
}

export async function updateAgentTriggerLastTriggered(triggerId: number, timestamp: number): Promise<void> {
  const query = `UPDATE agent_triggers SET last_triggered_at = $1 WHERE id = $2`;
  await pool.query(query, [timestamp, triggerId]);
}

export async function logAgentExecution(
  agentId: number,
  triggerReason: string,
  executionSummary: string,
  actionsTaken: any[]
): Promise<AgentExecutionLog> {
  const query = `
    INSERT INTO agent_execution_logs (agent_id, trigger_reason, execution_summary, actions_taken)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await pool.query(query, [agentId, triggerReason, executionSummary, JSON.stringify(actionsTaken)]);
  const row = result.rows[0];
  return { ...row, created_at: parseInt(row.created_at) };
}

export async function getAgentExecutionLogs(agentId: number, limit: number = 20): Promise<AgentExecutionLog[]> {
  const query = `SELECT * FROM agent_execution_logs WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`;
  const result = await pool.query(query, [agentId, limit]);
  return result.rows.map(row => ({ ...row, created_at: parseInt(row.created_at) }));
}

export async function queueAgentDiscordNotification(
  discordId: string,
  agentName: string,
  message: string
): Promise<void> {
  const query = `
    INSERT INTO agent_discord_notifications (discord_id, agent_name, message)
    VALUES ($1, $2, $3)
  `;
  await pool.query(query, [discordId, agentName, message]);
}

export async function getUnprocessedAgentDiscordNotifications(): Promise<any[]> {
  const query = `SELECT * FROM agent_discord_notifications WHERE processed = FALSE ORDER BY created_at ASC`;
  const result = await pool.query(query);
  return result.rows.map(row => ({ ...row, created_at: parseInt(row.created_at) }));
}

export async function markAgentDiscordNotificationsProcessed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const query = `UPDATE agent_discord_notifications SET processed = TRUE WHERE id = ANY($1)`;
  await pool.query(query, [ids]);
}

// --- PORTFOLIO & AGENT MESSAGES HELPERS ---
export interface PortfolioItem {
  id: number;
  user_id: number;
  agent_id: number | null;
  item_id: number;
  item_name: string;
  quantity: number;
  buy_price: number;
  target_sell_price: number;
  stop_loss_price: number | null;
  status: 'buying' | 'holding' | 'selling' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface AgentMessage {
  id: number;
  agent_id: number;
  sender: 'user' | 'agent' | 'system';
  content: string;
  metadata: any;
  created_at: number;
}

export async function addPortfolioItem(
  userId: number,
  itemId: number,
  itemName: string,
  quantity: number,
  buyPrice: number,
  targetSellPrice?: number | null,
  agentId?: number | null,
  notes?: string | null,
  stopLossPrice?: number | null
): Promise<PortfolioItem> {
  const now = Math.floor(Date.now() / 1000);
  const effectiveTargetSell = targetSellPrice ?? buyPrice;
  const query = `
    INSERT INTO user_portfolio (
      user_id, agent_id, item_id, item_name, quantity, buy_price, target_sell_price, stop_loss_price, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
    RETURNING *
  `;
  const params = [
    userId, agentId ?? null, itemId, itemName, quantity, buyPrice, effectiveTargetSell, stopLossPrice ?? null, notes ?? null, now
  ];
  const result = await pool.query(query, params);
  const row = result.rows[0];
  return {
    ...row,
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at)
  };
}

export async function getUserPortfolio(userId: number): Promise<PortfolioItem[]> {
  const query = `SELECT * FROM user_portfolio WHERE user_id = $1 ORDER BY updated_at DESC`;
  const result = await pool.query(query, [userId]);
  return result.rows.map(row => ({
    ...row,
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at)
  }));
}

export async function getPortfolioItemById(id: number): Promise<PortfolioItem | null> {
  const query = `SELECT * FROM user_portfolio WHERE id = $1`;
  const result = await pool.query(query, [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at)
  };
}

export async function updatePortfolioItem(
  id: number,
  userId: number,
  updates: Partial<PortfolioItem>
): Promise<PortfolioItem | null> {
  const current = await getPortfolioItemById(id);
  if (!current || current.user_id !== userId) return null;

  const merged = { ...current, ...updates };
  const now = Math.floor(Date.now() / 1000);
  const query = `
    UPDATE user_portfolio SET
      quantity = $1, buy_price = $2, target_sell_price = $3, stop_loss_price = $4,
      status = $5, notes = $6, updated_at = $7
    WHERE id = $8 AND user_id = $9
    RETURNING *
  `;
  const params = [
    merged.quantity, merged.buy_price, merged.target_sell_price, merged.stop_loss_price,
    merged.status, merged.notes, now, id, userId
  ];
  const result = await pool.query(query, params);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at)
  };
}

export async function deletePortfolioItem(id: number, userId: number): Promise<boolean> {
  const query = `DELETE FROM user_portfolio WHERE id = $1 AND user_id = $2`;
  const result = await pool.query(query, [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function addAgentMessage(
  agentId: number,
  sender: 'user' | 'agent' | 'system',
  content: string,
  metadata: any = {}
): Promise<AgentMessage> {
  const query = `
    INSERT INTO agent_messages (agent_id, sender, content, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const result = await pool.query(query, [agentId, sender, content, JSON.stringify(metadata)]);
  const row = result.rows[0];
  return {
    ...row,
    created_at: parseInt(row.created_at)
  };
}

export async function getAgentMessages(agentId: number, limit: number = 50): Promise<AgentMessage[]> {
  const query = `
    SELECT * FROM agent_messages WHERE agent_id = $1 ORDER BY created_at ASC LIMIT $2
  `;
  const result = await pool.query(query, [agentId, limit]);
  return result.rows.map(row => ({
    ...row,
    created_at: parseInt(row.created_at)
  }));
}


