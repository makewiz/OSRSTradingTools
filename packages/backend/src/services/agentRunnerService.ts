import { getGeminiClient, DEFAULT_GEMINI_MODEL } from "../gemini";
import { geminiTools, executeGeminiTool } from "../tools/geminiTools";
import { autonomousAgentTools, executeAgentTool } from "../tools/agentTools";
import {
    getTradingAgentById,
    getAllActiveTradingAgents,
    updateTradingAgent,
    getAgentTriggers,
    updateAgentTriggerLastTriggered,
    logAgentExecution,
    addAgentMessage,
    getAgentMessages,
    TradingAgent
} from "../database";
import { getLatestItems } from "../scheduler";
import { CombinedItem } from "../osrsClient";
import { logger } from "@osrstradingtools/shared";

async function generateContentWithTimeout(
    client: any,
    params: any,
    timeoutMs: number = 45000
): Promise<any> {
    return Promise.race([
        client.models.generateContent(params),
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Gemini API call timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
        )
    ]);
}

export class AgentRunnerService {
    /**
     * Run a single trading agent autonomously
     */
    static async runAgent(agentId: number, triggerReason: string): Promise<{ success: boolean; summary: string }> {
        const agent = await getTradingAgentById(agentId);
        if (!agent || !agent.enabled) {
            return { success: false, summary: "Agent not found or disabled." };
        }

        const client = getGeminiClient();
        if (!client) {
            logger.error(`[AgentRunner] Gemini client not configured for agent ${agentId}`);
            await updateTradingAgent(agentId, agent.user_id, {
                status: "error",
                error_message: "GEMINI_API_KEY not configured on backend."
            });
            return { success: false, summary: "Gemini API key missing." };
        }

        // --- Guardrail Checks ---
        const now = Math.floor(Date.now() / 1000);
        const todayStr = new Date().toISOString().split("T")[0];
        let runsToday = agent.runs_today;
        if (agent.last_run_date !== todayStr) {
            runsToday = 0;
        }

        // Cap runs per day to 48 (approx 1 run per 30 mins average)
        if (runsToday >= 48) {
            logger.warn(`[AgentRunner] Agent ${agent.id} reached maximum daily execution limit (48 runs).`);
            await updateTradingAgent(agentId, agent.user_id, {
                status: "idle",
                error_message: "Daily limit of 48 execution runs reached."
            });
            return { success: false, summary: "Daily execution quota reached (48 runs)." };
        }

        // Min 5-minute cooldown between automated runs
        if (agent.last_run_at && (now - agent.last_run_at) < 300 && !triggerReason.startsWith("Manual") && !triggerReason.startsWith("User prompt")) {
            logger.info(`[AgentRunner] Agent ${agent.id} ran less than 5 minutes ago. Skipping.`);
            return { success: false, summary: "Skipped due to 5-minute cooldown." };
        }

        // Update status to running
        await updateTradingAgent(agentId, agent.user_id, {
            status: "running",
            error_message: null
        });

        // Combined tools available to agent
        const allTools = [...geminiTools, ...autonomousAgentTools];

        // System Instruction with Agent Persona, Cash Stack, Memory, and Instructions
        const memoryJson = typeof agent.memory === "object" ? JSON.stringify(agent.memory, null, 2) : "{}";
        const systemInstruction = `
You are an Autonomous Old School RuneScape (OSRS) AI Trading Agent.
Your goal is to actively manage investments, monitor open portfolio positions, analyze market price trends, find lucrative flips or arbitrage, set price triggers, and notify the user on Discord when actionable trade opportunities or sell points occur.

**Agent Details:**
- **Agent ID**: ${agent.id}
- **Agent Name**: ${agent.name}
- **Primary Goal Prompt**: "${agent.goal}"
- **Current Cash Stack**: ${agent.cash_stack.toLocaleString()} GP
- **Trigger Reason**: ${triggerReason}
- **Execution Timestamp**: ${new Date(now * 1000).toUTCString()}

**Persistent Strategy Memory State:**
${memoryJson}

**Autonomous Operating Modes:**

1. **REAL MARKET ADVISOR MODE** (Default for investment advice, market scans, dip analysis, and portfolio alerts):
   - Use market analysis tools ('search_items', 'get_item_detail', 'get_recipes', 'get_set_arbitrage', 'get_decant_arbitrage', 'get_latest_news', 'get_wiki_summary') to research trade opportunities matching the goal.
   - Call 'get_user_portfolio' to inspect the user's active holdings.
   - Provide exact trade advice: Item Name, Item ID, Recommended Buy Price, Target Sell Price, Quantity, Net Profit after 2% Tax, ROI %.
   - Call 'set_price_trigger' to monitor target prices and 'send_discord_notification' for alerts.
   - **DO NOT call Trading Game tools ('game_place_offer', 'game_cancel_offer') when in Real Market Advisor mode**, unless the user explicitly asks you to play the Trading Game!

2. **TRADING GAME COMPETITOR MODE** (Active ONLY when the prompt or goal explicitly asks to play the Trading Game, manage GE slots, or compete on the leaderboard):
   - Call 'game_get_account' to inspect your 10M cash stack, 8 GE slots, and inventory.
   - Verify remaining cash stack before placing BUY offers (total_cost <= available cash).
   - Place buy/sell offers in your 8 GE slots ('game_place_offer'), respect 4-hour buy limits, collect filled slots ('game_collect_slot'), and track net worth to rank on the leaderboard.

**Common Execution Instructions:**
- Always calculate net profits AFTER 2% GE tax.
- Call 'schedule_next_run' to specify when to automatically re-evaluate (e.g. 15, 30, 60 minutes).
- Summarize your findings clearly and concisely in natural language.
`;

        // Fetch prior chat history for this agent
        const priorMessages = await getAgentMessages(agentId, 15);
        const contents: any[] = [];

        for (const msg of priorMessages) {
            const role = msg.sender === "user" ? "user" : "model";
            contents.push({
                role,
                parts: [{ text: msg.content }]
            });
        }

        // Add current execution turn prompt
        contents.push({
            role: "user",
            parts: [{ text: `Execute trading cycle. Trigger reason: ${triggerReason}` }]
        });

        const contextState: {
            nextRunTime?: number;
            scheduledReason?: string;
            discordNotified?: boolean;
            actionsTaken: any[];
            updatedMemory?: any;
        } = {
            actionsTaken: []
        };

        let finalSummary = "";
        let turns = 0;
        const maxTurns = 25;

        try {
            while (turns < maxTurns) {
                turns++;

                // Nudge model to synthesize if approaching turn limit
                if (turns === maxTurns - 3) {
                    contents.push({
                        role: "user",
                        parts: [{ text: "SYSTEM HINT: You have gathered market data across several tool turns. Please synthesize your findings now. Provide your specific item recommendations (with buy prices, target sell prices, tax-adjusted profit) and outline your execution plan." }]
                    });
                }

                const response = await generateContentWithTimeout(
                    client,
                    {
                        model: DEFAULT_GEMINI_MODEL,
                        contents: contents,
                        config: {
                            systemInstruction: systemInstruction,
                            tools: [{ functionDeclarations: allTools as any }]
                        }
                    },
                    45000
                );

                const functionCalls = response.functionCalls;

                if (functionCalls && functionCalls.length > 0) {
                    const modelContent = response.candidates?.[0]?.content;
                    if (modelContent) {
                        contents.push(modelContent);
                    } else {
                        contents.push({
                            role: "model",
                            parts: functionCalls.map((fc: any) => ({
                                functionCall: { name: fc.name, args: fc.args }
                            }))
                        });
                    }

                    const toolResponseParts: any[] = [];
                    for (const fc of functionCalls) {
                        const toolName = fc.name || "";
                        let rawResult: any;

                        try {
                            // Check if autonomous agent tool
                            if (autonomousAgentTools.some(t => t.name === toolName)) {
                                rawResult = await executeAgentTool(toolName, fc.args || {}, agent, contextState);
                            } else {
                                // Standard market harness tool
                                const contextUser = { id: agent.user_id, username: `Agent_${agent.id}` };
                                rawResult = await executeGeminiTool(toolName, fc.args || {}, contextUser);
                                contextState.actionsTaken.push({ action: toolName, args: fc.args });
                            }
                        } catch (err: any) {
                            logger.warn(`[AgentRunner] Tool '${toolName}' execution returned error: ${err.message}`);
                            rawResult = {
                                success: false,
                                error: err.message || "Tool execution failed."
                            };
                        }

                        let responsePayload: Record<string, any>;
                        if (Array.isArray(rawResult)) {
                            responsePayload = { items: rawResult };
                        } else if (typeof rawResult === "object" && rawResult !== null) {
                            responsePayload = rawResult;
                        } else {
                            responsePayload = { output: rawResult };
                        }

                        toolResponseParts.push({
                            functionResponse: {
                                name: toolName,
                                response: responsePayload
                            }
                        });
                    }

                    contents.push({
                        role: "user",
                        parts: toolResponseParts
                    });
                } else {
                    finalSummary = (typeof response.text === "string" && response.text) ? response.text : "Execution completed.";
                    break;
                }
            }

            // Fallback forced text synthesis if max turns reached without text output
            if (!finalSummary) {
                try {
                    contents.push({
                        role: "user",
                        parts: [{ text: "Synthesize all analyzed market items and present your top trade recommendations (with exact buy/sell GP targets and tax profits) now." }]
                    });
                    const forcedRes = await generateContentWithTimeout(
                        client,
                        {
                            model: DEFAULT_GEMINI_MODEL,
                            contents: contents,
                            config: {
                                systemInstruction: systemInstruction
                            }
                        },
                        45000
                    );
                    finalSummary = forcedRes.text || "Analyzed market trends and configured price triggers.";
                } catch (synthesisErr) {
                    logger.error("[AgentRunner] Error generating final text synthesis:", synthesisErr);
                    finalSummary = "Autonomous market analysis completed and active watch triggers configured.";
                }
            }

            // Save agent response into message history
            await addAgentMessage(agentId, "agent", finalSummary, {
                triggerReason,
                actionsTaken: contextState.actionsTaken
            });

            // Update Agent State after successful run
            const newMemory = contextState.updatedMemory || agent.memory;
            const defaultNextRun = contextState.nextRunTime || (now + 1800); // 30 mins default

            await updateTradingAgent(agentId, agent.user_id, {
                status: "idle",
                last_run_at: now,
                next_run_at: defaultNextRun,
                runs_today: runsToday + 1,
                last_run_date: todayStr,
                cash_stack: agent.cash_stack,
                memory: newMemory,
                error_message: null
            });

            // Log execution history
            await logAgentExecution(agentId, triggerReason, finalSummary, contextState.actionsTaken);

            logger.info(`[AgentRunner] Agent ${agentId} (${agent.name}) execution completed successfully.`);
            return { success: true, summary: finalSummary };

        } catch (err: any) {
            logger.error(`[AgentRunner] Error executing agent ${agentId}:`, err);
            await updateTradingAgent(agentId, agent.user_id, {
                status: "error",
                error_message: err.message || String(err),
                last_run_at: now,
                next_run_at: now + 900 // Retry in 15 mins
            });
            await logAgentExecution(agentId, triggerReason, `Execution error: ${err.message || String(err)}`, contextState.actionsTaken);
            return { success: false, summary: `Error: ${err.message || String(err)}` };
        }
    }

