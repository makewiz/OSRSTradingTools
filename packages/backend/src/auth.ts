import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { getUserById, User } from "./database";

// JWT Secret Key - should be in environment variables
const JWT_SECRET = process.env.JWT_SECRET || "development_secret_do_not_use_in_production";

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
    if (!hash) return false;
    return bcrypt.compare(password, hash);
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: User): string {
    // Payload contains minimal user info
    const payload = {
        sub: user.id,
        username: user.username
    };

    // Sign token, valid for 7 days
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Middleware to authenticate JWT token
 */
/**
 * Middleware to authenticate JWT token
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: "Access token required" });
    }

    try {
        const decoded: any = jwt.verify(token, JWT_SECRET);

        // Get user from database to ensure they still exist
        const user = await getUserById(decoded.sub);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
    }
}
