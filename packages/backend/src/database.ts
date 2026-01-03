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
  password_hash: string;
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
    // Item price history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS item_price_history (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL,
        timestamp BIGINT NOT NULL,
        buy_price INTEGER,
        sell_price INTEGER,
        volume INTEGER,
        granularity TEXT NOT NULL DEFAULT 'minute',
        UNIQUE(item_id, timestamp, granularity)
      )
    `);

    // Index for fast lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_price_history_item_timestamp 
      ON item_price_history(item_id, timestamp DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_price_history_timestamp 
      ON item_price_history(timestamp DESC)
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
      )
    `);

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
  } finally {
    client.release();
  }
}

export async function insertPriceHistory(
  itemId: number,
  timestamp: number,
  buyPrice: number | null,
  sellPrice: number | null,
  volume: number | null,
  granularity: "minute" | "hour" | "day" = "minute"
): Promise<void> {
  const query = `
    INSERT INTO item_price_history 
    (item_id, timestamp, buy_price, sell_price, volume, granularity)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (item_id, timestamp, granularity) DO UPDATE SET
      buy_price = EXCLUDED.buy_price,
      sell_price = EXCLUDED.sell_price,
      volume = EXCLUDED.volume
  `;

  await pool.query(query, [itemId, timestamp, buyPrice, sellPrice, volume, granularity]);
}

export async function getLatestPrice(itemId: number): Promise<ItemPriceHistory | null> {
  const query = `
    SELECT * FROM item_price_history
    WHERE item_id = $1 AND granularity = 'minute'
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [itemId]);
  return result.rows[0] ? (result.rows[0] as ItemPriceHistory) : null;
}



export async function getPriceAtTime(
  itemId: number,
  targetTimestamp: number
): Promise<ItemPriceHistory | null> {
  const query = `
    SELECT * FROM item_price_history
    WHERE item_id = $1 AND timestamp <= $2
    ORDER BY timestamp DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [itemId, targetTimestamp]);
  return result.rows[0] ? (result.rows[0] as ItemPriceHistory) : null;
}

export async function getPriceHistory(
  itemId: number,
  startTime: number,
  endTime: number,
  granularity: "minute" | "hour" | "day" = "minute"
): Promise<ItemPriceHistory[]> {
  const query = `
    SELECT * FROM item_price_history
    WHERE item_id = $1 
      AND timestamp >= $2 
      AND timestamp <= $3
      AND granularity = $4
    ORDER BY timestamp ASC
  `;

  const result = await pool.query(query, [itemId, startTime, endTime, granularity]);
  return result.rows as ItemPriceHistory[];
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
  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;
  const tolerance = 60 * 60;

  const query = `
    SELECT buy_price, sell_price
    FROM item_price_history
    WHERE item_id = $1
      AND timestamp >= $2
      AND timestamp <= $3
    ORDER BY ABS(timestamp - $4) ASC
    LIMIT 1
  `;

  const result = await pool.query(query, [
    itemId,
    oneDayAgo - tolerance,
    oneDayAgo + tolerance,
    oneDayAgo
  ]);

  const oldPrice = result.rows[0] as { buy_price: number | null; sell_price: number | null } | undefined;

  if (!oldPrice) {
    return { buyDayChange: null, sellDayChange: null, dayChange: null };
  }

  let buyDayChange: number | null = null;
  if (
    currentBuyPrice !== null &&
    oldPrice.buy_price !== null &&
    oldPrice.buy_price > 0
  ) {
    buyDayChange =
      ((currentBuyPrice - oldPrice.buy_price) / oldPrice.buy_price) * 100;
  }

  let sellDayChange: number | null = null;
  if (
    currentSellPrice !== null &&
    oldPrice.sell_price !== null &&
    oldPrice.sell_price > 0
  ) {
    sellDayChange =
      ((currentSellPrice - oldPrice.sell_price) / oldPrice.sell_price) * 100;
  }

  let dayChange: number | null = null;
  if (buyDayChange !== null && sellDayChange !== null) {
    dayChange = (buyDayChange + sellDayChange) / 2;
  } else if (buyDayChange !== null) {
    dayChange = buyDayChange;
  } else if (sellDayChange !== null) {
    dayChange = sellDayChange;
  }

  return { buyDayChange, sellDayChange, dayChange };
}

/**
 * User Management Functions
 */

// Create new user
export async function createUser(
  username: string,
  passwordHash: string,
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
export async function addBackendWatch(discordId: string, itemId: number, threshold: number): Promise<void> {
  const query = `
    INSERT INTO notification_settings (discord_id, item_id, day_change_threshold, enabled)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT(discord_id, item_id) DO UPDATE SET
      day_change_threshold = EXCLUDED.day_change_threshold,
      enabled = 1
  `;
  await pool.query(query, [discordId, itemId, threshold]);
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
