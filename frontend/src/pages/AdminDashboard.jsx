import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import DatePicker from "@/components/DatePicker";
import Leaderboard from "@/components/Leaderboard";
import DownloadPdfButton from "@/components/DownloadPdfButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Train, Camera, ArrowRight, Filter, Award, ShieldAlert, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { format } from "date-fns";

const todayIso = () => new Date().toISOString().slice(0, 10);
const AXIS_TICK = { fill: "#FFFFFF", fontSize: 11 };
const AXIS_TICK_SM = { fill: "#FFFFFF", fontSize: 10 };
const TOOLTIP_STYLE = {
  contentStyle: { background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" },
  labelStyle: { color: "#FFFFFF" },
  itemStyle: { color: "#FFFFFF" },
};

export default function AdminDashboard() {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [dayDetail, setDayDetail] = useState(null);
  const [overallLeaderboard, setOverallLeaderboard] = useState([]);
  const pdfRef = useRef(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const insParams = new URLSearchParams(params);
    insParams.set("limit", "20");
    const isSingleToday = from === to;
    const requests = [
      api.get(`/reports/summary?${params.toString()}`),
      api.get(`/inspections?${insParams.toString()}`),
    ];
    if (isSingleToday) requests.push(api.get(`/reports/day-detail?date=${from}`));
    const [s, r, d] = await Promise.all(requests);
    setSummary(s.data);
    setRecent(r.data);
    setDayDetail(d ? d.data : null);
  }, [from, to]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const dateLabel =
    from === to ? format(new Date(from), "PP") : `${format(new Date(from), "PP")} → ${format(new Date(to), "PP")}`;

  const best = overallLeaderboard[0];
  const worst = overallLeaderboard.length > 1 ? overallLeaderboard[overallLeaderboard.length - 1] : null;

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">{dateLabel}</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Operational overview</h1>
        </div>
        <div className="flex gap-2">
          <DownloadPdfButton
            contentRef={pdfRef}
            filename={`overview_${from}_${to}`}
            title="My Clean Station — Overview"
            subtitle={`Range: ${dateLabel}`}
            testid="dashboard-download-pdf"
          />
          <Link to="/admin/reports">
            <Button variant="ghost" className="text-blue-400 hover:text-blue-300" data-testid="goto-reports-btn">
              Full reports <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      <div ref={pdfRef} className="space-y-8">
        {/* Best / Worst callouts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CalloutCard tone="green" icon={Award} label="Best Clean Station" station={best} testid="callout-best" />
          <CalloutCard tone="red" icon={ShieldAlert} label="Worst Clean Station" station={worst} testid="callout-worst" />
        </div>

        {/* Date filter */}
        <div className="surface rounded-xl p-4 md:p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
            <Filter className="w-3.5 h-3.5" /> Date range
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs text-slate-400">From</Label>
              <div className="mt-1"><DatePicker value={from} onChange={setFrom} testid="dashboard-date-from" max={todayIso()} /></div>
            </div>
            <div>
              <Label className="text-xs text-slate-400">To</Label>
              <div className="mt-1"><DatePicker value={to} onChange={setTo} testid="dashboard-date-to" max={todayIso()} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setFrom(todayIso()); setTo(todayIso()); }} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="dashboard-preset-today">Today</Button>
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(Date.now() - 6*86400000).toISOString().slice(0,10); setFrom(d); setTo(todayIso()); }} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="dashboard-preset-7d">7d</Button>
              <Button size="sm" variant="outline" onClick={() => { const d = new Date(Date.now() - 29*86400000).toISOString().slice(0,10); setFrom(d); setTo(todayIso()); }} className="border-slate-700 text-slate-200 hover:bg-slate-800" data-testid="dashboard-preset-30d">30d</Button>
            </div>
          </div>
        </div>

        {!summary ? (
          <div className="text-slate-400" data-testid="admin-dashboard-loading">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StationsUploadedCard dayDetail={dayDetail} summary={summary} isSingleDay={from === to} />
              <PhotosAnalysedCard dayDetail={dayDetail} summary={summary} dateLabel={dateLabel} isSingleDay={from === to} />
            </div>

            {/* All-stations bar chart, descending */}
            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
                All stations by average score — best → worst
              </div>
              <AllStationsBarChart data={summary.station_breakdown} />
            </div>

            {/* Today uploads */}
            <div className="surface rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Today uploads</div>
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
          </>
        )}
      </div>

      <Leaderboard onOverall={setOverallLeaderboard} />
    </div>
  );
}

