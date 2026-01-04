import axios from "axios";

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

export async function exchangeCodeForToken(code: string, redirectUri?: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams();
    params.append("client_id", process.env.DISCORD_CLIENT_ID!);
    params.append("client_secret", process.env.DISCORD_CLIENT_SECRET!);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri || process.env.DISCORD_REDIRECT_URI!);

    try {
        const response = await axios.post(`${DISCORD_API_URL}/oauth2/token`, params, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return response.data;
    } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error("Discord Token Exchange Failed:");
        if (err.response) {
            // eslint-disable-next-line no-console
            console.error("Status:", err.response.status);
            // eslint-disable-next-line no-console
            console.error("Data:", err.response.data);
        } else {
            // eslint-disable-next-line no-console
            console.error(err.message);
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
        console.error("Discord User Fetch Failed:");
        if (err.response) {
            // eslint-disable-next-line no-console
            console.error("Status:", err.response.status);
            // eslint-disable-next-line no-console
            console.error("Data:", err.response.data);
        } else {
            // eslint-disable-next-line no-console
            console.error(err.message);
        }
        throw new Error("Failed to fetch Discord user");
    }
}
