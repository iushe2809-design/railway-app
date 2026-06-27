import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Train, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function StationManagement() {
  const [stations, setStations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await api.get("/stations");
    setStations(r.data);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.name || !form.code) {
      toast.error("Name and code required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/stations", form);
      toast.success("Station added");
      setOpen(false);
      setForm({ name: "", code: "" });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Delete station ${s.name}?`)) return;
    try {
      await api.delete(`/admin/stations/${s.id}`);
      toast.success("Station deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="station-management-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Network</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Stations</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="new-station-btn">
              <Plus className="w-4 h-4 mr-1.5" /> New station
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle>Add station</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-slate-300">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
                  placeholder="e.g. Jaipur Jn"
                  data-testid="new-station-name"
                />
              </div>
              <div>
                <Label className="text-slate-300">Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1 font-mono"
                  placeholder="e.g. JP"
                  data-testid="new-station-code"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-300">
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving} className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="new-station-submit">
                {saving ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map((s) => (
          <div key={s.id} className="surface rounded-xl p-5 flex items-center gap-4" data-testid={`station-card-${s.code}`}>
            <div className="w-10 h-10 rounded-md bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
              <Train className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-100 font-medium truncate">{s.name}</div>
              <div className="text-xs text-slate-500 font-mono">{s.code}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => remove(s)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              data-testid={`delete-station-${s.code}`}
              aria-label="Delete station"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
