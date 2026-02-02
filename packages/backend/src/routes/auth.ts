import express from "express";
import { z } from "zod";
import {
    createUser,
    getUserByUsername,
    getUserByDiscordId,
    linkDiscordUser
} from "../database";
import {
    hashPassword,
    verifyPassword,
    generateToken,
    authenticateToken
} from "../auth";
import { exchangeCodeForToken, getDiscordUser, checkGuildMembership, assignLinkedRole } from "../oauth";
import { authLimiter } from "../middleware/rateLimiter";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

// Validation Schemas
const registerSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    email: z.string().email().optional().or(z.literal("")),
});

const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
});

const discordLoginSchema = z.object({
    code: z.string().min(1, "Authorization code is required"),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters long"),
});

// Register
router.post("/register", authLimiter, async (req, res) => {
    try {
        if (process.env.DISABLE_REGISTRATION === "true") {
            return res.status(403).json({ error: "Registration is disabled" });
        }

        // Validate input
        const result = registerSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: result.error.issues[0].message });
        }

        const { username, password, email } = result.data;

        // Check if user already exists
        const existingUser = await getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: "Username already exists" });
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);
        const user = await createUser(username, passwordHash, email || null);

        // Generate token
        const token = generateToken(user);

        // Return user info and token (exclude password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userSafe } = user;
        res.status(201).json({ user: userSafe, token });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        logger.error("Failed to register user:", err);
        res.status(500).json({ error: "Failed to register user" });
    }
});

// Login
router.post("/login", authLimiter, async (req, res) => {
    try {
        // Validate input
        const result = loginSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: result.error.issues[0].message });
        }

        const { username, password } = result.data;

        const user = await getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = generateToken(user);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userSafe } = user;
        res.json({ user: userSafe, token });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to login:", err);
        res.status(500).json({ error: "Failed to login" });
    }
});

// Discord Login
router.post("/discord/login", authLimiter, async (req, res) => {
    // Validate input
    const result = discordLoginSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { code } = result.data;

    try {
        // 1. Exchange code for token
        const tokenData = await exchangeCodeForToken(code);
        const discordProfile = await getDiscordUser(tokenData.access_token);

        // 2. Check if user exists with this Discord ID
        let user = await getUserByDiscordId(discordProfile.id);

        if (!user) {
            if (process.env.DISABLE_REGISTRATION === "true") {
                try {
                    const isMember = await checkGuildMembership(discordProfile.id);
                    if (!isMember) {
                        return res.status(403).json({ error: "Registration is disabled" });
                    }
                } catch (err) {
                    // eslint-disable-next-line no-console
                    logger.error("Guild check failed during registration:", err);
                    return res.status(503).json({ error: "Registration temporarily unavailable" });
                }
            }

            // 3. If not, treat as "Register via Discord"
            // We need to create a new user. We'll generate a random username if collision, or random password.
            // Create new user with Discord username.
            let username = discordProfile.username;

            // Check collision
            let suffix = 1;
            while (await getUserByUsername(username)) {
                username = `${discordProfile.username}${suffix}`;
                suffix++;
            }

            // Generate random password (they login via Discord anyway)
            // const randomPw = crypto.randomBytes(16).toString("hex");
            // const pwHash = await hashPassword(randomPw);

            user = await createUser(username, null, null);

            // Link Immediately
            await linkDiscordUser(user.id, discordProfile.id);

            // Assign "Linked User" role
            await assignLinkedRole(discordProfile.id, discordProfile.username);
        }

        // 4. Generate Token
        const jwt = generateToken(user);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userSafe } = user;

        res.json({ user: userSafe, token: jwt });

    } catch (err: any) {
        // eslint-disable-next-line no-console
        logger.error("Failed to login with Discord:", err);
        res.status(500).json({ error: "Failed to login with Discord" });
    }
});

// Get Current User
router.get("/me", authenticateToken, (req, res) => {
    const user = req.user!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userSafe } = user;
    res.json({ user: { ...userSafe, has_password: !!user.password_hash } });
});

// Change Password
router.post("/change-password", authLimiter, authenticateToken, async (req, res) => {
    try {
        const user = req.user!;
        if (!user.password_hash) {
            return res.status(400).json({ error: "Cannot change password for passwordless account" });
        }

        // Validate input
        const result = changePasswordSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: result.error.issues[0].message });
        }

        const { currentPassword, newPassword } = result.data;

        // Verify current password
        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(403).json({ error: "Invalid current password" });
        }

        // Update password
        const newHash = await hashPassword(newPassword);
        const { updateUserPassword } = await import("../database");
        await updateUserPassword(user.id, newHash);

        res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to update password:", err);
        res.status(500).json({ error: "Failed to update password" });
    }
});

// Delete Account
router.delete("/account", authenticateToken, async (req, res) => {
    try {
        const userId = req.user!.id;

        const { deleteUser } = await import("../database");
        await deleteUser(userId);

        res.json({ success: true, message: "Account deleted successfully" });
    } catch (err) {
        // eslint-disable-next-line no-console
        logger.error("Failed to delete account:", err);
        res.status(500).json({ error: "Failed to delete account" });
    }
});

export default router;
