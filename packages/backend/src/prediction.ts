export interface Point {
    x: number; // timestamp
    y: number; // price
}

export interface ForecastPoint extends Point {
    isForecast: true;
    lowerBound?: number;
    upperBound?: number;
}

/**
 * Calculates simple linear regression (y = mx + b)
 */
export function calculateLinearRegression(data: Point[]) {
    const n = data.length;
    if (n < 2) return null;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const point of data) {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumXX += point.x * point.x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
}

/**
 * Generates a forecast based on recent history
 * @param history Recent price data points
 * @param forecastDurationSeconds How far into the future to forecast
 * @param resolutionSeconds Gap between forecast points
 */
export function generateForecast(
    history: Point[],
    forecastDurationSeconds: number = 6 * 60 * 60, // 6 hours
    resolutionSeconds: number = 30 * 60 // 30 minutes
): ForecastPoint[] {
    // 1. Filter for valid data
    const validData = history.filter(p => p.y !== null && !isNaN(p.y));
    if (validData.length < 10) return []; // Need consistent data for a trend

    // 2. Normalize timestamps for calculation (regression struggles with huge numbers)
    // We'll treat the first point as t=0
    const startTime = validData[0].x;
    const normalizedData = validData.map(p => ({
        x: p.x - startTime,
        y: p.y
    }));

    // 3. Calculate separate regressions for Buy and Sell if needed, 
    // but for now we'll assumes 'history' is a single series (e.g. averaged price)

    const regression = calculateLinearRegression(normalizedData);
    if (!regression) return [];

    const { slope, intercept } = regression;

    // 4. Calculate Standard Error for Confidence Intervals (Simplified)
    // We'll use the standard deviation of residuals as a proxy for "volatility"
    let sumSquaredResiduals = 0;
    for (const p of normalizedData) {
        const predicted = slope * p.x + intercept;
        const residual = p.y - predicted;
        sumSquaredResiduals += residual * residual;
    }
    const stdDev = Math.sqrt(sumSquaredResiduals / normalizedData.length);

    // 5. Generate Future Points
    const lastTime = validData[validData.length - 1].x;
    const forecastPoints: ForecastPoint[] = [];

    // Start from the last known point to ensure continuity visually
    const startX = lastTime - startTime;

    for (let i = 1; i <= forecastDurationSeconds / resolutionSeconds; i++) {
        const futureTimeRelative = startX + (i * resolutionSeconds);
        const futureTimeAbsolute = startTime + futureTimeRelative;

        const predictedPrice = slope * futureTimeRelative + intercept;

        // Widen confidence interval as we go further into the future
        // Simple heuristic: 1 stdDev +/- (0.1 stdDev per step)
        const uncertaintyMultiplier = 1 + (i * 0.1);
        const marginOfError = stdDev * uncertaintyMultiplier;

        forecastPoints.push({
            x: futureTimeAbsolute,
            y: Math.max(0, Math.round(predictedPrice)), // Price can't be negative
            isForecast: true,
            lowerBound: Math.max(0, Math.round(predictedPrice - marginOfError)),
            upperBound: Math.max(0, Math.round(predictedPrice + marginOfError))
        });
    }

    return forecastPoints;
}
