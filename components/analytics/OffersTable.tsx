"use client";

import React, { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type OfferPerf = {
  id: string;
  title: string;
  url: string;
  impressions: number;
  clicks: number;
  ctr: number; // percentage 0-100
  last_seen: string | null;
};

interface Props {
  items: OfferPerf[];
}

export default function OffersTable({ items }: Props) {
  const [sortKey, setSortKey] = useState<keyof OfferPerf | "ctr">("clicks");
  const [asc, setAsc] = useState(false);
  const [q, setQ] = useState("");

  const data = useMemo(() => {
    const filtered = (items || []).filter((i) =>
      !q ? true : (i.title?.toLowerCase().includes(q.toLowerCase()) || i.url?.toLowerCase().includes(q.toLowerCase()))
    );
    filtered.sort((a: any, b: any) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return filtered;
  }, [items, sortKey, asc, q]);

  const maxClicks = Math.max(1, ...data.map((d) => d.clicks));

  const header = (label: string, key: keyof OfferPerf | "ctr") => (
    <button
      className="text-left font-medium text-sm text-gray-700 hover:text-gray-900"
      onClick={() => {
        if (sortKey === key) setAsc((v) => !v);
        else { setSortKey(key); setAsc(false); }
      }}
    >
      {label}{sortKey === key ? (asc ? " ▲" : " ▼") : ""}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by title or URL"
          className="w-72 h-9 px-3 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[220px]">{header("Offer", "title")}</TableHead>
              <TableHead className="min-w-[220px]">URL</TableHead>
              <TableHead className="w-32">{header("Impressions", "impressions")}</TableHead>
              <TableHead className="w-32">{header("Clicks", "clicks")}</TableHead>
              <TableHead className="w-24">{header("CTR", "ctr")}</TableHead>
              <TableHead className="w-44">{header("Last active", "last_seen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-gray-900">{p.title}</TableCell>
                <TableCell className="truncate max-w-[420px] text-gray-600" title={p.url}>{p.url}</TableCell>
                <TableCell>{p.impressions}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 bg-gray-200 rounded">
                      <div className="h-2 bg-blue-500 rounded" style={{ width: `${Math.round((p.clicks / maxClicks) * 100)}%` }} />
                    </div>
                    <span className="text-sm">{p.clicks}</span>
                  </div>
                </TableCell>
                <TableCell>{p.ctr}%</TableCell>
                <TableCell>{p.last_seen ? new Date(p.last_seen).toLocaleString() : ""}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-gray-500">No offers yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

