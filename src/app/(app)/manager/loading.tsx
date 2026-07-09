import { Bar, Card } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Bar className="h-7 w-56" />
          <Bar className="h-4 w-72" />
        </div>
        <Bar className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-2">
            <Bar className="h-3 w-20" />
            <Bar className="h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card className="space-y-3">
        <Bar className="h-5 w-40" />
        <div className="grid md:grid-cols-2 gap-4">
          <Bar className="h-24 w-full" />
          <Bar className="h-24 w-full" />
        </div>
      </Card>
    </div>
  );
}
