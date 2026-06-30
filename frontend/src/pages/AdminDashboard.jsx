import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import DatePicker from "@/components/DatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Activity,
  Train,
  Camera,
  AlertTriangle,
  TrendingDown,
  ArrowRight,
  Filter,
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

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function AdminDashboard() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);

  const load = async () => {
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const insParams = new URLSearchParams(params);
    insParams.set("limit", "10");
    const [s, r] = await Promise.all([
      api.get(`/reports/summary?${params.toString()}`),
      api.get(`/inspections?${insParams.toString()}`),
    ]);
    setSummary(s.data);
    setRecent(r.data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const dateLabel =
    from && to
      ? from === to
        ? format(new Date(from), "PP")
        : `${format(new Date(from), "PP")} → ${format(new Date(to), "PP")}`
      : "All time";

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">
            {dateLabel}
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

      <div className="surface rounded-xl p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
          <Filter className="w-3.5 h-3.5" /> Date range
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-xs text-slate-400">From</Label>
            <div className="mt-1">
              <DatePicker value={from} onChange={setFrom} placeholder="From date" testid="dashboard-date-from" max={todayIso()} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">To</Label>
            <div className="mt-1">
              <DatePicker value={to} onChange={setTo} placeholder="To date" testid="dashboard-date-to" max={todayIso()} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setFrom(todayIso()); setTo(todayIso()); }}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="dashboard-preset-today"
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
              data-testid="dashboard-preset-7d"
            >
              Last 7d
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const d = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
                setFrom(d); setTo(todayIso());
              }}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
              data-testid="dashboard-preset-30d"
            >
              30d
            </Button>
          </div>
        </div>
      </div>

      {!summary ? (
        <div className="text-slate-400" data-testid="admin-dashboard-loading">Loading…</div>
      ) : (
        <DashboardBody summary={summary} recent={recent} dateLabel={dateLabel} />
      )}
    </div>
  );
}

function DashboardBody({ summary, recent, dateLabel }) {
  const pieData = Object.entries(summary.rating_counts).map(([name, value]) => ({ name, value }));
  const stationBars = summary.station_breakdown.slice(0, 8).map((s) => ({
    name: s.station_name,
    score: s.avg_score,
  }));

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Activity} label="Stations uploads" value={summary.total_inspections} tint="blue" testid="stat-inspections" />
        <Stat icon={Camera} label={`Photos analysed (${dateLabel})`} value={summary.total_photos} tint="blue" testid="stat-photos" />
        <Stat icon={Train} label="Stations active" value={summary.station_breakdown.length} tint="emerald" testid="stat-stations" />
        <Stat icon={AlertTriangle} label="Unclean flagged" value={summary.rating_counts["Unclean"] || 0} tint="red" testid="stat-unclean" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="surface rounded-xl p-5 lg:col-span-1">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">Rating mix</div>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={COLORS[d.name]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
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
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">Lowest-scoring stations</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={stationBars} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#FFFFFF" tick={{ fill: "#FFFFFF", fontSize: 11 }} angle={-15} textAnchor="end" height={50} />
                <YAxis stroke="#FFFFFF" tick={{ fill: "#FFFFFF", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" }}
                  labelStyle={{ color: "#FFFFFF" }}
                  itemStyle={{ color: "#FFFFFF" }}
                />
                <Bar dataKey="score" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="surface rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Unclean alerts</div>
          </div>
          {summary.unclean_details.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm">
              No unclean stations in this period.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {summary.unclean_details.slice(0, 8).map((u) => (
                <Link to={`/admin/inspections/${u.inspection_id}`} key={u.inspection_id} className="block px-5 py-3.5 hover:bg-slate-800/40" data-testid={`alert-${u.inspection_id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{u.station_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {u.inspection_date || format(new Date(u.created_at), "PP")} · {u.issues[0] || "Unclean"}
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
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Recent uploads</div>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-500 text-sm">No uploads in this date range.</div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-96 overflow-y-auto">
              {recent.map((insp) => (
                <Link to={`/admin/inspections/${insp.id}`} key={insp.id} className="block px-5 py-3.5 hover:bg-slate-800/40" data-testid={`recent-${insp.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{insp.station_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {insp.inspection_date || format(new Date(insp.created_at), "PPp")} · {insp.photos.length} photo
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
    </>
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
