import { Badge } from "@/components/ui/badge";

export default function StatusBadge({ rating, score, size = "md", testid }) {
  let cls = "status-clean";
  if (rating === "Needs Attention") cls = "status-attention";
  else if (rating === "Unclean") cls = "status-unclean";
  const sz = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-md uppercase tracking-[0.12em] font-medium ${cls} ${sz}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
      {rating}
      {typeof score === "number" && (
        <span className="font-mono opacity-80">· {score}</span>
      )}
    </span>
  );
}

export { Badge };
