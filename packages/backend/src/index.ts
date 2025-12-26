import express from "express";
import cors from "cors";
import { getCombinedItems } from "./osrsClient";
import { initializeDatabase, closeDatabase } from "./database";
import { startPriceScheduler } from "./scheduler";
import { startAggregationScheduler } from "./aggregator";
import itemsRouter from "./routes/items";

// Initialize database
initializeDatabase();
// eslint-disable-next-line no-console
console.log("[Database] Initialized");

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "osrs-trading-tools-backend" });
});

app.get("/api/items", async (_req, res) => {
  try {
    const items = await getCombinedItems();
    res.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(502).json({ error: "Failed to fetch OSRS prices" });
  }
});

// Item detail routes
app.use("/api/items", itemsRouter);

// Start schedulers
startPriceScheduler();
startAggregationScheduler();

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  // eslint-disable-next-line no-console
  console.log("\n[SIGINT] Shutting down gracefully...");
  server.close(() => {
    closeDatabase();
    // eslint-disable-next-line no-console
    console.log("[Shutdown] Database closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  // eslint-disable-next-line no-console
  console.log("\n[SIGTERM] Shutting down gracefully...");
  server.close(() => {
    closeDatabase();
    // eslint-disable-next-line no-console
    console.log("[Shutdown] Database closed");
    process.exit(0);
  });
});



