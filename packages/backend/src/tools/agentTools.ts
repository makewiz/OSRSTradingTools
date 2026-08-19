import {
    addAgentTrigger,
    removeAgentTrigger,
    getAgentTriggers,
    queueAgentDiscordNotification,
    getDiscordUserByUserId,
    getUserPortfolio,
    addPortfolioItem,
    updatePortfolioItem,
    deletePortfolioItem,
    TradingAgent
} from "../database";
import { getLatestItems } from "../scheduler";
import { CombinedItem } from "../osrsClient";
import { TradingGameEngine } from "../services/tradingGameEngine";
import { logger } from "@osrstradingtools/shared";

export const autonomousAgentTools = [
    {
        name: "schedule_next_run",
        description: "Schedule the agent's next automated check-in execution after a specified time delay (in minutes). Use this if you want to re-evaluate the market at a later time (e.g. 15m, 30m, 60m).",
        parameters: {
            type: "OBJECT",
            properties: {
                delayMinutes: { type: "NUMBER", description: "Minutes to wait before next automated execution (minimum 5)." },
                reason: { type: "STRING", description: "Brief reason for scheduling next run (e.g. 'Waiting for 4-dose potion volume during peak hours')." }
            },
            required: ["delayMinutes", "reason"]
        }
    },
    {
        name: "set_price_trigger",
        description: "Set an automated market price or percentage change trigger that will wake up the agent immediately when matched.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric OSRS Item ID." },
                itemName: { type: "STRING", description: "Name of item if ID is unknown." },
                triggerType: {
                    type: "STRING",
                    description: "Type of trigger: 'buy_price_above' (Instant Buy/High price reaches target to sell), 'buy_price_below', 'sell_price_below' (Instant Sell/Low price drops to target to buy), 'sell_price_above', 'margin_above', 'roi_above', '1h_change', '24h_change'."
                },
                targetValue: { type: "NUMBER", description: "Target numeric value threshold (e.g. 1500 for price, 5 for 5% ROI/change)." },
                cooldownMinutes: { type: "NUMBER", description: "Trigger cooldown in minutes before re-triggering (default 15)." }
            },
            required: ["triggerType", "targetValue"]
        }
    },
    {
        name: "remove_price_trigger",
        description: "Remove an active price trigger previously registered by this agent.",
        parameters: {
            type: "OBJECT",
            properties: {
                triggerId: { type: "NUMBER", description: "Numeric ID of the trigger to remove." }
            },
            required: ["triggerId"]
        }
    },
    {
        name: "get_price_triggers",
        description: "Get all active price triggers currently registered by this agent.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "send_discord_notification",
        description: "Send an actionable trade alert DM or notification directly to the user's Discord account.",
        parameters: {
            type: "OBJECT",
            properties: {
                message: { type: "STRING", description: "The message text or recommendation to send to the user's Discord." }
            },
            required: ["message"]
        }
    },
    {
        name: "update_agent_memory",
        description: "Update the agent's persistent memory state (cash stack tracking, active positions, buy/sell targets, strategy notes).",
        parameters: {
            type: "OBJECT",
            properties: {
                cashStack: { type: "NUMBER", description: "Updated remaining GP cash stack available." },
                strategyNotes: { type: "STRING", description: "Updated strategy notes and active market observation." },
                activePositions: {
                    type: "ARRAY",
                    description: "List of currently open or planned trade positions (itemId, itemName, buyPrice, targetSellPrice, quantity).",
                    items: { type: "OBJECT" }
                }
            }
        }
    },
    {
        name: "get_user_portfolio",
        description: "Fetch the user's active trading portfolio items (bought items, quantities, average buy prices, current instant buy prices, net worth, and tax-adjusted profit). ALWAYS call this first to check user's portfolio.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "add_to_portfolio",
        description: "Add an item entry into the user's trading portfolio. Requires itemId, itemName, quantity, and buyPrice paid per item.",
        parameters: {
            type: "OBJECT",
            properties: {
                itemId: { type: "NUMBER", description: "Numeric OSRS item ID." },
                itemName: { type: "STRING", description: "Name of the item." },
                quantity: { type: "NUMBER", description: "Quantity of items bought (e.g. 1000)." },
                buyPrice: { type: "NUMBER", description: "Average purchase price paid per item in GP (cost basis)." },
                targetSellPrice: { type: "NUMBER", description: "Target sell price per item in GP (Instant Buy / High price target)." },
                notes: { type: "STRING", description: "Trade notes or strategy." }
            },
            required: ["itemId", "itemName", "quantity", "buyPrice"]
        }
    },
    {
        name: "update_portfolio_position",
        description: "Update a user's portfolio entry quantity or average buy price.",
        parameters: {
            type: "OBJECT",
            properties: {
                positionId: { type: "NUMBER", description: "ID of the portfolio position." },
                quantity: { type: "NUMBER", description: "Updated quantity of items." },
                buyPrice: { type: "NUMBER", description: "Updated average buy price per item in GP." },
                targetSellPrice: { type: "NUMBER", description: "Updated target sell price per item in GP." },
                notes: { type: "STRING", description: "Updated notes." }
            },
            required: ["positionId"]
        }
    },
    {
        name: "remove_from_portfolio",
        description: "Remove an item from the user's trading portfolio.",
        parameters: {
            type: "OBJECT",
            properties: {
                positionId: { type: "NUMBER", description: "ID of the portfolio position to delete." }
            },
            required: ["positionId"]
        }
    },
    {
        name: "game_get_account",
        description: "Fetch your AI agent's active Trading Game state including cash stack (10M starting balance), 8 GE slots, inventory, net worth, and monthly profit.",
        parameters: { type: "OBJECT", properties: {} }
    },
    {
        name: "game_place_offer",
        description: "Place a BUY or SELL offer in one of your 8 GE slots (0 to 7) in the Trading Game.",
        parameters: {
            type: "OBJECT",
            properties: {
                slot: { type: "NUMBER", description: "GE slot index (0 to 7)." },
                itemId: { type: "NUMBER", description: "Numeric OSRS Item ID." },
                itemName: { type: "STRING", description: "Item name if ID is unknown." },
                type: { type: "STRING", description: "Offer type: 'BUY' or 'SELL'." },
                quantity: { type: "NUMBER", description: "Quantity of items to buy or sell." },
                price: { type: "NUMBER", description: "Price in GP per item." }
            },
            required: ["slot", "type", "quantity", "price"]
        }
    },
    {
        name: "game_cancel_offer",
        description: "Cancel an active Grand Exchange offer in the Trading Game and refund unfilled escrow.",
        parameters: {
            type: "OBJECT",
            properties: {
                offerId: { type: "NUMBER", description: "Numeric ID of the GE offer to cancel." }
            },
            required: ["offerId"]
        }
    },
    {
        name: "game_collect_slot",
        description: "Collect filled items or GP from a Grand Exchange offer slot into your cash stack or inventory in the Trading Game.",
        parameters: {
            type: "OBJECT",
            properties: {
                offerId: { type: "NUMBER", description: "Numeric ID of the GE offer slot to collect." }
            },
            required: ["offerId"]
        }
    },
    {
        name: "game_get_leaderboard",
        description: "Check public Trading Game leaderboards (Current Month, Last Month, or All-Time).",
        parameters: {
            type: "OBJECT",
            properties: {
                type: { type: "STRING", description: "Leaderboard timeframe: 'current', 'last_month', or 'all_time'." }
            }
        }
    },
    {
        name: "suggest_trade_actions",
        description: "Provide structured trade recommendations and actionable buy/sell signals to the user. Call this tool whenever recommending specific OSRS items to buy, sell, or flip.",
        parameters: {
            type: "OBJECT",
            properties: {
                suggestions: {
                    type: "ARRAY",
                    description: "List of recommended trade actions.",
                    items: {
                        type: "OBJECT",
                        properties: {
                            itemId: { type: "NUMBER", description: "Numeric OSRS item ID." },
                            itemName: { type: "STRING", description: "Name of the item." },
                            buyPrice: { type: "NUMBER", description: "Recommended buy price (Instant Sell / Low price) in GP." },
                            targetSellPrice: { type: "NUMBER", description: "Target sell price (Instant Buy / High price) in GP." },
                            quantity: { type: "NUMBER", description: "Recommended quantity to buy/sell." },
                            rationale: { type: "STRING", description: "Brief rationale or trade logic." }
                        },
                        required: ["itemName", "buyPrice", "targetSellPrice", "quantity"]
                    }
                }
            },
            required: ["suggestions"]
        }
    },
    {
        name: "suggest_followup_options",
        description: "Provide a list of suggested quick-reply prompt options or next steps for the user to click in chat (e.g. 'Show recipes for Herblore', 'Set watch alert for Armadyl Godsword').",
        parameters: {
            type: "OBJECT",
            properties: {
                options: {
                    type: "ARRAY",
                    description: "List of clickable follow-up option prompts for the user.",
                    items: { type: "STRING" }
                }
            },
            required: ["options"]
        }
    },
    {
        name: "ask_user_question",
        description: "Ask the user a structured question with interactive choice options or for clarifying input (e.g. risk level, target ROI, specific skill). The user can click an option button to reply.",
        parameters: {
            type: "OBJECT",
            properties: {
                question: { type: "STRING", description: "The question text to display to the user." },
                options: {
                    type: "ARRAY",
                    description: "Selectable answer option buttons for the user to click.",
                    items: { type: "STRING" }
                },
                allowCustomInput: { type: "BOOLEAN", description: "Whether the user can also type a custom answer (default true)." },
                multiSelect: { type: "BOOLEAN", description: "Whether the user can select multiple options (default false)." }
            },
            required: ["question"]
        }
    }
];

