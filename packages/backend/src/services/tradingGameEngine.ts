import { pool, TradingGameAccount, TradingGameOffer, TradingGameInventoryItem, getOrCreateGameAccount, getAccountOffers, getAccountInventory, get4HourBoughtQuantity, getSystemSetting, setSystemSetting } from "../database";
import { CombinedItem, getCombinedItems } from "../osrsClient";
import { calculateTax } from "../tax";
import { logger } from "@osrstradingtools/shared";

export interface AccountGameState {
  account: TradingGameAccount;
  offers: TradingGameOffer[];
  inventory: TradingGameInventoryItem[];
  netWorth: number;
  monthlyProfit: number;
  claimedUncollectedGP: number;
  claimedUncollectedItemsCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  accountId: number;
  name: string;
  isAgent: boolean;
  netWorth: number;
  profit: number;
  cashStack: number;
  activeOffersCount: number;
}

export class TradingGameEngine {
  /**
   * Get full game state for an account (user or agent)
   */
  static async getGameState(userId: number | null, agentId: number | null): Promise<AccountGameState> {
    const account = await getOrCreateGameAccount(userId, agentId);
    const offers = await getAccountOffers(account.id);
    const inventory = await getAccountInventory(account.id);

    // Fetch latest market prices for net worth calculation
    const items = await getCombinedItems();
    const itemMap = new Map<number, CombinedItem>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    let inventoryMarketValue = 0;
    for (const inv of inventory) {
      const marketItem = itemMap.get(inv.item_id);
      const currentPrice = marketItem?.buyPrice || inv.avg_buy_price || 0;
      inventoryMarketValue += inv.quantity * currentPrice;
    }

    let escrowedGP = 0;
    let unclaimedGP = 0;
    let unclaimedItemsCount = 0;

    for (const offer of offers) {
      unclaimedGP += offer.claimed_gp;
      unclaimedItemsCount += offer.claimed_items;

      if (offer.status === 'ACTIVE') {
        if (offer.type === 'BUY') {
          const unfilledQty = offer.target_quantity - offer.filled_quantity;
          escrowedGP += unfilledQty * offer.price;
        } else if (offer.type === 'SELL') {
          const unfilledQty = offer.target_quantity - offer.filled_quantity;
          const marketItem = itemMap.get(offer.item_id);
          const currentPrice = marketItem?.buyPrice || offer.price;
          inventoryMarketValue += unfilledQty * currentPrice;
        }
      }
    }

    const netWorth = account.cash_stack + escrowedGP + unclaimedGP + inventoryMarketValue;
    const monthlyProfit = netWorth - 10000000;

    return {
      account,
      offers,
      inventory,
      netWorth,
      monthlyProfit,
      claimedUncollectedGP: unclaimedGP,
      claimedUncollectedItemsCount: unclaimedItemsCount
    };
  }

