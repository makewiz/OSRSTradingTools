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
  ResponsiveContainer
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

interface PriceChartProps {
  data: PriceDataPoint[] | HighFidelityData;
  isHighFidelity?: boolean;
}

export const PriceChart: React.FC<PriceChartProps> = ({ data, isHighFidelity }) => {
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

  if (chartData.length === 0) {
    return (
      <div className="chart-placeholder">
        <p>No price history available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis
          dataKey="time"
          stroke="#d0d7e2"
          tick={{ fill: "#d0d7e2", fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          yAxisId="left"
          stroke="#d0d7e2"
          tick={{ fill: "#d0d7e2", fontSize: 12 }}
          tickFormatter={(value) => value.toLocaleString()}
          domain={['auto', 'auto']}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke="#8884d8"
          tick={{ fill: "#8884d8", fontSize: 12 }}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(10, 12, 20, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: "0.4rem",
            color: "#f5f5f5"
          }}
          formatter={(value: any) => (typeof value === 'number' ? value.toLocaleString() : value) ?? "N/A"}
        />
        <Legend
          wrapperStyle={{ color: "#d0d7e2" }}
          iconType="rect"
        />

        {/* Market Prices */}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="buyPrice"
          stroke="#f87171"
          strokeWidth={2}
          dot={{ r: 2 }}
          name="Buy Price"
          connectNulls
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="sellPrice"
          stroke="#4ade80"
          strokeWidth={2}
          dot={{ r: 2 }}
          name="Sell Price"
          connectNulls
        />

        {/* Volume Bars */}
        {isHighFidelity ? (
          <>
            <Bar yAxisId="right" dataKey="buyVolume" name="Buy Volume" fill="#f87171" opacity={0.3} barSize={20} />
            <Bar yAxisId="right" dataKey="sellVolume" name="Sell Volume" fill="#4ade80" opacity={0.3} barSize={20} />
          </>
        ) : (
          <Bar yAxisId="right" dataKey="volume" name="Volume" fill="#8884d8" opacity={0.3} />
        )}

      </ComposedChart>
    </ResponsiveContainer>
  );
};
