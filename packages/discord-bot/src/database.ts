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
  target_price_above: number | null;
  target_price_below: number | null;
  is_1h_triggered: boolean | number;
  is_24h_triggered: boolean | number;
  is_above_triggered: boolean | number;
  is_below_triggered: boolean | number;
  enabled: boolean;
  created_at: number;
  last_notified_at: number | null;
  last_notified_1h_at: number | null;
  last_notified_above_at: number | null;
  last_notified_below_at: number | null;
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
  threshold?: number | null,
  period: '24h' | '1h' | 'none' = '1h',
  cooldownSeconds: number = 3600,
  targetPriceAbove?: number | null,
  targetPriceBelow?: number | null,
  oneHourChangeThreshold?: number | null,
  dayChangeThreshold?: number | null
): Promise<void> {
  await ensureDiscordUser(discordId);

  let final1h: number | null = oneHourChangeThreshold !== undefined ? oneHourChangeThreshold : null;
  let final24h: number | null = dayChangeThreshold !== undefined ? dayChangeThreshold : null;

  if (threshold !== undefined && threshold !== null) {
    if (period === '1h' && oneHourChangeThreshold === undefined) final1h = threshold;
    if (period === '24h' && dayChangeThreshold === undefined) final24h = threshold;
  }

  const finalAbove = targetPriceAbove !== undefined ? targetPriceAbove : null;
  const finalBelow = targetPriceBelow !== undefined ? targetPriceBelow : null;

  const query = `
    INSERT INTO notification_settings (
      discord_id, item_id, day_change_threshold, one_hour_change_threshold,
      target_price_above, target_price_below, cooldown_seconds, enabled,
      is_1h_triggered, is_24h_triggered, is_above_triggered, is_below_triggered
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 0, 0, 0, 0)
    ON CONFLICT(discord_id, item_id) DO UPDATE SET
      day_change_threshold = EXCLUDED.day_change_threshold,
      one_hour_change_threshold = EXCLUDED.one_hour_change_threshold,
      target_price_above = EXCLUDED.target_price_above,
      target_price_below = EXCLUDED.target_price_below,
      cooldown_seconds = EXCLUDED.cooldown_seconds,
      enabled = 1,
      is_1h_triggered = 0,
      is_24h_triggered = 0,
      is_above_triggered = 0,
      is_below_triggered = 0
  `;
  await pool.query(query, [discordId, itemId, final24h, final1h, finalAbove, finalBelow, cooldownSeconds]);
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
export async function updateLastNotified(id: number, period: '24h' | '1h' | 'above' | 'below'): Promise<void> {
  let column = 'last_notified_1h_at';
  if (period === '24h') column = 'last_notified_at';
  if (period === 'above') column = 'last_notified_above_at';
  if (period === 'below') column = 'last_notified_below_at';

  const query = `
    UPDATE notification_settings SET ${column} = $1 WHERE id = $2
  `;
  await pool.query(query, [Math.floor(Date.now() / 1000), id]);
}

/**
 * Update active triggered state and notification timestamp for a watch trigger type
 */
export async function updateWatchState(
  id: number,
  type: '1h' | '24h' | 'above' | 'below',
  triggered: boolean
): Promise<void> {
  let triggeredCol = '';
  let notifiedCol = '';

  switch (type) {
    case '1h':
      triggeredCol = 'is_1h_triggered';
      notifiedCol = 'last_notified_1h_at';
      break;
    case '24h':
      triggeredCol = 'is_24h_triggered';
      notifiedCol = 'last_notified_at';
      break;
    case 'above':
      triggeredCol = 'is_above_triggered';
      notifiedCol = 'last_notified_above_at';
      break;
    case 'below':
      triggeredCol = 'is_below_triggered';
      notifiedCol = 'last_notified_below_at';
      break;
  }

  const triggeredVal = triggered ? 1 : 0;
  const nowSec = Math.floor(Date.now() / 1000);

  if (triggered) {
    const query = `UPDATE notification_settings SET ${triggeredCol} = $1, ${notifiedCol} = $2 WHERE id = $3`;
    await pool.query(query, [triggeredVal, nowSec, id]);
  } else {
    const query = `UPDATE notification_settings SET ${triggeredCol} = $1 WHERE id = $2`;
    await pool.query(query, [triggeredVal, id]);
  }
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
