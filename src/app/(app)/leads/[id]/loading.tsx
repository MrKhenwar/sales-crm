import { Bar, Card } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bar className="h-4 w-20" />
          <Bar className="h-7 w-52" />
          <Bar className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Bar className="h-10 w-24" />
          <Bar className="h-10 w-24" />
        </div>
      </div>
      <Card className="space-y-3">
        <Bar className="h-5 w-28" />
        <Bar className="h-10 w-full" />
      </Card>
      <Card className="space-y-3">
        <Bar className="h-5 w-28" />
        <div className="grid sm:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Bar key={i} className="h-4 w-full" />)}
        </div>
      </Card>
    </div>
  );
}
