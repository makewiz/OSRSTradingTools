import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Ensure DATABASE_URL is provided
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Please set it in your .env file.");
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

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // Item buy prices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_buy_prices (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        price INTEGER NOT NULL,
        PRIMARY KEY (item_id, timestamp)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_buy_prices_time 
      ON item_buy_prices(item_id, timestamp DESC)
    `);

    // Item sell prices table
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_sell_prices (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        price INTEGER NOT NULL,
        PRIMARY KEY (item_id, timestamp)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_sell_prices_time 
      ON item_sell_prices(item_id, timestamp DESC)
    `);

    // Item volumes table (5m raw or 1h aggregated)
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_volumes (
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        buy_volume INTEGER,
        sell_volume INTEGER,
        PRIMARY KEY (item_id, timestamp)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_volumes_time 
      ON item_volumes(item_id, timestamp DESC)
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        email TEXT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
      )
    `);

    // Migration: Ensure password_hash is nullable (for existing databases)
    await client.query(`
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL
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
  } finally {
    client.release();
  }
}

export async function insertBuyPrice(itemId: number, timestamp: number, price: number): Promise<void> {
  const query = `
    INSERT INTO item_buy_prices (item_id, timestamp, price)
    VALUES ($1, $2, $3)
    ON CONFLICT (item_id, timestamp) DO NOTHING
  `;
  await pool.query(query, [itemId, timestamp, price]);
}

export async function insertSellPrice(itemId: number, timestamp: number, price: number): Promise<void> {
  const query = `
    INSERT INTO item_sell_prices (item_id, timestamp, price)
    VALUES ($1, $2, $3)
    ON CONFLICT (item_id, timestamp) DO NOTHING
  `;
  await pool.query(query, [itemId, timestamp, price]);
}

export async function insertVolume(
  itemId: number,
  timestamp: number,
  buyVolume: number | null,
  sellVolume: number | null
): Promise<void> {
  const query = `
    INSERT INTO item_volumes (item_id, timestamp, buy_volume, sell_volume)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (item_id, timestamp) DO UPDATE SET
        buy_volume = EXCLUDED.buy_volume,
        sell_volume = EXCLUDED.sell_volume
  `;
  await pool.query(query, [itemId, timestamp, buyVolume, sellVolume]);
}

export async function getPriceHistory(
  itemId: number,
  startTime: number,
  endTime: number
): Promise<{
  buy: { timestamp: number; price: number }[];
  sell: { timestamp: number; price: number }[];
  volume: { timestamp: number; buy_volume: number | null; sell_volume: number | null }[];
}> {
  const buyQuery = `
    SELECT timestamp, price FROM item_buy_prices
    WHERE item_id = $1 AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp ASC
  `;
  const sellQuery = `
    SELECT timestamp, price FROM item_sell_prices
    WHERE item_id = $1 AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp ASC
  `;
  const volumeQuery = `
    SELECT timestamp, buy_volume, sell_volume FROM item_volumes
    WHERE item_id = $1 AND timestamp >= $2 AND timestamp <= $3
    ORDER BY timestamp ASC
  `;

  const [buyRes, sellRes, volRes] = await Promise.all([
    pool.query(buyQuery, [itemId, startTime, endTime]),
    pool.query(sellQuery, [itemId, startTime, endTime]),
    pool.query(volumeQuery, [itemId, startTime, endTime])
  ]);

  return {
    buy: buyRes.rows.map(r => ({ timestamp: parseInt(r.timestamp), price: r.price })),
    sell: sellRes.rows.map(r => ({ timestamp: parseInt(r.timestamp), price: r.price })),
    volume: volRes.rows.map(r => ({
      timestamp: parseInt(r.timestamp),
      buy_volume: r.buy_volume,
      sell_volume: r.sell_volume
    }))
  };
}

export async function getLatestPrice(itemId: number): Promise<{ buyPrice: number | null; sellPrice: number | null }> {
  const buyQuery = `SELECT price FROM item_buy_prices WHERE item_id = $1 ORDER BY timestamp DESC LIMIT 1`;
  const sellQuery = `SELECT price FROM item_sell_prices WHERE item_id = $1 ORDER BY timestamp DESC LIMIT 1`;

  const [buyRes, sellRes] = await Promise.all([
    pool.query(buyQuery, [itemId]),
    pool.query(sellQuery, [itemId])
  ]);

  return {
    buyPrice: buyRes.rows[0]?.price ?? null,
    sellPrice: sellRes.rows[0]?.price ?? null
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

  const buyQuery = `
    SELECT price FROM item_buy_prices 
    WHERE item_id = $1 AND timestamp <= $2
    ORDER BY timestamp DESC LIMIT 1
  `;
  const sellQuery = `
    SELECT price FROM item_sell_prices 
    WHERE item_id = $1 AND timestamp <= $2
    ORDER BY timestamp DESC LIMIT 1
  `;

  const [buyRes, sellRes] = await Promise.all([
    pool.query(buyQuery, [itemId, timeAgo]),
    pool.query(sellQuery, [itemId, timeAgo])
  ]);

  const oldBuyPrice = buyRes.rows[0]?.price;
  const oldSellPrice = sellRes.rows[0]?.price;

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
export async function createUser(
  username: string,
  passwordHash: string | null,
  email: string | null = null
): Promise<User> {
  const query = `
    INSERT INTO users (username, password_hash, email)
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  const result = await pool.query(query, [username, passwordHash, email]);
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
  cooldownSeconds: number = 3600
): Promise<void> {
  const is24h = period === '24h';

  // We need to handle the upsert carefully to preserve other fields if they exist,
  // or we can just set them. 
  // If user sets 24h watch, we update day_change_threshold.
  // We also update cooldown_seconds (global for the item watch).

  if (is24h) {
    const query = `
        INSERT INTO notification_settings (discord_id, item_id, day_change_threshold, cooldown_seconds, enabled)
        VALUES ($1, $2, $3, $4, 1)
        ON CONFLICT(discord_id, item_id) DO UPDATE SET
          day_change_threshold = EXCLUDED.day_change_threshold,
          cooldown_seconds = EXCLUDED.cooldown_seconds,
          enabled = 1
      `;
    await pool.query(query, [discordId, itemId, threshold, cooldownSeconds]);
  } else {
    const query = `
        INSERT INTO notification_settings (discord_id, item_id, one_hour_change_threshold, cooldown_seconds, enabled)
        VALUES ($1, $2, $3, $4, 1)
        ON CONFLICT(discord_id, item_id) DO UPDATE SET
          one_hour_change_threshold = EXCLUDED.one_hour_change_threshold,
          cooldown_seconds = EXCLUDED.cooldown_seconds,
          enabled = 1
      `;
    await pool.query(query, [discordId, itemId, threshold, cooldownSeconds]);
  }
}

// Remove Watch
export async function removeBackendWatch(discordId: string, itemId: number): Promise<void> {
  const query = `
    DELETE FROM notification_settings WHERE discord_id = $1 AND item_id = $2
  `;
  await pool.query(query, [discordId, itemId]);
}



// Close database connection gracefully
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
