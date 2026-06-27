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
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Copy, Share2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ShareLinks() {
  const [links, setLinks] = useState([]);
  const [open, setOpen] = useState(false);
  const [stationName, setStationName] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(null);

  const load = async () => {
    const l = await api.get("/admin/share-links");
    setLinks(l.data);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!stationName.trim()) return toast.error("Enter a station name");
    setSaving(true);
    try {
      await api.post("/admin/share-links", { station_name: stationName.trim() });
      toast.success("Share link created");
      setOpen(false);
      setStationName("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (l) => {
    if (!confirm(`Revoke link for ${l.station_name}?`)) return;
    await api.delete(`/admin/share-links/${l.id}`);
    toast.success("Revoked");
    load();
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    toast.success("Link copied");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6" data-testid="share-links-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Public uploads</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Shareable upload links
          </h1>
          <p className="text-slate-400 mt-2 max-w-2xl">
            Share these tokenized links to allow anyone (passengers, contractors, RPF) to upload
            photos for a specific station without an account.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="new-share-link-btn">
              <Plus className="w-4 h-4 mr-1.5" /> New share link
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle>Create share link</DialogTitle>
              <DialogDescription className="text-slate-400">
                Anyone with this link can submit photos for the selected station.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label className="text-slate-300">Station name</Label>
              <Input
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                placeholder="e.g. Jaipur Junction"
                className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
                data-testid="share-link-station-name"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-300">
                Cancel
              </Button>
              <Button onClick={create} disabled={saving} className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="share-link-create-btn">
                {saving ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="surface rounded-xl overflow-hidden">
        {links.length === 0 ? (
          <div className="px-5 py-14 text-center text-slate-500">
            <Share2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No share links yet. Create one to start collecting public submissions.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {links.map((l) => {
              const url = `${window.location.origin}/share/${l.token}`;
              return (
                <div key={l.id} className="px-5 py-4 flex items-center gap-4" data-testid={`share-link-${l.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-slate-100 truncate">{l.station_name}</div>
                      {l.active ? (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-800 text-slate-400 border border-slate-700">
                          Revoked
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">{url}</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Created {format(new Date(l.created_at), "PPp")}
                    </div>
                  </div>
                  {l.active && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyLink(l.token)}
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        data-testid={`copy-share-${l.id}`}
                      >
                        {copied === l.token ? <Check className="w-4 h-4 mr-1.5 text-emerald-400" /> : <Copy className="w-4 h-4 mr-1.5" />}
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => revoke(l)}
                        className="text-red-400 hover:bg-red-500/10"
                        data-testid={`revoke-share-${l.id}`}
                        aria-label="Revoke link"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
