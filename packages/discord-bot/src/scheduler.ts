import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAllActiveWatches, updateLastNotified } from "./database";
import { logger } from "@osrstradingtools/shared";

const COOLDOWN_1H_SECONDS = 60 * 60; // 1 hour cooldown for 1h change
const COOLDOWN_24H_SECONDS = 24 * 60 * 60; // 24 hour cooldown for 24h change

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

export function startNotificationScheduler(client: Client) {
    // Run every minute
    cron.schedule("* * * * *", async () => {
        try {
            logger.debug("[Scheduler] Checking notifications...");
            await checkNotifications(client);
        } catch (err) {
            logger.error("[Scheduler] Error checking notifications:", err);
        }
    });

    // Run daily at 10:00 AM UTC
    cron.schedule("0 10 * * *", async () => {
        try {
            logger.info("[Scheduler] Broadcasting daily highlights...");
            await broadcastHighlights(client);
        } catch (err) {
            logger.error("[Scheduler] Error broadcasting highlights:", err);
        }
    });
}

async function broadcastHighlights(client: Client) {
    const channelId = process.env.DISCORD_HIGHLIGHTS_CHANNEL_ID;
    if (!channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !(channel instanceof TextChannel)) return;

        const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
        const res = await fetch(`${backendUrl}/api/discord/bot/highlights`, {
            headers: {
                "x-bot-api-key": process.env.BOT_API_KEY || ""
            }
        });
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();

        const embed = new EmbedBuilder()
            .setTitle("📊 Daily Market Analysis")
            .setDescription(data.summary || "No summary available.")
            .setColor(0x0099ff)
            .setTimestamp(data.timestamp)
            .addFields(
                { name: "💰 High Margin", value: data.highMargin.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: false },
                { name: "📈 Top Spikes", value: data.priceSpikes.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: true },
                { name: "📉 Top Drops", value: data.priceDrops.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: true }
            )
            .setFooter({ text: "OSRS Trading Tools AI" });

        await channel.send({ embeds: [embed] });
        logger.info("[Scheduler] Broadcasted highlights to channel " + channelId);
    } catch (err) {
        logger.error("[Scheduler] Failed to broadcast highlights:", err);
    }
}

