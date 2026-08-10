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
  one_hour_change_threshold: number | null;
  enabled: boolean;
  created_at: number;
  last_notified_at: number | null;
  last_notified_1h_at: number | null;
  cooldown_seconds: number | null;
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
 * Check if a Discord user is linked to an Admin account
 */
export async function isUserAdmin(discordId: string): Promise<boolean> {
  const query = `
    SELECT u.is_admin 
    FROM discord_users du
    JOIN users u ON du.user_id = u.id
    WHERE du.discord_id = $1
  `;
  const result = await pool.query(query, [discordId]);
  return result.rows.length > 0 && result.rows[0].is_admin === true;
}

/**
 * Add a watch for an item
 */
// Add/Update Watch
export async function addWatch(
  discordId: string,
  itemId: number,
  threshold: number = 5.0,
  period: '24h' | '1h' = '1h',
  cooldownSeconds: number = 3600
): Promise<void> {
  await ensureDiscordUser(discordId);

  if (period === '24h') {
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
export async function updateLastNotified(id: number, period: '24h' | '1h'): Promise<void> {
  const column = period === '24h' ? 'last_notified_at' : 'last_notified_1h_at';
  const query = `
    UPDATE notification_settings SET ${column} = $1 WHERE id = $2
  `;
  await pool.query(query, [Math.floor(Date.now() / 1000), id]);
}

/**
 * Advanced Watch Functions
 */

export async function getAllActiveAdvancedWatches(): Promise<AdvancedWatch[]> {
  const query = `
    SELECT * FROM advanced_watches WHERE enabled = TRUE
  `;
  const result = await pool.query(query);
  return result.rows.map(row => ({ ...row, created_at: parseInt(row.created_at) })) as AdvancedWatch[];
}

export async function getAdvancedWatchHistory(watchId: number, itemId: number): Promise<number | null> {
  const query = `
    SELECT triggered_at FROM advanced_watch_history WHERE watch_id = $1 AND item_id = $2
  `;
  const result = await pool.query(query, [watchId, itemId]);
  if (result.rows.length > 0) {
    return parseInt(result.rows[0].triggered_at);
  }
  return null;
}

export async function updateAdvancedWatchHistory(watchId: number, itemId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const query = `
    INSERT INTO advanced_watch_history (watch_id, item_id, triggered_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (watch_id, item_id) DO UPDATE SET triggered_at = EXCLUDED.triggered_at
  `;
  await pool.query(query, [watchId, itemId, now]);
}






/**
 * System Settings
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

export async function closeDatabase() {
  await pool.end();
}
