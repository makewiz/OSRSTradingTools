import { pool } from "./index";
import { logger } from "@osrstradingtools/shared";

export interface TradingGameAccount {
  id: number;
  user_id: number | null;
  agent_id: number | null;
  cash_stack: number;
  created_at: number;
  updated_at: number;
  username?: string;
  agent_name?: string;
  is_agent?: boolean;
}

export interface TradingGameOffer {
  id: number;
  account_id: number;
  slot: number;
  item_id: number;
  item_name: string;
  type: 'BUY' | 'SELL';
  target_quantity: number;
  filled_quantity: number;
  price: number;
  total_escrow: number;
  claimed_gp: number;
  claimed_items: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  created_at: number;
  updated_at: number;
}

export interface TradingGameInventoryItem {
  id: number;
  account_id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  avg_buy_price: number;
  updated_at: number;
}

export interface TradingGameFill {
  id: number;
  offer_id: number;
  account_id: number;
  item_id: number;
  quantity_filled: number;
  fill_price: number;
  filled_at: number;
}

export interface MonthlyHistoryRecord {
  id: number;
  account_id: number;
  month_identifier: string;
  final_net_worth: number;
  net_profit: number;
  rank: number | null;
  created_at: number;
  name?: string;
  is_agent?: boolean;
}

