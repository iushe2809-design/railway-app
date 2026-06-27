import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Filter, Download, AlertTriangle } from "lucide-react";

function toCsv(rows) {
  const header = Object.keys(rows[0]).join(",");
  const body = rows
    .map((r) =>
      Object.values(r)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");
  return `${header}\n${body}`;
}

export default function Reports() {
  const [stationNames, setStationNames] = useState([]);
  const [stationName, setStationName] = useState("all");
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 30 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/inspections/station-names").then((r) => setStationNames(r.data));
  }, []);

  const load = async () => {
    const params = new URLSearchParams();
    if (stationName !== "all") params.set("station_name", stationName);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const res = await api.get(`/reports/summary?${params.toString()}`);
    setData(res.data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationName, from, to]);

  const exportCsv = () => {
    if (!data || data.station_breakdown.length === 0) return;
    const csv = toCsv(data.station_breakdown);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">
            Performance reports
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Station performance
          </h1>
        </div>
        <Button
          onClick={exportCsv}
          variant="outline"
          className="border-slate-700 text-slate-200 hover:bg-slate-800"
          data-testid="export-csv-btn"
        >
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="surface rounded-xl p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-slate-400">Station</Label>
            <Select value={stationName} onValueChange={setStationName}>
              <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="reports-station-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100 max-h-72">
                <SelectItem value="all">All stations</SelectItem>
                {stationNames.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-slate-500">No stations submitted yet</div>
                )}
                {stationNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-slate-400">From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
              data-testid="reports-date-from"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
              data-testid="reports-date-to"
            />
          </div>
        </div>
      </div>

      {!data ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="reports-stats">
            <KPI label="Inspections" value={data.total_inspections} />
            <KPI label="Photos" value={data.total_photos} />
            <KPI label="Clean" value={data.rating_counts.Clean} tint="emerald" />
            <KPI label="Unclean" value={data.rating_counts.Unclean} tint="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
                Photos uploaded per day
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={data.daily_uploads}>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#64748B" fontSize={11} />
                    <YAxis stroke="#64748B" fontSize={11} />
                    <Tooltip contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" }} />
                    <Line type="monotone" dataKey="photos" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
                Station average scores
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.station_breakdown}>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="station_name" stroke="#64748B" fontSize={10} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" }} />
                    <Bar dataKey="avg_score" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="surface rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 text-xs uppercase tracking-[0.18em] text-slate-400">
              Station breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="station-breakdown-table">
                <thead className="text-left text-slate-400 text-xs uppercase tracking-[0.12em]">
                  <tr>
                    <th className="px-5 py-3">Station</th>
                    <th className="px-5 py-3 text-right">Inspections</th>
                    <th className="px-5 py-3 text-right">Clean</th>
                    <th className="px-5 py-3 text-right">Needs Att.</th>
                    <th className="px-5 py-3 text-right">Unclean</th>
                    <th className="px-5 py-3 text-right">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.station_breakdown.map((s) => (
                    <tr key={s.station_name} className="hover:bg-slate-800/40">
                      <td className="px-5 py-3 text-slate-100">{s.station_name}</td>
                      <td className="px-5 py-3 text-right font-mono">{s.total}</td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-400">{s.clean}</td>
                      <td className="px-5 py-3 text-right font-mono text-amber-400">{s.needs_attention}</td>
                      <td className="px-5 py-3 text-right font-mono text-red-400">{s.unclean}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-100">{s.avg_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.unclean_details.length > 0 && (
            <div className="surface rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 text-xs uppercase tracking-[0.18em] text-slate-400 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Unclean stations — problems
              </div>
              <div className="divide-y divide-slate-800">
                {data.unclean_details.map((u) => (
                  <Link
                    to={`/admin/inspections/${u.inspection_id}`}
                    key={u.inspection_id}
                    className="block px-5 py-4 hover:bg-slate-800/40"
                    data-testid={`unclean-row-${u.inspection_id}`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className="text-sm font-medium text-slate-100">{u.station_name}</div>
                      <div className="text-xs text-slate-500">
                        {u.inspection_date || new Date(u.created_at).toLocaleDateString()} · Score {u.score}
                      </div>
                    </div>
                    {u.issues.length > 0 && (
                      <ul className="text-xs text-slate-400 space-y-0.5">
                        {u.issues.map((it, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-red-400 mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                            {it}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, tint }) {
  const tints = {
    emerald: "text-emerald-400",
    red: "text-red-400",
  };
  return (
    <div className="surface rounded-xl p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`font-display text-3xl font-bold mt-1 ${tints[tint] || "text-slate-100"}`}>
        {value}
      </div>
    </div>
  );
}
