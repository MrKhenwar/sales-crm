import { Bar, Card } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Bar className="h-7 w-28" />
          <Bar className="h-4 w-44" />
        </div>
        <Bar className="h-10 w-20" />
      </div>
      <Card className="flex flex-col items-center gap-4 py-10">
        <Bar className="h-6 w-40" />
        <Bar className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-3 w-full max-w-md mt-4">
          <Bar className="h-11 w-full" />
          <Bar className="h-11 w-full" />
        </div>
      </Card>
    </div>
  );
}
