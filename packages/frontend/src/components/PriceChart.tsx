import React from "react";
import {
  LineChart,
  Line,
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

interface PriceChartProps {
  data: PriceDataPoint[];
}

export const PriceChart: React.FC<PriceChartProps> = ({ data }) => {
  // Format data for the chart
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp * 1000).toLocaleString(),
    timestamp: point.timestamp,
    buyPrice: point.buyPrice,
    sellPrice: point.sellPrice,
    volume: point.volume
  }));

  if (chartData.length === 0) {
    return (
      <div className="chart-placeholder">
        <p>No price history available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          stroke="#d0d7e2"
          tick={{ fill: "#d0d7e2", fontSize: 12 }}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(10, 12, 20, 0.95)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            borderRadius: "0.4rem",
            color: "#f5f5f5"
          }}
          formatter={(value: number) => value?.toLocaleString() ?? "N/A"}
        />
        <Legend
          wrapperStyle={{ color: "#d0d7e2" }}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="buyPrice"
          stroke="#f87171"
          strokeWidth={2}
          dot={false}
          name="Buy Price"
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="sellPrice"
          stroke="#4ade80"
          strokeWidth={2}
          dot={false}
          name="Sell Price"
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};


