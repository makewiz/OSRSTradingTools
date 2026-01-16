import axios from "axios";
import { logger } from "@osrstradingtools/shared";

const DISCORD_API_URL = "https://discord.com/api/v10";

export interface DiscordTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    email?: string;
}

export async function exchangeCodeForToken(code: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams();
    params.append("client_id", process.env.DISCORD_CLIENT_ID!);
    params.append("client_secret", process.env.DISCORD_CLIENT_SECRET!);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", process.env.DISCORD_REDIRECT_URI!);

    try {
        const response = await axios.post(`${DISCORD_API_URL}/oauth2/token`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return response.data;
    } catch (err: any) {
        // eslint-disable-next-line no-console
        logger.error("Discord Token Exchange Failed:");
        if (err.response) {
            // eslint-disable-next-line no-console
            logger.error("Status:", err.response.status);
            // eslint-disable-next-line no-console
            logger.error("Data:", err.response.data);
        } else {
            // eslint-disable-next-line no-console
            logger.error(err.message);
        }
        throw new Error("Failed to exchange code for token");
    }
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
    try {
        const response = await axios.get(`${DISCORD_API_URL}/users/@me`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return response.data;
    } catch (err: any) {
        // eslint-disable-next-line no-console
        logger.error("Discord User Fetch Failed:");
        if (err.response) {
            // eslint-disable-next-line no-console
            logger.error("Status:", err.response.status);
            // eslint-disable-next-line no-console
            logger.error("Data:", err.response.data);
        } else {
            // eslint-disable-next-line no-console
            logger.error(err.message);
        }
        throw new Error("Failed to fetch Discord user");
    }
}

export async function checkGuildMembership(userId: string): Promise<boolean> {
    const guildId = process.env.DISCORD_GUILD_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!guildId || !botToken) {
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        logger.warn("DISCORD_GUILD_ID or DISCORD_BOT_TOKEN not set. Cannot check guild membership.");
        return false;
    }

    try {
        const response = await axios.get(`${DISCORD_API_URL}/guilds/${guildId}/members/${userId}`, {
            headers: { Authorization: `Bot ${botToken}` },
            timeout: 5000,
        });
        return response.status === 200;
    } catch (err: any) {
        if (err.response) {
            if (err.response.status === 404) {
                return false; // User not in guild
            }
            // eslint-disable-next-line no-console
            // eslint-disable-next-line no-console
            logger.error("Failed to check guild membership. Status:", err.response.status, "Data:", err.response.data);
        } else {
            // eslint-disable-next-line no-console
            logger.error("Failed to check guild membership:", err.message);
        }
        throw err; // Rethrow so caller knows it was a transient/upstream error
    }
}

