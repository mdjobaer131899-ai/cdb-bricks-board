import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

function Placeholder({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Construction className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">এই মডিউলটি শীঘ্রই আসছে। ড্যাশবোর্ড থেকে সকল সারসংক্ষেপ দেখুন।</p>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/challans")({ component: () => <Placeholder title="চালান এন্ট্রি" /> });
