import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { fileUrl } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
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
import { format } from "date-fns";
import { Filter, Search, ArrowRight } from "lucide-react";

export default function AdminInspections() {
  const [stationNames, setStationNames] = useState([]);
  const [items, setItems] = useState([]);
  const [stationName, setStationName] = useState("all");
  const [rating, setRating] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/inspections/station-names").then((r) => setStationNames(r.data));
  }, []);

  const load = async () => {
    const params = new URLSearchParams();
    if (stationName !== "all") params.set("station_name", stationName);
    if (rating !== "all") params.set("rating", rating);
    if (from) params.set("date_from", from);
    if (to) params.set("date_to", to);
    const res = await api.get(`/inspections?${params.toString()}`);
    setItems(res.data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationName, rating, from, to]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.station_name.toLowerCase().includes(q) ||
        i.uploaded_by_name.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="space-y-6" data-testid="admin-inspections-page">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Audit log</div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          Inspections
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          Filter by date and station name (as entered by Station Masters).
        </p>
      </div>

      <div className="surface rounded-xl p-4 md:p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 mb-4">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs text-slate-400">Station</Label>
            <Select value={stationName} onValueChange={setStationName}>
              <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="filter-station">
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
            <Label className="text-xs text-slate-400">Rating</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="filter-rating">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100">
                <SelectItem value="all">All ratings</SelectItem>
                <SelectItem value="Clean">Clean</SelectItem>
                <SelectItem value="Needs Attention">Needs Attention</SelectItem>
                <SelectItem value="Unclean">Unclean</SelectItem>
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
              data-testid="filter-date-from"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400">To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
              data-testid="filter-date-to"
            />
          </div>
          <div>
            <Label className="text-xs text-slate-400">Search</Label>
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Station or uploader"
                className="bg-[#0B1120] border-slate-800 text-slate-100 pl-8"
                data-testid="filter-search"
              />
            </div>
          </div>
        </div>
        {(stationName !== "all" || rating !== "all" || from || to || search) && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStationName("all");
                setRating("all");
                setFrom("");
                setTo("");
                setSearch("");
              }}
              className="text-slate-400 hover:text-white"
              data-testid="filter-clear-btn"
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 text-xs uppercase tracking-[0.18em] text-slate-400 flex items-center justify-between">
          <div>Results</div>
          <div data-testid="results-count">{filtered.length} inspection{filtered.length === 1 ? "" : "s"}</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-5 py-14 text-center text-slate-500 text-sm">No matching inspections.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((insp) => (
              <Link
                to={`/admin/inspections/${insp.id}`}
                key={insp.id}
                className="px-5 py-4 hover:bg-slate-800/40 flex items-center gap-4"
                data-testid={`inspection-row-${insp.id}`}
              >
                <div className="flex -space-x-2">
                  {insp.photos.slice(0, 3).map((p) => (
                    <img
                      key={p.id}
                      src={fileUrl(p.storage_path)}
                      alt="thumb"
                      className="w-11 h-11 rounded-md object-cover border border-slate-800"
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{insp.station_name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {insp.inspection_date || format(new Date(insp.created_at), "PP")} · {insp.photos.length} photo
                    {insp.photos.length === 1 ? "" : "s"} · by {insp.uploaded_by_name}
                  </div>
                </div>
                <StatusBadge rating={insp.aggregate_rating} score={insp.aggregate_score} size="sm" />
                <ArrowRight className="w-4 h-4 text-slate-500" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
