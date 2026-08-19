import { PoolClient, Pool } from "pg";
import { logger } from "@osrstradingtools/shared";

// Helper to get partition bounds for a given timestamp
function getPartitionRange(timestamp: number, interval: number): { start: number; end: number } {
    const start = Math.floor(timestamp / interval) * interval;
    const end = start + interval;
    return { start, end };
}

// Helper to generate partition table name
function getPartitionName(tableName: string, startTimestamp: number): string {
    return `${tableName}_p${startTimestamp}`;
}

export async function ensurePartitionedHistoryTable(
    client: PoolClient,
    tableName: string,
    retentionSeconds: number,
    partitionInterval: number
): Promise<void> {
    // Check if table exists and is partitioned
    const res = await client.query(
        `SELECT relkind FROM pg_class WHERE relname = $1`,
        [tableName]
    );

    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      item_id INTEGER NOT NULL,
      timestamp BIGINT NOT NULL,
      avg_high_price INTEGER,
      avg_low_price INTEGER,
      high_price_volume INTEGER,
      low_price_volume INTEGER,
      PRIMARY KEY (item_id, timestamp)
    ) PARTITION BY RANGE (timestamp)
  `;

    // Migration logic
    if ((res.rowCount || 0) > 0 && res.rows[0].relkind === 'r') {
        logger.info(`[Database] Migrating ${tableName} to partitioned table...`);

        // Rename existing
        await client.query(`ALTER TABLE ${tableName} RENAME TO ${tableName}_legacy`);

        // Create new partitioned table
        await client.query(createTableQuery);

        // Create indexes on parent (propagates to partitions)
        await client.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_time ON ${tableName}(item_id, timestamp DESC)`);

        // Create partitions covering the retention period
        const now = Math.floor(Date.now() / 1000);
        // Be generous with lookback to ensure we capture all valid data
        const startTimeResult = await client.query(`SELECT MIN(timestamp) as min_ts FROM ${tableName}_legacy`);
        const minTs = parseInt(startTimeResult.rows[0].min_ts) || (now - retentionSeconds);

        // Limit to retention period to drop old data effectively
        const retentionStart = now - retentionSeconds;
        const effectiveStart = Math.max(minTs, retentionStart);

        // Create necessary partitions
        await ensurePartitionsExist(client, tableName, effectiveStart, now + partitionInterval, partitionInterval);

        // Copy data
        logger.info(`[Database] Copying legacy data for ${tableName}...`);
        await client.query(`
      INSERT INTO ${tableName} 
      SELECT * FROM ${tableName}_legacy 
      WHERE timestamp >= $1
    `, [effectiveStart]);

        // Cleanup
        logger.info(`[Database] Dropping legacy table ${tableName}_legacy...`);
        await client.query(`DROP TABLE ${tableName}_legacy`);

        logger.info(`[Database] Migration of ${tableName} complete.`);
    } else if ((res.rowCount || 0) === 0) {
        // New table
        await client.query(createTableQuery);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_time ON ${tableName}(item_id, timestamp DESC)`);
    }

    // Ensure partitions exist for the full retention period (plus some future buffer)
    const now = Math.floor(Date.now() / 1000);
    const retentionStart = now - retentionSeconds;
    await ensurePartitionsExist(client, tableName, retentionStart, now + partitionInterval * 2, partitionInterval);
}

async function ensurePartitionsExist(
    client: PoolClient,
    tableName: string,
    fromTime: number,
    toTime: number,
    interval: number
): Promise<void> {
    let current = Math.floor(fromTime / interval) * interval;
    const end = Math.floor(toTime / interval) * interval;

    while (current <= end) {
        const partitionName = getPartitionName(tableName, current);
        const rangeEnd = current + interval;

        try {
            await client.query(`
              CREATE TABLE IF NOT EXISTS ${partitionName}
              PARTITION OF ${tableName}
              FOR VALUES FROM (${current}) TO (${rangeEnd})
            `);
        } catch (err: any) {
            // 42P07 is PostgreSQL 'duplicate_table' error code.
            // When multiple queries attempt to create the partition at the exact same moment,
            // Postgres can throw 42P07 despite IF NOT EXISTS. Safely ignore it.
            if (err?.code === '42P07') {
                logger.debug(`[Database] Partition ${partitionName} already exists (handled concurrent creation).`);
            } else {
                throw err;
            }
        }

        current += interval;
    }
}

export async function maintainPartitions(
    pool: Pool,
    tableName: string,
    retentionSeconds: number,
    partitionInterval: number
): Promise<void> {
    const client = await pool.connect();
    try {
        const now = Math.floor(Date.now() / 1000);

        // 1. Create future partitions (lookahead 2 intervals)
        await ensurePartitionsExist(client, tableName, now, now + partitionInterval * 2, partitionInterval);

        // 2. Drop old partitions
        // Retention end = now - retentionSeconds.
        // Any partition where range_end < retention_end is safe to drop.
        const retentionCutoff = now - retentionSeconds;

        // Find partitions that are fully older than retentionCutoff
        // We can query pg_class/pg_inherits but valid standard naming allows us to infer or we can enable strict checks.
        // Easier: Query system catalogs.

        const attempts = await client.query(`
      SELECT
          nmsp_child.nspname AS child_schema,
          child.relname      AS child,
          pg_get_expr(child.relpartbound, child.oid) AS partbound
      FROM pg_inherits
          JOIN pg_class parent        ON pg_inherits.inhparent = parent.oid
          JOIN pg_class child         ON pg_inherits.inhrelid   = child.oid
          JOIN pg_namespace nmsp_parent   ON nmsp_parent.oid  = parent.relnamespace
          JOIN pg_namespace nmsp_child    ON nmsp_child.oid   = child.relnamespace
      WHERE parent.relname = $1
    `, [tableName]);

        for (const row of attempts.rows) {
            // Parse FOR VALUES FROM (START) TO (END)
            const match = row.partbound.match(/FOR VALUES FROM \('?(\d+)'?\) TO \('?(\d+)'?\)/);
            if (match) {
                const pEnd = parseInt(match[2]);
                if (pEnd < retentionCutoff) {
                    logger.info(`[Partition Manager] Dropping expired partition ${row.child} (End: ${pEnd}, Cutoff: ${retentionCutoff})`);
                    await client.query(`DROP TABLE ${row.child_schema}.${row.child}`);
                }
            }
        }

    } catch (err) {
        logger.error(`[Partition Manager] Error maintaining partitions for ${tableName}:`, err);
    } finally {
        client.release();
    }
}
