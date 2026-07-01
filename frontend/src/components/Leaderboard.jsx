import { useEffect, useState } from "react";
import api from "@/lib/api";
import DatePicker from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Award, AlertTriangle, Filter, Trophy } from "lucide-react";
import { format } from "date-fns";

const todayIso = () => new Date().toISOString().slice(0, 10);
const AXIS_TICK = { fill: "#FFFFFF", fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: { background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" },
  labelStyle: { color: "#FFFFFF" },
  itemStyle: { color: "#FFFFFF" },
};

/**
 * Reusable panel for showing best/worst station leaderboards.
 * `data` is expected in the shape [{station_name, clean_pct, avg_score?, ...}]
 * sorted best → worst.
 */
export function LeaderboardChart({ title, subtitle, data, dataKey = "clean_pct", suffix = "%", testid }) {
  if (!data || data.length === 0) {
    return (
      <div className="surface rounded-xl p-5" data-testid={testid}>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>}
        <div className="text-slate-500 text-sm py-10 text-center">No uploads in this range.</div>
      </div>
    );
  }
  return (
    <div className="surface rounded-xl p-5" data-testid={testid}>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{title}</div>
      {subtitle && <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div>}
      <div className="mt-4" style={{ height: Math.max(260, data.length * 26) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 55, right: 30 }}>
            <CartesianGrid stroke="#1E293B" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} stroke="#FFFFFF" tick={AXIS_TICK} />
            <YAxis
              dataKey="station_name"
              type="category"
              stroke="#FFFFFF"
              tick={AXIS_TICK}
              width={55}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v) => [`${v}${suffix}`, "Clean %"]}
            />
            <Bar dataKey={dataKey} radius={[0, 4, 4, 0]}>
              {data.map((_, i) => {
                const fill =
                  i === 0
                    ? "#10B981"
                    : i === data.length - 1
                      ? "#EF4444"
                      : "#3B82F6";
                return <Cell key={i} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Leaderboard({ overallData, onOverall }) {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [board, setBoard] = useState(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const r = await api.get(`/reports/leaderboard?${params.toString()}`);
    setBoard(r.data);
    if (onOverall) onOverall(r.data.overall || []);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const rangeLabel =
    from === to
      ? format(new Date(from), "PP")
      : `${format(new Date(from), "PP")} → ${format(new Date(to), "PP")}`;

  return (
    <section className="space-y-4" data-testid="leaderboard-section">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-blue-400" />
          <h2 className="font-display text-xl font-semibold tracking-tight">Station leaderboard</h2>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs text-slate-400">From</Label>
            <div className="mt-1">
              <DatePicker value={from} onChange={setFrom} testid="lb-date-from" max={todayIso()} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">To</Label>
            <div className="mt-1">
              <DatePicker value={to} onChange={setTo} testid="lb-date-to" max={todayIso()} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setFrom(todayIso()); setTo(todayIso()); }}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="lb-preset-today"
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
                setFrom(d); setTo(todayIso());
              }}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="lb-preset-7d"
            >
              7d
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeaderboardChart
          title="Average Clean % over selected range"
          subtitle={`Averaged across all uploads · ${rangeLabel}`}
          data={board?.average || []}
          dataKey="clean_pct"
          testid="lb-chart-average"
        />
        <LeaderboardChart
          title="Most recent upload in range"
          subtitle={`Clean % of the single latest upload per station · ${rangeLabel}`}
          data={board?.most_recent || []}
          dataKey="clean_pct"
          testid="lb-chart-recent"
        />
      </div>
    </section>
  );
}
