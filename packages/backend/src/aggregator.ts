import cron from "node-cron";
import { pool } from "./database";

/**
 * Aggregate minute-level data to hourly data
 * Should be run periodically to compress old data
 */
export async function aggregateToHourly(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[Aggregator] Starting hourly aggregation...");

  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // 24 hours ago

  // Find all minute-level records older than 24 hours that haven't aggregated
  const userQuery = `
      SELECT item_id, timestamp, buy_price, sell_price, volume
      FROM item_price_history
      WHERE granularity = 'minute' 
        AND timestamp < $1
      ORDER BY item_id, timestamp
  `;

  const result = await pool.query(userQuery, [oneDayAgo]);

  const minuteRecords = result.rows as Array<{
    item_id: number;
    timestamp: string | number;
    buy_price: number | null;
    sell_price: number | null;
    volume: number | null;
  }>;

  if (minuteRecords.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[Aggregator] No records to aggregate");
    return;
  }

  // Group by item_id and hour
  const hourlyGroups = new Map<string, typeof minuteRecords>();

  for (const record of minuteRecords) {
    const ts = typeof record.timestamp === 'string' ? parseInt(record.timestamp) : record.timestamp;
    // Round timestamp down to the hour
    const hourTimestamp = Math.floor(ts / 3600) * 3600;
    const key = `${record.item_id}_${hourTimestamp}`;

    if (!hourlyGroups.has(key)) {
      hourlyGroups.set(key, []);
    }
    hourlyGroups.get(key)!.push(record);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let aggregated = 0;
    let deleted = 0;

    const insertQuery = `
        INSERT INTO item_price_history 
        (item_id, timestamp, buy_price, sell_price, volume, granularity)
        VALUES ($1, $2, $3, $4, $5, 'hour')
        ON CONFLICT (item_id, timestamp, granularity) DO UPDATE SET
            buy_price = EXCLUDED.buy_price,
            sell_price = EXCLUDED.sell_price,
            volume = EXCLUDED.volume
    `;

    const deleteQuery = `
        DELETE FROM item_price_history
        WHERE item_id = $1 
        AND timestamp >= $2 
        AND timestamp < $3
        AND granularity = 'minute'
    `;

    for (const [key, records] of hourlyGroups.entries()) {
      if (records.length === 0) continue;

      const itemId = records[0].item_id;
      const firstTs = typeof records[0].timestamp === 'string' ? parseInt(records[0].timestamp) : records[0].timestamp;
      const hourTimestamp = Math.floor(firstTs / 3600) * 3600;

      // Calculate averages for prices, sum for volume
      let buySum = 0;
      let buyCount = 0;
      let sellSum = 0;
      let sellCount = 0;
      let volumeSum = 0;
      let volumeCount = 0;

      for (const record of records) {
        if (record.buy_price !== null) {
          buySum += record.buy_price;
          buyCount++;
        }
        if (record.sell_price !== null) {
          sellSum += record.sell_price;
          sellCount++;
        }
        if (record.volume !== null) {
          volumeSum += record.volume;
          volumeCount++;
        }
      }

      const avgBuyPrice = buyCount > 0 ? Math.round(buySum / buyCount) : null;
      const avgSellPrice = sellCount > 0 ? Math.round(sellSum / sellCount) : null;
      const totalVolume = volumeCount > 0 ? volumeSum : null;

      // Insert aggregated record
      await client.query(insertQuery, [itemId, hourTimestamp, avgBuyPrice, avgSellPrice, totalVolume]);
      aggregated++;

      // Delete minute-level records for this hour
      const nextHour = hourTimestamp + 3600;
      const delResult = await client.query(deleteQuery, [itemId, hourTimestamp, nextHour]);
      deleted += delResult.rowCount || 0;
    }

    await client.query("COMMIT");

    // eslint-disable-next-line no-console
    console.log(
      `[Aggregator] Aggregated ${aggregated} hours, deleted ${deleted} minute records`
    );

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Aggregate hourly data to daily data
 * Should be run periodically to compress old hourly data
 */
export async function aggregateToDaily(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[Aggregator] Starting daily aggregation...");

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days ago

  // Find all hourly records older than 7 days
  const query = `
      SELECT item_id, timestamp, buy_price, sell_price, volume
      FROM item_price_history
      WHERE granularity = 'hour' 
        AND timestamp < $1
      ORDER BY item_id, timestamp
  `;

  const result = await pool.query(query, [sevenDaysAgo]);

  const hourlyRecords = result.rows as Array<{
    item_id: number;
    timestamp: string | number;
    buy_price: number | null;
    sell_price: number | null;
    volume: number | null;
  }>;

  if (hourlyRecords.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[Aggregator] No hourly records to aggregate");
    return;
  }

  // Group by item_id and day
  const dailyGroups = new Map<string, typeof hourlyRecords>();

  for (const record of hourlyRecords) {
    const ts = typeof record.timestamp === 'string' ? parseInt(record.timestamp) : record.timestamp;
    // Round timestamp down to the day (midnight UTC)
    const dayTimestamp = Math.floor(ts / 86400) * 86400;
    const key = `${record.item_id}_${dayTimestamp}`;

    if (!dailyGroups.has(key)) {
      dailyGroups.set(key, []);
    }
    dailyGroups.get(key)!.push(record);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let aggregated = 0;
    let deleted = 0;

    const insertQuery = `
        INSERT INTO item_price_history 
        (item_id, timestamp, buy_price, sell_price, volume, granularity)
        VALUES ($1, $2, $3, $4, $5, 'day')
        ON CONFLICT (item_id, timestamp, granularity) DO UPDATE SET
            buy_price = EXCLUDED.buy_price,
            sell_price = EXCLUDED.sell_price,
            volume = EXCLUDED.volume
    `;

    const deleteQuery = `
        DELETE FROM item_price_history
        WHERE item_id = $1 
        AND timestamp >= $2 
        AND timestamp < $3
        AND granularity = 'hour'
    `;

    for (const [key, records] of dailyGroups.entries()) {
      if (records.length === 0) continue;

      const itemId = records[0].item_id;
      const firstTs = typeof records[0].timestamp === 'string' ? parseInt(records[0].timestamp) : records[0].timestamp;
      const dayTimestamp = Math.floor(firstTs / 86400) * 86400;

      // Calculate averages for prices, sum for volume
      let buySum = 0;
      let buyCount = 0;
      let sellSum = 0;
      let sellCount = 0;
      let volumeSum = 0;
      let volumeCount = 0;

      for (const record of records) {
        if (record.buy_price !== null) {
          buySum += record.buy_price;
          buyCount++;
        }
        if (record.sell_price !== null) {
          sellSum += record.sell_price;
          sellCount++;
        }
        if (record.volume !== null) {
          volumeSum += record.volume;
          volumeCount++;
        }
      }

      const avgBuyPrice = buyCount > 0 ? Math.round(buySum / buyCount) : null;
      const avgSellPrice = sellCount > 0 ? Math.round(sellSum / sellCount) : null;
      const totalVolume = volumeCount > 0 ? volumeSum : null;

      // Insert aggregated record
      await client.query(insertQuery, [itemId, dayTimestamp, avgBuyPrice, avgSellPrice, totalVolume]);
      aggregated++;

      // Delete hourly records for this day
      const nextDay = dayTimestamp + 86400;
      const delResult = await client.query(deleteQuery, [itemId, dayTimestamp, nextDay]);
      deleted += delResult.rowCount || 0;
    }

    await client.query("COMMIT");

    // eslint-disable-next-line no-console
    console.log(
      `[Aggregator] Aggregated ${aggregated} days, deleted ${deleted} hourly records`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Start the aggregation scheduler
 * Runs hourly aggregation daily at 2 AM, daily aggregation weekly
 */
export function startAggregationScheduler(): void {
  // Run hourly aggregation daily at 2 AM
  cron.schedule("0 2 * * *", () => {
    aggregateToHourly().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Aggregator] Hourly aggregation failed:", err);
    });
  });

  // Run daily aggregation weekly on Sunday at 3 AM
  cron.schedule("0 3 * * 0", () => {
    aggregateToDaily().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Aggregator] Daily aggregation failed:", err);
    });
  });

  // eslint-disable-next-line no-console
  console.log("[Aggregator] Aggregation scheduler started");
}
