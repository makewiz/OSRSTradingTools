import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAllActiveWatches, updateLastNotified } from "./database";
import { logger } from "@osrstradingtools/shared";

const COOLDOWN_SECONDS = 60 * 60; // 1 hour cooldown per item per user

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

        const res = await fetch("http://localhost:4000/api/highlights");
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
    const watches = await getAllActiveWatches();
    const now = Math.floor(Date.now() / 1000);

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

    for (const watch of watches) {
        // Check cooldown
        if (watch.last_notified_at && (now - watch.last_notified_at) < COOLDOWN_SECONDS) {
            continue;
        }

        const item = itemMap.get(watch.item_id);
        if (!item) continue;

        // Check threshold
        // item.dayChange is already calculated by backend
        const dayChange = item.dayChange;

        if (dayChange !== null && Math.abs(dayChange) >= (watch.day_change_threshold || 5.0)) {
            // Trigger notification
            const direction = dayChange > 0 ? "📈 UP" : "📉 DOWN";
            const msg = `**${item.name}**: ${direction} ${dayChange.toFixed(2)}% (Buy: ${item.buyPrice}, Sell: ${item.sellPrice})`;

            // Update DB
            await updateLastNotified(watch.id);

            // Add to send list
            let userBatch = notificationsToSend.find(n => n.discordId === watch.discord_id);
            if (!userBatch) {
                userBatch = { discordId: watch.discord_id, messages: [] };
                notificationsToSend.push(userBatch);
            }
            userBatch.messages.push(msg);
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
