import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => (
    <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Construction className="h-10 w-10 text-muted-foreground" />
      <h2 className="text-lg font-semibold">রিপোর্ট</h2>
      <p className="text-sm text-muted-foreground">শীঘ্রই আসছে।</p>
    </CardContent></Card>
  ),
});
