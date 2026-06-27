import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { getUser, fileUrl } from "@/lib/api";
import UploadZone from "@/components/UploadZone";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Camera, History } from "lucide-react";

export default function SMDashboard() {
  const user = getUser();
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState([]);

  const loadRecent = async () => {
    try {
      const res = await api.get("/inspections?limit=20");
      setRecent(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRecent();
  }, []);

  const onUpload = async (files) => {
    setUploading(true);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    try {
      await api.post("/inspections/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Submitted ${files.length} photo${files.length === 1 ? "" : "s"} — thank you!`);
      loadRecent();
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
      return false;
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8" data-testid="sm-dashboard">
      <div>
        <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">
          Daily inspection
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
          Upload today&apos;s photos
        </h1>
        <p className="text-slate-400 mt-2 max-w-2xl">
          Station: <span className="text-slate-200 font-medium">{user?.station_name || "—"}</span>.
          Photos are analysed automatically by AI vision and routed to your supervisor.
        </p>
      </div>

      <UploadZone onUpload={onUpload} uploading={uploading} testid="sm-upload-zone" />

      <div className="surface rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <div className="text-sm uppercase tracking-[0.18em] text-slate-400">
              Your recent submissions
            </div>
          </div>
          <Badge variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300">
            {recent.length} total
          </Badge>
        </div>
        {recent.length === 0 ? (
          <div className="px-6 py-14 text-center text-slate-500">
            <Camera className="w-8 h-8 mx-auto mb-3 opacity-50" />
            No submissions yet today. Drop a few photos above to get started.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recent.map((insp) => (
              <div key={insp.id} className="px-5 py-4 flex items-center gap-4" data-testid={`sm-recent-${insp.id}`}>
                <div className="flex -space-x-2">
                  {insp.photos.slice(0, 3).map((p) => (
                    <img
                      key={p.id}
                      src={fileUrl(p.storage_path)}
                      alt="inspection thumb"
                      className="w-10 h-10 rounded-md object-cover border border-slate-800"
                    />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">
                    {insp.station_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {format(new Date(insp.created_at), "PPp")} · {insp.photos.length} photo
                    {insp.photos.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Badge variant="secondary" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Submitted
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
