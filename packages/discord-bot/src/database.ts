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



export async function closeDatabase() {
  await pool.end();
}
