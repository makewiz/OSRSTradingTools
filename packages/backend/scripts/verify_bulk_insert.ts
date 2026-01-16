
import { pool, bulkInsertItemHistory } from '../src/database';

async function testBulkInsert() {
    console.log("Starting bulk insert test...");
    try {
        const testItems = [];
        const now = Math.floor(Date.now() / 1000);

        // Create 100 sample items
        for (let i = 0; i < 100; i++) {
            testItems.push({
                itemId: 999999, // Use a fake ID to avoid conflicts
                timestamp: now - i * 300,
                avgHighPrice: 100 + i,
                avgLowPrice: 90 + i,
                highPriceVolume: 10,
                lowPriceVolume: 20
            });
        }

        console.log(`db url: ${process.env.DATABASE_URL}`);
        console.log(`Inserting ${testItems.length} items...`);
        await bulkInsertItemHistory('item_history_5m', testItems);
        console.log("Insert successful!");

        // Verify
        const res = await pool.query('SELECT COUNT(*) FROM item_history_5m WHERE item_id = 999999');
        console.log(`Count in DB: ${res.rows[0].count}`);

        // Clean up
        await pool.query('DELETE FROM item_history_5m WHERE item_id = 999999');
        console.log("Cleanup successful.");

    } catch (err) {
        console.error("Test failed:", err);
    } finally {
        await pool.end();
    }
}

testBulkInsert();
