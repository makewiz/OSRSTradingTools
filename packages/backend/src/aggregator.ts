import cron from "node-cron";
import { db } from "./database";

/**
 * Aggregate minute-level data to hourly data
 * Should be run periodically to compress old data
 */
export function aggregateToHourly(): void {
  // eslint-disable-next-line no-console
  console.log("[Aggregator] Starting hourly aggregation...");

  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // 24 hours ago

  // Find all minute-level records older than 24 hours that haven't been aggregated yet
  const minuteRecords = db
    .prepare(`
      SELECT item_id, timestamp, buy_price, sell_price, volume
      FROM item_price_history
      WHERE granularity = 'minute' 
        AND timestamp < ?
      ORDER BY item_id, timestamp
    `)
    .all(oneDayAgo) as Array<{
    item_id: number;
    timestamp: number;
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
    // Round timestamp down to the hour
    const hourTimestamp = Math.floor(record.timestamp / 3600) * 3600;
    const key = `${record.item_id}_${hourTimestamp}`;

    if (!hourlyGroups.has(key)) {
      hourlyGroups.set(key, []);
    }
    hourlyGroups.get(key)!.push(record);
  }

  // Aggregate each group
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO item_price_history 
    (item_id, timestamp, buy_price, sell_price, volume, granularity)
    VALUES (?, ?, ?, ?, ?, 'hour')
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM item_price_history
    WHERE item_id = ? 
      AND timestamp >= ? 
      AND timestamp < ?
      AND granularity = 'minute'
  `);

  let aggregated = 0;
  let deleted = 0;

  for (const [key, records] of hourlyGroups.entries()) {
    if (records.length === 0) continue;

    const itemId = records[0].item_id;
    const hourTimestamp = Math.floor(records[0].timestamp / 3600) * 3600;

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
    insertStmt.run(itemId, hourTimestamp, avgBuyPrice, avgSellPrice, totalVolume);
    aggregated++;

    // Delete minute-level records for this hour
    const nextHour = hourTimestamp + 3600;
    const result = deleteStmt.run(itemId, hourTimestamp, nextHour);
    deleted += result.changes || 0;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[Aggregator] Aggregated ${aggregated} hours, deleted ${deleted} minute records`
  );
}

/**
 * Aggregate hourly data to daily data
 * Should be run periodically to compress old hourly data
 */
export function aggregateToDaily(): void {
  // eslint-disable-next-line no-console
  console.log("[Aggregator] Starting daily aggregation...");

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60; // 7 days ago

  // Find all hourly records older than 7 days
  const hourlyRecords = db
    .prepare(`
      SELECT item_id, timestamp, buy_price, sell_price, volume
      FROM item_price_history
      WHERE granularity = 'hour' 
        AND timestamp < ?
      ORDER BY item_id, timestamp
    `)
    .all(sevenDaysAgo) as Array<{
    item_id: number;
    timestamp: number;
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
    // Round timestamp down to the day (midnight UTC)
    const dayTimestamp = Math.floor(record.timestamp / 86400) * 86400;
    const key = `${record.item_id}_${dayTimestamp}`;

    if (!dailyGroups.has(key)) {
      dailyGroups.set(key, []);
    }
    dailyGroups.get(key)!.push(record);
  }

  // Aggregate each group
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO item_price_history 
    (item_id, timestamp, buy_price, sell_price, volume, granularity)
    VALUES (?, ?, ?, ?, ?, 'day')
  `);

  const deleteStmt = db.prepare(`
    DELETE FROM item_price_history
    WHERE item_id = ? 
      AND timestamp >= ? 
      AND timestamp < ?
      AND granularity = 'hour'
  `);

  let aggregated = 0;
  let deleted = 0;

  for (const [key, records] of dailyGroups.entries()) {
    if (records.length === 0) continue;

    const itemId = records[0].item_id;
    const dayTimestamp = Math.floor(records[0].timestamp / 86400) * 86400;

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
    insertStmt.run(itemId, dayTimestamp, avgBuyPrice, avgSellPrice, totalVolume);
    aggregated++;

    // Delete hourly records for this day
    const nextDay = dayTimestamp + 86400;
    const result = deleteStmt.run(itemId, dayTimestamp, nextDay);
    deleted += result.changes || 0;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[Aggregator] Aggregated ${aggregated} days, deleted ${deleted} hourly records`
  );
}

/**
 * Start the aggregation scheduler
 * Runs hourly aggregation daily at 2 AM, daily aggregation weekly
 */
export function startAggregationScheduler(): void {
  // Run hourly aggregation daily at 2 AM
  cron.schedule("0 2 * * *", () => {
    try {
      aggregateToHourly();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Aggregator] Hourly aggregation failed:", err);
    }
  });

  // Run daily aggregation weekly on Sunday at 3 AM
  cron.schedule("0 3 * * 0", () => {
    try {
      aggregateToDaily();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Aggregator] Daily aggregation failed:", err);
    }
  });

  // eslint-disable-next-line no-console
  console.log("[Aggregator] Aggregation scheduler started");
}

