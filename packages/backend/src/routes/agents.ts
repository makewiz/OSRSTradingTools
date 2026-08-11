import express from "express";
import { z } from "zod";
import { authenticateToken } from "../auth";
import {
    createTradingAgent,
    getUserTradingAgents,
    getTradingAgentById,
    updateTradingAgent,
    deleteTradingAgent,
    getAgentTriggers,
    addAgentTrigger,
    getAgentExecutionLogs,
    removeAgentTrigger,
    addAgentMessage,
    getAgentMessages
} from "../database";
import { AgentRunnerService } from "../services/agentRunnerService";
import { logger } from "@osrstradingtools/shared";

const router = express.Router();

// Require authentication for all agent management endpoints
router.use(authenticateToken);

const createAgentSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    goal: z.string().min(5, "Goal prompt is required"),
    cashStack: z.number().min(0, "Cash stack cannot be negative").default(10000000)
});

const updateAgentSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    goal: z.string().min(5).optional(),
    cashStack: z.number().min(0).optional(),
    enabled: z.boolean().optional()
});

/**
 * GET /api/agents
 * List user's trading agents
 */
router.get("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agents = await getUserTradingAgents(userId);

        // Fetch active triggers for each agent
        const enriched = await Promise.all(agents.map(async (agent) => {
            const triggers = await getAgentTriggers(agent.id);
            return {
                ...agent,
                triggers
            };
        }));

        res.json({ agents: enriched });
    } catch (err: any) {
        logger.error("Error fetching trading agents:", err);
        res.status(500).json({ error: "Failed to fetch trading agents" });
    }
});

/**
 * POST /api/agents
 * Create a new trading agent (Quota: max 3 per user)
 */
router.post("/", async (req, res) => {
    try {
        const userId = req.user!.id;
        const existing = await getUserTradingAgents(userId);

        if (existing.length >= 3) {
            return res.status(400).json({ error: "Agent limit reached. Maximum 3 trading agents allowed per account." });
        }

        const parseResult = createAgentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.issues[0].message });
        }

        const { name, goal, cashStack } = parseResult.data;
        const agent = await createTradingAgent(userId, name, goal, cashStack);

        res.status(201).json({ agent, message: "Trading agent created." });
    } catch (err: any) {
        logger.error("Error creating trading agent:", err);
        res.status(500).json({ error: "Failed to create trading agent" });
    }
});

/**
 * GET /api/agents/:id
 * Fetch single agent details
 */
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Trading agent not found" });
        }

        const triggers = await getAgentTriggers(agentId);
        const logs = await getAgentExecutionLogs(agentId, 10);

        res.json({ agent: { ...agent, triggers }, logs });
    } catch (err: any) {
        logger.error(`Error fetching agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to fetch trading agent" });
    }
});

/**
 * PUT /api/agents/:id
 * Update trading agent parameters
 */
router.put("/:id", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const parseResult = updateAgentSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.issues[0].message });
        }

        const updates: any = {};
        if (parseResult.data.name !== undefined) updates.name = parseResult.data.name;
        if (parseResult.data.goal !== undefined) updates.goal = parseResult.data.goal;
        if (parseResult.data.cashStack !== undefined) updates.cash_stack = parseResult.data.cashStack;
        if (parseResult.data.enabled !== undefined) updates.enabled = parseResult.data.enabled;

        const updated = await updateTradingAgent(agentId, userId, updates);
        if (!updated) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        res.json({ agent: updated, message: "Agent updated successfully." });
    } catch (err: any) {
        logger.error(`Error updating agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to update trading agent" });
    }
});

/**
 * DELETE /api/agents/:id
 * Delete trading agent
 */
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const deleted = await deleteTradingAgent(agentId, userId);
        if (!deleted) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        res.json({ success: true, message: "Agent deleted successfully." });
    } catch (err: any) {
        logger.error(`Error deleting agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to delete trading agent" });
    }
});

/**
 * POST /api/agents/:id/run
 * Manually trigger agent execution run immediately
 */
router.post("/:id/run", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        // Trigger manual run synchronously for immediate feedback
        const result = await AgentRunnerService.runAgent(agentId, "Manual user invocation");
        res.json(result);
    } catch (err: any) {
        logger.error(`Error running agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to run trading agent: " + (err.message || String(err)) });
    }
});

/**
 * GET /api/agents/:id/logs
 * Fetch agent execution logs
 */
router.get("/:id/logs", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        const logs = await getAgentExecutionLogs(agentId, 30);
        res.json({ logs });
    } catch (err: any) {
        logger.error(`Error fetching logs for agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to fetch agent logs" });
    }
});

/**
 * POST /api/agents/:id/triggers
 * Add a price trigger to the agent
 */
router.post("/:id/triggers", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        const { itemId, itemName, triggerType, targetValue, cooldownSeconds } = req.body;
        if (!triggerType || typeof targetValue !== "number") {
            return res.status(400).json({ error: "triggerType and targetValue are required" });
        }

        const trigger = await addAgentTrigger(
            agentId,
            itemId || null,
            itemName || null,
            triggerType,
            targetValue,
            cooldownSeconds || 300
        );

        res.status(201).json({ success: true, trigger });
    } catch (err: any) {
        logger.error(`Error adding trigger:`, err);
        res.status(500).json({ error: "Failed to add trigger" });
    }
});

/**
 * DELETE /api/agents/:id/triggers/:triggerId
 * Remove specific trigger
 */
router.delete("/:id/triggers/:triggerId", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        const triggerId = parseInt(req.params.triggerId, 10);

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        await removeAgentTrigger(triggerId, agentId);
        res.json({ success: true, message: "Trigger removed." });
    } catch (err: any) {
        logger.error(`Error removing trigger:`, err);
        res.status(500).json({ error: "Failed to remove trigger" });
    }
});

/**
 * GET /api/agents/:id/messages
 * Fetch agent conversation messages
 */
router.get("/:id/messages", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        const messages = await getAgentMessages(agentId, 50);
        res.json({ messages });
    } catch (err: any) {
        logger.error(`Error fetching messages for agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to fetch agent messages" });
    }
});

/**
 * POST /api/agents/:id/messages
 * User sends a prompt to steer agent or answer question
 */
router.post("/:id/messages", async (req, res) => {
    try {
        const userId = req.user!.id;
        const agentId = parseInt(req.params.id, 10);
        if (isNaN(agentId)) return res.status(400).json({ error: "Invalid agent ID" });

        const { message } = req.body;
        if (!message || typeof message !== "string" || message.trim().length === 0) {
            return res.status(400).json({ error: "Message string is required" });
        }

        const agent = await getTradingAgentById(agentId);
        if (!agent || agent.user_id !== userId) {
            return res.status(404).json({ error: "Agent not found or unauthorized" });
        }

        // Save user message
        const userMsg = await addAgentMessage(agentId, "user", message.trim());

        // Immediately trigger agent execution turn synchronously
        const result = await AgentRunnerService.runAgent(agentId, `User prompt: ${message.trim()}`);

        const updatedMessages = await getAgentMessages(agentId, 50);
        res.json({ userMessage: userMsg, agentResult: result, messages: updatedMessages });
    } catch (err: any) {
        logger.error(`Error sending message to agent ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to send message: " + (err.message || String(err)) });
    }
});

export default router;
