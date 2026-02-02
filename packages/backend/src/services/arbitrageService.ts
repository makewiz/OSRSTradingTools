import { ITEM_SETS, ItemSet } from '../data/itemSets';
import { POTIONS, PotionDoses } from '../data/potions';
import { ItemService } from './itemService'; // This should now resolve
import { calculateTax } from '../tax';




interface ArbitrageSetResult {
    setId: number;
    setName: string;
    action: 'ASSEMBLE' | 'BREAK'; // Assemble parts into set, or break set into parts
    cost: number;
    revenue: number;
    profit: number;
    roi: number;
    components: number[];
    volume: number; // Volume of the limiting item (lowest volume in the chain)
    profitPerHour: number;
}

interface DecantResult {
    potionName: string;
    sourceDose: 1 | 2 | 3;
    sourceId: number;
    targetId: number; // Always buying lower doses to make 4-dose (usually)
    costPer4Dose: number;
    revenuePer4Dose: number;
    profitPer4Dose: number;
    roi: number;
    buyVolume: number;
    profitPerHour: number;
}

export class ArbitrageService {
    private itemService: ItemService;

    constructor(itemService: ItemService) {
        this.itemService = itemService;
    }

    private getHourlyCap(limit: number | null | undefined, volume: number | null | undefined): number {
        // Default limit to a reasonably high number if unknown (e.g. 10000) to rely on volume, or 0? 
        // Safer to assume some limit exists. Most GE limits are known. If null, maybe 0 to be safe? 
        // Or 10000. Let's use 10000 as a fallback if null, but prioritize volume.
        const l = limit ?? 10000;
        const v = volume ?? 0;

        const hourlyLimit = l / 4;
        const hourlyVolume = v / 24;

        return Math.min(hourlyLimit, hourlyVolume);
    }

    public async getSetArbitrage(): Promise<ArbitrageSetResult[]> {
        const items = await this.itemService.getLatestItems();
        const results: ArbitrageSetResult[] = [];



        for (const set of ITEM_SETS) {
            const setItem = items.find(i => i.id === set.id);
            if (!setItem) continue;

            // Check for stale data (older than 6 hours)
            const STALE_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours
            const now = Date.now();
            const lastUpdated = Math.max(setItem.lastBuyTime || 0, setItem.lastSellTime || 0) * 1000; // API uses seconds

            if (now - lastUpdated > STALE_THRESHOLD) {
                // Skip stale items to avoid "ghost" arbitrage
                continue;
            }

            let componentsSumBuy = 0;

            let componentsSumSell = 0;
            let minComponentVolume = Infinity;
            let allComponentsFound = true;

            // For Assemble: We buy components. Bottleneck is the component with lowest "buy availability" (limit or volume)
            let maxAssembleSetsPerHour = Infinity;

            // For Break: We buy Set. Bottleneck is Set buy availability.
            const maxBreakSetsPerHour = this.getHourlyCap(setItem.limit, setItem.volume);

            for (const compId of set.componentIds) {
                const comp = items.find(i => i.id === compId);
                if (!comp) {
                    allComponentsFound = false;
                    break;
                }
                componentsSumBuy += comp.sellPrice || 0; // Buy at high (instant)
                componentsSumSell += comp.buyPrice || 0; // Sell at low (instant)

                // Track the lowest volume item to gauge liquidity
                const vol = comp.volume || 0;
                if (vol < minComponentVolume) minComponentVolume = vol;

                // Calculate Cap for this component
                const compCap = this.getHourlyCap(comp.limit, comp.volume);
                if (compCap < maxAssembleSetsPerHour) {
                    maxAssembleSetsPerHour = compCap;
                }
            }

            if (!allComponentsFound) continue;

            // Scenario 1: Buy Parts -> Assemble -> Sell Set
            // Cost: Sum of Parts High
            // Revenue: Set Low (Instant Sell) - Tax
            const partsCost = componentsSumBuy;
            const setLow = setItem.buyPrice || 0;
            const setRevenue = setLow - calculateTax(setLow, setItem.name);
            const assembleProfit = setRevenue - partsCost;

            if (assembleProfit > 0) {
                // Cap is also limited by the output volume (Set volume) because we need to sell it
                const setSellCap = (setItem.volume || 0) / 24;
                const finalAssembleSpeed = Math.min(maxAssembleSetsPerHour, setSellCap);

                results.push({
                    setId: set.id,
                    setName: set.name,
                    action: 'ASSEMBLE',
                    cost: partsCost,
                    revenue: setRevenue,
                    profit: assembleProfit,
                    roi: (assembleProfit / partsCost) * 100,
                    components: set.componentIds,
                    volume: Math.min(minComponentVolume, setItem.volume || 0),
                    profitPerHour: assembleProfit * finalAssembleSpeed
                });

            }

            // Scenario 2: Buy Set -> Break -> Sell Parts
            // Cost: Set High (Instant Buy)
            // Revenue: Sum of Parts Low (Instant Sell) - Tax on each part
            // Note: When selling parts, tax applies to each transaction.

            // Let's refine tax on parts.
            let partsRevenue = 0;
            // Also need to check if we can sell the parts (volume limit)
            let maxPartsSellSpeed = Infinity;

            for (const compId of set.componentIds) {
                const comp = items.find(i => i.id === compId);
                if (comp) {
                    const sellPrice = comp.buyPrice || 0;
                    partsRevenue += (sellPrice - calculateTax(sellPrice, comp.name));

                    const compSellCap = (comp.volume || 0) / 24;
                    if (compSellCap < maxPartsSellSpeed) {
                        maxPartsSellSpeed = compSellCap;
                    }
                }
            }

            const setCost = setItem.sellPrice || 0;
            const breakProfit = partsRevenue - setCost;


            if (breakProfit > 0) {
                const finalBreakSpeed = Math.min(maxBreakSetsPerHour, maxPartsSellSpeed);
                results.push({
                    setId: set.id,
                    setName: set.name,
                    action: 'BREAK',
                    cost: setCost,
                    revenue: partsRevenue,
                    profit: breakProfit,
                    roi: (breakProfit / setCost) * 100,
                    components: set.componentIds,
                    volume: Math.min(minComponentVolume, setItem.volume || 0),
                    profitPerHour: breakProfit * finalBreakSpeed
                });

            }
        }

        return results.sort((a, b) => b.profit - a.profit);
    }

