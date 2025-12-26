import cron from "node-cron";
import { getCombinedItems } from "./osrsClient";
import { insertPriceHistory } from "./database";

let isRunning = false;

/**
 * Fetch and store current prices in the database
 */
async function fetchAndStorePrices(): Promise<void> {
  if (isRunning) {
    // eslint-disable-next-line no-console
    console.log("[Scheduler] Previous fetch still running, skipping...");
    return;
  }

  isRunning = true;
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  try {
    // eslint-disable-next-line no-console
    console.log(`[Scheduler] Fetching prices at ${new Date().toISOString()}...`);

    const items = await getCombinedItems();

    // Store each item's price data
    for (const item of items) {
      insertPriceHistory(
        item.id,
        timestamp,
        item.buyPrice,
        item.sellPrice,
        item.volume,
        "minute"
      );
    }

    // eslint-disable-next-line no-console
    console.log(`[Scheduler] Stored ${items.length} item prices successfully`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Scheduler] Error fetching/storing prices:", error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduled price fetcher (runs every minute)
 */
export function startPriceScheduler(): void {
  // Run immediately on startup
  fetchAndStorePrices().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[Scheduler] Initial fetch failed:", err);
  });

  // Then schedule to run every minute
  cron.schedule("* * * * *", () => {
    fetchAndStorePrices().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[Scheduler] Scheduled fetch failed:", err);
    });
  });

  // eslint-disable-next-line no-console
  console.log("[Scheduler] Price fetcher started (runs every minute)");
}