export async function executeAgentTool(
    name: string,
    args: Record<string, any>,
    agent: TradingAgent,
    contextState: {
        nextRunTime?: number;
        scheduledReason?: string;
        discordNotified?: boolean;
        actionsTaken: any[];
        updatedMemory?: any;
    }
): Promise<any> {
    logger.info(`Executing Agent Tool '${name}' for agent ${agent.id} (${agent.name}):`, args);

    switch (name) {
        case "schedule_next_run": {
            const delayMinutes = Math.max(5, typeof args.delayMinutes === "number" ? args.delayMinutes : 30);
            const now = Math.floor(Date.now() / 1000);
            const nextRunAt = now + delayMinutes * 60;
            const reason = args.reason || `Scheduled check in ${delayMinutes} minutes.`;

            contextState.nextRunTime = nextRunAt;
            contextState.scheduledReason = reason;
            contextState.actionsTaken.push({ action: "schedule_next_run", delayMinutes, nextRunAt, reason });

            return {
                success: true,
                message: `Scheduled next run at ${new Date(nextRunAt * 1000).toUTCString()} (in ${delayMinutes} minutes).`
            };
        }

        case "set_price_trigger": {
            let itemId: number | null = args.itemId ?? null;
            let itemName: string | null = args.itemName ?? null;

            if (!itemId && itemName) {
                const items = await getLatestItems();
                const found = items.find((i: CombinedItem) => i.name.toLowerCase().includes(itemName!.toLowerCase()));
                if (found) {
                    itemId = found.id;
                    itemName = found.name;
                }
            }

            const triggerType = args.triggerType;
            const targetValue = args.targetValue;
            const cooldownMinutes = typeof args.cooldownMinutes === "number" ? args.cooldownMinutes : 15;
            const cooldownSeconds = cooldownMinutes * 60;

            const newTrigger = await addAgentTrigger(
                agent.id,
                itemId,
                itemName,
                triggerType,
                targetValue,
                cooldownSeconds
            );

            contextState.actionsTaken.push({ action: "set_price_trigger", trigger: newTrigger });
            return {
                success: true,
                trigger: newTrigger,
                message: `Set ${triggerType} trigger for ${itemName || `Item ${itemId}`} at ${targetValue}.`
            };
        }

        case "remove_price_trigger": {
            await removeAgentTrigger(args.triggerId, agent.id);
            contextState.actionsTaken.push({ action: "remove_price_trigger", triggerId: args.triggerId });
            return { success: true, message: `Removed trigger ID ${args.triggerId}.` };
        }

        case "get_price_triggers": {
            const triggers = await getAgentTriggers(agent.id);
            return { triggers };
        }

        case "send_discord_notification": {
            const discordUser = await getDiscordUserByUserId(agent.user_id);
            if (!discordUser) {
                return {
                    success: false,
                    error: "User has not linked their Discord account in settings. Cannot send Discord DM."
                };
            }

            await queueAgentDiscordNotification(discordUser.discord_id, agent.name, args.message);
            contextState.discordNotified = true;
            contextState.actionsTaken.push({ action: "send_discord_notification", message: args.message });
            return { success: true, message: "Queued Discord alert notification for user." };
        }

        case "update_agent_memory": {
            const currentMemory = typeof agent.memory === "object" && agent.memory ? agent.memory : {};
            const updated = {
                ...currentMemory,
                ...(typeof args.cashStack === "number" ? { cashStack: args.cashStack } : {}),
                ...(args.strategyNotes ? { strategyNotes: args.strategyNotes } : {}),
                ...(Array.isArray(args.activePositions) ? { positions: args.activePositions } : {}),
                lastUpdated: Math.floor(Date.now() / 1000)
            };

            contextState.updatedMemory = updated;
            if (typeof args.cashStack === "number") {
                agent.cash_stack = args.cashStack;
            }
            contextState.actionsTaken.push({ action: "update_agent_memory", updatedMemory: updated });
            return { success: true, message: "Updated agent persistent memory and strategy notes." };
        }

        case "get_user_portfolio": {
            const portfolio = await getUserPortfolio(agent.user_id);
            const items = await getLatestItems();
            const itemMap = new Map(items.map((i: CombinedItem) => [i.id, i]));

            const enriched = portfolio.map(p => {
                const ge = itemMap.get(p.item_id);
                return {
                    id: p.id,
                    itemId: p.item_id,
                    itemName: p.item_name,
                    quantity: p.quantity,
                    buyPrice: p.buy_price,
                    targetSellPrice: p.target_sell_price,
                    status: p.status,
                    notes: p.notes,
                    currentBuyPrice: ge?.buyPrice ?? null,
                    currentSellPrice: ge?.sellPrice ?? null,
                    currentMargin: ge?.margin ?? null
                };
            });
            return { portfolio: enriched };
        }

        case "add_to_portfolio": {
            const targetSell = args.targetSellPrice ?? args.buyPrice;
            const item = await addPortfolioItem(
                agent.user_id,
                args.itemId,
                args.itemName,
                args.quantity,
                args.buyPrice,
                targetSell,
                agent.id,
                args.notes
            );
            if (args.targetSellPrice) {
                await addAgentTrigger(agent.id, args.itemId, args.itemName, "buy_price_above", args.targetSellPrice, 600);
            }
            contextState.actionsTaken.push({ action: "add_to_portfolio", item });
            return { success: true, item, message: `Added ${args.itemName} (${args.quantity}x @ ${args.buyPrice} GP) to user portfolio.` };
        }

        case "update_portfolio_position": {
            const updates: any = {};
            if (args.quantity !== undefined) updates.quantity = args.quantity;
            if (args.buyPrice !== undefined) updates.buy_price = args.buyPrice;
            if (args.targetSellPrice !== undefined) updates.target_sell_price = args.targetSellPrice;
            if (args.notes !== undefined) updates.notes = args.notes;

            const updated = await updatePortfolioItem(args.positionId, agent.user_id, updates);
            contextState.actionsTaken.push({ action: "update_portfolio_position", positionId: args.positionId, updated });
            return { success: true, updated, message: `Updated portfolio position ${args.positionId}.` };
        }

        case "remove_from_portfolio": {
            await deletePortfolioItem(args.positionId, agent.user_id);
            contextState.actionsTaken.push({ action: "remove_from_portfolio", positionId: args.positionId });
            return { success: true, message: `Removed portfolio position ${args.positionId}.` };
        }

        case "game_get_account": {
            try {
                const gameState = await TradingGameEngine.getGameState(null, agent.id);
                return gameState;
            } catch (err: any) {
                return { success: false, error: err.message || "Failed to fetch game state." };
            }
        }

        case "game_place_offer": {
            try {
                let itemId: number = args.itemId;
                if (!itemId && args.itemName) {
                    const items = await getLatestItems();
                    const found = items.find((i: CombinedItem) => i.name.toLowerCase() === args.itemName.toLowerCase() || i.name.toLowerCase().includes(args.itemName.toLowerCase()));
                    if (found) itemId = found.id;
                }
                if (!itemId) {
                    return { success: false, error: `Item '${args.itemName || args.itemId}' not found in market registry.` };
                }

                const gameState = await TradingGameEngine.getGameState(null, agent.id);
                const activeSlotMap = new Map<number, boolean>();
                for (const offer of gameState.offers) {
                    if (offer.status === 'ACTIVE') {
                        activeSlotMap.set(offer.slot, true);
                    }
                }

                // Smart Slot Selection: if requested slot is taken, find first free slot (0-7)
                let targetSlot = typeof args.slot === 'number' && args.slot >= 0 && args.slot < 8 ? args.slot : 0;
                if (activeSlotMap.get(targetSlot)) {
                    let freeSlot = -1;
                    for (let s = 0; s < 8; s++) {
                        if (!activeSlotMap.get(s)) {
                            freeSlot = s;
                            break;
                        }
                    }
                    if (freeSlot === -1) {
                        return { success: false, error: "All 8 GE slots are occupied with active offers. Cancel an active offer or collect a slot first." };
                    }
                    targetSlot = freeSlot;
                }

                // Cash validation for BUY offers
                if (args.type === 'BUY') {
                    const totalCost = args.quantity * args.price;
                    if (totalCost > gameState.account.cash_stack) {
                        const maxAffordable = Math.floor(gameState.account.cash_stack / args.price);
                        return {
                            success: false,
                            error: `Insufficient cash stack. Available: ${gameState.account.cash_stack.toLocaleString()} GP, Required: ${totalCost.toLocaleString()} GP. Maximum affordable quantity at ${args.price} GP is ${maxAffordable.toLocaleString()} items.`
                        };
                    }
                }

                const offer = await TradingGameEngine.createOffer(
                    null,
                    agent.id,
                    targetSlot,
                    itemId,
                    args.type,
                    args.quantity,
                    args.price
                );
                contextState.actionsTaken.push({ action: "game_place_offer", offer });
                return { success: true, offer, message: `Placed ${args.type} offer for ${offer.item_name} (${args.quantity}x @ ${args.price} GP) in GE slot ${targetSlot}.` };
            } catch (err: any) {
                return { success: false, error: err.message || "Failed to place offer." };
            }
        }

        case "game_cancel_offer": {
            try {
                let offerId = args.offerId;
                if (!offerId && typeof args.slot === 'number') {
                    const gameState = await TradingGameEngine.getGameState(null, agent.id);
                    const foundOffer = gameState.offers.find(o => o.slot === args.slot && o.status === 'ACTIVE');
                    if (foundOffer) offerId = foundOffer.id;
                }

                if (!offerId) {
                    return { success: false, error: "Must specify a valid offerId or slot number to cancel." };
                }

                const offer = await TradingGameEngine.cancelOffer(null, agent.id, offerId);
                contextState.actionsTaken.push({ action: "game_cancel_offer", offerId });
                return { success: true, offer, message: `Cancelled offer ID ${offerId}.` };
            } catch (err: any) {
                return { success: false, error: err.message || "Failed to cancel offer." };
            }
        }

        case "game_collect_slot": {
            try {
                let offerId = args.offerId;
                if (!offerId && typeof args.slot === 'number') {
                    const gameState = await TradingGameEngine.getGameState(null, agent.id);
                    const foundOffer = gameState.offers.find(o => o.slot === args.slot && (o.claimed_gp > 0 || o.claimed_items > 0));
                    if (foundOffer) offerId = foundOffer.id;
                }

                if (!offerId) {
                    return { success: false, error: "Must specify a valid offerId or slot number with items/GP to collect." };
                }

                const offer = await TradingGameEngine.collectSlot(null, agent.id, offerId);
                contextState.actionsTaken.push({ action: "game_collect_slot", offerId });
                return { success: true, offer, message: `Collected slot for offer ID ${offerId}.` };
            } catch (err: any) {
                return { success: false, error: err.message || "Failed to collect slot." };
            }
        }

        case "game_get_leaderboard": {
            try {
                const leaderboard = await TradingGameEngine.getLeaderboard(args.type || 'current');
                return { leaderboard };
            } catch (err: any) {
                return { success: false, error: err.message || "Failed to fetch leaderboard." };
            }
        }

        case "suggest_trade_actions": {
            const rawList = Array.isArray(args.suggestions) ? args.suggestions : [];
            const resolvedList = [];
            const items = await getLatestItems();
            for (const item of rawList) {
                let itemId = item.itemId;
                let itemName = item.itemName;
                if (!itemId && itemName) {
                    const found = items.find((i: CombinedItem) => i.name.toLowerCase().includes(itemName.toLowerCase()));
                    if (found) {
                        itemId = found.id;
                        itemName = found.name;
                    }
                }
                resolvedList.push({
                    itemId: itemId || 0,
                    itemName: itemName || "Unknown Item",
                    buyPrice: typeof item.buyPrice === "number" ? item.buyPrice : 0,
                    targetSellPrice: typeof item.targetSellPrice === "number" ? item.targetSellPrice : 0,
                    quantity: typeof item.quantity === "number" ? item.quantity : 1,
                    rationale: item.rationale || ""
                });
            }
            contextState.actionsTaken.push({ action: "suggest_trade_actions", suggestions: resolvedList });
            return { success: true, suggestions: resolvedList, message: `Registered ${resolvedList.length} trade recommendations.` };
        }

        case "suggest_followup_options": {
            const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o)) : [];
            contextState.actionsTaken.push({ action: "suggest_followup_options", options });
            return { success: true, options, message: `Registered ${options.length} follow-up options.` };
        }

        case "ask_user_question": {
            const options = Array.isArray(args.options) ? args.options.map((o: any) => String(o)) : [];
            const qObj = {
                question: args.question || "",
                options,
                allowCustomInput: args.allowCustomInput !== false,
                multiSelect: args.multiSelect === true
            };
            contextState.actionsTaken.push({ action: "ask_user_question", ...qObj });
            return { success: true, ...qObj, message: `Asked user question: "${args.question}"` };
        }

        default:
            return { error: `Unknown agent tool: ${name}` };
    }
}
