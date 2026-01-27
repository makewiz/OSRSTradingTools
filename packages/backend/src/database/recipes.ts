import { pool, getLatestPricesBefore, getLatestPrice, getLatestPricesFallback } from "../database";
import { logger } from "@osrstradingtools/shared";
import { getMapping, getVolumes } from "../osrsClient";

export interface RecipeInput {
    itemId: number;
    quantity: number;
}

export interface RecipeOutput {
    itemId: number;
    quantity: number;
    subtxt?: string; // e.g. "Ammo mould" vs "Double ammo mould"
}

export interface Recipe {
    id: number;
    name: string; // usually Name of the output item, or specific name if multiple
    skill: string;
    level: number;
    ticks: number | null;
    inputs: RecipeInput[];
    outputs: RecipeOutput[];
    facilities: string | null;
    tools: string | null;
    wikiUrl?: string;
    members: boolean;
    xp_: number | null;
}

export interface ProfitableRecipe extends Recipe {
    cost: number;
    revenue: number;
    profit: number;
    profitPerItem: number;
    roi: number;
    potentialProfitPerHour: number | null;
    dailyVolume: number | null;
    inputs: (RecipeInput & { name: string; price: number })[];
    outputs: (RecipeOutput & { name: string; price: number })[];
}

export async function createRecipeTables(): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        skill TEXT,
        level INTEGER,
        ticks INTEGER,
        facilities TEXT,
        tools TEXT,
        members BOOLEAN,
        xp REAL,
        wiki_url TEXT,
        created_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        updated_at BIGINT NOT NULL DEFAULT (CAST(EXTRACT(EPOCH FROM NOW()) AS BIGINT)),
        UNIQUE(name, skill, level) 
      )
    `);
        // Note: inputs_hash is a conceptual unique constraint; in practice we might just rely on name/skill or just overwrite.
        // Simplifying unique constraint to just name for now, or name+skill+output? 
        // Actually, one item can have multiple recipes (e.g. diff moulds).
        // Let's rely on a delete-insert or intelligent upsert based on name + signature.
        // For now, let's Drop/Recreate or just Upsert by Name if unique enough.
        // To keep it simple for the MVP: We will use a unique constraint on (name, skill, level) and basic Upsert.
        // If that proves insufficient (collisions), we'll refine.

        await client.query(`
      CREATE TABLE IF NOT EXISTS recipe_inputs (
        recipe_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      )
    `);

        await client.query(`
      CREATE TABLE IF NOT EXISTS recipe_outputs (
        recipe_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        subtxt TEXT,
        FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
      )
    `);

        // Add constraint if not exists (manual check or just try/catch)
        // For simplicity in this script, we won't add complex constraints dynamically yet.

    } finally {
        client.release();
    }
}

export async function clearRecipes(): Promise<void> {
    await pool.query("TRUNCATE recipes CASCADE");
}

export async function saveRecipe(recipe: Omit<Recipe, "id">): Promise<void> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Basic de-duplication: Delete existing recipes with same name/skill to avoid duplicates on re-sync
        // A better approach would be checking a hash, but this is fine for full-syncs.
        await client.query("DELETE FROM recipes WHERE name = $1 AND skill = $2", [recipe.name, recipe.skill]);

        const res = await client.query(`
      INSERT INTO recipes (name, skill, level, ticks, facilities, tools, members, xp, wiki_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
            recipe.name,
            recipe.skill,
            recipe.level,
            recipe.ticks,
            recipe.facilities,
            recipe.tools,
            recipe.members,
            recipe.xp_,
            recipe.wikiUrl
        ]);

        const recipeId = res.rows[0].id;

        for (const input of recipe.inputs) {
            await client.query(`
        INSERT INTO recipe_inputs (recipe_id, item_id, quantity)
        VALUES ($1, $2, $3)
      `, [recipeId, input.itemId, input.quantity]);
        }

        for (const output of recipe.outputs) {
            await client.query(`
        INSERT INTO recipe_outputs (recipe_id, item_id, quantity, subtxt)
        VALUES ($1, $2, $3, $4)
      `, [recipeId, output.itemId, output.quantity, output.subtxt]);
        }

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        logger.error(`Failed to save recipe ${recipe.name}`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getProfitableRecipes(minProfit: number = 0, limit: number = 100, minVolume: number = 0): Promise<ProfitableRecipe[]> {
    // 1. Fetch all recipes
    // 2. Fetch latest prices for all involved items
    // 3. Calculate profit in memory (easier than complex SQL with current schema)

    const recipesRes = await pool.query(`
      SELECT r.*, 
             COALESCE(json_agg(DISTINCT ri.*) FILTER (WHERE ri.item_id IS NOT NULL), '[]') as inputs,
             COALESCE(json_agg(DISTINCT ro.*) FILTER (WHERE ro.item_id IS NOT NULL), '[]') as outputs
      FROM recipes r
      LEFT JOIN recipe_inputs ri ON r.id = ri.recipe_id
      LEFT JOIN recipe_outputs ro ON r.id = ro.recipe_id
      GROUP BY r.id
    `);

    // Get all unique item IDs
    const itemIds = new Set<number>();
    recipesRes.rows.forEach(r => {
        r.inputs.forEach((i: any) => itemIds.add(i.item_id));
        r.outputs.forEach((o: any) => itemIds.add(o.item_id));
    });

    if (itemIds.size === 0) return [];

    // Optimize: fetch all latest prices in one go
    // We can use getLatestPricesBefore with current timestamp, or a dedicated map function if available.
    // getLatestPricesBefore returns { [id]: { avgHigh, avgLow } } from history tables.
    // For live profitability, we might prefer 'getLatest' (from API cache) or 'getLatestPrice' (DB).
    // Let's use getLatestPrice in bulk or reuse getLatestPricesBefore which uses the 5m table.
    // The database.ts has 'getLatestPricesBefore'.
    const now = Math.floor(Date.now() / 1000);
    const [priceMap, mapping, volumes] = await Promise.all([
        getLatestPricesFallback(Array.from(itemIds), now),
        getMapping(),
        getVolumes()
    ]);

    // Create Map for Name Lookup
    const nameMap = new Map<number, string>();
    for (const item of mapping) {
        nameMap.set(item.id, item.name);
    }

    const profitableRecipes: ProfitableRecipe[] = [];

    for (const row of recipesRes.rows) {
        let cost = 0;
        let revenue = 0;
        let valid = true;

        const richInputs = [];
        const richOutputs = [];

        // Calculate Cost (Buy Price of Inputs)
        for (const input of row.inputs) {
            // Special handling for Coins (995)
            if (input.item_id === 995) {
                cost += input.quantity; // 1 gp per 1 quantity
                richInputs.push({
                    itemId: input.item_id,
                    quantity: input.quantity,
                    name: "Coins",
                    price: 1
                });
                continue;
            }

            const priceData = priceMap[input.item_id];
            // If no price data, assume 0 or skip? Let's skip to be safe, or use 0 if unlikely.
            // Skipping is safer for "Profit" correctness.
            // Some items might be untradeable (no price).
            const price = priceData?.avgHigh ?? 0; // Buy at High (conservative/instant) or Low? 
            // Usually for crafting: Buy at Ask (High), Sell at Bid (Low).
            // Actually: Instant Buy = High, Slow Buy = Low.
            // Instant Sell = Low, Slow Sell = High.
            // Let's use Buy = AvgLow (Slow buys are typical for crafting) and Sell = AvgHigh (Slow sells).
            // But to be conservative: Buy High, Sell Low.
            // Let's stick to standard: Cost = Buy Price, Revenue = Sell Price.
            // Most tools use "Active" prices. 
            // Let's use avgLow for buying materials (patient buyer) and avgHigh for selling (patient seller)?
            // Or avgHigh for buying (instant) and avgLow for selling (instant)?
            // Let's use avgLow for Input and avgHigh for Output to represent "Trading Post / Merching" style (Patient).
            // BUT for mass crafting, usually you Buy Instantly (High) and Sell Instantly (Low) if you want speed.
            // Let's use avg_low_price for both to keep it consistent? No.
            // Let's start with: Cost = Price to acquire. Revenue = Price to sell.
            const costPrice = priceData?.avgLow ?? 0; // Buy at low (bid)
            const revenuePrice = priceData?.avgHigh ?? 0; // Sell at high (ask)

            // If price is missing or zero, we can't calculate profit accurately
            if ((!priceData || costPrice <= 0) && input.item_id !== 995) {
                valid = false;
            }

            cost += costPrice * input.quantity;
            richInputs.push({
                itemId: input.item_id,
                quantity: input.quantity,
                name: nameMap.get(input.item_id) || `Item ${input.item_id}`,
                price: costPrice
            });
        }

        // Calculate Revenue (Sell Price of Outputs)
        for (const output of row.outputs) {
            // Special handling for Coins (995)
            if (output.item_id === 995) {
                revenue += output.quantity; // 1 gp per 1 quantity
                richOutputs.push({
                    itemId: output.item_id,
                    quantity: output.quantity,
                    subtxt: output.subtxt,
                    name: "Coins",
                    price: 1
                });
                continue;
            }

            const priceData = priceMap[output.item_id];
            const price = priceData?.avgHigh ?? 0;
            revenue += price * output.quantity;
            richOutputs.push({
                itemId: output.item_id,
                quantity: output.quantity,
                subtxt: output.subtxt,
                name: nameMap.get(output.item_id) || `Item ${output.item_id}`,
                price: price
            });
        }

        const profit = revenue - cost;
        const roi = cost > 0 ? (profit / cost) * 100 : 0;

        let profitPerHour = null;
        if (row.ticks && row.ticks > 0) {
            // 1 tick = 0.6 seconds
            const secondsPerAction = row.ticks * 0.6;
            const actionsPerHour = 3600 / secondsPerAction;
            profitPerHour = profit * actionsPerHour;
        }

        // Determine Weekly/Daily Volume based on main output
        // Try to match exact recipe name (often output name)
        let volume = volumes[row.name];

        // Fallback: Check outputs if recipe name doesn't match
        if (volume === undefined && richOutputs.length > 0) {
            // Use the item with the highest quantity or just the first?
            // Usually first output is main.
            volume = volumes[richOutputs[0].name];
        }

        const dailyVolume = volume ?? 0;

        if (valid && profit >= minProfit) {
            if (minVolume > 0 && dailyVolume < minVolume) {
                // Skip if volume too low
                continue;
            }

            profitableRecipes.push({
                id: row.id,
                name: row.name,
                skill: row.skill,
                level: row.level,
                ticks: row.ticks,
                inputs: richInputs,
                outputs: richOutputs,
                facilities: row.facilities,
                tools: row.tools,
                members: row.members,
                xp_: row.xp,
                wikiUrl: row.wiki_url,
                cost,
                revenue,
                profit,
                profitPerItem: profit, // this is per action/recipe
                roi,
                potentialProfitPerHour: profitPerHour,
                dailyVolume: volume ?? null
            });
        }

    }

    return profitableRecipes.sort((a, b) => (b.potentialProfitPerHour ?? -Infinity) - (a.potentialProfitPerHour ?? -Infinity)).slice(0, limit);
}
