import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { getUser, fileUrl, setSession } from "@/lib/api";
import UploadZone from "@/components/UploadZone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Camera, History, MapPin, CalendarDays, Lock, MessageSquareWarning, Send } from "lucide-react";

export default function SMDashboard() {
  const user = getUser();
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualStation, setManualStation] = useState("");
  const [grievanceStation, setGrievanceStation] = useState(user?.station_name || "");
  const [grievanceText, setGrievanceText] = useState("");
  const [submittingGrievance, setSubmittingGrievance] = useState(false);
  const [myGrievances, setMyGrievances] = useState([]);

  const assignedStation = user?.station_name || "";
  const needsStationSetup = !assignedStation;

  const loadRecent = async () => {
    try {
      const [ins, gr] = await Promise.all([
        api.get("/inspections?limit=20"),
        api.get("/grievances"),
      ]);
      setRecent(ins.data);
      setMyGrievances(gr.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadRecent(); }, []);

  const onUpload = async (files) => {
    let stationToUse = assignedStation;
    if (needsStationSetup) {
      if (!manualStation.trim()) {
        toast.error("Enter your station name — it will be locked to your ID after this upload.");
        return false;
      }
      stationToUse = manualStation.trim();
    }
    if (!inspectionDate) { toast.error("Please select the inspection date"); return false; }
    setUploading(true);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("inspection_date", inspectionDate);
    if (needsStationSetup) fd.append("station_name", stationToUse);
    try {
      await api.post("/inspections/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(needsStationSetup
        ? `Submitted — your station "${stationToUse}" is now locked to your ID.`
        : `Submitted ${files.length} photo${files.length === 1 ? "" : "s"} — thank you!`);
      if (needsStationSetup) {
        // Refresh session so header + lock UI update
        try {
          const me = await api.get("/auth/me");
          setSession(localStorage.getItem("rc_token"), me.data);
        } catch (_) { /* noop */ }
        setTimeout(() => window.location.reload(), 800);
      }
      loadRecent();
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
      return false;
    } finally {
      setUploading(false);
    }
  };

  const submitGrievance = async () => {
    if (!grievanceStation.trim()) { toast.error("Enter the station name"); return; }
    if (!grievanceText.trim()) { toast.error("Please describe your grievance"); return; }
    setSubmittingGrievance(true);
    try {
      await api.post("/grievances", { station_name: grievanceStation.trim(), message: grievanceText.trim() });
      toast.success("Grievance submitted — the supervisor will review it.");
      setGrievanceText("");
      loadRecent();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to submit");
    } finally {
      setSubmittingGrievance(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="sm-dashboard">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">Daily inspection</div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Upload today&apos;s photos</h1>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Photos uploaded here will be analysed and forwarded to the supervisor for your station.
        </p>
      </div>

      <div className="surface rounded-xl p-5 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-400" /> Station
          </Label>
          {needsStationSetup ? (
            <>
              <Input
                value={manualStation}
                onChange={(e) => setManualStation(e.target.value)}
                className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1 h-11 font-mono tracking-wide"
                placeholder="Type your station code (e.g. RNC)"
                data-testid="sm-manual-station-input"
              />
              <div className="text-[11px] text-amber-400 mt-1">
                First-time setup — this will lock to your User ID after your first upload.
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 h-11 rounded-md border border-slate-800 bg-[#0B1120] px-3 flex items-center justify-between" data-testid="sm-station-display">
                <span className="font-mono text-lg tracking-wide text-slate-100">{assignedStation}</span>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Assigned to your User ID — cannot be changed.</div>
            </>
          )}
        </div>
        <div>
          <Label className="text-slate-300 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-blue-400" /> Inspection date
          </Label>
          <Input
            type="date"
            value={inspectionDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setInspectionDate(e.target.value)}
            className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1 h-11"
            data-testid="sm-inspection-date-input"
          />
        </div>
      </div>

      <UploadZone onUpload={onUpload} uploading={uploading} testid="sm-upload-zone" />

      {/* Grievance form */}
      <div className="surface rounded-xl p-5 md:p-6" data-testid="sm-grievance-section">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquareWarning className="w-4 h-4 text-amber-400" />
          <div>
            <div className="font-display text-lg font-semibold">Grievances & Complaints</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Report an issue even without uploading a photo. The supervisor will see it.
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <Label className="text-slate-300 text-xs">Station name</Label>
            <Input
              value={grievanceStation}
              onChange={(e) => setGrievanceStation(e.target.value)}
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
              placeholder="e.g. RNC"
              data-testid="grievance-station-input"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-slate-300 text-xs">Grievance</Label>
            <Textarea
              value={grievanceText}
              onChange={(e) => setGrievanceText(e.target.value)}
              placeholder="Describe the issue — e.g. bins not emptied since morning, water logging near platform 3, etc."
              className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1 min-h-[90px]"
              data-testid="grievance-text-input"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            onClick={submitGrievance}
            disabled={submittingGrievance}
            className="bg-amber-500 hover:bg-amber-400 text-slate-900"
            data-testid="grievance-submit-btn"
          >
            <Send className="w-4 h-4 mr-1.5" />
            {submittingGrievance ? "Submitting…" : "Submit grievance"}
          </Button>
        </div>

        {myGrievances.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-2">Your recent grievances</div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {myGrievances.slice(0, 10).map((g) => (
                <div key={g.id} className="text-sm p-3 rounded-md bg-slate-900/40 border border-slate-800" data-testid={`sm-grievance-${g.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-mono text-slate-100">{g.station_name}</div>
                    <div className="text-[11px] text-slate-500">{format(new Date(g.created_at), "PP")}</div>
                  </div>
                  <div className="text-slate-300 whitespace-pre-wrap">{g.message}</div>
                  {g.resolved && (
                    <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-emerald-400">Resolved</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <div className="text-sm uppercase tracking-[0.18em] text-slate-400">Your recent submissions</div>
          </div>
          <Badge variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300">
            {recent.length} total
          </Badge>
        </div>
        {recent.length === 0 ? (
          <div className="px-6 py-14 text-center text-slate-500">
            <Camera className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No submissions yet. Pick the date and drop a few photos to get started.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recent.map((insp) => (
              <div key={insp.id} className="px-5 py-4 flex items-center gap-4" data-testid={`sm-recent-${insp.id}`}>
                <div className="flex -space-x-2">
                  {insp.photos.slice(0, 3).map((p) => (
                    <img key={p.id} src={fileUrl(p.storage_path)} alt="thumb" className="w-10 h-10 rounded-md object-cover border border-slate-800" />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{insp.station_name}</div>
                  <div className="text-xs text-slate-500">
                    {insp.inspection_date || format(new Date(insp.created_at), "PP")} · {insp.photos.length} photo
                    {insp.photos.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">Submitted</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
