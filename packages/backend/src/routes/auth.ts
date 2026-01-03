import express from "express";
import {
    createUser,
    getUserByUsername,
    getUserByDiscordId,
    linkDiscordUser,
    User
} from "../database";
import {
    hashPassword,
    verifyPassword,
    generateToken,
    authenticateToken
} from "../auth";
import { exchangeCodeForToken, getDiscordUser } from "../oauth";
import crypto from "crypto";

const router = express.Router();

// Register
router.post("/register", async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        // Check if user already exists
        const existingUser = getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: "Username already exists" });
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);
        const user = createUser(username, passwordHash, email || null);

        // Generate token
        const token = generateToken(user);

        // Return user info and token (exclude password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userSafe } = user;
        res.status(201).json({ user: userSafe, token });
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to register user" });
    }
});

// Login
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        const user = getUserByUsername(username);
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
        console.error(err);
        res.status(500).json({ error: "Failed to login" });
    }
});

// Discord Login
router.post("/discord/login", async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        // 1. Exchange code for token
        const tokenData = await exchangeCodeForToken(code as string);
        const discordProfile = await getDiscordUser(tokenData.access_token);

        // 2. Check if user exists with this Discord ID
        let user = getUserByDiscordId(discordProfile.id);

        if (!user) {
            // 3. If not, treat as "Register via Discord"
            // We need to create a new user. We'll generate a random username if collision, or random password.
            // NOTE: In a real app, might ask user to choose username. For now, auto-create.
            let username = discordProfile.username;

            // Check collision
            let suffix = 1;
            while (getUserByUsername(username)) {
                username = `${discordProfile.username}${suffix}`;
                suffix++;
            }

            // Generate random password (they login via Discord anyway)
            const randomPw = crypto.randomBytes(16).toString("hex");
            const pwHash = await hashPassword(randomPw);

            user = createUser(username, pwHash, discordProfile.email || null);

            // Link Immediately
            linkDiscordUser(user.id, discordProfile.id);
        }

        // 4. Generate Token
        const jwt = generateToken(user);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password_hash, ...userSafe } = user;

        res.json({ user: userSafe, token: jwt });

    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to login with Discord" });
    }
});

// Get Current User
router.get("/me", authenticateToken, (req, res) => {
    const user = req.user!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...userSafe } = user;
    res.json({ user: userSafe });
});

export default router;
