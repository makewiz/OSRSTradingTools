import express from "express";
import { createUser, getUserByUsername, User } from "../database";
import { hashPassword, verifyPassword, generateToken, authenticateToken } from "../auth";

const router = express.Router();

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
    try {
        const { username, password, email } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" });
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
        const { password_hash, ...userSafe } = user;
        res.status(201).json({ user: userSafe, token });
    } catch (err: any) {
        // Check for SQLite unique constraint error (redundant check but safe)
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: "Username already exists" });
        }

        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to register user" });
    }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required" });
        }

        // Find user
        const user = getUserByUsername(username);
        if (!user) {
            // Use generic message for security
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Verify password
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate token
        const token = generateToken(user);

        // Return user info and token
        const { password_hash, ...userSafe } = user;
        res.json({ user: userSafe, token });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        res.status(500).json({ error: "Failed to login" });
    }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, (req, res) => {
    const user = req.user!;
    const { password_hash, ...userSafe } = user;
    res.json({ user: userSafe });
});

export default router;
