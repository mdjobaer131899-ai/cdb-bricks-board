import { Link, useNavigate } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SaleRow } from "@/lib/sales-queries";
import { bn, bnDate } from "@/lib/format";

interface Props {
  entries: SaleRow[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  limit?: number;
  currentUserId?: string;
  isAdmin?: boolean;
  onDelete?: (row: SaleRow) => void;
}

export function RecentSalesTable({
  entries,
  loading,
  title = "সাম্প্রতিক বিক্রয় এন্ট্রি",
  subtitle = "শেষ ১০টি চালান",
  limit = 10,
  currentUserId,
  isAdmin,
  onDelete,
}: Props) {
  const navigate = useNavigate();
  const showActions = Boolean(onDelete);
  const showAmount = isAdmin === true;
  const colCount = (showActions ? 1 : 0) + (showAmount ? 8 : 7);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="outline" className="hidden sm:inline-flex">মোট {bn(entries.length)}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>চালান নং</TableHead>
                <TableHead>গ্রাহক</TableHead>
                <TableHead>ইটের ধরন</TableHead>
                <TableHead className="text-right">পরিমাণ</TableHead>
                {showAmount && <TableHead className="text-right">টাকা (৳)</TableHead>}
                <TableHead>ধরন</TableHead>
                <TableHead>স্ট্যাটাস</TableHead>
                {/* manager column removed */}
                <TableHead>তারিখ</TableHead>
                {showActions && <TableHead className="text-right">অ্যাকশন</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: colCount }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="py-10 text-center text-sm text-muted-foreground">কোনো এন্ট্রি পাওয়া যায়নি।</TableCell></TableRow>
                ) : entries.slice(0, limit).map((e) => {
                  const canEdit = isAdmin || (e.status === "pending" && e.created_by === currentUserId);
                  const isApproved = e.status === "approved";
                  return (
                    <TableRow
                      key={e.id}
                      className={`hover:bg-muted/40 ${isApproved ? "cursor-pointer" : ""}`}
                      onClick={isApproved ? () => navigate({ to: "/challans/$id", params: { id: e.id } }) : undefined}
                    >
                      <TableCell className="font-mono text-xs font-semibold">{e.challan_no}</TableCell>
                      <TableCell className="font-medium">{e.customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{e.brick_type?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{bn(e.quantity)}</TableCell>
                      {showAmount && <TableCell className="text-right tabular-nums font-semibold">{e.sale_type === "advance" ? <span className="text-muted-foreground">—</span> : <>৳ {bn(e.total_amount)}</>}</TableCell>}
                      <TableCell>
                        {e.sale_type === "advance" ? (
                          <Badge className="bg-info/15 text-info hover:bg-info/20">অগ্রিম</Badge>
                        ) : (
                          <Badge variant="secondary">নিয়মিত</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.status === "approved" ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/20">অনুমোদিত</Badge>
                        ) : e.status === "rejected" ? (
                          <Badge variant="destructive">প্রত্যাখ্যাত</Badge>
                        ) : (
                          <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/30">অপেক্ষমাণ</Badge>
                        )}
                      </TableCell>
                      {/* manager cell removed */}
                      <TableCell className="text-muted-foreground text-xs">{bnDate(e.sale_date)}</TableCell>
                      {showActions && (
                        <TableCell className="text-right">
                          {canEdit ? (
                            <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
                              <Button asChild size="icon" variant="ghost" className="h-8 w-8">
                                <Link to="/entries/$id/edit" params={{ id: e.id }} aria-label="এডিট">
                                  <Pencil className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={(ev) => { ev.stopPropagation(); onDelete?.(e); }}
                                aria-label="ডিলেট"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

