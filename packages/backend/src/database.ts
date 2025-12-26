import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "../../data/osrs_trading.db");

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

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

export function initializeDatabase(): void {
  // Item price history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      buy_price INTEGER,
      sell_price INTEGER,
      volume INTEGER,
      granularity TEXT NOT NULL DEFAULT 'minute',
      UNIQUE(item_id, timestamp, granularity)
    )
  `);

  // Index for fast lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_item_price_history_item_timestamp 
    ON item_price_history(item_id, timestamp DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_item_price_history_timestamp 
    ON item_price_history(timestamp DESC)
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // User favorites table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id 
    ON user_favorites(user_id)
  `);

  // Discord users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discord_users (
      discord_id TEXT PRIMARY KEY,
      user_id INTEGER,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Notification settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      day_change_threshold REAL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      last_notified_at INTEGER,
      FOREIGN KEY (discord_id) REFERENCES discord_users(discord_id) ON DELETE CASCADE,
      UNIQUE(discord_id, item_id)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notification_settings_discord_id 
    ON notification_settings(discord_id)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notification_settings_item_id 
    ON notification_settings(item_id)
  `);
}

export function insertPriceHistory(
  itemId: number,
  timestamp: number,
  buyPrice: number | null,
  sellPrice: number | null,
  volume: number | null,
  granularity: "minute" | "hour" | "day" = "minute"
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO item_price_history 
    (item_id, timestamp, buy_price, sell_price, volume, granularity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(itemId, timestamp, buyPrice, sellPrice, volume, granularity);
}

export function getLatestPrice(itemId: number): ItemPriceHistory | null {
  const stmt = db.prepare(`
    SELECT * FROM item_price_history
    WHERE item_id = ? AND granularity = 'minute'
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  return stmt.get(itemId) as ItemPriceHistory | null;
}

export function getPriceAtTime(
  itemId: number,
  targetTimestamp: number
): ItemPriceHistory | null {
  // Find the closest price record before or at the target time
  const stmt = db.prepare(`
    SELECT * FROM item_price_history
    WHERE item_id = ? AND timestamp <= ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  return stmt.get(itemId, targetTimestamp) as ItemPriceHistory | null;
}

export function getPriceHistory(
  itemId: number,
  startTime: number,
  endTime: number,
  granularity: "minute" | "hour" | "day" = "minute"
): ItemPriceHistory[] {
  const stmt = db.prepare(`
    SELECT * FROM item_price_history
    WHERE item_id = ? 
      AND timestamp >= ? 
      AND timestamp <= ?
      AND granularity = ?
    ORDER BY timestamp ASC
  `);

  return stmt.all(itemId, startTime, endTime, granularity) as ItemPriceHistory[];
}

// Close database connection gracefully
export function closeDatabase(): void {
  db.close();
}

