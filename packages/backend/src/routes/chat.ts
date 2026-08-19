import express from "express";
import { MERCHANTING_GUIDE } from "../analysis";
import { logger } from "@osrstradingtools/shared";
import { authenticateToken, optionalAuthenticateToken } from "../auth";
import { getGeminiClient, DEFAULT_GEMINI_MODEL } from "../gemini";
import { geminiTools, executeGeminiTool, ContextUser } from "../tools/geminiTools";

const router = express.Router();

if (process.env.REQUIRE_AUTH === "true") {
    router.use(authenticateToken);
} else {
    router.use(optionalAuthenticateToken);
}

const APP_GUIDE = `
**Application Navigation & Feature Guide (How to guide the user):**
- **Home / Highlights ('/')**: Real-time market summary, top margin flips, volume spikes, and recent news.
- **Item Explorer ('/items')**: Browse, search, and filter all OSRS items by buy/sell price, margin, ROI %, and volume. Allows creating and saving filter presets.
- **Item Detail ('/item/:id')**: Detailed view for a specific item with 7-day price charts, volume trends, and tax details. Users can click the Heart button to favorite an item.
- **Recipes ('/recipes')**: Calculates skill processing profitability (Herblore, Smithing, Cooking, Fletching, Crafting) with profit per hour, daily volume, and ingredient costs.
- **Arbitrage ('/arbitrage')**: Shows Set Arbitrage (assembling parts into sets or breaking sets) and Decanting Arbitrage (combining 1/2/3-dose potions into 4-dose potions).
- **Price Watches ('/watches')**: Create and manage percentage price change alerts or custom advanced watch filters.
- **Favorites ('/favorites')**: Quick access list of all items favorited by the user.
- **Profile & Discord Settings ('/profile')**: Link Discord account to receive price alerts via Discord bot notifications.
- **Hiscores ('/hiscores')**: Search OSRS player stats and skill levels.

When the user asks how to do something in the app (e.g. "Where do I see set arbitrage?", "How do I save a favorite?", "Where are price charts?"), explain clearly which page or button to use based on this guide.
`;

interface ChatMessage {
    role: "user" | "model" | "ai" | "assistant";
    content: string;
}

