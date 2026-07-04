import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import DatePicker from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Filter, Download, AlertTriangle, FileDown, PieChart as PieIcon } from "lucide-react";
import { toast } from "sonner";

const AXIS_TICK = { fill: "#FFFFFF", fontSize: 11 };
const AXIS_TICK_SM = { fill: "#FFFFFF", fontSize: 10 };
const TOOLTIP_STYLE = {
  contentStyle: { background: "#0B1120", border: "1px solid #1E293B", color: "#FFFFFF" },
  labelStyle: { color: "#FFFFFF" },
  itemStyle: { color: "#FFFFFF" },
};

function toCsv(rows) {
  if (!rows.length) return "";
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
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  // Pie chart has its own independent date range
  const [pieFrom, setPieFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [pieTo, setPieTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [pieData, setPieData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const chartsRef = useRef(null);

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

  const loadPie = async () => {
    const params = new URLSearchParams();
    if (pieFrom) params.set("date_from", pieFrom);
    if (pieTo) params.set("date_to", pieTo);
    const res = await api.get(`/reports/summary?${params.toString()}`);
    setPieData(res.data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationName, from, to]);

  useEffect(() => {
    loadPie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieFrom, pieTo]);

  const exportCsv = () => {
    if (!data || data.station_breakdown.length === 0) return;
    const rows = data.station_breakdown.map((s) => ({
      station: s.station_name,
      inspections_days: s.inspection_days,
      clean_pct: s.clean_pct,
      need_attention_pct: s.need_attention_pct,
      avg_score: s.avg_score,
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!data || data.station_breakdown.length === 0) {
      toast.error("No data to export");
      return;
    }
    setExporting(true);
    try {
      const [{ default: jsPDF }, autoTableModule, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
        import("html2canvas"),
      ]);
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("My Clean Station — Station Report", 40, 40);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Range: ${from} to ${to}${stationName !== "all" ? ` · Station: ${stationName}` : ""}`,
        40,
        58
      );
      doc.text(
        `Generated: ${new Date().toLocaleString()} · Stations: ${data.station_breakdown.length} · Photos: ${data.total_photos}`,
        40,
        72
      );

      // Snapshot the bar chart into an image
      if (chartsRef.current) {
        const canvas = await html2canvas(chartsRef.current, {
          backgroundColor: "#0B1120",
          scale: 2,
        });
        const img = canvas.toDataURL("image/png");
        const imgW = pageWidth - 80;
        const imgH = (canvas.height * imgW) / canvas.width;
        doc.addImage(img, "PNG", 40, 90, imgW, Math.min(imgH, 260));
      }

      autoTable(doc, {
        startY: 380,
        head: [["Station", "Inspections (days)", "Clean %", "Need Attention %", "Avg score"]],
        body: data.station_breakdown.map((s) => [
          s.station_name,
          s.inspection_days,
          `${s.clean_pct}%`,
          `${s.need_attention_pct}%`,
          s.avg_score,
        ]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
        alternateRowStyles: { fillColor: [241, 245, 249] },
      });

      doc.save(`my-clean-station_report_${from}_${to}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="reports-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Performance reports</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Station performance</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={exportCsv}
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            data-testid="export-csv-btn"
          >
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
          <Button
            onClick={exportPdf}
            disabled={exporting}
            className="bg-blue-500 hover:bg-blue-400 text-white"
            data-testid="export-pdf-btn"
          >
            <FileDown className="w-4 h-4 mr-1.5" /> {exporting ? "Preparing…" : "Download Report (PDF)"}
          </Button>
        </div>
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
            <div className="mt-1">
              <DatePicker value={from} onChange={setFrom} testid="reports-date-from" max={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-slate-400">To</Label>
            <div className="mt-1">
              <DatePicker value={to} onChange={setTo} testid="reports-date-to" max={new Date().toISOString().slice(0, 10)} />
            </div>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4" data-testid="reports-stats">
            <KPI label="Photos" value={data.total_photos} />
            <KPI label="Clean" value={data.rating_counts.Clean} tint="emerald" />
            <KPI label="Need Attention" value={data.rating_counts["Need Attention"] || 0} tint="red" />
          </div>

          <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PieChartCard
              pieData={pieData}
              pieFrom={pieFrom}
              pieTo={pieTo}
              setPieFrom={setPieFrom}
              setPieTo={setPieTo}
            />
            <div className="surface rounded-xl p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
                Station average scores — all {data.station_breakdown.length} stations
              </div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(600, data.station_breakdown.length * 60), height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.station_breakdown}>
                      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="station_name" stroke="#FFFFFF" tick={AXIS_TICK_SM} interval={0} angle={-45} textAnchor="end" height={80} />
                      <YAxis stroke="#FFFFFF" tick={AXIS_TICK} domain={[0, 100]} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="avg_score" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
                    <th className="px-5 py-3 text-right">Inspections (days)</th>
                    <th className="px-5 py-3 text-right">Clean %</th>
                    <th className="px-5 py-3 text-right">Need Attention %</th>
                    <th className="px-5 py-3 text-right">Avg score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.station_breakdown.map((s) => (
                    <tr key={s.station_name} className="hover:bg-slate-800/40">
                      <td className="px-5 py-3 text-slate-100">{s.station_name}</td>
                      <td className="px-5 py-3 text-right font-mono">{s.inspection_days}</td>
                      <td className="px-5 py-3 text-right font-mono text-emerald-400">{s.clean_pct}%</td>
                      <td className="px-5 py-3 text-right font-mono text-amber-400">{s.need_attention_pct}%</td>
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
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Stations needing attention
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
      <div className={`font-display text-3xl font-bold mt-1 ${tints[tint] || "text-slate-100"}`}>{value}</div>
    </div>
  );
}

const PIE_COLORS = { Clean: "#10B981", "Need Attention": "#F59E0B" };

function PieChartCard({ pieData, pieFrom, pieTo, setPieFrom, setPieTo }) {
  const counts = pieData?.rating_counts || { Clean: 0, "Need Attention": 0 };
  const total = (counts.Clean || 0) + (counts["Need Attention"] || 0);
  const rows = [
    { name: "Clean", value: counts.Clean || 0 },
    { name: "Need Attention", value: counts["Need Attention"] || 0 },
  ];
  const cleanPct = total ? Math.round(((counts.Clean || 0) / total) * 1000) / 10 : 0;
  const naPct = total ? Math.round(((counts["Need Attention"] || 0) / total) * 1000) / 10 : 0;

  return (
    <div className="surface rounded-xl p-5" data-testid="reports-pie-chart">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 flex items-center gap-1.5">
            <PieIcon className="w-3.5 h-3.5" /> Clean vs Need Attention (%)
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Independent date filter for this chart.</div>
        </div>
        <div className="flex gap-2">
          <div>
            <Label className="text-[10px] uppercase tracking-[0.15em] text-slate-500">From</Label>
            <div className="mt-1"><DatePicker value={pieFrom} onChange={setPieFrom} testid="pie-date-from" max={new Date().toISOString().slice(0, 10)} /></div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-[0.15em] text-slate-500">To</Label>
            <div className="mt-1"><DatePicker value={pieTo} onChange={setPieTo} testid="pie-date-to" max={new Date().toISOString().slice(0, 10)} /></div>
          </div>
        </div>
      </div>
      {total === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No uploads in this range.</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={rows} dataKey="value" innerRadius={55} outerRadius={95} paddingAngle={3}
                label={({ name, value }) => `${name}: ${value}`}>
                {rows.map((r) => (
                  <Cell key={r.name} fill={PIE_COLORS[r.name]} stroke="none" />
                ))}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ color: "#FFFFFF" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex gap-4 text-xs text-slate-300 mt-2">
        <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />Clean: <span className="font-mono">{cleanPct}%</span></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />Need Attention: <span className="font-mono">{naPct}%</span></span>
      </div>
    </div>
  );
}
