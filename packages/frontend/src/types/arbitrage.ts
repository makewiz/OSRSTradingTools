export interface ArbitrageSetResult {
    setId: number;
    setName: string;
    action: 'ASSEMBLE' | 'BREAK';
    cost: number;
    revenue: number;
    profit: number;
    roi: number;
    components: number[];
    volume: number;
    profitPerHour: number;
}

export interface DecantResult {
    potionName: string;
    sourceDose: 1 | 2 | 3;
    sourceId: number;
    targetId: number;
    costPer4Dose: number;
    revenuePer4Dose: number;
    profitPer4Dose: number;
    roi: number;
    buyVolume: number;
    profitPerHour: number;
}