router.post("/", async (req, res) => {
    try {
        const { message, history, currentPath } = req.body;
        if (!message || typeof message !== "string") {
            return res.status(400).json({ error: "Message string is required" });
        }

        const client = getGeminiClient();
        if (!client) {
            return res.status(503).json({ error: "AI service not configured (missing GEMINI_API_KEY)" });
        }

        const contextUser: ContextUser | undefined = req.user
            ? { id: req.user.id, username: req.user.username, is_admin: req.user.is_admin }
            : undefined;

        // Current temporal context
        const now = new Date();
        const currentDateUTC = now.toUTCString();
        const currentDateISO = now.toISOString();
        const activeRoute = typeof currentPath === "string" ? currentPath : "/";

        let pageName = `Page '${activeRoute}'`;
        if (activeRoute === "/" || activeRoute === "/highlights") pageName = "Home / Highlights ('/')";
        else if (activeRoute === "/arbitrage") pageName = "Arbitrage Page ('/arbitrage')";
        else if (activeRoute === "/recipes") pageName = "Recipes Page ('/recipes')";
        else if (activeRoute === "/items") pageName = "Item Explorer ('/items')";
        else if (activeRoute.startsWith("/item/")) pageName = `Item Detail Page ('${activeRoute}')`;
        else if (activeRoute === "/watches") pageName = "Price Watches Page ('/watches')";
        else if (activeRoute === "/favorites") pageName = "Favorites Page ('/favorites')";
        else if (activeRoute === "/profile") pageName = "User Profile ('/profile')";
        else if (activeRoute === "/hiscores") pageName = "Hiscores Page ('/hiscores')";

        const systemInstruction = `
You are an expert Old School RuneScape (OSRS) flipping, merchanting, and market analysis assistant.
You have direct access to a harness of interactive tools to read and filter data from recipes, arbitrage, and OSRS items, as well as manage user favorites and price watch alerts.

**Current Session Context:**
- **Current Server Time**: ${currentDateUTC} (ISO: ${currentDateISO})
- **User's Active Page/Route**: ${pageName}
- **User Status**: ${contextUser ? `Logged in as '${contextUser.username}' (ID: ${contextUser.id})` : "Not logged in (Anonymous)"}

CRITICAL ROUTE INSTRUCTION: The user is right now on ${pageName}. Ignore any previous messages in the conversation history that mention past pages the user visited earlier. Always refer ONLY to ${pageName} as the user's active location.

**System Capabilities & Available Harness Tools:**
1. **Recipes**: 'get_recipes' - Fetch/filter processing & crafting recipes by profit, volume, or limit.
2. **Set Arbitrage**: 'get_set_arbitrage' - Fetch set packing and unpacking arbitrage opportunities.
3. **Decanting Arbitrage**: 'get_decant_arbitrage' - Fetch potion decanting profit opportunities.
4. **Items & Market**:
   - 'search_items': Search items by query, minimum margin, ROI, or volume.
   - 'get_item_detail': Fetch detailed market stats for an item by ID or name (includes Wiki extract).
5. **News & Wiki Context**:
   - 'get_latest_news': Fetch recent official OSRS game updates and news announcements to explain price spikes or market trends.
   - 'get_wiki_summary': Fetch official OSRS Wiki intro extract for items, bosses, skills, or updates to explain item demand and utility.
6. **Favorites**:
   - 'get_favorites': List favorited items for the logged-in user.
   - 'add_favorite': Add an item to user's favorites.
   - 'remove_favorite': Remove an item from user's favorites.
7. **Watches & Price Alerts**:
   - 'get_watches': View user's active price watches.
   - 'add_watch': Add a price watch alert for an item.
   - 'remove_watch': Remove a price watch alert.
   - 'get_advanced_watches': View advanced market watch filters.
   - 'add_advanced_watch': Add a new custom advanced market watch.
8. **User Portfolio**:
   - 'get_user_portfolio': List user's active portfolio items, quantities, buy prices, current GE prices, PnL, and ROI.
   - 'add_to_portfolio': Add an item to user's portfolio.
   - 'remove_from_portfolio': Remove an item from user's portfolio.
9. **Interactive Suggestions & Questions**:
   - 'suggest_trade_actions': Provide structured buy/sell item recommendations.
   - 'suggest_followup_options': Provide clickable quick-reply prompt options.
   - 'ask_user_question': Ask the user a structured question with interactive choice buttons.

${APP_GUIDE}

**General Guidelines:**
- The Grand Exchange tax rate is 2%. All profit and ROI figures provided by tools are AFTER tax.
- ${MERCHANTING_GUIDE}

**Instructions:**
1. ALWAYS use the appropriate tool whenever specific, real-time market data or user state (favorites/watches/portfolio) is needed to answer a user prompt.
2. Call 'get_user_portfolio' to check what items the user currently holds before offering trade recommendations. DO NOT repeatedly suggest buying items that the user already has in their portfolio.
3. If an item in the user's portfolio experiences a price spike or hits target sell price/stop loss, inform the user and recommend selling or taking profits.
4. If a user asks to add/remove an item from favorites/portfolio or set price watches, execute the action using the tools and confirm the outcome in natural language.
5. If user is NOT logged in and requests a user-bound action (favorites/watches/portfolio), state clearly that they need to log in first.
6. Cite exact numbers (prices, ROI, volume, profit) when offering advice.
7. If the user asks about the current date/time, use the Current Server Time provided above.
8. Whenever recommending specific OSRS items to buy, sell, or flip, ALWAYS call the 'suggest_trade_actions' tool with structured item data ({ itemId, itemName, buyPrice, targetSellPrice, quantity, rationale }).
9. Whenever offering follow-up prompt choices or next steps, call the 'suggest_followup_options' tool with quick-reply strings.
10. Whenever asking the user a clarifying question or offering choices (e.g. risk level, budget, skill), call the 'ask_user_question' tool with the question and selectable options.
11. Be concise, clear, and structure your responses with GitHub Flavored Markdown (bolding, lists, tables).
12. Whenever you mention specific OSRS items in your response text, format them as markdown links to their item page if you know their item ID, e.g. \[Abyssal whip\](/item/4151). If the item ID was returned by a tool, always use \[Item Name\](/item/itemId).
`;

        // Build Gemini contents history array from prior conversation turns
        const contents: any[] = [];

        if (Array.isArray(history)) {
            for (const item of history as ChatMessage[]) {
                if (!item.content || typeof item.content !== "string") continue;
                const role = item.role === "ai" || item.role === "assistant" || item.role === "model" ? "model" : "user";
                contents.push({
                    role,
                    parts: [{ text: item.content }]
                });
            }
        }

        // Append current turn user prompt
        contents.push({
            role: "user",
            parts: [{ text: message }]
        });

        let finalReply = "";
        let turns = 0;
        const maxTurns = 10;
        const tradeSuggestions: any[] = [];
        const followupOptions: string[] = [];
        const questions: any[] = [];

        while (turns < maxTurns) {
            turns++;

            // Call Gemini API with tool definitions
            const response = await client.models.generateContent({
                model: DEFAULT_GEMINI_MODEL,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction,
                    tools: [{ functionDeclarations: geminiTools as any }]
                }
            });

            const functionCalls = response.functionCalls;

            if (functionCalls && functionCalls.length > 0) {
                // Preserve exact model content (including thought signatures) returned by Gemini
                const modelContent = response.candidates?.[0]?.content;
                if (modelContent) {
                    contents.push(modelContent);
                } else {
                    contents.push({
                        role: "model",
                        parts: functionCalls.map(fc => ({
                            functionCall: { name: fc.name, args: fc.args }
                        }))
                    });
                }

                // Execute each requested tool in parallel
                const toolResponseParts: any[] = [];
                for (const fc of functionCalls) {
                    const toolName = fc.name || "";
                    const rawResult = await executeGeminiTool(toolName, fc.args || {}, contextUser);
                    
                    if (toolName === "suggest_trade_actions" && Array.isArray(rawResult?.suggestions)) {
                        tradeSuggestions.push(...rawResult.suggestions);
                    } else if (toolName === "suggest_followup_options" && Array.isArray(rawResult?.options)) {
                        followupOptions.push(...rawResult.options);
                    } else if (toolName === "ask_user_question" && rawResult?.question) {
                        questions.push({
                            question: rawResult.question,
                            options: rawResult.options || [],
                            allowCustomInput: rawResult.allowCustomInput,
                            multiSelect: rawResult.multiSelect
                        });
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

                // Send tool execution results back to model under 'user' role
                contents.push({
                    role: "user",
                    parts: toolResponseParts
                });
            } else {
                // Model provided final text response
                finalReply = (typeof response.text === "string" && response.text) ? response.text : "I have processed your request.";
                break;
            }
        }

        // If loop finished after maximum tool turns without generating text, force a final synthesis response
        if (!finalReply) {
            logger.info("Max tool turns reached. Executing final synthesis response without tools.");
            const finalResponse = await client.models.generateContent({
                model: DEFAULT_GEMINI_MODEL,
                contents: contents,
                config: {
                    systemInstruction: systemInstruction + "\n\nProvide your final detailed natural language answer and recommendations to the user based on all the gathered data above."
                }
            });
            finalReply = (typeof finalResponse.text === "string" && finalResponse.text)
                ? finalResponse.text
                : "Based on the market data gathered, I have found the item recommendations for you.";
        }

        res.json({
            response: finalReply,
            tradeSuggestions,
            followupOptions,
            questions
        });

    } catch (err: any) {
        logger.error("Error in chat route:", err);
        res.status(500).json({ error: "Failed to generate chat response: " + (err.message || String(err)) });
    }
});

export default router;
