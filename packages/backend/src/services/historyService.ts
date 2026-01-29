import { fetchWikiTimeSeries, getMapping, CombinedItem, OsrsItemMapping } from "../osrsClient";
import { bulkInsertItemHistory } from "../database";
import { logger } from "@osrstradingtools/shared";

interface BackfillStatus {
    isBackfilling: boolean;
    totalItems: number;
    processedCount: number;
    currentItemName: string | null;
    lastError: string | null;
    startTime: number | null;
}

export class HistoryService {
    private status: BackfillStatus = {
        isBackfilling: false,
        totalItems: 0,
        processedCount: 0,
        currentItemName: null,
        lastError: null,
        startTime: null
    };

    public getStatus(): BackfillStatus {
        return { ...this.status };
    }

    public async backfillHistory(retentionDays?: number): Promise<void> {
        if (this.status.isBackfilling) {
            throw new Error("Backfill already in progress");
        }

        this.status = {
            isBackfilling: true,
            totalItems: 0,
            processedCount: 0,
            currentItemName: null,
            lastError: null,
            startTime: Date.now()
        };

        // Run asynchronously
        this.processBackfill(retentionDays).catch(err => {
            logger.error("[HistoryService] Backfill failed unexpectedly:", err);
            this.status.lastError = err.message;
            this.status.isBackfilling = false;
        });
    }

    private async processBackfill(requestedRetentionDays: number = 365): Promise<void> {
        try {
            logger.info(`[HistoryService] Starting history backfill. Retention: ${requestedRetentionDays} days.`);

            const mapping = await getMapping();
            this.status.totalItems = mapping.length;

            // Determine global max retention from env
            const envRetentionDays = process.env.DATA_RETENTION_DAYS
                ? parseInt(process.env.DATA_RETENTION_DAYS, 10)
                : 3650;

            const MAX_RETENTION_SECONDS = envRetentionDays * 24 * 3600;

            // Calculate retention seconds for each bucket, capped by global max
            // 5m: 24h
            const retention5m = Math.min(24 * 3600, MAX_RETENTION_SECONDS);
            // 1h: 7d
            const retention1h = Math.min(7 * 24 * 3600, MAX_RETENTION_SECONDS);
            // 6h: 30d
            const retention6h = Math.min(30 * 24 * 3600, MAX_RETENTION_SECONDS);
            // 24h: requested days (capped by global)
            const retention24h = Math.min(requestedRetentionDays * 24 * 3600, MAX_RETENTION_SECONDS);

            const now = Math.floor(Date.now() / 1000);

            for (const item of mapping) {
                if (!this.status.isBackfilling) break; // Allow cancellation logic if we ever implement it

                this.status.currentItemName = item.name;

                // Rate limit: 200ms delay between items
                await new Promise(resolve => setTimeout(resolve, 200));

                try {
                    await this.backfillItem(item, now, retention5m, retention1h, retention6h, retention24h);
                } catch (err) {
                    logger.warn(`[HistoryService] Failed to backfill item ${item.name} (${item.id}):`, err);
                    // Continue with next item
                }

                this.status.processedCount++;
            }

            logger.info("[HistoryService] Backfill completed.");
        } catch (err) {
            logger.error("[HistoryService] Backfill process error:", err);
            this.status.lastError = (err as Error).message;
        } finally {
            this.status.isBackfilling = false;
            this.status.currentItemName = null;
        }
    }

    private async backfillItem(
        item: OsrsItemMapping,
        now: number,
        retention5m: number,
        retention1h: number,
        retention6h: number,
        retention24h: number
    ) {
        // We fetching all timesteps. 
        // To be efficient, we might not need to fetch ALL if retention is very low, but simple logic is safer.

        const tasks: Promise<void>[] = [];

        // 5m
        if (retention5m > 0) {
            tasks.push(this.fetchAndInsert(item.id, '5m', 'item_history_5m', now - retention5m));
        }
        // 1h
        if (retention1h > 0) {
            tasks.push(this.fetchAndInsert(item.id, '1h', 'item_history_1h', now - retention1h));
        }
        // 6h
        if (retention6h > 0) {
            tasks.push(this.fetchAndInsert(item.id, '6h', 'item_history_6h', now - retention6h));
        }
        // 24h
        if (retention24h > 0) {
            tasks.push(this.fetchAndInsert(item.id, '24h', 'item_history_24h', now - retention24h));
        }

        await Promise.all(tasks);
    }

    private async fetchAndInsert(itemId: number, timestep: string, table: string, sinceTimestamp: number) {
        try {
            const data = await fetchWikiTimeSeries(itemId, timestep);
            // Filter by retention
            const validPoints = data
                .filter(d => d.timestamp >= sinceTimestamp)
                .map(d => ({
                    itemId,
                    timestamp: d.timestamp,
                    avgHighPrice: d.avgHighPrice,
                    avgLowPrice: d.avgLowPrice,
                    highPriceVolume: d.highPriceVolume,
                    lowPriceVolume: d.lowPriceVolume
                }));

            if (validPoints.length > 0) {
                // Split into chunks of 1000
                const chunkSize = 1000;
                for (let i = 0; i < validPoints.length; i += chunkSize) {
                    await bulkInsertItemHistory(table, validPoints.slice(i, i + chunkSize));
                }
            }
        } catch (err) {
            // Log debug or warn? Warn might be too noisy if many items fail
            if (process.env.NODE_ENV === 'development') {
                logger.debug(`[HistoryService] Failed fetch ${timestep} for ${itemId}: ${err}`);
            }
        }
    }
}

export const historyService = new HistoryService();
