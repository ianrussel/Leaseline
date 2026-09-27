const URGENCY_STYLES = {
  emergency: "bg-urgency-emergency text-urgency-emergency-fg",
  high: "bg-urgency-high text-urgency-high-fg",
  medium: "bg-urgency-medium text-urgency-medium-fg",
  low: "bg-urgency-low text-urgency-low-fg",
};

const BADGE_BASE = "inline-block px-[9px] py-1 font-mono text-[11px] font-semibold tracking-[0.04em]";

export function CategoryBadge({ children }) {
  return <span className={`${BADGE_BASE} border border-line text-ink`}>{children}</span>;
}

export default function UrgencyBadge({ urgency, uppercase = false, flagged = false }) {
  const style = URGENCY_STYLES[String(urgency).toLowerCase()] ?? URGENCY_STYLES.low;
  return (
    <span className={`${BADGE_BASE} ${style}`}>
      {uppercase ? String(urgency).toUpperCase() : urgency}
      {flagged ? " ⚠" : ""}
    </span>
  );
}
