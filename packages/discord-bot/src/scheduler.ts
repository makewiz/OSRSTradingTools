import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAllActiveWatches, getLatestPrice, updateLastNotified, getDayChange } from "./database";

const COOLDOWN_SECONDS = 60 * 60; // 1 hour cooldown per item per user

export function startNotificationScheduler(client: Client) {
    // Run every minute
    cron.schedule("* * * * *", async () => {
        try {
            // eslint-disable-next-line no-console
            console.log("[Scheduler] Checking notifications...");
            await checkNotifications(client);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[Scheduler] Error checking notifications:", err);
        }
    });

    // Run daily at 10:00 AM UTC
    cron.schedule("0 10 * * *", async () => {
        try {
            console.log("[Scheduler] Broadcasting daily highlights...");
            await broadcastHighlights(client);
        } catch (err) {
            console.error("[Scheduler] Error broadcasting highlights:", err);
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
        console.log("[Scheduler] Broadcasted highlights to channel " + channelId);
    } catch (err) {
        console.error("[Scheduler] Failed to broadcast highlights:", err);
    }
}

async function checkNotifications(client: Client) {
    const watches = await getAllActiveWatches();
    const now = Math.floor(Date.now() / 1000);

    // Group by user to batch messages if we wanted to (simple version sends individual for now or basic batching)
    const notificationsToSend: { discordId: string; messages: string[] }[] = [];

    for (const watch of watches) {
        // Check cooldown
        if (watch.last_notified_at && (now - watch.last_notified_at) < COOLDOWN_SECONDS) {
            continue;
        }

        // Get price data
        const price = await getLatestPrice(watch.item_id);
        if (!price) continue;

        // Calculate change
        const dayChange = await getDayChange(watch.item_id, price.buy_price, price.sell_price);

        // Check threshold
        // Threshold is magnitude? Or direction? Assuming magnitude for now (absolute change) based on "day change".
        // Or if user sets 5%, do they mean > +5% or mismatch > 5%? 
        // Usually trading tools alert on spikes in either direction or specific drops.
        // Let's assume ABS(change) >= threshold.

        if (dayChange !== null && Math.abs(dayChange) >= (watch.day_change_threshold || 5.0)) {
            // Trigger notification
            const direction = dayChange > 0 ? "📈 UP" : "📉 DOWN";
            const msg = `**Item ${watch.item_id}**: ${direction} ${dayChange.toFixed(2)}% (Buy: ${price.buy_price}, Sell: ${price.sell_price})`;

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
                // eslint-disable-next-line no-console
                console.log(`[Notifier] Sent alert to ${batch.discordId} for ${batch.messages.length} items`);
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(`[Notifier] Failed to dm ${batch.discordId}`, err);
        }
    }
}
