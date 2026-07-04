import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { MessageSquareWarning, Search, CheckCircle2, Trash2, Filter } from "lucide-react";
import { toast } from "sonner";

export default function Grievances() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | open | resolved

  const load = async () => {
    const res = await api.get("/grievances");
    setItems(res.data);
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter((g) => {
    if (filter === "open" && g.resolved) return false;
    if (filter === "resolved" && !g.resolved) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !g.station_name.toLowerCase().includes(q) &&
        !g.message.toLowerCase().includes(q) &&
        !g.submitted_by_name.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const resolve = async (g) => {
    try {
      await api.post(`/grievances/${g.id}/resolve`);
      toast.success("Marked resolved");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const remove = async (g) => {
    try {
      await api.delete(`/grievances/${g.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="grievances-page">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2 flex items-center gap-1.5">
          <MessageSquareWarning className="w-3.5 h-3.5" /> Field feedback
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Grievances</h1>
        <p className="text-slate-400 mt-2 text-sm">
          Complaints from Station Masters. Each entry shows the SM who filed it and the station name.
        </p>
      </div>

      <div className="surface rounded-xl p-4 md:p-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by station, SM name, or text"
            className="bg-[#0B1120] border-slate-800 text-slate-100 pl-8"
            data-testid="grievances-search"
          />
        </div>
        <div className="flex gap-1 items-center">
          <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
          {[
            { id: "all", label: "All" },
            { id: "open", label: "Open" },
            { id: "resolved", label: "Resolved" },
          ].map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              onClick={() => setFilter(f.id)}
              className={filter === f.id ? "bg-blue-500 hover:bg-blue-400 text-white" : "border-slate-700 text-slate-200 hover:bg-slate-800"}
              data-testid={`grievance-filter-${f.id}`}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 text-xs uppercase tracking-[0.18em] text-slate-400 flex items-center justify-between">
          <div>Grievances</div>
          <div data-testid="grievances-count">{filtered.length} entr{filtered.length === 1 ? "y" : "ies"}</div>
        </div>
        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center text-slate-500">
            <MessageSquareWarning className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No grievances match this filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filtered.map((g) => (
              <div key={g.id} className="px-5 py-4" data-testid={`grievance-row-${g.id}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-mono text-slate-100 text-lg">{g.station_name}</div>
                      {g.resolved ? (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          Resolved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          Open
                        </Badge>
                      )}
                      <span className="text-[11px] text-slate-500">
                        by <span className="text-slate-300">{g.submitted_by_name}</span>
                        {g.submitted_by_username && <span className="font-mono"> ({g.submitted_by_username})</span>}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        · {format(new Date(g.created_at), "PPp")}
                      </span>
                    </div>
                    <div className="text-slate-200 mt-2 whitespace-pre-wrap leading-relaxed">{g.message}</div>
                  </div>
                  <div className="flex gap-1">
                    {!g.resolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve(g)}
                        className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                        data-testid={`resolve-grievance-${g.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark resolved
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" data-testid={`delete-grievance-${g.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this grievance?</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            Permanent — cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-800 text-slate-200 hover:bg-slate-700 border-slate-700">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(g)} className="bg-red-500 hover:bg-red-400 text-white">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
