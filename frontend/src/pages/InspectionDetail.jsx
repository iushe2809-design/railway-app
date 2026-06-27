import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api, { fileUrl } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ArrowLeft, Gavel, Sparkles, ListChecks, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function InspectionDetail() {
  const { id } = useParams();
  const [insp, setInsp] = useState(null);
  const [openPhoto, setOpenPhoto] = useState(null);

  const load = async () => {
    const res = await api.get(`/inspections/${id}`);
    setInsp(res.data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!insp) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="inspection-detail">
      <Link to="/admin/inspections" className="inline-flex items-center text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to inspections
      </Link>

      <div className="surface-elevated rounded-xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
        <div className="relative flex flex-wrap gap-4 items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Inspection report</div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{insp.station_name}</h1>
            <div className="text-slate-400 mt-2 text-sm">
              {format(new Date(insp.created_at), "PPpp")} · {insp.photos.length} photo
              {insp.photos.length === 1 ? "" : "s"} · Submitted by{" "}
              <span className="text-slate-200">{insp.uploaded_by_name}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge rating={insp.aggregate_rating} score={insp.aggregate_score} testid="aggregate-badge" />
            <div className="font-mono text-3xl text-slate-100" data-testid="aggregate-score">
              {insp.aggregate_score}
              <span className="text-slate-500 text-base">/100</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6" data-testid="photos-list">
        {insp.photos.map((p, i) => (
          <PhotoCard
            key={p.id}
            photo={p}
            index={i + 1}
            inspectionId={insp.id}
            onOpenPhoto={setOpenPhoto}
            onUpdated={load}
          />
        ))}
      </div>

      <Dialog open={!!openPhoto} onOpenChange={(o) => !o && setOpenPhoto(null)}>
        <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100 max-w-3xl">
          <DialogHeader>
            <DialogTitle>Photo preview</DialogTitle>
            <DialogDescription className="text-slate-400">
              Click outside to close.
            </DialogDescription>
          </DialogHeader>
          {openPhoto && (
            <img
              src={fileUrl(openPhoto)}
              alt="full"
              className="w-full max-h-[70vh] object-contain rounded-md"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoCard({ photo, index, inspectionId, onOpenPhoto, onUpdated }) {
  const ai = photo.ai_analysis || {};
  const effective = photo.override
    ? { rating: photo.override.rating, score: photo.override.score }
    : { rating: ai.rating, score: ai.score };

  return (
    <div className="surface rounded-xl overflow-hidden" data-testid={`photo-card-${photo.id}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        <button
          onClick={() => onOpenPhoto(photo.storage_path)}
          className="block bg-black/40 group"
          data-testid={`view-photo-${photo.id}`}
          aria-label="View full photo"
        >
          <img
            src={fileUrl(photo.storage_path)}
            alt={`photo ${index}`}
            className="w-full h-64 md:h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        </button>
        <div className="md:col-span-2 p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Photo {index} · {ai.area_detected || "Area"}
              </div>
              <div className="font-display text-lg sm:text-xl font-semibold mt-1 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                AI Verdict
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge rating={effective.rating} score={effective.score} />
              {photo.override && (
                <div className="text-[11px] uppercase tracking-[0.15em] text-amber-400">
                  Overruled by supervisor
                </div>
              )}
            </div>
          </div>

          {ai.area_breakdown?.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">
                Area breakdown
              </div>
              <div className="h-36">
                <ResponsiveContainer>
                  <BarChart data={ai.area_breakdown} layout="vertical" margin={{ left: 60, right: 10 }}>
                    <CartesianGrid stroke="#1E293B" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} stroke="#64748B" fontSize={11} />
                    <YAxis dataKey="aspect" type="category" stroke="#94A3B8" fontSize={11} width={120} />
                    <Tooltip
                      contentStyle={{ background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" }}
                    />
                    <Bar dataKey="score" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Issues
              </div>
              {(ai.issues || []).length === 0 ? (
                <div className="text-sm text-slate-500">None reported</div>
              ) : (
                <ul className="space-y-1.5">
                  {ai.issues.map((it, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-red-400 mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5 text-blue-400" /> Recommendations
              </div>
              {(ai.recommendations || []).length === 0 ? (
                <div className="text-sm text-slate-500">—</div>
              ) : (
                <ul className="space-y-1.5">
                  {ai.recommendations.map((it, idx) => (
                    <li key={idx} className="text-sm text-slate-300 flex gap-2">
                      <span className="text-blue-400 mt-1.5 w-1 h-1 rounded-full bg-current flex-shrink-0" />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {photo.override && (
            <div className="surface rounded-md p-3 text-sm">
              <div className="text-xs uppercase tracking-[0.15em] text-amber-400 mb-1">
                Supervisor override
              </div>
              <div className="text-slate-200">{photo.override.notes}</div>
              <div className="text-xs text-slate-500 mt-1">
                — {photo.override.by_name}, {format(new Date(photo.override.at), "PPp")}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 flex-wrap">
            <Button
              variant="ghost"
              onClick={() => onOpenPhoto(photo.storage_path)}
              className="text-slate-300 hover:text-white"
              data-testid={`open-photo-btn-${photo.id}`}
            >
              <ImageIcon className="w-4 h-4 mr-1.5" /> View photo
            </Button>
            <OverrideDialog inspectionId={inspectionId} photoId={photo.id} onUpdated={onUpdated} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OverrideDialog({ inspectionId, photoId, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState("Clean");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!notes.trim()) {
      toast.error("Add a note for the override");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inspections/${inspectionId}/photos/${photoId}/override`, {
        new_rating: rating,
        notes,
      });
      toast.success("Override saved");
      setOpen(false);
      setNotes("");
      onUpdated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          data-testid={`override-btn-${photoId}`}
        >
          <Gavel className="w-4 h-4 mr-1.5" /> Overrule verdict
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Overrule AI verdict</DialogTitle>
          <DialogDescription className="text-slate-400">
            Inspectors can override the AI rating. Provide your reasoning for the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">New rating</Label>
            <Select value={rating} onValueChange={setRating}>
              <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="override-rating-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100">
                <SelectItem value="Clean">Clean</SelectItem>
                <SelectItem value="Needs Attention">Needs Attention</SelectItem>
                <SelectItem value="Unclean">Unclean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-slate-300">Notes</Label>
            <Textarea
              data-testid="override-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for the override (visible in audit log)"
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1 min-h-[100px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-300">
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900"
            data-testid="override-confirm-btn"
          >
            {saving ? "Saving…" : "Save override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
