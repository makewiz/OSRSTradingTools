import React from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area
} from "recharts";

interface PriceDataPoint {
  timestamp: number;
  buyPrice: number | null;
  sellPrice: number | null;
  volume: number | null;
}

interface HighFidelityData {
  buy: { timestamp: number; price: number }[];
  sell: { timestamp: number; price: number }[];
  volume: { timestamp: number; buy_volume: number | null; sell_volume: number | null }[];
}

export interface ForecastPoint {
  x: number;
  y: number;
  isForecast: boolean;
  lowerBound: number;
  upperBound: number;
}

interface PriceChartProps {
  data: PriceDataPoint[] | HighFidelityData;
  forecastData?: {
    buy: ForecastPoint[],
    sell: ForecastPoint[],
    ai?: { buy: ForecastPoint[], sell: ForecastPoint[] }
  } | ForecastPoint[];
  isHighFidelity?: boolean;
  graphType?: 'price' | 'volume';
  showForecast?: boolean;
  forecastModel?: 'linear' | 'ai';
}

export const PriceChart: React.FC<PriceChartProps> = ({
  data,
  forecastData,
  isHighFidelity,
  graphType = 'price',
  showForecast = false,
  forecastModel = 'linear'
}) => {
  let chartData: any[] = [];

  if (isHighFidelity && data) {
    // Merge separate streams into a single timeline for the chart
    const hData = data as HighFidelityData;
    const timestamps = new Set<number>();

    if (hData.buy) hData.buy.forEach(d => timestamps.add(d.timestamp));
    if (hData.sell) hData.sell.forEach(d => timestamps.add(d.timestamp));
    if (hData.volume) hData.volume.forEach(d => timestamps.add(d.timestamp));

    chartData = Array.from(timestamps).sort().map(ts => {
      const buyPoint = hData.buy?.find(d => d.timestamp === ts);
      const sellPoint = hData.sell?.find(d => d.timestamp === ts);
      const volPoint = hData.volume?.find(d => d.timestamp === ts);

      return {
        timestamp: ts,
        time: new Date(ts * 1000).toLocaleString(),
        buyPrice: buyPoint?.price ?? null,
        sellPrice: sellPoint?.price ?? null,
        buyVolume: volPoint?.buy_volume ?? null,
        sellVolume: volPoint?.sell_volume ?? null
      };
    });
  } else if (Array.isArray(data)) {
    // Legacy format
    chartData = data.map((point) => ({
      time: new Date(point.timestamp * 1000).toLocaleString(),
      timestamp: point.timestamp,
      buyPrice: point.buyPrice,
      sellPrice: point.sellPrice,
      volume: point.volume
    }));
  }

  // Merge Forecast Data if available and only for price graph
  if (forecastData && graphType === 'price' && showForecast) {
    const fData = forecastData as any;
    let newPoints: any[] = [];

    // Check if it's the new split structure
    if (fData.buy || fData.sell) {
      // Choose which forecast source to use
      const useAI = forecastModel === 'ai' && fData.ai;
      const sourceBuy = useAI ? fData.ai.buy : fData.buy;
      const sourceSell = useAI ? fData.ai.sell : fData.sell;

      // Collect all timestamps
      const fTimestamps = new Set<number>();
      if (sourceBuy) sourceBuy.forEach((p: any) => fTimestamps.add(p.x));
      if (sourceSell) sourceSell.forEach((p: any) => fTimestamps.add(p.x));

      newPoints = Array.from(fTimestamps).map(ts => {
        const buyP = sourceBuy?.find((p: any) => p.x === ts);
        const sellP = sourceSell?.find((p: any) => p.x === ts);
        return {
          timestamp: ts,
          time: new Date(ts * 1000).toLocaleString(),
          forecastBuy: buyP?.y ?? null,
          forecastSell: sellP?.y ?? null,
          isForecast: true
        };
      });
    } else if (Array.isArray(fData)) {
      // Legacy single array
      newPoints = fData.map((p: any) => ({
        timestamp: p.x,
        time: new Date(p.x * 1000).toLocaleString(),
        forecastPrice: p.y,
        isForecast: true
      }));
    }

    // Append forecast data to chartData
    chartData = [...chartData, ...newPoints];

    // Sort again just in case overlap exists
    chartData.sort((a, b) => a.timestamp - b.timestamp);
  }

  if (chartData.length === 0) {
    return (
      <div className="chart-placeholder">
        <p>No price history available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis
          dataKey="time"
          stroke="#d0d7e2"
          tick={{ fill: "#d0d7e2", fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={60}
          minTickGap={30}
        />
        <YAxis
          yAxisId="left"
          stroke="#d0d7e2"
          tick={{ fill: "#d0d7e2", fontSize: 12 }}
          tickFormatter={(value) =>
            graphType === 'volume'
              ? (value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value)
              : value.toLocaleString()
          }
          domain={['auto', 'auto']}
          orientation="left"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(10, 12, 20, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: "0.4rem",
            color: "#f5f5f5"
          }}
          formatter={(value: any, name: any) => {
            if (name === 'forecastLower' || name === 'forecastUpper') return [null, null]; // Hide bounds from default tooltip if desired, or show range
            return (typeof value === 'number' ? value.toLocaleString() : value) ?? "N/A";
          }}
          labelFormatter={(label) => label}
        />
        <Legend verticalAlign="top" height={36} />

        {graphType === 'price' && (
          <>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="buyPrice"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              name="Buy Price"
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="sellPrice"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              name="Sell Price"
              connectNulls
            />
            {/* Forecast Lines */}
            {showForecast && (
              <>
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="forecastBuy"
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Forecast Buy"
                  connectNulls
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="forecastSell"
                  stroke="#4ade80"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Forecast Sell"
                  connectNulls
                />
              </>
            )}


          </>
        )}

        {graphType === 'volume' && (
          isHighFidelity ? (
            <>
              <Bar yAxisId="left" dataKey="buyVolume" name="Buy Volume" fill="#f87171" opacity={0.5} barSize={20} stackId="a" />
              <Bar yAxisId="left" dataKey="sellVolume" name="Sell Volume" fill="#4ade80" opacity={0.5} barSize={20} stackId="a" />
            </>
          ) : (
            <Bar yAxisId="left" dataKey="volume" name="Volume" fill="#8884d8" opacity={0.5} />
          )
        )}

      </ComposedChart>
    </ResponsiveContainer>
  );
};
