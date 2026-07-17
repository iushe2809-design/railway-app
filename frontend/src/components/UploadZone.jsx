import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, ImagePlus, X, Loader2, CheckCircle2 } from "lucide-react";

const ACCEPTED_PREFIX = "image/";
const MAX_SIZE = 25 * 1024 * 1024;

export default function UploadZone({ onUpload, uploading, testid = "upload-zone" }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = useCallback((list) => {
    const next = [];
    for (const f of Array.from(list)) {
      const t = (f.type || "").toLowerCase();
      const name = (f.name || "").toLowerCase();
      const looksLikeImage =
        t.startsWith(ACCEPTED_PREFIX) ||
        /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(name);
      if (!looksLikeImage) {
        toast.error(`${f.name}: not an image file`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        toast.error(`${f.name}: too large (max 25MB)`);
        continue;
      }
      next.push(f);
    }
    setFiles((prev) => {
  const combined = [...prev, ...next];

  if (combined.length > 5) {
    toast.error("Maximum 5 photos allowed.");
    return combined.slice(0, 5);
  }

  return combined;
});
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!files.length!==5) {
      toast.error("Please upload exactly 5 photos.");
      return;
    }
    const ok = await onUpload(files);
    if (ok) {
      setFiles([]);
    }
  };

  const remove = (i) => setFiles((p) => p.filter((_, idx) => idx !== i));

  return (
    <div data-testid={testid}>
      <div
        className={`upload-zone rounded-xl p-8 sm:p-12 text-center cursor-pointer ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        data-testid="upload-dropzone"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif,.bmp,.tif,.tiff"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
          data-testid="upload-file-input"
        />
        <div className="mx-auto w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
          <CloudUpload className="w-6 h-6 text-blue-400" />
        </div>
        <div className="font-display text-lg sm:text-xl font-semibold">
          Drop photos here, or tap to browse
        </div>
        <div className="text-sm text-slate-400 mt-2">
          Upload exactly 5 photos · Any photo format (including iPhone HEIC) · Up to 25 MB each
        </div>
      </div>

      {files.length > 0 && (
        <>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="upload-previews">
            {files.map((f, i) => (
              <div key={i} className="relative group surface rounded-lg overflow-hidden">
                <img
                  src={previews[i]}
                  alt={f.name}
                  className="w-full h-32 object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 hover:bg-red-500/90 flex items-center justify-center"
                  aria-label="Remove image"
                  data-testid={`remove-preview-${i}`}
                >
                  <X className="w-4 h-4 text-white" />
                </button>
                <div className="px-2 py-1.5 text-[11px] text-slate-400 truncate">{f.name}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400 flex items-center gap-2">
              <ImagePlus className="w-4 h-4" />
              {files.length} photo{files.length === 1 ? "" : "s"} ready
              <Badge variant="secondary" className="bg-slate-800 border-slate-700 text-slate-300">
                Auto-analysis on submit
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setFiles([])}
                disabled={uploading}
                className="text-slate-400 hover:text-white"
                data-testid="upload-clear-btn"
              >
                Clear
              </Button>
              <Button
                onClick={submit}
                disabled={uploading||files.length!==5}
                className="bg-blue-500 hover:bg-blue-400 text-white"
                data-testid="upload-submit-btn"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Submit {files.length} photo{files.length === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

