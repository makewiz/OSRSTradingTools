import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// Ensure DATABASE_URL is provided, or rely on shared config if possible, but separate env is safer for decoupled running
if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Please set it in your .env file.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

/**
 * Ensure Discord user exists in DB
 */
export async function ensureDiscordUser(discordId: string): Promise<void> {
  const query = `
    INSERT INTO discord_users (discord_id, notifications_enabled) VALUES ($1, 1)
    ON CONFLICT (discord_id) DO NOTHING
  `;
  await pool.query(query, [discordId]);
}

/**
 * Get Discord user settings
 */
export async function getDiscordUser(discordId: string): Promise<DiscordUser | null> {
  const query = "SELECT * FROM discord_users WHERE discord_id = $1";
  const result = await pool.query(query, [discordId]);
  return result.rows[0] ? (result.rows[0] as DiscordUser) : null;
}

/**
 * Add a watch for an item
 */
export async function addWatch(discordId: string, itemId: number, threshold: number | null = 5.0): Promise<void> {
  await ensureDiscordUser(discordId);

  const query = `
    INSERT INTO notification_settings (discord_id, item_id, day_change_threshold, enabled)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT(discord_id, item_id) DO UPDATE SET
      day_change_threshold = EXCLUDED.day_change_threshold,
      enabled = 1
  `;
  await pool.query(query, [discordId, itemId, threshold]);
}

/**
 * Remove a watch
 */
export async function removeWatch(discordId: string, itemId: number): Promise<void> {
  const query = `
    DELETE FROM notification_settings WHERE discord_id = $1 AND item_id = $2
  `;
  await pool.query(query, [discordId, itemId]);
}

/**
 * List active watches for a user
 */
export async function getWatches(discordId: string): Promise<NotificationSetting[]> {
  const query = `
    SELECT * FROM notification_settings 
    WHERE discord_id = $1 AND enabled = 1
  `;
  const result = await pool.query(query, [discordId]);
  return result.rows as NotificationSetting[];
}

/**
 * Enable/Disable global notifications for user
 */
export async function setNotificationsEnabled(discordId: string, enabled: boolean): Promise<void> {
  await ensureDiscordUser(discordId);
  const query = `
    UPDATE discord_users SET notifications_enabled = $1 WHERE discord_id = $2
  `;
  await pool.query(query, [enabled ? 1 : 0, discordId]);
}

/**
 * Get all active watches for notification checking
 */
export async function getAllActiveWatches(): Promise<(NotificationSetting & { notifications_enabled: boolean })[]> {
  // Join with discord_users to check if they have notifications enabled globally
  const query = `
    SELECT ns.*, du.notifications_enabled 
    FROM notification_settings ns
    JOIN discord_users du ON ns.discord_id = du.discord_id
    WHERE ns.enabled = 1 AND du.notifications_enabled = 1
  `;
  const result = await pool.query(query);
  return result.rows as (NotificationSetting & { notifications_enabled: boolean })[];
}

/**
 * Update last_notified_at
 */
export async function updateLastNotified(id: number): Promise<void> {
  const query = `
    UPDATE notification_settings SET last_notified_at = $1 WHERE id = $2
  `;
  await pool.query(query, [Math.floor(Date.now() / 1000), id]);
}

/**
 * Get latest price for an item (from price history)
 */
export async function getLatestPrice(itemId: number): Promise<{ buy_price: number | null; sell_price: number | null } | null> {
  const query = `
    SELECT buy_price, sell_price FROM item_price_history
    WHERE item_id = $1 AND granularity = 'minute'
    ORDER BY timestamp DESC LIMIT 1
  `;
  const result = await pool.query(query, [itemId]);
  return result.rows[0] ? (result.rows[0] as { buy_price: number | null; sell_price: number | null }) : null;
}

/**
 * Calculate day change (reused logic from backend, simplified)
 */
export async function getDayChange(itemId: number, currentBuy: number | null, currentSell: number | null): Promise<number | null> {
  if (currentBuy === null && currentSell === null) return null;

  const now = Math.floor(Date.now() / 1000);
  const oneDayAgo = now - 24 * 60 * 60;

  // Find price ~24h ago
  const query = `
    SELECT buy_price, sell_price FROM item_price_history
    WHERE item_id = $1 AND timestamp <= $2
    ORDER BY timestamp DESC LIMIT 1
  `;

  const result = await pool.query(query, [itemId, oneDayAgo]);
  const old = result.rows[0] as { buy_price: number | null; sell_price: number | null } | undefined;

  if (!old) return null;

  // Calculate change based on average price if possible
  const getAvg = (b: number | null, s: number | null) => {
    if (b && s) return (b + s) / 2;
    if (b) return b;
    if (s) return s;
    return null;
  };

  const currentAvg = getAvg(currentBuy, currentSell);
  const oldAvg = getAvg(old.buy_price, old.sell_price);

  if (currentAvg && oldAvg && oldAvg > 0) {
    return ((currentAvg - oldAvg) / oldAvg) * 100;
  }

  return null;
}

export async function closeDatabase() {
  await pool.end();
}
