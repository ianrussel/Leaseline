// Placeholder bar shown while a card's data loads - keeps the page layout stable so nothing jumps
// when the real content arrives.
export function Skeleton({ className = "h-4 w-full" }) {
  return <div aria-hidden="true" className={`animate-pulse bg-line/70 ${className}`} />;
}

// Table rows of skeleton bars, one per column.
export function SkeletonRows({ cols, rows = 3 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="border-t border-line">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className="td"><Skeleton className="h-4 w-full max-w-32" /></td>
      ))}
    </tr>
  ));
}
