"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type TrendPoint = {
  date: string;
  sessions: number;
  impressions: number;
  clicks: number;
  widget_opens: number;
};

interface Props {
  data: TrendPoint[];
  metric: "sessions" | "clicks" | "impressions" | "widget_opens";
  height?: number;
}

export default function AreaTimeline({ data, metric, height = 220 }: Props) {
  const color = "#2563eb"; // blue-600
  const areaFillId = `areaFill-${metric}`;

  // Map to a single series for clarity (like the screenshot)
  const series = data.map((d) => ({
    date: d.date,
    value: (d as any)[metric] ?? 0,
  }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
          <defs>
            <linearGradient id={areaFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} width={38} allowDecimals={false} />
          <Tooltip
            formatter={(value: any) => [String(value), metric.replace("_", " ")]}
            labelStyle={{ color: "#334155" }}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }}
          />
          <Area type="monotone" dataKey="value" stroke={color} fill={`url(#${areaFillId})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

