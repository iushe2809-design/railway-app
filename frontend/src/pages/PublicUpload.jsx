import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CloudUpload, Train, X, Loader2, CheckCircle2 } from "lucide-react";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function PublicUpload() {
  const { token } = useParams();
  const [station, setStation] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inspectionDate, setInspectionDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const inputRef = useRef(null);

  useEffect(() => {
    api
      .get(`/public/share/${token}`)
      .then((r) => setStation(r.data))
      .catch(() => setError("This share link is invalid or has been revoked."));
  }, [token]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = useCallback((list) => {
    const next = [];
    for (const f of Array.from(list)) {
      if (!ACCEPTED.includes(f.type)) {
        toast.error(`${f.name}: unsupported format`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: too large (max 10MB)`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => [...prev, ...next]);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!files.length) return toast.error("Add at least one photo");
    setUploading(true);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("uploader_name", name || "Anonymous");
    fd.append("inspection_date", inspectionDate);
    try {
      await fetch(`${API}/public/upload/${token}`, {
        method: "POST",
        body: fd,
      }).then((r) => {
        if (!r.ok) throw new Error("Upload failed");
      });
      toast.success("Thank you! Photos submitted.");
      setFiles([]);
      setSubmitted(true);
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#060B14]">
        <div className="surface rounded-xl p-8 max-w-md text-center" data-testid="public-error">
          <div className="text-red-400 font-display text-2xl font-semibold">Link unavailable</div>
          <div className="text-slate-400 mt-2">{error}</div>
        </div>
      </div>
    );
  }
  if (!station)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );

  return (
    <div className="min-h-screen bg-[#060B14] py-10 px-4 sm:px-6" data-testid="public-upload-page">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <Train className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
              Railway Cleanliness · Public Upload
            </div>
            <div className="font-display text-xl font-semibold">
              {station.station_name}
            </div>
          </div>
        </div>

        <div className="surface-elevated rounded-xl p-6 sm:p-8">
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">
            {submitted ? "Submission received" : "Help us improve"}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            {submitted ? "Thank you!" : "Submit station photos"}
          </h1>
          <p className="text-slate-400 mt-2">
            {submitted
              ? "Your photos have been forwarded to the supervisor at this station."
              : "Take or upload photos showing the cleanliness around the station. No login required."}
          </p>

          {!submitted && (
            <>
              <div className="mt-6">
                <Label className="text-slate-300">Your name (optional)</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Passenger A"
                  className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
                  data-testid="public-uploader-name"
                />
              </div>
              <div className="mt-4">
                <Label className="text-slate-300">Inspection date</Label>
                <Input
                  type="date"
                  value={inspectionDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setInspectionDate(e.target.value)}
                  className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
                  data-testid="public-inspection-date"
                />
              </div>

              <div
                className={`upload-zone rounded-xl p-8 sm:p-10 text-center cursor-pointer mt-5 ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                data-testid="public-upload-dropzone"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                  data-testid="public-upload-file-input"
                />
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-3">
                  <CloudUpload className="w-5 h-5 text-blue-400" />
                </div>
                <div className="font-medium">Tap to browse or drop photos</div>
                <div className="text-xs text-slate-500 mt-1">JPEG · PNG · WEBP · up to 10 MB</div>
              </div>

              {files.length > 0 && (
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {files.map((f, i) => (
                    <div key={i} className="relative surface rounded-lg overflow-hidden">
                      <img src={previews[i]} alt={f.name} className="w-full h-28 object-cover" />
                      <button
                        type="button"
                        onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-red-500/90 flex items-center justify-center"
                        aria-label="Remove"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={submit}
                disabled={uploading || !files.length}
                className="w-full mt-6 h-11 bg-blue-500 hover:bg-blue-400 text-white"
                data-testid="public-upload-submit-btn"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Submit {files.length || ""} photo{files.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </>
          )}

          {submitted && (
            <Button
              onClick={() => setSubmitted(false)}
              className="mt-6 bg-blue-500 hover:bg-blue-400 text-white"
              data-testid="public-upload-another-btn"
            >
              Upload more
            </Button>
          )}
        </div>

        <div className="text-center text-[11px] uppercase tracking-[0.22em] text-slate-600 mt-8">
          Indian Railways · Cleanliness AI Inspector
        </div>
      </div>
    </div>
  );
}
