import { Badge } from "@/components/ui/badge";

/**
 * 2-tier status badge — Clean or Need Attention.
 * Legacy data with rating "Unclean" or "Needs Attention" is folded into
 * "Need Attention" tone based on the numeric score (score >= 80 → Clean).
 */
export default function StatusBadge({ rating, score, size = "md", testid }) {
  const effective =
    rating === "Clean" || (typeof score === "number" && score >= 80)
      ? "Clean"
      : "Need Attention";
  const cls = effective === "Clean" ? "status-clean" : "status-attention";
  const sz = size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-md uppercase tracking-[0.12em] font-medium ${cls} ${sz}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
      {effective}
      {typeof score === "number" && (
        <span className="font-mono opacity-80">· {score}</span>
      )}
    </span>
  );
}

export { Badge };
