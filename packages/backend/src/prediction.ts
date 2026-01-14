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
 * Calculates weighted linear regression (y = mx + b)
 * giving more weight to recent data points.
 */
export function calculateWeightedLinearRegression(data: Point[]) {
    const n = data.length;
    if (n < 2) return null;

    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    let sumWXY = 0;
    let sumWXX = 0;

    // Use normalized X for numerical stability, similar to before
    // Weights: simple linear ramp from 1 to N. 
    // This gives the most recent point N times more influence than the oldest.

    for (let i = 0; i < n; i++) {
        const point = data[i];
        const weight = i + 1; // Weight range [1, n]

        sumW += weight;
        sumWX += weight * point.x;
        sumWY += weight * point.y;
        sumWXY += weight * point.x * point.y;
        sumWXX += weight * point.x * point.x;
    }

    const denominator = sumW * sumWXX - sumWX * sumWX;
    if (denominator === 0) return null;

    const slope = (sumW * sumWXY - sumWX * sumWY) / denominator;
    const intercept = (sumWY - slope * sumWX) / sumW;

    return { slope, intercept };
}

/**
 * Generates a forecast based on recent history using Weighted Linear Regression
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
    const startTime = validData[0].x;
    const normalizedData = validData.map(p => ({
        x: p.x - startTime,
        y: p.y
    }));

    // 3. Calculate Weighted Regression
    const regression = calculateWeightedLinearRegression(normalizedData);
    if (!regression) return [];

    const { slope, intercept } = regression;

    // 4. Calculate Standard Error (Weighted RMSE) for Confidence Intervals
    let sumWeightedSquaredResiduals = 0;
    let sumWeights = 0;

    for (let i = 0; i < normalizedData.length; i++) {
        const p = normalizedData[i];
        const weight = i + 1;
        const predicted = slope * p.x + intercept;
        const residual = p.y - predicted;

        sumWeightedSquaredResiduals += weight * residual * residual;
        sumWeights += weight;
    }

    const weightedStdDev = Math.sqrt(sumWeightedSquaredResiduals / sumWeights);

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
        const uncertaintyMultiplier = 1 + (i * 0.1);
        const marginOfError = weightedStdDev * uncertaintyMultiplier;

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

/**
 * Generates a forecast using a Neural Network (Perceptron).
 * This captures non-linear trends using a sliding window approach.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Architect, Trainer } = require("synaptic");

export function generateAIForecast(
    history: Point[],
    forecastDurationSeconds: number = 6 * 60 * 60,
    resolutionSeconds: number = 30 * 60
): ForecastPoint[] {
    const validData = history.filter(p => p.y !== null && !isNaN(p.y));
    if (validData.length < 20) return [];

    // 1. Normalize data
    const prices = validData.map(p => p.y);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    if (priceRange === 0) return [];

    const normalizedData = prices.map(y => (y - minPrice) / priceRange);

    // 2. Prepare training data (Sliding Window)
    const windowSize = 5;
    const trainingSet = [];

    for (let i = 0; i < normalizedData.length - windowSize; i++) {
        trainingSet.push({
            input: normalizedData.slice(i, i + windowSize),
            output: [normalizedData[i + windowSize]]
        });
    }

    // 3. Train Neural Network
    // Input: windowSize, Hidden: 8, Output: 1
    const net = new Architect.Perceptron(windowSize, 8, 1);
    const trainer = new Trainer(net);

    trainer.train(trainingSet, {
        rate: 0.1,
        iterations: 1000,
        error: 0.005,
        shuffle: true,
        log: 0,
        cost: Trainer.cost.MSE
    });

    // 4. Forecast
    const forecastPoints: ForecastPoint[] = [];
    const lastTime = validData[validData.length - 1].x;

    // Seed with the last window
    let currentInput = normalizedData.slice(-windowSize);

    for (let i = 1; i <= forecastDurationSeconds / resolutionSeconds; i++) {
        // Activate the network with the current input window
        const nextNormalized = net.activate(currentInput)[0];

        // Denormalize
        const predictedPrice = nextNormalized * priceRange + minPrice;

        const futureTimeAbsolute = lastTime + (i * resolutionSeconds);

        forecastPoints.push({
            x: futureTimeAbsolute,
            y: Math.max(0, Math.round(predictedPrice)),
            isForecast: true
        });

        // Update input window: remove oldest, add new prediction
        currentInput = [...currentInput.slice(1), nextNormalized];
    }

    return forecastPoints;
}
