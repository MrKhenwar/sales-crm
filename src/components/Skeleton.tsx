/** Lightweight pulsing placeholders shown while a route's data loads. */

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

export function Card({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-6 ${className}`}>{children}</div>;
}

/** A generic list/table page skeleton: title + filter bar + rows. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bar className="h-7 w-40" />
          <Bar className="h-4 w-24" />
        </div>
        <Bar className="h-9 w-24" />
      </div>
      <Card>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Bar key={i} className="h-8 w-20" />)}
        </div>
      </Card>
      <Card className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-24" />
            <Bar className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </Card>
    </div>
  );
}
