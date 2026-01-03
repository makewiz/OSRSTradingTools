import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Path to the shared database
// NOTE: In a real monorepo, we might share this config or use an env var
// We assume execution from packages/discord-bot or root
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "../../data/osrs_trading.db");

// Ensure data directory exists (just in case)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

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
export function ensureDiscordUser(discordId: string): void {
    const stmt = db.prepare(`
    INSERT OR IGNORE INTO discord_users (discord_id) VALUES (?)
  `);
    stmt.run(discordId);
}

/**
 * Get Discord user settings
 */
export function getDiscordUser(discordId: string): DiscordUser | null {
    const stmt = db.prepare("SELECT * FROM discord_users WHERE discord_id = ?");
    return stmt.get(discordId) as DiscordUser | null;
}

/**
 * Add a watch for an item
 */
export function addWatch(discordId: string, itemId: number, threshold: number | null = 5.0): void {
    ensureDiscordUser(discordId);

    const stmt = db.prepare(`
    INSERT INTO notification_settings (discord_id, item_id, day_change_threshold)
    VALUES (?, ?, ?)
    ON CONFLICT(discord_id, item_id) DO UPDATE SET
      day_change_threshold = excluded.day_change_threshold,
      enabled = 1
  `);
    stmt.run(discordId, itemId, threshold);
}

/**
 * Remove a watch
 */
export function removeWatch(discordId: string, itemId: number): void {
    const stmt = db.prepare(`
    DELETE FROM notification_settings WHERE discord_id = ? AND item_id = ?
  `);
    stmt.run(discordId, itemId);
}

/**
 * List active watches for a user
 */
export function getWatches(discordId: string): NotificationSetting[] {
    const stmt = db.prepare(`
    SELECT * FROM notification_settings 
    WHERE discord_id = ? AND enabled = 1
  `);
    return stmt.all(discordId) as NotificationSetting[];
}

/**
 * Enable/Disable global notifications for user
 */
export function setNotificationsEnabled(discordId: string, enabled: boolean): void {
    ensureDiscordUser(discordId);
    const stmt = db.prepare(`
    UPDATE discord_users SET notifications_enabled = ? WHERE discord_id = ?
  `);
    stmt.run(enabled ? 1 : 0, discordId);
}

/**
 * Get all active watches for notification checking
 */
export function getAllActiveWatches(): (NotificationSetting & { notifications_enabled: boolean })[] {
    // Join with discord_users to check if they have notifications enabled globally
    const stmt = db.prepare(`
    SELECT ns.*, du.notifications_enabled 
    FROM notification_settings ns
    JOIN discord_users du ON ns.discord_id = du.discord_id
    WHERE ns.enabled = 1 AND du.notifications_enabled = 1
  `);
    return stmt.all() as (NotificationSetting & { notifications_enabled: boolean })[];
}

/**
 * Update last_notified_at
 */
export function updateLastNotified(id: number): void {
    const stmt = db.prepare(`
    UPDATE notification_settings SET last_notified_at = ? WHERE id = ?
  `);
    stmt.run(Math.floor(Date.now() / 1000), id);
}

/**
 * Get latest price for an item (from price history)
 */
export function getLatestPrice(itemId: number): { buy_price: number | null; sell_price: number | null } | null {
    const stmt = db.prepare(`
    SELECT buy_price, sell_price FROM item_price_history
    WHERE item_id = ? AND granularity = 'minute'
    ORDER BY timestamp DESC LIMIT 1
  `);
    return stmt.get(itemId) as { buy_price: number | null; sell_price: number | null } | null;
}

/**
 * Calculate day change (reused logic from backend, simplified)
 */
export function getDayChange(itemId: number, currentBuy: number | null, currentSell: number | null): number | null {
    if (currentBuy === null && currentSell === null) return null;

    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - 24 * 60 * 60;

    // Find price ~24h ago
    const stmt = db.prepare(`
    SELECT buy_price, sell_price FROM item_price_history
    WHERE item_id = ? AND timestamp <= ?
    ORDER BY timestamp DESC LIMIT 1
  `);

    const old = stmt.get(itemId, oneDayAgo) as { buy_price: number | null; sell_price: number | null } | undefined;
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

export function closeDatabase() {
    db.close();
}
