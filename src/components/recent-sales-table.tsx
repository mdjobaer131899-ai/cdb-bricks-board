import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SaleEntry } from "@/lib/mock-data";

interface Props {
  entries: SaleEntry[];
  loading?: boolean;
}

const bn = (n: number) => n.toLocaleString("bn-BD");

export function RecentSalesTable({ entries, loading }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">সাম্প্রতিক বিক্রয় এন্ট্রি</CardTitle>
          <p className="text-xs text-muted-foreground">শেষ ১০টি চালান</p>
        </div>
        <Badge variant="outline" className="hidden sm:inline-flex">
          মোট {bn(entries.length)}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>চালান নং</TableHead>
                <TableHead>গ্রাহক</TableHead>
                <TableHead className="text-right">ইট</TableHead>
                <TableHead className="text-right">টাকা (৳)</TableHead>
                <TableHead>ধরন</TableHead>
                <TableHead>স্ট্যাটাস</TableHead>
                <TableHead className="hidden md:table-cell">ম্যানেজার</TableHead>
                <TableHead className="hidden sm:table-cell">তারিখ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : entries.slice(0, 10).map((e) => (
                    <TableRow key={e.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-xs font-semibold">{e.challanNo}</TableCell>
                      <TableCell className="font-medium">{e.customer}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(e.bricks)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">৳ {bn(e.amount)}</TableCell>
                      <TableCell>
                        {e.type === "advance" ? (
                          <Badge className="bg-info/15 text-info hover:bg-info/20">অগ্রিম</Badge>
                        ) : (
                          <Badge variant="secondary">নিয়মিত</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.status === "approved" ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/20">অনুমোদিত</Badge>
                        ) : (
                          <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/30">অপেক্ষমাণ</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">{e.managerName}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                        {new Date(e.date).toLocaleDateString("bn-BD")}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