export async function createTradingGameTables(client?: any): Promise<void> {
  const db = client || pool;
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_game_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      agent_id INTEGER UNIQUE REFERENCES trading_agents(id) ON DELETE CASCADE,
      cash_stack BIGINT NOT NULL DEFAULT 10000000,
      created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
      updated_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
      CONSTRAINT chk_user_or_agent CHECK (
        (user_id IS NOT NULL AND agent_id IS NULL) OR
        (user_id IS NULL AND agent_id IS NOT NULL)
      )
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_game_offers (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES trading_game_accounts(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot >= 0 AND slot < 8),
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
      target_quantity INTEGER NOT NULL CHECK (target_quantity > 0),
      filled_quantity INTEGER NOT NULL DEFAULT 0,
      price INTEGER NOT NULL CHECK (price > 0),
      total_escrow BIGINT NOT NULL DEFAULT 0,
      claimed_gp BIGINT NOT NULL DEFAULT 0,
      claimed_items INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
      created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
      updated_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_trading_game_offers_account_slot 
    ON trading_game_offers(account_id, slot, status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_trading_game_offers_active 
    ON trading_game_offers(status, item_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_game_inventory (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES trading_game_accounts(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      avg_buy_price REAL NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
      updated_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
      UNIQUE(account_id, item_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_game_fills (
      id SERIAL PRIMARY KEY,
      offer_id INTEGER NOT NULL REFERENCES trading_game_offers(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES trading_game_accounts(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL,
      quantity_filled INTEGER NOT NULL,
      fill_price INTEGER NOT NULL,
      filled_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_trading_game_fills_account_item_time 
    ON trading_game_fills(account_id, item_id, filled_at);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_game_monthly_history (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES trading_game_accounts(id) ON DELETE CASCADE,
      month_identifier TEXT NOT NULL,
      final_net_worth BIGINT NOT NULL,
      net_profit BIGINT NOT NULL,
      rank INTEGER,
      created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
    )
  `);

  logger.info("[Database] Trading Game tables initialized successfully.");
}

/**
 * Get or create trading game account for a user or agent
 */
export async function getOrCreateGameAccount(
  userId: number | null,
  agentId: number | null
): Promise<TradingGameAccount> {
  if (!userId && !agentId) {
    throw new Error("Must provide either userId or agentId");
  }

  const existingQuery = userId
    ? `SELECT a.*, u.username FROM trading_game_accounts a LEFT JOIN users u ON a.user_id = u.id WHERE a.user_id = $1`
    : `SELECT a.*, ta.name as agent_name FROM trading_game_accounts a LEFT JOIN trading_agents ta ON a.agent_id = ta.id WHERE a.agent_id = $1`;
  const existingResult = await pool.query(existingQuery, [userId || agentId]);

  if (existingResult.rows.length > 0) {
    const row = existingResult.rows[0];
    return {
      id: row.id,
      user_id: row.user_id ? parseInt(row.user_id) : null,
      agent_id: row.agent_id ? parseInt(row.agent_id) : null,
      cash_stack: parseInt(row.cash_stack),
      created_at: parseInt(row.created_at),
      updated_at: parseInt(row.updated_at),
      username: row.username,
      agent_name: row.agent_name,
      is_agent: !!row.agent_id
    };
  }

  const insertQuery = `
    INSERT INTO trading_game_accounts (user_id, agent_id, cash_stack)
    VALUES ($1, $2, 10000000)
    RETURNING *
  `;
  const insertResult = await pool.query(insertQuery, [userId, agentId]);
  const row = insertResult.rows[0];

  let name = "";
  if (userId) {
    const uRes = await pool.query(`SELECT username FROM users WHERE id = $1`, [userId]);
    name = uRes.rows[0]?.username || "Player";
  } else if (agentId) {
    const aRes = await pool.query(`SELECT name FROM trading_agents WHERE id = $1`, [agentId]);
    name = aRes.rows[0]?.name || "Agent";
  }

  return {
    id: row.id,
    user_id: row.user_id ? parseInt(row.user_id) : null,
    agent_id: row.agent_id ? parseInt(row.agent_id) : null,
    cash_stack: parseInt(row.cash_stack),
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at),
    username: userId ? name : undefined,
    agent_name: agentId ? name : undefined,
    is_agent: !!agentId
  };
}

/**
 * Get active offers for an account
 */
export async function getAccountOffers(accountId: number): Promise<TradingGameOffer[]> {
  const query = `
    SELECT * FROM trading_game_offers 
    WHERE account_id = $1 
    ORDER BY slot ASC
  `;
  const result = await pool.query(query, [accountId]);
  return result.rows.map(row => ({
    id: row.id,
    account_id: row.account_id,
    slot: row.slot,
    item_id: row.item_id,
    item_name: row.item_name,
    type: row.type,
    target_quantity: row.target_quantity,
    filled_quantity: row.filled_quantity,
    price: row.price,
    total_escrow: parseInt(row.total_escrow),
    claimed_gp: parseInt(row.claimed_gp),
    claimed_items: row.claimed_items,
    status: row.status,
    created_at: parseInt(row.created_at),
    updated_at: parseInt(row.updated_at)
  }));
}

/**
 * Get active inventory for an account
 */
export async function getAccountInventory(accountId: number): Promise<TradingGameInventoryItem[]> {
  const query = `
    SELECT * FROM trading_game_inventory 
    WHERE account_id = $1 AND quantity > 0
    ORDER BY item_name ASC
  `;
  const result = await pool.query(query, [accountId]);
  return result.rows.map(row => ({
    id: row.id,
    account_id: row.account_id,
    item_id: row.item_id,
    item_name: row.item_name,
    quantity: row.quantity,
    avg_buy_price: parseFloat(row.avg_buy_price),
    updated_at: parseInt(row.updated_at)
  }));
}

/**
 * Get quantity of an item bought by an account in the last 4 hours (rolling window)
 */
export async function get4HourBoughtQuantity(accountId: number, itemId: number): Promise<number> {
  const fourHoursAgo = Math.floor(Date.now() / 1000) - (4 * 3600);
  const query = `
    SELECT COALESCE(SUM(quantity_filled), 0) as total
    FROM trading_game_fills
    WHERE account_id = $1 AND item_id = $2 AND filled_at >= $3
  `;
  const result = await pool.query(query, [accountId, itemId, fourHoursAgo]);
  return parseInt(result.rows[0]?.total || "0", 10);
}
