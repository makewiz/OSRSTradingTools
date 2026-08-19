import path from "path";
import dotenv from "dotenv";

// Load dotenv from package directory if not already set
dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://user:password@localhost:5432/osrs_trading";
}

import { initializeDatabase, getUserByUsername, createUser, pool } from "../database";
import { hashPassword } from "../auth";
import { logger } from "@osrstradingtools/shared";

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const rawArgs = process.argv.slice(2);

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rawArgs[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  const username = args.username || process.env.ADMIN_USERNAME || "admin";
  const password = args.password || process.env.ADMIN_PASSWORD;
  const email = args.email || process.env.ADMIN_EMAIL || null;

  if (!username) {
    logger.error("Error: --username is required.");
    process.exit(1);
  }

  try {
    await initializeDatabase();

    const existingUser = await getUserByUsername(username);

    if (existingUser) {
      if (existingUser.is_admin) {
        logger.info(`User '${username}' is already an admin.`);
      } else {
        await pool.query("UPDATE users SET is_admin = TRUE WHERE id = $1", [existingUser.id]);
        logger.info(`Successfully promoted existing user '${username}' to admin!`);
      }
    } else {
      if (!password) {
        logger.error("Error: --password or ADMIN_PASSWORD env variable is required to create a new admin account.");
        process.exit(1);
      }

      const passwordHash = await hashPassword(password);
      await createUser(username, passwordHash, email, true);
      logger.info(`Successfully created admin account '${username}'!`);
    }
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
      logger.error("   1. Start the local database with: docker compose up -d");
      logger.error(`   2. Target Connection String: ${dbUrl}`);
      logger.error("=".repeat(80) + "\n");
    } else {
      logger.error("Failed to create/promote admin user:", err);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
