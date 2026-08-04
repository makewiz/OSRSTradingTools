import { getUserByUsername, createUser, pool } from "./index";
import { hashPassword } from "../auth";
import { logger } from "@osrstradingtools/shared";

/**
 * Automatically creates or promotes an admin user if ADMIN_USERNAME and ADMIN_PASSWORD
 * environment variables are defined.
 */
export async function seedAdminUser(): Promise<void> {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL || null;

  if (!adminUsername || !adminPassword) {
    return;
  }

  try {
    const existingUser = await getUserByUsername(adminUsername);

    if (!existingUser) {
      const passwordHash = await hashPassword(adminPassword);
      await createUser(adminUsername, passwordHash, adminEmail, true);
      logger.info(`[Database] Auto-seeded default admin user: ${adminUsername}`);
    } else if (!existingUser.is_admin) {
      await pool.query("UPDATE users SET is_admin = TRUE WHERE id = $1", [existingUser.id]);
      logger.info(`[Database] Promoted user '${adminUsername}' to admin`);
    }
  } catch (err) {
    logger.error("[Database] Failed to seed admin user:", err);
  }
}
