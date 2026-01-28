import { logger } from "@osrstradingtools/shared";
import { load } from "cheerio";
import { getCombinedItems } from "../osrsClient";
import { saveRecipe, Recipe, RecipeInput, RecipeOutput } from "../database/recipes";

const WIKI_API_URL = "https://oldschool.runescape.wiki/api.php";

interface WikiParseResponse {
    parse: {
        title: string;
        pageid: number;
        wikitext: {
            "*": string;
        };
    };
}

interface WikiQueryResponse {
    query: {
        categorymembers: {
            pageid: number;
            title: string;
        }[];
    };
    continue?: {
        cmcontinue: string;
    };
}

export class RecipeService {
    private itemMapping: Map<string, number> = new Map();

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Helper to fetch JSON from URL with retry on 429
    private async fetchJson<T>(url: string, retries = 3, backoff = 1000): Promise<T> {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": `OSRSTradingTools/1.0 (contact: admin@osrstradingtools.com)`
                }
            });

            if (res.status === 429) {
                if (retries > 0) {
                    logger.warn(`[RecipeService] 429 Too Many Requests for ${url}. Retrying in ${backoff}ms...`);
                    await this.sleep(backoff);
                    return this.fetchJson<T>(url, retries - 1, backoff * 2);
                } else {
                    throw new Error(`Failed to fetch ${url}: 429 Too Many Requests (Max retries exceeded)`);
                }
            }

            if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
            return (await res.json()) as T;
        } catch (err: any) {
            // Network errors might also be worth retrying
            if (retries > 0 && (err.cause?.code === 'ECONNRESET' || err.message.includes("fetch failed"))) {
                logger.warn(`[RecipeService] Network error for ${url}. Retrying...`);
                await this.sleep(backoff);
                return this.fetchJson<T>(url, retries - 1, backoff * 2);
            }
            throw err;
        }
    }

    // Initialize Item Mapping (Name -> ID)
    private async loadItemMapping() {
        if (this.itemMapping.size > 0) return;
        try {
            const items = await getCombinedItems(); // This might be heavy? It fetches latest prices too.
            // Actually getCombinedItems calls getMapping internally.
            // Let's just use getMapping directly if exposed, OR just use `items` since we need it anyway.
            // Since `getMapping` is not exported from `osrsClient` directly (it is internal), we rely on `getCombinedItems` or modify `osrsClient`.
            // `getCombinedItems` is fine, it caches.

            for (const item of items) {
                this.itemMapping.set(item.name.toLowerCase(), item.id);
                // Also map "Steel bar" -> ID
                // Some wiki names might differ slightly, we can add normalization if needed.
            }
            logger.info(`[RecipeService] Loaded ${this.itemMapping.size} items for mapping.`);
        } catch (err) {
            logger.error(`[RecipeService] Failed to load item mapping`, err);
        }
    }

    private getItemId(name: string): number | null {
        const cleanName = name.trim();
        const lower = cleanName.toLowerCase();
        // Try direct match
        if (this.itemMapping.has(lower)) return this.itemMapping.get(lower)!;

        // Try resolving redirects (not implemented yet, but common mismatch source)

        // Try specific overrides if common issues arise
        if (lower === "coins") return 995;

        return null;
    }

    // 1. Fetch Pages from Category
    private async fetchPagesInCategory(category: string, limit: number = 500): Promise<string[]> {
        const titles: string[] = [];
        let continueToken: string | null = null;

        // Safety break
        let loops = 0;
        do {
            let url = `${WIKI_API_URL}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=max&format=json`;
            if (continueToken) url += `&cmcontinue=${continueToken}`;

            try {
                const data = await this.fetchJson<WikiQueryResponse>(url);
                if (data.query && data.query.categorymembers) {
                    titles.push(...data.query.categorymembers.map(m => m.title));
                }
                continueToken = data.continue?.cmcontinue || null;
            } catch (err) {
                logger.error(`[RecipeService] Error fetching category ${category}`, err);
                break;
            }
            loops++;
        } while (continueToken && titles.length < limit && loops < 10);

        return titles;
    }

    // 2. Fetch Wikitext for a Page
    private async fetchWikitext(title: string): Promise<string | null> {
        const url = `${WIKI_API_URL}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`;
        try {
            const data = await this.fetchJson<WikiParseResponse>(url);
            return data.parse?.wikitext?.["*"] || null;
        } catch (err) {
            logger.warn(`[RecipeService] Failed to fetch wikitext for ${title}`, err);
            return null;
        }
    }

    // 3. Parse {{Recipe}} Template
    private parseRecipes(wikitext: string, pageTitle: string): Omit<Recipe, "id">[] {
        const recipes: Omit<Recipe, "id">[] = [];

        // Regex to find {{Recipe ... }} blocks
        // This is a naive regex parser. It handles nested braces poorly but {{Recipe}} usually isn't deeply nested.
        // Better approach: simple stack parser or library. 
        // For now, let's use a regex that matches {{Recipe and ends with }} 
        // Multi-line support is needed.

        // We'll iterate through the string to find {{Recipe
        const matches = wikitext.matchAll(/\{\{Recipe\s*\|([\s\S]*?)\}\}/gi);
        // Wait, non-greedy match might stop early if there are nested templates.
        // Correct parsing requires counting braces.

        let cursor = 0;
        while (cursor < wikitext.length) {
            const start = wikitext.indexOf("{{Recipe", cursor);
            if (start === -1) break;

            // Find closing }} based on brace counting
            let braceCount = 2; // We skipped {{
            let end = start + 8; // length of "{{Recipe"

            while (end < wikitext.length && braceCount > 0) {
                if (wikitext.startsWith("{{", end)) {
                    braceCount += 2;
                    end += 2;
                } else if (wikitext.startsWith("}}", end)) {
                    braceCount -= 2;
                    end += 2;
                } else {
                    end++;
                }
            }

            if (braceCount === 0) {
                const fullTemplate = wikitext.substring(start, end);
                // Extract content inside {{Recipe ... }}
                const content = fullTemplate.substring(8, fullTemplate.length - 2);
                const recipe = this.parseRecipeTemplate(content, pageTitle);
                if (recipe) recipes.push(recipe);
            }

            cursor = start + 8;
        }

        return recipes;
    }

    private parseRecipeTemplate(content: string, pageTitle: string): Omit<Recipe, "id"> | null {
        // Split by pipes | that are not inside other templates
        // Again, simple split might fail if nested templates use |, e.g. {{...|...}}
        // For MVP, simple split by `\n|` or `|` is mostly okay if we assume cleaner formatting.
        // But let's be slightly robust:
        // We assume params are top-level. 

        // Remove comments <!-- -->
        const cleanContent = content.replace(/<!--[\s\S]*?-->/g, "");

        const params: Record<string, string> = {};

        let buffer = "";
        let braces = 0;
        let brackets = 0;

        // We want to split by pipe `|` ONLY if braces/brackets are 0.
        // And we need to capture key=value.

        // Actually, a simpler regex for parameter parsing might work if we assume standard formatting:
        // | key = value

        const paramMatches = cleanContent.matchAll(/\|\s*([^=]+?)\s*=\s*([\s\S]*?)(?=(\n\||$))/g);
        // This regex is tricky.

        // Let's implement a simple loop parser for params
        const parts: string[] = [];
        let currentPart = "";
        for (let i = 0; i < cleanContent.length; i++) {
            const char = cleanContent[i];
            if (char === '{') braces++;
            else if (char === '}') braces--;
            else if (char === '[') brackets++;
            else if (char === ']') brackets--;

            if (char === '|' && braces === 0 && brackets === 0) {
                parts.push(currentPart);
                currentPart = "";
            } else {
                currentPart += char;
            }
        }
        parts.push(currentPart);

        for (const part of parts) {
            const eqIndex = part.indexOf('=');
            if (eqIndex !== -1) {
                const key = part.substring(0, eqIndex).trim().toLowerCase();
                const val = part.substring(eqIndex + 1).trim();
                params[key] = val;
            }
        }

        // Extract Data
        // Inputs: mat1, mat1quantity, mat2...
        // Outputs: output1, output1quantity... (Default output is often the page title)

        const inputs: RecipeInput[] = [];
        const outputs: RecipeOutput[] = [];

        // Inputs
        // Support up to 10? verify how many mats. usually mat1..mat10
        for (let i = 1; i <= 10; i++) {
            const item = params[`mat${i}`];
            if (item) {
                const qtyStr = params[`mat${i}quantity`] || "1";
                // Remove commas, handle "1-5"? Use max or min?
                // For now simpler: parse int.
                const qty = parseInt(qtyStr.replace(/,/g, "")) || 1;
                const cleanName = this.cleanWikiText(item);
                const itemId = this.getItemId(cleanName);
                if (itemId) {
                    inputs.push({ itemId, quantity: qty });
                } else {
                    // Untradable / Missing ID
                    // Store with ID 0 and name
                    inputs.push({ itemId: 0, quantity: qty, name: cleanName });
                }
            }
        }

        // Outputs
        // If output1 is not defined, is it the page title? Usually explicit.
        // Sometimes just `output`?
        // Usually output1, output2...

        let hasOutputs = false;
        for (let i = 1; i <= 10; i++) {
            const item = params[`output${i}`];
            if (item) {
                hasOutputs = true;
                const qtyStr = params[`output${i}quantity`] || "1";
                const qty = parseInt(qtyStr.replace(/,/g, "")) || 1;
                const itemId = this.getItemId(this.cleanWikiText(item));
                const subtxt = params[`output${i}subtxt`];
                if (itemId) {
                    outputs.push({ itemId, quantity: qty, subtxt });
                }
            }
        }

        // If no explicit outputs, try page title (common for simple pages?) 
        // The `{{Recipe}}` docs say output1 is required usually.

        if (inputs.length === 0 || outputs.length === 0) return null;

        // Other fields
        const skill = params["skill1"] || params["skill"] || "Unknown";
        const level = parseInt(params["skill1lvl"] || params["level"] || "0") || 0;
        const ticks = parseInt(params["ticks"] || "0") || null;
        const facilities = params["facilities"] || null;
        const tools = params["tools"] || null;
        const members = (params["members"] || "").toLowerCase() === "yes";
        const xp = parseFloat(params["skill1exp"] || "0") || 0;

        // Determine name: Use output name (if singular) or Page Title
        const name = outputs.length === 1 ? this.cleanWikiText(params["output1"]) : pageTitle;

        return {
            name,
            skill,
            level,
            ticks,
            inputs,
            outputs,
            facilities: this.cleanWikiText(facilities || ""),
            tools: this.cleanWikiText(tools || ""),
            members,
            xp_: xp,
            wikiUrl: `https://oldschool.runescape.wiki/w/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`
        };
    }

    private cleanWikiText(text: string): string {
        // Remove [[Link|Text]] -> Text
        // Remove [[Link]] -> Link
        // Remove {{...}} -> ? 
        if (!text) return "";
        let clean = text;

        // [[Target|Label]] -> Label
        clean = clean.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");

        // Remove templates mostly? {{SCP|...}} -> ... ?
        // For facility/tools, often has templates.
        // {{SCP|Quest}} -> "Partial completion of..." - hard to parse generically.
        // Just keep text.
        return clean.trim();
    }

    private isSyncing = false;
    private lastSyncStart: Date | null = null;
    private lastSyncEnd: Date | null = null;
    private lastError: string | null = null;
    private processedCount = 0;

    public getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncStart: this.lastSyncStart,
            lastSyncEnd: this.lastSyncEnd,
            lastError: this.lastError,
            processedCount: this.processedCount
        };
    }

    // Orchestrator
    public async syncRecipes(): Promise<void> {
        if (this.isSyncing) {
            logger.warn("[RecipeService] Sync already in progress.");
            return;
        }

        this.isSyncing = true;
        this.lastSyncStart = new Date();
        this.lastError = null;
        this.processedCount = 0;

        try {
            logger.info("[RecipeService] Starting recipe sync...");
            await this.loadItemMapping();

            // Potential categories:
            // Category:Recipe_tables (might be meta)
            // Category:Items_with_recipes - Not sure if this exists.
            // Check Wiki structure... 
            // "Category:Production" ? 
            // Let's rely on specific known skill categories for MVP to ensure high quality data.
            const categories = [
                "Category:Smithing",
                "Category:Crafting",
                "Category:Fletching",
                "Category:Herblore",
                "Category:Cooking",
                "Category:Construction",
                "Category:Farming",
                "Category:Magic",
                "Category:Runecraft",
                "Category:Potions",
                "Category:Food",
                "Category:Ammunition",
                "Category:Jewellery",
                "Category:Armour",
                "Category:Weapons"
            ];

            for (const cat of categories) {
                logger.info(`[RecipeService] Fetching titles for ${cat}`);
                const titles = await this.fetchPagesInCategory(cat, 5000); // 200 is too low
                logger.info(`[RecipeService] Found ${titles.length} titles in ${cat}`);

                for (const title of titles) {
                    // Throttle: Wiki asks to not overload. 
                    // Sequential requests are usually fine, but adding a small delay is polite and avoids 429 burst.
                    await this.sleep(100);

                    const wikitext = await this.fetchWikitext(title);
                    if (wikitext) {
                        const recipes = this.parseRecipes(wikitext, title);
                        for (const r of recipes) {
                            try {
                                await saveRecipe(r);
                                this.processedCount++;
                            } catch (e) {
                                //  logger.warn(`Failed to save recipe for ${title}`, e);
                            }
                        }
                    }
                }
            }

            this.lastSyncEnd = new Date();
            logger.info(`[RecipeService] Sync complete. Saved ${this.processedCount} recipes.`);
        } catch (err: any) {
            logger.error(`[RecipeService] Sync failed`, err);
            this.lastError = err.message || "Unknown error";
        } finally {
            this.isSyncing = false;
        }
    }
}

export const recipeService = new RecipeService();
