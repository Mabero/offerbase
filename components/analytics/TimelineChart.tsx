"use client";

import React from "react";

type TrendPoint = {
  date: string;
  sessions: number;
  impressions: number;
  clicks: number;
  widget_opens: number;
};

type SeriesVisibility = {
  sessions?: boolean;
  impressions?: boolean;
  clicks?: boolean;
  opens?: boolean;
};

interface TimelineChartProps {
  data: TrendPoint[];
  show?: SeriesVisibility;
  height?: number;
  className?: string;
}

const defaultShow: Required<SeriesVisibility> = {
  sessions: true,
  clicks: true,
  impressions: false,
  opens: false,
};

export default function TimelineChart({
  data,
  show = defaultShow,
  height = 160,
  className,
}: TimelineChartProps) {
  const padding = 24;
  const width = Math.max(320, (data.length > 1 ? (data.length - 1) * 16 : 0) + padding * 2);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const enabled = {
    sessions: !!show.sessions,
    impressions: !!show.impressions,
    clicks: !!show.clicks,
    opens: !!show.opens,
  };

  const maxVal = Math.max(
    1,
    ...data.map((d) =>
      Math.max(
        enabled.sessions ? d.sessions || 0 : 0,
        enabled.impressions ? d.impressions || 0 : 0,
        enabled.clicks ? d.clicks || 0 : 0,
        enabled.opens ? d.widget_opens || 0 : 0
      )
    )
  );

  const step = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  const series = [
    { key: "sessions" as const, color: "#3b82f6", accessor: (d: TrendPoint) => d.sessions },
    { key: "impressions" as const, color: "#f59e0b", accessor: (d: TrendPoint) => d.impressions },
    { key: "clicks" as const, color: "#10b981", accessor: (d: TrendPoint) => d.clicks },
    { key: "opens" as const, color: "#ef4444", accessor: (d: TrendPoint) => d.widget_opens },
  ];

  function makePoints(accessor: (d: TrendPoint) => number) {
    return data
      .map((d, i) => {
        const x = padding + i * step;
        const v = Math.min(accessor(d), maxVal);
        const y = padding + (chartHeight - (v / maxVal) * chartHeight);
        return `${x},${y}`;
      })
      .join(" ");
  }

  const labelIdxs = new Set<number>();
  if (data.length > 0) {
    labelIdxs.add(0);
    labelIdxs.add(data.length - 1);
    labelIdxs.add(Math.floor((data.length - 1) / 2));
  }

  return (
    <div className={className} style={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label="Timeline chart">
        <rect x={0} y={0} width={width} height={height} fill="white" />

        {/* Axes */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((p, i) => {
          const y = padding + chartHeight * (1 - p);
          return <line key={i} x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f3f4f6" />;
        })}

        {/* Series */}
        {series.map((s) =>
          (enabled as any)[s.key] ? (
            <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2} points={makePoints(s.accessor)} />
          ) : null
        )}

        {/* Points */}
        {series.map((s) =>
          (enabled as any)[s.key]
            ? data.map((d, i) => {
                const x = padding + i * step;
                const v = Math.min(s.accessor(d), maxVal);
                const y = padding + (chartHeight - (v / maxVal) * chartHeight);
                return <circle key={`${s.key}-${i}`} cx={x} cy={y} r={2} fill={s.color} />;
              })
            : null
        )}

        {/* Labels */}
        {data.map((d, i) =>
          labelIdxs.has(i) ? (
            <text key={`label-${i}`} x={padding + i * step} y={height - padding + 14} textAnchor="middle" fontSize="10" fill="#6b7280">
              {d.date}
            </text>
          ) : null
        )}
        <text x={padding - 6} y={padding + 6} textAnchor="end" fontSize="10" fill="#6b7280">
          {maxVal}
        </text>
        <text x={padding - 6} y={height - padding} textAnchor="end" fontSize="10" fill="#6b7280">
          0
        </text>
      </svg>
    </div>
  );
}

