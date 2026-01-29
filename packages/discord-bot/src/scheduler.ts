import cron from "node-cron";
import { Client, EmbedBuilder, TextChannel, NewsChannel } from "discord.js";
import { getAllActiveWatches, updateLastNotified, getSystemSetting, getAllActiveAdvancedWatches, getAdvancedWatchHistory, updateAdvancedWatchHistory } from "./database";
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
    let channelId = process.env.DISCORD_HIGHLIGHTS_CHANNEL_ID;

    try {
        const dbChannelId = await getSystemSetting("discord_highlights_channel_id", "");
        if (dbChannelId) channelId = dbChannelId;
    } catch (err) {
        // Fallback to env var
    }

    if (!channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || (!(channel instanceof TextChannel) && !(channel instanceof NewsChannel))) return;

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
    let startHour = parseInt(process.env.BOT_SLEEP_START || "-1", 10);
    let endHour = parseInt(process.env.BOT_SLEEP_END || "-1", 10);

    // Attempt to fetch dynamic settings from DB
    try {
        const dbStart = await getSystemSetting("bot_sleep_start", "");
        const dbEnd = await getSystemSetting("bot_sleep_end", "");

        if (dbStart !== "") startHour = parseInt(dbStart, 10);
        if (dbEnd !== "") endHour = parseInt(dbEnd, 10);
    } catch (err) {
        // Fallback to env vars on error, already set above
    }

    const now = Math.floor(Date.now() / 1000);
    // User requested UTC time for bot sleep times
    const currentHourUtc = new Date().getUTCHours();

    if (startHour >= 0 && endHour >= 0) {
        let isSleepTime = false;
        if (startHour == endHour) {
            // Continuous sleep time
            isSleepTime = true;
        } else if (startHour < endHour) {
            // Example: 01 to 05
            if (currentHourUtc >= startHour && currentHourUtc < endHour) isSleepTime = true;
        } else {
            // Example: 22 to 06
            if (currentHourUtc >= startHour || currentHourUtc < endHour) isSleepTime = true;
        }

        if (isSleepTime) {
            // We do NOTHING. No DB check, no backend fetch.
            return;
        }
    }

    const watches = await getAllActiveWatches();
    const advancedWatches = await getAllActiveAdvancedWatches();

    // Explicitly optimize: If no watches of either type, do not fetch backend
    if (watches.length === 0 && advancedWatches.length === 0) return;

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
    interface NotificationBatch {
        header: string;
        items: string[];
    }
    const notificationsToSend = new Map<string, NotificationBatch[]>();

    // Helper to add to batch
    const addToBatch = (discordId: string, header: string, items: string[], allowMerge = true) => {
        let userBatches = notificationsToSend.get(discordId);
        if (!userBatches) {
            userBatches = [];
            notificationsToSend.set(discordId, userBatches);
        }
        // Merge into existing batch if header matches.

        let existingBatch = allowMerge ? userBatches.find(b => b.header === header) : undefined;
        if (existingBatch) {
            existingBatch.items.push(...items);
        } else {
            userBatches.push({ header, items });
        }
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
                    addToBatch(watch.discord_id, "🚨 **OSRS Price Alerts**", [msg]);
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
                    addToBatch(watch.discord_id, "🚨 **OSRS Price Alerts**", [msg]);
                }
            }
        }
    }

    // --- CHECK ADVANCED WATCHES ---
    if (advancedWatches.length > 0) {
        for (const watch of advancedWatches) {
            let potentialMatches: any[] = [];

            // 1. Filter items
            for (const item of items) {
                // strict null checks
                if (watch.min_buy_price !== null && (item.buyPrice === null || item.buyPrice < watch.min_buy_price)) continue;
                if (watch.max_buy_price !== null && (item.buyPrice === null || item.buyPrice > watch.max_buy_price)) continue;
                if (watch.min_sell_price !== null && (item.sellPrice === null || item.sellPrice < watch.min_sell_price)) continue;
                if (watch.max_sell_price !== null && (item.sellPrice === null || item.sellPrice > watch.max_sell_price)) continue;
                if (watch.min_volume !== null && (item.volume === null || item.volume < watch.min_volume)) continue;

                // Change filters
                if (watch.min_change_1h !== null && (item.oneHourChange === null || Math.abs(item.oneHourChange) < watch.min_change_1h)) continue;
                if (watch.min_change_24h !== null && (item.dayChange === null || Math.abs(item.dayChange) < watch.min_change_24h)) continue;

                // New Filters
                if (watch.is_members !== null && item.members !== watch.is_members) continue;
                if (watch.min_buy_limit !== null && (item.limit === null || item.limit < watch.min_buy_limit)) continue;
                if (watch.max_buy_limit !== null && (item.limit === null || item.limit > watch.max_buy_limit)) continue;
                if (watch.min_margin !== null && (item.margin === null || item.margin < watch.min_margin)) continue;
                if (watch.max_margin !== null && (item.margin === null || item.margin > watch.max_margin)) continue;
                if (watch.min_profit !== null && (item.profit === null || item.profit < watch.min_profit)) continue;
                if (watch.max_profit !== null && (item.profit === null || item.profit > watch.max_profit)) continue;
                if (watch.min_roi !== null && (item.roi === null || item.roi < watch.min_roi)) continue;
                if (watch.min_potential_profit !== null && (item.potentialProfit === null || item.potentialProfit < watch.min_potential_profit)) continue;

                potentialMatches.push(item);
            }

            // 2. Sort Items
            if (potentialMatches.length > 0) {
                const orderBy = watch.order_by || 'profit';
                const direction = watch.direction === 'asc' ? 1 : -1;

                potentialMatches.sort((a, b) => {
                    let valA = 0;
                    let valB = 0;

                    switch (orderBy) {
                        case 'profit': valA = a.profit ?? 0; valB = b.profit ?? 0; break;
                        case 'roi': valA = a.roi ?? 0; valB = b.roi ?? 0; break;
                        case 'margin': valA = a.margin ?? 0; valB = b.margin ?? 0; break;
                        case 'volume': valA = a.volume ?? 0; valB = b.volume ?? 0; break;
                        case 'oneHourChange': valA = Math.abs(a.oneHourChange ?? 0); valB = Math.abs(b.oneHourChange ?? 0); break;
                        case 'dayChange': valA = a.dayChange ?? 0; valB = b.dayChange ?? 0; break;
                        default: valA = a.profit ?? 0; valB = b.profit ?? 0;
                    }

                    if (valA < valB) return -1 * direction;
                    if (valA > valB) return 1 * direction;
                    return 0;
                });

                // 3. Max Count
                const maxCount = watch.max_count || 10;
                potentialMatches = potentialMatches.slice(0, maxCount);

                // 4. Cooldown & Notification Construction
                const cooldownSeconds = (watch.cooldown_minutes || 60) * 60;
                const itemsToSend: string[] = [];
                let hasTriggeredItem = false;
                const evaluatedItems: { item: any, msg: string }[] = [];

                for (const item of potentialMatches) {
                    const lastTriggered = await getAdvancedWatchHistory(watch.id, item.id);
                    const isTriggered = !lastTriggered || (now - lastTriggered) >= cooldownSeconds;

                    if (isTriggered) hasTriggeredItem = true;

                    const link = `${frontendUrl}/item/${item.id}`;
                    // Only highlight strictly new items (no history)
                    const prefix = !lastTriggered ? "🆕 " : "";
                    const msg = `${prefix}**${item.name}**: ${item.buyPrice?.toLocaleString()} GP | Profit: ${item.profit?.toLocaleString()} | ROI: ${item.roi?.toFixed(2)}%\n` +
                        `[View Item](${link})`;

                    evaluatedItems.push({ item, msg });
                }

                if (hasTriggeredItem) {
                    for (const evaluated of evaluatedItems) {
                        itemsToSend.push(evaluated.msg);
                        // Update history for all items sent to prevent immediate re-notification of the same list
                        await updateAdvancedWatchHistory(watch.id, evaluated.item.id);
                    }
                }

                if (itemsToSend.length > 0) {
                    const header = `🔎 **${watch.name || "Advanced Watch"}**`;
                    addToBatch(watch.discord_id, header, itemsToSend, false);
                }
            }
        }
    }

    // Send Messages
    for (const [discordId, batches] of notificationsToSend.entries()) {
        try {
            const user = await client.users.fetch(discordId);
            if (user) {
                // Construct one big message or multiple?
                // Discord limit is 2000 chars (not 4000). Embeds have more but simple text is 2000.
                // We should try to group.

                let messageBuffer = "";

                for (const batch of batches) {
                    const header = batch.header;
                    const items = batch.items;

                    let batchText = `${header}\n`;
                    batchText += items.join("\n");
                    batchText += "\n\n";

                    if (messageBuffer.length + batchText.length > 1900) {
                        // Flush
                        await user.send(messageBuffer);
                        messageBuffer = "";
                    }
                    messageBuffer += batchText;
                }

                if (messageBuffer.trim().length > 0) {
                    await user.send(messageBuffer);
                }

                const totalItems = batches.reduce((acc, b) => acc + b.items.length, 0);
                logger.info(`[Notifier] Sent alert to ${discordId} for ${totalItems} items`);
            }
        } catch (err) {
            logger.error(`[Notifier] Failed to dm ${discordId}`, err);
        }
    }
}



