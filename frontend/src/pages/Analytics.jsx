import { useEffect, useState } from "react";
import api from "@/lib/api";
import Leaderboard, { LeaderboardChart } from "@/components/Leaderboard";
import { Sparkles, TrendingUp, PieChart as PieIcon } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = { Clean: "#10B981", "Need Attention": "#F59E0B" };
const AXIS_TICK = { fill: "#FFFFFF", fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: { background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" },
  labelStyle: { color: "#FFFFFF" },
  itemStyle: { color: "#FFFFFF" },
};

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [board, setBoard] = useState(null);

  const load = async () => {
    const [s, b] = await Promise.all([
      api.get("/reports/summary"),
      api.get("/reports/leaderboard"),
    ]);
    setSummary(s.data);
    setBoard(b.data);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-8" data-testid="analytics-page">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Deep dive
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Analytics</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Visual view of network-wide cleanliness. All charts auto-refresh every 45 seconds.
        </p>
      </div>

      {!summary || !board ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-3 flex items-center gap-1.5">
                <PieIcon className="w-3.5 h-3.5" /> Rating mix — all time
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={Object.entries(summary.rating_counts).map(([name, value]) => ({ name, value }))}
                      dataKey="value"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {Object.keys(summary.rating_counts).map((k) => (
                        <Cell key={k} fill={COLORS[k] || "#94A3B8"} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ color: "#FFFFFF" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Photos per day (all time)
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={summary.daily_uploads}>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#FFFFFF" tick={AXIS_TICK} />
                    <YAxis stroke="#FFFFFF" tick={AXIS_TICK} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Line type="monotone" dataKey="photos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <LeaderboardChart
            title="All-time leaderboard — best → worst"
            subtitle="Clean % across every upload ever recorded"
            data={board.overall}
            testid="analytics-overall-leaderboard"
          />

          <Leaderboard />
        </>
      )}
    </div>
  );
}
