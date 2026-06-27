import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Train,
  Camera,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";

const COLORS = {
  Clean: "#10B981",
  "Needs Attention": "#F59E0B",
  Unclean: "#EF4444",
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);

  const load = async () => {
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 86400000);
    const [s, r] = await Promise.all([
      api.get(
        `/reports/summary?date_from=${monthAgo.toISOString().slice(0, 10)}&date_to=${today
          .toISOString()
          .slice(0, 10)}`
      ),
      api.get("/inspections?limit=10"),
    ]);
    setSummary(s.data);
    setRecent(r.data);
  };

  useEffect(() => {
    load();
  }, []);

  if (!summary)
    return <div className="text-slate-400" data-testid="admin-dashboard-loading">Loading…</div>;

  const pieData = Object.entries(summary.rating_counts).map(([name, value]) => ({ name, value }));
  const stationBars = summary.station_breakdown.slice(0, 8).map((s) => ({
    name: s.station_name,
    score: s.avg_score,
  }));

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">
            Last 30 days
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Operational overview
          </h1>
        </div>
        <Link to="/admin/reports">
          <Button variant="ghost" className="text-blue-400 hover:text-blue-300" data-testid="goto-reports-btn">
            Full reports <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={Activity}
          label="Inspections"
          value={summary.total_inspections}
          tint="blue"
          testid="stat-inspections"
        />
        <Stat icon={Camera} label="Photos analysed" value={summary.total_photos} tint="blue" testid="stat-photos" />
        <Stat
          icon={Train}
          label="Stations active"
          value={summary.station_breakdown.length}
          tint="emerald"
          testid="stat-stations"
        />
        <Stat
          icon={AlertTriangle}
          label="Unclean flagged"
          value={summary.rating_counts["Unclean"] || 0}
          tint="red"
          testid="stat-unclean"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="surface rounded-xl p-5 lg:col-span-1">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
            Rating mix
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={COLORS[d.name]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {pieData.map((d) => (
              <Badge key={d.name} variant="secondary" className="bg-slate-800/70 border border-slate-700 text-slate-300">
                <span className="w-2 h-2 rounded-full mr-1.5" style={{ background: COLORS[d.name] }} />
                {d.name} · {d.value}
              </Badge>
            ))}
          </div>
        </div>

        <div className="surface rounded-xl p-5 lg:col-span-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
            Lowest-scoring stations
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={stationBars} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" }}
                />
                <Bar dataKey="score" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Unclean alerts
            </div>
          </div>
          {summary.unclean_details.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm">
              No unclean stations in the last 30 days. 🎉
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {summary.unclean_details.slice(0, 8).map((u) => (
                <Link
                  to={`/admin/inspections/${u.inspection_id}`}
                  key={u.inspection_id}
                  className="block px-5 py-3.5 hover:bg-slate-800/40"
                  data-testid={`alert-${u.inspection_id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{u.station_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {format(new Date(u.created_at), "PP")} · {u.issues[0] || "Unclean"}
                      </div>
                    </div>
                    <StatusBadge rating="Unclean" score={u.score} size="sm" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="surface rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              Recent inspections
            </div>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm">
              No inspections yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {recent.map((insp) => (
                <Link
                  to={`/admin/inspections/${insp.id}`}
                  key={insp.id}
                  className="block px-5 py-3.5 hover:bg-slate-800/40"
                  data-testid={`recent-${insp.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{insp.station_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {format(new Date(insp.created_at), "PPp")} · {insp.photos.length} photo
                        {insp.photos.length === 1 ? "" : "s"} · by {insp.uploaded_by_name}
                      </div>
                    </div>
                    <StatusBadge rating={insp.aggregate_rating} score={insp.aggregate_score} size="sm" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint, testid }) {
  const tints = {
    blue: "bg-blue-500/10 border-blue-500/25 text-blue-400",
    emerald: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
    red: "bg-red-500/10 border-red-500/25 text-red-400",
  };
  return (
    <div className="surface rounded-xl p-5" data-testid={testid}>
      <div className={`w-9 h-9 rounded-md border flex items-center justify-center mb-4 ${tints[tint]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="font-display text-3xl font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );
}