    /**
     * Evaluate agent schedules and price triggers across all active agents
     */
    static async evaluateTriggers(): Promise<void> {
        try {
            const activeAgents = await getAllActiveTradingAgents();
            if (activeAgents.length === 0) return;

            const now = Math.floor(Date.now() / 1000);
            const items = await getLatestItems();
            const itemMap = new Map(items.map(i => [i.id, i]));

            for (const agent of activeAgents) {
                if (agent.status === "running") continue;

                let shouldRun = false;
                let triggerReason = "";

                // 1. Scheduled time trigger
                if (agent.next_run_at && now >= agent.next_run_at) {
                    shouldRun = true;
                    triggerReason = `Scheduled timer reached (${new Date(agent.next_run_at * 1000).toLocaleTimeString()})`;
                }

                // 2. Price/Market Triggers check
                if (!shouldRun) {
                    const triggers = await getAgentTriggers(agent.id);
                    for (const trigger of triggers) {
                        if (!trigger.enabled) continue;
                        const cooldown = trigger.cooldown_seconds || 300;
                        if (trigger.last_triggered_at && (now - trigger.last_triggered_at) < cooldown) continue;

                        let targetItem: CombinedItem | undefined;
                        if (trigger.item_id) {
                            targetItem = itemMap.get(trigger.item_id);
                        } else if (trigger.item_name) {
                            targetItem = items.find(i => i.name.toLowerCase().includes(trigger.item_name!.toLowerCase()));
                        }

                        if (!targetItem) continue;

                        let isMatched = false;
                        switch (trigger.trigger_type) {
                            case "buy_price_below":
                                if (targetItem.buyPrice !== null && targetItem.buyPrice <= trigger.target_value) isMatched = true;
                                break;
                            case "sell_price_above":
                                if (targetItem.sellPrice !== null && targetItem.sellPrice >= trigger.target_value) isMatched = true;
                                break;
                            case "margin_above":
                                if (targetItem.margin !== null && targetItem.margin >= trigger.target_value) isMatched = true;
                                break;
                            case "roi_above":
                                if (targetItem.roi !== null && targetItem.roi >= trigger.target_value) isMatched = true;
                                break;
                            case "1h_change":
                                if (targetItem.oneHourChange !== null && Math.abs(targetItem.oneHourChange) >= trigger.target_value) isMatched = true;
                                break;
                            case "24h_change":
                                if (targetItem.dayChange !== null && Math.abs(targetItem.dayChange) >= trigger.target_value) isMatched = true;
                                break;
                        }

                        if (isMatched) {
                            shouldRun = true;
                            triggerReason = `Price trigger hit on ${targetItem.name} (${trigger.trigger_type} target: ${trigger.target_value})`;
                            await updateAgentTriggerLastTriggered(trigger.id, now);
                            break;
                        }
                    }
                }

                if (shouldRun) {
                    logger.info(`[AgentRunner] Triggering execution for agent ${agent.id} (${agent.name}). Reason: ${triggerReason}`);
                    // Run asynchronously to avoid blocking loop
                    AgentRunnerService.runAgent(agent.id, triggerReason).catch(err => {
                        logger.error(`[AgentRunner] Background run error for agent ${agent.id}:`, err);
                    });
                }
            }
        } catch (err) {
            logger.error("[AgentRunner] Error evaluating triggers:", err);
        }
    }
}
