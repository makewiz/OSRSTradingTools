
export const TAX_RATE = 0.02; // 2%
export const TAX_CAP = 5000000; // 5m
export const TAX_EXEMPT_THRESHOLD = 50; // < 50gp

const EXEMPT_ITEMS = new Set([
    // Special
    "Old school bond", // Corrected to singular as per likely in-game name, but user said 'Old school bonds'. I'll add both to be safe.
    "Old school bonds",
    "Energy potion",

    // Low level combat
    "Bronze arrow",
    "Bronze dart",
    "Iron arrow",
    "Iron dart",
    "Mind rune",
    "Steel arrow",
    "Steel dart",

    // Low level food
    "Bass",
    "Bread",
    "Cake",
    "Cooked chicken",
    "Cooked meat",
    "Herring",
    "Lobster",
    "Mackerel",
    "Meat pie",
    "Pike",
    "Salmon",
    "Shrimps",
    "Tuna",

    // Teleport items
    "Ardougne teleport",
    "Camelot teleport",
    "Civitas illa fortis teleport",
    "Falador teleport",
    "Games necklace(8)", // Wiki usually has no space before (8).
    "Games necklace (8)",
    "Kourend castle teleport",
    "Lumbridge teleport",
    "Ring of dueling(8)",
    "Ring of dueling (8)",
    "Teleport to house",
    "Varrock teleport",

    // Tools
    "Chisel",
    "Gardening trowel",
    "Glassblowing pipe",
    "Hammer",
    "Needle",
    "Pestle and mortar",
    "Rake",
    "Saw",
    "Secateurs",
    "Seed dibber",
    "Shears",
    "Spade",
    "Watering can(0)",
    "Watering can (0)"
]);

export function isTaxExempt(name: string): boolean {
    // Check exact match
    if (EXEMPT_ITEMS.has(name)) return true;

    // Check case-insensitive
    // (optimization: could lowercase the set keys once)
    // Check case-insensitive
    const lowerName = name.toLowerCase();
    for (const item of EXEMPT_ITEMS) {
        if (item.toLowerCase() === lowerName) return true;
    }

    return false;
}

export function calculateTax(price: number, name: string): number {
    if (price < TAX_EXEMPT_THRESHOLD) {
        return 0;
    }

    if (isTaxExempt(name)) {
        return 0;
    }

    const tax = Math.floor(price * TAX_RATE);
    return Math.min(tax, TAX_CAP);
}

export function calculateProfit(buyPrice: number, sellPrice: number, name: string): number {
    const tax = calculateTax(sellPrice, name);
    return (sellPrice - tax) - buyPrice;
}

export function calculateROI(buyPrice: number, sellPrice: number, name: string): number {
    if (buyPrice <= 0) return 0;
    const profit = calculateProfit(buyPrice, sellPrice, name);
    return (profit / buyPrice) * 100;
}
