import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { getCombinedItems } from "./osrsClient";
import { initializeDatabase, closeDatabase } from "./database";
import { startPriceScheduler, getLatestItems, touchActivity, getLastFetchTime } from "./scheduler";

import itemsRouter from "./routes/items";
import authRouter from "./routes/auth";
import favoritesRouter from "./routes/favorites";
import discordRouter from "./routes/discord";
import highlightsRouter from "./routes/highlights";
import adminRouter from "./routes/admin";

// Initialize database
// Initialize database
(async () => {
  try {
    await initializeDatabase();
    // eslint-disable-next-line no-console
    console.log("[Database] Initialized");
  } catch (err) {
    console.error("[Database] Failed to initialize:", err);
    process.exit(1);
  }
})();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "osrs-trading-tools-backend" });
});

// Auth routes
app.use("/api/auth", authRouter);
// Favorites routes
app.use("/api/favorites", favoritesRouter);
// Discord routes
app.use("/api/discord", discordRouter);
// Highlights routes
app.use("/api/highlights", highlightsRouter);
// Admin routes
app.use("/api/admin", adminRouter);


import { authenticateToken } from "./auth";

app.get("/api/items", async (req, res, next) => {
  if (process.env.REQUIRE_AUTH === "true") {
    await authenticateToken(req, res, next);
  } else {
    next();
  }
}, async (_req, res) => {
  try {
    touchActivity();
    const cached = getLatestItems();
    if (cached && cached.length > 0 && Date.now() - getLastFetchTime() < 120000) {
      res.json({ items: cached });
    } else {
      // Fallback if cache is empty (e.g. startup)
      const items = await getCombinedItems();
      res.json({ items });
    }
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


const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  // eslint-disable-next-line no-console
  console.log("\n[SIGINT] Shutting down gracefully...");
  server.close(async () => {
    await closeDatabase();
    // eslint-disable-next-line no-console
    console.log("[Shutdown] Database closed");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  // eslint-disable-next-line no-console
  console.log("\n[SIGTERM] Shutting down gracefully...");
  server.close(async () => {
    await closeDatabase();
    // eslint-disable-next-line no-console
    console.log("[Shutdown] Database closed");
    process.exit(0);
  });
});