  /**
   * Create a Buy or Sell Offer in a GE slot (0 to 7)
   */
  static async createOffer(
    userId: number | null,
    agentId: number | null,
    slot: number,
    itemId: number,
    type: 'BUY' | 'SELL',
    quantity: number,
    price: number
  ): Promise<TradingGameOffer> {
    if (slot < 0 || slot >= 8) {
      throw new Error("Slot must be between 0 and 7");
    }
    if (quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }
    if (price <= 0) {
      throw new Error("Price must be greater than 0");
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const account = await getOrCreateGameAccount(userId, agentId);

      // Check slot availability
      const slotCheck = await client.query(
        `SELECT id FROM trading_game_offers WHERE account_id = $1 AND slot = $2 AND status = 'ACTIVE'`,
        [account.id, slot]
      );
      if (slotCheck.rows.length > 0) {
        throw new Error(`Slot ${slot} already has an active offer. Cancel or collect it first.`);
      }

      // Fetch item name
      const items = await getCombinedItems();
      const item = items.find(i => i.id === itemId);
      if (!item) {
        throw new Error(`Item ID ${itemId} not found`);
      }

      if (type === 'BUY') {
        const totalEscrow = quantity * price;
        if (account.cash_stack < totalEscrow) {
          throw new Error(`Insufficient cash. Required: ${totalEscrow.toLocaleString()} GP, Available: ${account.cash_stack.toLocaleString()} GP`);
        }

        // Deduct cash
        await client.query(
          `UPDATE trading_game_accounts SET cash_stack = cash_stack - $1, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)) WHERE id = $2`,
          [totalEscrow, account.id]
        );

        const insertQuery = `
          INSERT INTO trading_game_offers (account_id, slot, item_id, item_name, type, target_quantity, filled_quantity, price, total_escrow)
          VALUES ($1, $2, $3, $4, 'BUY', $5, 0, $6, $7)
          RETURNING *
        `;
        const res = await client.query(insertQuery, [account.id, slot, itemId, item.name, quantity, price, totalEscrow]);
        await client.query('COMMIT');

        const row = res.rows[0];
        return {
          id: row.id,
          account_id: row.account_id,
          slot: row.slot,
          item_id: row.item_id,
          item_name: row.item_name,
          type: 'BUY',
          target_quantity: row.target_quantity,
          filled_quantity: row.filled_quantity,
          price: row.price,
          total_escrow: parseInt(row.total_escrow),
          claimed_gp: parseInt(row.claimed_gp),
          claimed_items: row.claimed_items,
          status: row.status,
          created_at: parseInt(row.created_at),
          updated_at: parseInt(row.updated_at)
        };
      } else {
        // SELL offer: require item in inventory
        const invCheck = await client.query(
          `SELECT quantity FROM trading_game_inventory WHERE account_id = $1 AND item_id = $2`,
          [account.id, itemId]
        );
        const invQty = invCheck.rows[0]?.quantity || 0;
        if (invQty < quantity) {
          throw new Error(`Insufficient inventory. Required: ${quantity}, Available: ${invQty}`);
        }

        // Deduct from inventory
        await client.query(
          `UPDATE trading_game_inventory SET quantity = quantity - $1, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)) WHERE account_id = $2 AND item_id = $3`,
          [quantity, account.id, itemId]
        );

        const insertQuery = `
          INSERT INTO trading_game_offers (account_id, slot, item_id, item_name, type, target_quantity, filled_quantity, price, total_escrow)
          VALUES ($1, $2, $3, $4, 'SELL', $5, 0, $6, $7)
          RETURNING *
        `;
        const res = await client.query(insertQuery, [account.id, slot, itemId, item.name, quantity, price, quantity]);
        await client.query('COMMIT');

        const row = res.rows[0];
        return {
          id: row.id,
          account_id: row.account_id,
          slot: row.slot,
          item_id: row.item_id,
          item_name: row.item_name,
          type: 'SELL',
          target_quantity: row.target_quantity,
          filled_quantity: row.filled_quantity,
          price: row.price,
          total_escrow: parseInt(row.total_escrow),
          claimed_gp: parseInt(row.claimed_gp),
          claimed_items: row.claimed_items,
          status: row.status,
          created_at: parseInt(row.created_at),
          updated_at: parseInt(row.updated_at)
        };
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an active offer and return unfilled escrow
   */
  static async cancelOffer(userId: number | null, agentId: number | null, offerId: number): Promise<TradingGameOffer> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const account = await getOrCreateGameAccount(userId, agentId);

      const offerRes = await client.query(
        `SELECT * FROM trading_game_offers WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [offerId, account.id]
      );
      if (offerRes.rows.length === 0) {
        throw new Error("Offer not found");
      }
      const offer = offerRes.rows[0];
      if (offer.status !== 'ACTIVE') {
        throw new Error(`Cannot cancel offer with status ${offer.status}`);
      }

      const unfilledQty = offer.target_quantity - offer.filled_quantity;

      if (offer.type === 'BUY') {
        const refundGP = unfilledQty * offer.price;
        if (refundGP > 0) {
          await client.query(
            `UPDATE trading_game_accounts SET cash_stack = cash_stack + $1, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)) WHERE id = $2`,
            [refundGP, account.id]
          );
        }
      } else if (offer.type === 'SELL') {
        if (unfilledQty > 0) {
          await client.query(
            `INSERT INTO trading_game_inventory (account_id, item_id, item_name, quantity, avg_buy_price)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, item_id)
             DO UPDATE SET quantity = trading_game_inventory.quantity + EXCLUDED.quantity, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))`,
            [account.id, offer.item_id, offer.item_name, unfilledQty, offer.price]
          );
        }
      }

      const updated = await client.query(
        `UPDATE trading_game_offers SET status = 'CANCELLED', updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)) WHERE id = $1 RETURNING *`,
        [offerId]
      );

      await client.query('COMMIT');
      const row = updated.rows[0];
      return {
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
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Collect claimed items / GP from an offer slot
   */
  static async collectSlot(userId: number | null, agentId: number | null, offerId: number): Promise<TradingGameOffer> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const account = await getOrCreateGameAccount(userId, agentId);
      const offerRes = await client.query(
        `SELECT * FROM trading_game_offers WHERE id = $1 AND account_id = $2 FOR UPDATE`,
        [offerId, account.id]
      );
      if (offerRes.rows.length === 0) {
        throw new Error("Offer not found");
      }
      const offer = offerRes.rows[0];
      const claimedGP = parseInt(offer.claimed_gp);
      const claimedItems = parseInt(offer.claimed_items);

      if (claimedGP <= 0 && claimedItems <= 0) {
        throw new Error("Nothing to collect in this slot");
      }

      // Collect GP
      if (claimedGP > 0) {
        await client.query(
          `UPDATE trading_game_accounts SET cash_stack = cash_stack + $1, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)) WHERE id = $2`,
          [claimedGP, account.id]
        );
      }

      // Collect Items
      if (claimedItems > 0) {
        // Calculate new average buy price
        const invRes = await client.query(
          `SELECT quantity, avg_buy_price FROM trading_game_inventory WHERE account_id = $1 AND item_id = $2`,
          [account.id, offer.item_id]
        );
        const existingQty = invRes.rows[0]?.quantity || 0;
        const existingAvgPrice = parseFloat(invRes.rows[0]?.avg_buy_price || 0);

        const newTotalQty = existingQty + claimedItems;
        const newAvgPrice = ((existingQty * existingAvgPrice) + (claimedItems * offer.price)) / newTotalQty;

        await client.query(
          `INSERT INTO trading_game_inventory (account_id, item_id, item_name, quantity, avg_buy_price)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_id, item_id)
           DO UPDATE SET 
             quantity = trading_game_inventory.quantity + EXCLUDED.quantity,
             avg_buy_price = $5,
             updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))`,
          [account.id, offer.item_id, offer.item_name, claimedItems, newAvgPrice]
        );
      }

      // Reset claimed counters on offer
      const newStatus = (offer.status === 'ACTIVE' && offer.filled_quantity >= offer.target_quantity)
        ? 'COMPLETED'
        : offer.status;

      const updated = await client.query(
        `UPDATE trading_game_offers 
         SET claimed_gp = 0, claimed_items = 0, status = $1, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))
         WHERE id = $2 RETURNING *`,
        [newStatus, offerId]
      );

      await client.query('COMMIT');
      const row = updated.rows[0];
      return {
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
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Process GE Market matching against active offers using latest price ticks
   */
  static async processMarketFills(latestItems: CombinedItem[]): Promise<number> {
    if (!latestItems || latestItems.length === 0) return 0;

    const itemMap = new Map<number, CombinedItem>();
    for (const item of latestItems) {
      itemMap.set(item.id, item);
    }

    const offersRes = await pool.query(
      `SELECT * FROM trading_game_offers WHERE status = 'ACTIVE' ORDER BY created_at ASC`
    );
    const activeOffers: TradingGameOffer[] = offersRes.rows;

    let fillCount = 0;

    for (const offer of activeOffers) {
      const marketItem = itemMap.get(offer.item_id);
      if (!marketItem) continue;

      const { avgHighPrice, avgLowPrice, highPriceVolume, lowPriceVolume, limit: itemBuyLimit } = marketItem;

      if (offer.type === 'BUY') {
        // Enforce 4-hour buy limit
        const limitCap = itemBuyLimit || 10000;
        const bought4h = await get4HourBoughtQuantity(offer.account_id, offer.item_id);
        const remaining4hLimit = Math.max(0, limitCap - bought4h);

        if (remaining4hLimit <= 0) continue;

        let fillPrice: number | null = null;
        let availableVolume: number | null = null;

        // Instant sell matching rule: if instant sell price <= buy offer price
        if (avgLowPrice !== null && avgLowPrice <= offer.price) {
          fillPrice = offer.price; // Fill at offer price
          availableVolume = lowPriceVolume || 1;
        } 
        // Instant buy matching rule: if instant buy price <= buy offer price
        else if (avgHighPrice !== null && avgHighPrice <= offer.price) {
          fillPrice = avgHighPrice; // Fill at lower instant buy price
          availableVolume = highPriceVolume || 1;
        }

        if (fillPrice !== null && availableVolume !== null && availableVolume > 0) {
          const qtyNeeded = offer.target_quantity - offer.filled_quantity;
          const fillQty = Math.min(qtyNeeded, availableVolume, remaining4hLimit);

          if (fillQty > 0) {
            await this.executeFill(offer, fillQty, fillPrice);
            fillCount++;
          }
        }
      } else if (offer.type === 'SELL') {
        let fillPrice: number | null = null;
        let availableVolume: number | null = null;

        // Instant buy matching rule: if instant buy price >= sell offer price
        if (avgHighPrice !== null && avgHighPrice >= offer.price) {
          fillPrice = avgHighPrice;
          availableVolume = highPriceVolume || 1;
        } 
        // Instant sell matching rule: if instant sell price >= sell offer price
        else if (avgLowPrice !== null && avgLowPrice >= offer.price) {
          fillPrice = offer.price;
          availableVolume = lowPriceVolume || 1;
        }

        if (fillPrice !== null && availableVolume !== null && availableVolume > 0) {
          const qtyNeeded = offer.target_quantity - offer.filled_quantity;
          const fillQty = Math.min(qtyNeeded, availableVolume);

          if (fillQty > 0) {
            await this.executeFill(offer, fillQty, fillPrice);
            fillCount++;
          }
        }
      }
    }

    return fillCount;
  }

  /**
   * Helper to execute fill transaction for an offer
   */
  private static async executeFill(offer: TradingGameOffer, fillQty: number, fillPrice: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const now = Math.floor(Date.now() / 1000);
      const newFilledQty = offer.filled_quantity + fillQty;
      const isCompleted = newFilledQty >= offer.target_quantity;
      const newStatus = isCompleted ? 'COMPLETED' : 'ACTIVE';

      // Insert into fills record
      await client.query(
        `INSERT INTO trading_game_fills (offer_id, account_id, item_id, quantity_filled, fill_price, filled_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [offer.id, offer.account_id, offer.item_id, fillQty, fillPrice, now]
      );

      if (offer.type === 'BUY') {
        // Refund difference if fill price was lower than offer price
        const priceDiff = offer.price - fillPrice;
        const refundGP = priceDiff > 0 ? priceDiff * fillQty : 0;

        await client.query(
          `UPDATE trading_game_offers
           SET filled_quantity = $1,
               claimed_items = claimed_items + $2,
               claimed_gp = claimed_gp + $3,
               status = $4,
               updated_at = $5
           WHERE id = $6`,
          [newFilledQty, fillQty, refundGP, newStatus, now, offer.id]
        );
      } else {
        // SELL offer: Add GP earned (minus 2% OSRS GE tax capped at 5M per item & tax exemptions)
        const taxPerItem = calculateTax(fillPrice, offer.item_name);
        const netEarned = (fillPrice - taxPerItem) * fillQty;

        await client.query(
          `UPDATE trading_game_offers
           SET filled_quantity = $1,
               claimed_gp = claimed_gp + $2,
               status = $3,
               updated_at = $4
           WHERE id = $5`,
          [newFilledQty, netEarned, newStatus, now, offer.id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[TradingGameEngine] Fill execution failed for offer ${offer.id}:`, err);
    } finally {
      client.release();
    }
  }

  /**
   * Get Leaderboards (Current Month, Last Month, All-Time)
   */
  static async getLeaderboard(type: 'current' | 'last_month' | 'all_time'): Promise<LeaderboardEntry[]> {
    const items = await getCombinedItems();
    const itemMap = new Map<number, CombinedItem>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    if (type === 'current' || type === 'all_time') {
      const accountsRes = await pool.query(`
        SELECT a.*, u.username, ta.name as agent_name
        FROM trading_game_accounts a
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN trading_agents ta ON a.agent_id = ta.id
      `);

      const entries: LeaderboardEntry[] = [];

      for (const row of accountsRes.rows) {
        const accountId = row.id;
        const name = row.username || row.agent_name || `Trader #${accountId}`;
        const isAgent = !!row.agent_id;

        const offers = await getAccountOffers(accountId);
        const inventory = await getAccountInventory(accountId);

        let inventoryMarketValue = 0;
        for (const inv of inventory) {
          const marketItem = itemMap.get(inv.item_id);
          const price = marketItem?.buyPrice || inv.avg_buy_price || 0;
          inventoryMarketValue += inv.quantity * price;
        }

        let escrowedGP = 0;
        let unclaimedGP = 0;

        for (const offer of offers) {
          unclaimedGP += offer.claimed_gp;
          if (offer.status === 'ACTIVE') {
            if (offer.type === 'BUY') {
              const unfilled = offer.target_quantity - offer.filled_quantity;
              escrowedGP += unfilled * offer.price;
            } else {
              const unfilled = offer.target_quantity - offer.filled_quantity;
              const marketItem = itemMap.get(offer.item_id);
              const price = marketItem?.buyPrice || offer.price;
              inventoryMarketValue += unfilled * price;
            }
          }
        }

        const cashStack = parseInt(row.cash_stack);
        const netWorth = cashStack + escrowedGP + unclaimedGP + inventoryMarketValue;
        const profit = netWorth - 10000000;

        entries.push({
          rank: 0,
          accountId,
          name,
          isAgent,
          netWorth,
          profit,
          cashStack,
          activeOffersCount: offers.filter(o => o.status === 'ACTIVE').length
        });
      }

      entries.sort((a, b) => b.netWorth - a.netWorth);
      entries.forEach((e, idx) => e.rank = idx + 1);
      return entries;
    } else {
      // last_month leaderboard
      const now = new Date();
      now.setMonth(now.getMonth() - 1);
      const prevMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const res = await pool.query(`
        SELECT h.*, u.username, ta.name as agent_name, a.user_id, a.agent_id
        FROM trading_game_monthly_history h
        JOIN trading_game_accounts a ON h.account_id = a.id
        LEFT JOIN users u ON a.user_id = u.id
        LEFT JOIN trading_agents ta ON a.agent_id = ta.id
        WHERE h.month_identifier = $1
        ORDER BY h.final_net_worth DESC
      `, [prevMonthStr]);

      return res.rows.map((row, idx) => ({
        rank: idx + 1,
        accountId: row.account_id,
        name: row.username || row.agent_name || `Trader #${row.account_id}`,
        isAgent: !!row.agent_id,
        netWorth: parseInt(row.final_net_worth),
        profit: parseInt(row.net_profit),
        cashStack: 0,
        activeOffersCount: 0
      }));
    }
  }

  /**
   * Execute monthly reset (runs on transition to a new month)
   */
  static async checkAndPerformMonthlyReset(): Promise<void> {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get the last month for which reset was completed
    const lastResetMonth = await getSystemSetting('trading_game_last_reset_month', '');

    // On a fresh installation, record current month as the baseline and avoid wiping active state
    if (!lastResetMonth) {
      await setSystemSetting('trading_game_last_reset_month', currentMonthStr);
      logger.info(`[TradingGameEngine] Initialized trading game baseline month to ${currentMonthStr}`);
      return;
    }

    // If still in the same month, no reset needed
    if (lastResetMonth === currentMonthStr) {
      return;
    }

    logger.info(`[TradingGameEngine] Performing monthly reset: transitioning from ${lastResetMonth} to ${currentMonthStr}...`);

    // Fetch leaderboard for the concluding month
    const leaderboard = await this.getLeaderboard('current');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Archive final rankings for the concluding month
      for (const entry of leaderboard) {
        await client.query(
          `INSERT INTO trading_game_monthly_history (account_id, month_identifier, final_net_worth, net_profit, rank)
           VALUES ($1, $2, $3, $4, $5)`,
          [entry.accountId, lastResetMonth, entry.netWorth, entry.profit, entry.rank]
        );
      }

      // Reset cash stacks to 10M, clear active offers and inventories
      await client.query(`UPDATE trading_game_accounts SET cash_stack = 10000000, updated_at = (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT))`);
      await client.query(`DELETE FROM trading_game_offers`);
      await client.query(`DELETE FROM trading_game_inventory`);

      // Update the recorded reset month in system_settings inside the transaction
      await client.query(
        `INSERT INTO system_settings (key, value)
         VALUES ('trading_game_last_reset_month', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [currentMonthStr]
      );

      await client.query('COMMIT');
      logger.info(`[TradingGameEngine] Monthly reset completed successfully for new month ${currentMonthStr}!`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error("[TradingGameEngine] Monthly reset failed:", err);
    } finally {
      client.release();
    }
  }
}
