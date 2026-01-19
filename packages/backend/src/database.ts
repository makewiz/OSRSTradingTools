import { Pool } from "pg";
import dotenv from "dotenv";
import { fetchWikiTimeSeries } from "./osrsClient";
import { logger } from "@osrstradingtools/shared";

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

    // --- NEW HISTORY TABLES ---

    // 5 Minute History (Base resolution)
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_history_5m (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        avg_high_price INTEGER,
        avg_low_price INTEGER,
        high_price_volume INTEGER,
        low_price_volume INTEGER,
        PRIMARY KEY (item_id, timestamp)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_history_5m_time ON item_history_5m(item_id, timestamp DESC)`);

    // 1 Hour History
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_history_1h (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        avg_high_price INTEGER,
        avg_low_price INTEGER,
        high_price_volume INTEGER,
        low_price_volume INTEGER,
        PRIMARY KEY (item_id, timestamp)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_history_1h_time ON item_history_1h(item_id, timestamp DESC)`);

    // 6 Hour History
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_history_6h (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        avg_high_price INTEGER,
        avg_low_price INTEGER,
        high_price_volume INTEGER,
        low_price_volume INTEGER,
        PRIMARY KEY (item_id, timestamp)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_history_6h_time ON item_history_6h(item_id, timestamp DESC)`);

    // 24 Hour History
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_history_24h (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        avg_high_price INTEGER,
        avg_low_price INTEGER,
        high_price_volume INTEGER,
        low_price_volume INTEGER,
        PRIMARY KEY (item_id, timestamp)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_item_history_24h_time ON item_history_24h(item_id, timestamp DESC)`);

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
      const historyPoints = apiData.map(d => ({
        itemId,
        timestamp: d.timestamp,
        avgHighPrice: d.avgHighPrice,
        avgLowPrice: d.avgLowPrice,
        highPriceVolume: d.highPriceVolume,
        lowPriceVolume: d.lowPriceVolume
      }));

      // Split into chunks of 1000 to be safe (though UNNEST handles large arrays well, 
      // we want to avoid massive memory spikes in Node or PG)
      const chunkSize = 1000;
      for (let i = 0; i < historyPoints.length; i += chunkSize) {
        await bulkInsertItemHistory(table, historyPoints.slice(i, i + chunkSize));
      }

      logger.info(`[PriceHistory] Persisted ${apiData.length} points to ${table} from Wiki API.`);

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
    if (row.avg_low_price !== null && row.avg_low_price !== undefined) {
      buy.push({ timestamp: ts, price: row.avg_low_price });
    }
    if (row.avg_high_price !== null && row.avg_high_price !== undefined) {
      sell.push({ timestamp: ts, price: row.avg_high_price });
    }
    if (row.high_price_volume !== null || row.low_price_volume !== null) {
      volume.push({
        timestamp: ts,
        buy_volume: row.low_price_volume ?? null,
        sell_volume: row.high_price_volume ?? null
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
    buyPrice: result.rows[0]?.avg_low_price ?? null,
    sellPrice: result.rows[0]?.avg_high_price ?? null
  };
}



// Obsolete legacy helpers (remove if unused, or keep empty if exported and used elsewhere)
// For now, I've replaced getPriceHistory with the new implementation above.


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

  const oldBuyPrice = result.rows[0]?.avg_low_price;
  const oldSellPrice = result.rows[0]?.avg_high_price;

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

/**
 * User Management Functions
 */

// Create new user
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
