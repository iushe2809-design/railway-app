import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

/**
 * Snapshots a ref'd DOM node into a PDF using html2canvas + jsPDF.
 * Props:
 *   - contentRef: React ref to the element to snapshot
 *   - filename: PDF filename (without .pdf)
 *   - title: PDF header title
 *   - subtitle: PDF header subtitle line
 */
export default function DownloadPdfButton({ contentRef, filename, title, subtitle, testid = "download-pdf-btn", variant = "outline" }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!contentRef?.current) {
      toast.error("Nothing to export yet");
      return;
    }
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(contentRef.current, {
        backgroundColor: "#060B14",
        scale: 1.5,
        useCORS: true,
        logging: false,
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFillColor(6, 11, 20);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text(title || "My Clean Station", 40, 40);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      if (subtitle) pdf.text(subtitle, 40, 58);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 40, 72);
      // Fit image proportionally
      const imgW = pageWidth - 60;
      const imgH = (canvas.height * imgW) / canvas.width;
      let y = 90;
      let remaining = imgH;
      let sy = 0;
      // If image is taller than one page, paginate
      const perPage = pageHeight - y - 20;
      const scale = imgW / canvas.width;
      while (remaining > 0) {
        const slicePx = Math.min(canvas.height - sy, perPage / scale);
        // Create a slice canvas
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = slicePx;
        const ctx = slice.getContext("2d");
        ctx.drawImage(canvas, 0, sy, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 30, y, imgW, slicePx * scale);
        remaining -= slicePx * scale;
        sy += slicePx;
        if (remaining > 0) {
          pdf.addPage();
          pdf.setFillColor(6, 11, 20);
          pdf.rect(0, 0, pageWidth, pageHeight, "F");
          y = 40;
        }
      }
      pdf.save(`${filename || "my-clean-station"}.pdf`);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("PDF export failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={download}
      disabled={busy}
      variant={variant}
      data-testid={testid}
      className={variant === "outline" ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "bg-blue-500 hover:bg-blue-400 text-white"}
    >
      <FileDown className="w-4 h-4 mr-1.5" /> {busy ? "Preparing…" : "Download PDF"}
    </Button>
  );
}
