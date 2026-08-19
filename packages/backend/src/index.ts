import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { initializeDatabase, closeDatabase } from "./database";
import { startPriceScheduler, getLatestItems, runRetentionPolicy } from "./scheduler";
import { logger } from "@osrstradingtools/shared";

import itemsRouter from "./routes/items";
import authRouter from "./routes/auth";
import favoritesRouter from "./routes/favorites";
import discordRouter from "./routes/discord";
import highlightsRouter from "./routes/highlights";
import adminRouter from "./routes/admin";
import configRouter from "./routes/config";
import analysisRouter from "./routes/analysis";
import recipesRouter from "./routes/recipes";
import chatRouter from "./routes/chat"; // [NEW] Chat route

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
// Config routes
app.use("/api/config", configRouter);
// Analysis routes
// Analysis routes
app.use("/api/analysis", analysisRouter);
// Filter routes
import filtersRouter from "./routes/filters";
app.use("/api/filters", filtersRouter);
// Recipe routes
app.use("/api/recipes", recipesRouter);
// Chat routes
app.use("/api/chat", chatRouter); // [NEW] Chat route
// Autonomous Agent routes
import agentsRouter from "./routes/agents";
app.use("/api/agents", agentsRouter);
// Trading Portfolio routes
import portfolioRouter from "./routes/portfolio";
app.use("/api/portfolio", portfolioRouter);
// Hiscore routes
import hiscoresRouter from "./routes/hiscores";
app.use("/api/hiscores", hiscoresRouter);

// Arbitrage routes
import { createArbitrageRouter } from "./routes/arbitrage";
import { itemService } from "./services/itemService"; // Fixed path
app.use("/api/arbitrage", createArbitrageRouter(itemService));

// Trading Game routes
import tradingGameRouter from "./routes/tradingGame";
app.use("/api/game", tradingGameRouter);




import { authenticateToken } from "./auth";

app.get("/api/items", async (req, res, next) => {
  if (process.env.REQUIRE_AUTH === "true") {
    await authenticateToken(req, res, next);
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const items = await getLatestItems();
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const pageSizeParam = req.query.pageSize || req.query.limit;
    const pageSize = pageSizeParam ? parseInt(pageSizeParam as string, 10) : 0;

    let filtered = items;
    if (search) {
      filtered = items.filter(i => i.name.toLowerCase().includes(search));
      filtered.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const aExact = aName === search;
        const bExact = bName === search;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = aName.startsWith(search);
        const bStarts = bName.startsWith(search);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return aName.localeCompare(bName);
      });
    }

    if (pageSize > 0 && !isNaN(pageSize)) {
      filtered = filtered.slice(0, pageSize);
    }

    res.json({ items: filtered });
  } catch (err) {
    logger.error("Failed to fetch OSRS prices:", err);
    res.status(502).json({ error: "Failed to fetch OSRS prices" });
  }
});

// Item detail routes
app.use("/api/items", itemsRouter);

async function startServer() {
  try {
    // 1. Initialize database and ensure partition tables exist before anything else
    await initializeDatabase();
    logger.info("[Database] Initialized");

    // 2. Start background schedulers (price fetching, retention downsampling, agent triggers)
    startPriceScheduler();

    // 3. Start Express HTTP server
    const server = app.listen(port, () => {
      logger.info(`Backend listening on http://localhost:${port}`);
    });

    // Graceful shutdown handlers
    const shutdown = (signal: string) => {
      logger.info(`\n[${signal}] Shutting down gracefully...`);
      server.close(async () => {
        await closeDatabase();
        logger.info("[Shutdown] Database closed");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err: any) {
    const isConnRefused =
      err?.code === "ECONNREFUSED" ||
      (err?.message && err.message.includes("ECONNREFUSED")) ||
      (Array.isArray(err?.errors) && err.errors.some((e: any) => e?.code === "ECONNREFUSED" || e?.message?.includes("ECONNREFUSED")));

    if (isConnRefused) {
      const dbUrl = process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/osrs_trading";
      logger.error("\n" + "=".repeat(80));
      logger.error("❌ [Database Connection Error] Could not connect to PostgreSQL!");
      logger.error("The database server appears to be offline or unreachable.");
      logger.error("");
      logger.error("💡 How to fix:");
      logger.error("   1. If running locally with Docker, start the database container with:");
      logger.error("      docker compose up -d");
      logger.error("");
      logger.error(`   2. Target Connection String: ${dbUrl}`);
      logger.error("      (If using a remote or custom database, verify DATABASE_URL in packages/backend/.env)");
      logger.error("=".repeat(80) + "\n");
    } else {
      logger.error("[Database] Failed to initialize:", err);
    }
    process.exit(1);
  }
}

startServer();