async function checkNotifications(client: Client) {
    const startHour = parseInt(process.env.BOT_SLEEP_START || "-1", 10);
    const endHour = parseInt(process.env.BOT_SLEEP_END || "-1", 10);
    const now = Math.floor(Date.now() / 1000);
    const currentHour = new Date().getUTCHours(); // UTC or local? Backend uses local or UTC?
    // Let's assume user wants to configure hours based on server time. 
    // process.env.TZ might be set or system local time.
    // Using simple getHours() uses local time of the server.
    const localHour = new Date().getHours();

    if (startHour >= 0 && endHour >= 0) {
        let isSleepTime = false;
        if (startHour < endHour) {
            // Example: 01 to 05
            if (localHour >= startHour && localHour < endHour) isSleepTime = true;
        } else {
            // Example: 22 to 06
            if (localHour >= startHour || localHour < endHour) isSleepTime = true;
        }

        if (isSleepTime) {
            // logger.debug("[Scheduler] Bot is in sleep mode. Spending resources sparingly.");
            // We do NOTHING. No DB check, no backend fetch.
            return;
        }
    }

    const watches = await getAllActiveWatches();

    // Explicitly optimize: If no watches, do not fetch backend
    if (watches.length === 0) return;

    // Fetch latest items from backend
    let items: any[] = [];
    try {
        const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
        // Use the dedicated bot endpoint with API Key authentication
        const res = await fetch(`${backendUrl}/api/discord/bot/items`, {
            headers: {
                "x-bot-api-key": process.env.BOT_API_KEY || ""
            }
        });

        if (!res.ok) {
            // Log specific error if unauthorized to help debugging
            if (res.status === 401) {
                logger.error("[Scheduler] Unauthorized: Check BOT_API_KEY in .env");
            }
            throw new Error(`Backend responded with ${res.status}`);
        }

        const data = await res.json();
        items = data.items || [];
    } catch (err) {
        logger.error("[Scheduler] Failed to fetch items from backend:", err);
        return;
    }

    // Map items for O(1) lookup
    const itemMap = new Map(items.map(i => [i.id, i]));

    // Group by user to batch messages
    const notificationsToSend: { discordId: string; messages: string[] }[] = [];

    // Helper to add to batch
    const addToBatch = (discordId: string, msg: string) => {
        let userBatch = notificationsToSend.find(n => n.discordId === discordId);
        if (!userBatch) {
            userBatch = { discordId, messages: [] };
            notificationsToSend.push(userBatch);
        }
        userBatch.messages.push(msg);
    };

    for (const watch of watches) {
        const item = itemMap.get(watch.item_id);
        if (!item) continue;

        // Determine cooldown
        const cooldown = watch.cooldown_seconds || COOLDOWN_1H_SECONDS;

        // Check 1h Change
        if (watch.one_hour_change_threshold !== null && watch.one_hour_change_threshold !== undefined) {
            const canNotify1h = !watch.last_notified_1h_at || (now - watch.last_notified_1h_at) >= cooldown;
            if (canNotify1h) {
                const hourChange = item.oneHourChange;
                if (hourChange !== null && Math.abs(hourChange) >= watch.one_hour_change_threshold) {
                    const direction = hourChange > 0 ? "📈 UP" : "📉 DOWN";
                    const link = `${frontendUrl}/item/${item.id}`;
                    const msg = `**${item.name}** (1H): ${direction} ${hourChange.toFixed(2)}% (Buy: ${item.buyPrice}, Sell: ${item.sellPrice})\n[View Item](${link})`;

                    await updateLastNotified(watch.id, '1h');
                    addToBatch(watch.discord_id, msg);
                }
            }
        }

        // Check 24h Change
        // For 24h change, we typically want 24h cooldown, but if user set a custom cooldown, 
        // we might want to respect it? 
        // Logic: if user sets custom cooldown, it applies to the watch rule they edited.
        // Currently DB has single cooldown_seconds column.
        // If they edit 1h watch, it sets cooldown_seconds.
        // If they edit 24h watch, it sets cooldown_seconds.
        // It's shared. So we use it for both.

        const cooldown24h = watch.cooldown_seconds || COOLDOWN_24H_SECONDS;

        if (watch.day_change_threshold !== null && watch.day_change_threshold !== undefined) {
            const canNotify24h = !watch.last_notified_at || (now - watch.last_notified_at) >= cooldown24h;
            if (canNotify24h) {
                const dayChange = item.dayChange;
                // Legacy fallback to 5.0
                const threshold = watch.day_change_threshold;

                if (dayChange !== null && Math.abs(dayChange) >= threshold) {
                    const direction = dayChange > 0 ? "📈 UP" : "📉 DOWN";
                    const link = `${frontendUrl}/item/${item.id}`;
                    const msg = `**${item.name}** (24H): ${direction} ${dayChange.toFixed(2)}% (Buy: ${item.buyPrice}, Sell: ${item.sellPrice})\n[View Item](${link})`;

                    await updateLastNotified(watch.id, '24h');
                    addToBatch(watch.discord_id, msg);
                }
            }
        }
    }

    // Send Messages
    for (const batch of notificationsToSend) {
        try {
            const user = await client.users.fetch(batch.discordId);
            if (user) {
                await user.send(`🚨 **OSRS Price Alerts**\n${batch.messages.join("\n")}`);
                logger.info(`[Notifier] Sent alert to ${batch.discordId} for ${batch.messages.length} items`);
            }
        } catch (err) {
            logger.error(`[Notifier] Failed to dm ${batch.discordId}`, err);
        }
    }
}