    public async getDecantProfit(): Promise<DecantResult[]> {
        const items = await this.itemService.getLatestItems();
        const results: DecantResult[] = [];


        for (const [potionName, doses] of Object.entries(POTIONS)) {
            const dose4 = items.find(i => i.id === doses.dose4);
            if (!dose4) continue;

            const dose4SellAvailability = (dose4.volume || 0) / 24; // How many 4-doses can we sell per hour

            // We are looking for opportunities to buy lower doses and decant into 4-dose
            // Strategy: Buy (3) dose.
            // 4 units of (3) dose = 3 units of (4) dose.
            // So verify: Cost(4 * dose3) < Revenue(3 * dose4) ?

            // DOSE 3
            const dose3 = items.find(i => i.id === doses.dose3);
            if (dose3) {
                // Calculation per 1 unit of resulting 4-dose potion
                // Need 1.333 units of 3-dose to make 1 unit of 4-dose.
                // Cost = 1.333 * dose3.high
                // Revenue = 1 * dose4.low * 0.99

                // To make it integer math friendly:
                // Batch: 4x (3) -> 3x (4)
                const costBatch = 4 * (dose3.sellPrice || 0);
                const dose4Low = dose4.buyPrice || 0;
                const revenueBatch = 3 * (dose4Low - calculateTax(dose4Low, dose4.name));

                const profitBatch = revenueBatch - costBatch;

                if (profitBatch > 0) {
                    // Availability
                    const sourceCap = this.getHourlyCap(dose3.limit, dose3.volume);
                    // Conversion: We need 4 inputs for 3 outputs.
                    // Max batches per hour = sourceCap / 4
                    // Output items per hour = Max batches * 3
                    const maxOutputPerHour = (sourceCap / 4) * 3;

                    const finalSpeed = Math.min(maxOutputPerHour, dose4SellAvailability);
                    const profitPer4Dose = profitBatch / 3;

                    results.push({
                        potionName: potionName,
                        sourceDose: 3,
                        sourceId: doses.dose3,
                        targetId: doses.dose4,
                        costPer4Dose: costBatch / 3,
                        revenuePer4Dose: revenueBatch / 3,
                        profitPer4Dose: profitPer4Dose,
                        roi: (profitBatch / costBatch) * 100,
                        buyVolume: dose3.volume || 0,
                        profitPerHour: profitPer4Dose * finalSpeed
                    });

                }
            }

            // DOSE 2
            const dose2 = items.find(i => i.id === doses.dose2);
            if (dose2) {
                // Batch: 2x (2) -> 1x (4)
                const costBatch = 2 * (dose2.sellPrice || 0);
                const dose4Low = dose4.buyPrice || 0;
                const revenueBatch = 1 * (dose4Low - calculateTax(dose4Low, dose4.name));
                const profitBatch = revenueBatch - costBatch;

                if (profitBatch > 0) {
                    const sourceCap = this.getHourlyCap(dose2.limit, dose2.volume);
                    // Conversion: 2 inputs for 1 output
                    const maxOutputPerHour = sourceCap / 2;

                    const finalSpeed = Math.min(maxOutputPerHour, dose4SellAvailability);
                    const profitPer4Dose = profitBatch;

                    results.push({
                        potionName: potionName,
                        sourceDose: 2,
                        sourceId: doses.dose2,
                        targetId: doses.dose4,
                        costPer4Dose: costBatch, // Batch is 1
                        revenuePer4Dose: revenueBatch,
                        profitPer4Dose: profitBatch,
                        roi: (profitBatch / costBatch) * 100,
                        buyVolume: dose2.volume || 0,
                        profitPerHour: profitPer4Dose * finalSpeed
                    });

                }
            }

            // DOSE 1
            const dose1 = items.find(i => i.id === doses.dose1);
            if (dose1) {
                // Batch: 4x (1) -> 1x (4)
                const costBatch = 4 * (dose1.sellPrice || 0);
                const dose4Low = dose4.buyPrice || 0;
                const revenueBatch = 1 * (dose4Low - calculateTax(dose4Low, dose4.name));
                const profitBatch = revenueBatch - costBatch;

                if (profitBatch > 0) {
                    const sourceCap = this.getHourlyCap(dose1.limit, dose1.volume);
                    // Conversion: 4 inputs for 1 output
                    const maxOutputPerHour = sourceCap / 4;

                    const finalSpeed = Math.min(maxOutputPerHour, dose4SellAvailability);
                    const profitPer4Dose = profitBatch;

                    results.push({
                        potionName: potionName,
                        sourceDose: 1,
                        sourceId: doses.dose1,
                        targetId: doses.dose4,
                        costPer4Dose: costBatch, // Batch is 1
                        revenuePer4Dose: revenueBatch,
                        profitPer4Dose: profitBatch,
                        roi: (profitBatch / costBatch) * 100,
                        buyVolume: dose1.volume || 0,
                        profitPerHour: profitPer4Dose * finalSpeed
                    });

                }
            }


        }

        return results.sort((a, b) => b.profitPer4Dose - a.profitPer4Dose);
    }
}