function StationsUploadedCard({ dayDetail, summary, isSingleDay }) {
  const [open, setOpen] = useState(false);
  const stations = isSingleDay && dayDetail ? dayDetail.stations : summary.station_breakdown;
  const count = isSingleDay && dayDetail ? dayDetail.stations_count : summary.station_breakdown.length;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="surface rounded-xl p-5 text-left hover:bg-slate-800/40 transition-colors" data-testid="stat-stations-uploaded">
          <div className="w-9 h-9 rounded-md border bg-blue-500/10 border-blue-500/25 text-blue-400 flex items-center justify-center mb-4">
            <Train className="w-4 h-4" />
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {isSingleDay ? "Stations uploaded today" : "Stations that uploaded"}
          </div>
          <div className="font-display text-3xl font-bold mt-1 tracking-tight flex items-center gap-2">
            {count}
            <ChevronRight className="w-5 h-5 text-slate-500" />
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Click to see station list</div>
        </button>
      </DialogTrigger>
      <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100 max-w-md" data-testid="stations-uploaded-dialog">
        <DialogHeader>
          <DialogTitle>Stations that uploaded</DialogTitle>
          <DialogDescription className="text-slate-400">
            {stations.length} station{stations.length === 1 ? "" : "s"} in this period.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {stations.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-6">No stations uploaded.</div>
          ) : (
            stations.map((s) => (
              <div key={s.station_name} className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/50 border border-slate-800">
                <div className="font-mono text-slate-100">{s.station_name}</div>
                <div className="text-xs text-slate-400">{s.photos ?? s.total} photo{(s.photos ?? s.total) === 1 ? "" : "s"}</div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhotosAnalysedCard({ dayDetail, summary, dateLabel, isSingleDay }) {
  const [pick, setPick] = useState("all");
  const uploaders = isSingleDay && dayDetail ? dayDetail.uploaders : [];
  const total = isSingleDay && dayDetail ? dayDetail.photos_count : summary.total_photos;
  const selected = pick === "all" ? null : uploaders.find((u) => `${u.submitted_by_name}::${u.station_name}` === pick);
  return (
    <div className="surface rounded-xl p-5" data-testid="stat-photos-analysed">
      <div className="w-9 h-9 rounded-md border bg-blue-500/10 border-blue-500/25 text-blue-400 flex items-center justify-center mb-4">
        <Camera className="w-4 h-4" />
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        Photos analysed ({dateLabel})
      </div>
      <div className="font-display text-3xl font-bold mt-1 tracking-tight">
        {selected ? selected.photos : total}
      </div>
      {isSingleDay && uploaders.length > 0 ? (
        <div className="mt-4">
          <Label className="text-[11px] uppercase tracking-[0.15em] text-slate-500">Break down by SM</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="bg-[#060B14] border-slate-800 text-slate-100 mt-1" data-testid="photos-analysed-sm-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100 max-h-72">
              <SelectItem value="all">All uploaders — {total} photo{total === 1 ? "" : "s"}</SelectItem>
              {uploaders.map((u) => (
                <SelectItem key={`${u.submitted_by_name}::${u.station_name}`} value={`${u.submitted_by_name}::${u.station_name}`}>
                  {u.submitted_by_name} · {u.station_name} — {u.photos}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 mt-1">Pick a single day to see per-SM breakdown.</div>
      )}
    </div>
  );
}

function AllStationsBarChart({ data }) {
  const sorted = [...data].sort((a, b) => b.avg_score - a.avg_score);
  const height = Math.max(320, sorted.length * 28);
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={sorted} layout="vertical" margin={{ left: 60, right: 20 }}>
          <CartesianGrid stroke="#1E293B" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke="#FFFFFF" tick={AXIS_TICK} />
          <YAxis dataKey="station_name" type="category" stroke="#FFFFFF" tick={AXIS_TICK_SM} width={60} interval={0} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="avg_score" fill="#3B82F6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CalloutCard({ tone, icon: Icon, label, station, testid }) {
  const tones = {
    green: { wrap: "bg-emerald-500/10 border-emerald-500/40", icon: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400", value: "text-emerald-300", accent: "text-emerald-400" },
    red: { wrap: "bg-red-500/10 border-red-500/40", icon: "bg-red-500/20 border-red-500/40 text-red-400", value: "text-red-300", accent: "text-red-400" },
  };
  const t = tones[tone];
  return (
    <div className={`rounded-xl border p-5 relative overflow-hidden ${t.wrap}`} data-testid={testid}>
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="relative flex items-center gap-4">
        <div className={`w-12 h-12 rounded-md border flex items-center justify-center ${t.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] uppercase tracking-[0.22em] ${t.accent}`}>{label}</div>
          <div className={`font-display text-2xl sm:text-3xl font-bold tracking-tight mt-0.5 truncate ${t.value}`}>{station?.station_name || "—"}</div>
          {station && (
            <div className="text-xs text-slate-400 mt-1">
              {station.clean_pct}% clean · {station.total} upload{station.total === 1 ? "" : "s"} · avg score {station.avg_score}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
