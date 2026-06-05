import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [{ title: "গ্রাহক — CDB Bricks" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { data: me } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">গ্রাহক ব্যবস্থাপনা</h2>
          <p className="text-sm text-muted-foreground">সব গ্রাহকের তালিকা</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> নতুন গ্রাহক</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>নতুন গ্রাহক যোগ করুন</DialogTitle></DialogHeader>
              <NewCustomerForm onDone={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">গ্রাহক তালিকা</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>নাম</TableHead>
                  <TableHead>ফোন</TableHead>
                  <TableHead>ঠিকানা</TableHead>
                  <TableHead className="hidden sm:table-cell">যোগ হয়েছে</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 4 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : (q.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">কোনো গ্রাহক নেই</TableCell></TableRow>
                  ) : (q.data ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.address || "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{bnDate(c.created_at)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewCustomerForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("নাম দিন"); return; }
    setBusy(true);
    const { error } = await supabase.from("customers").insert({
      name: name.trim(), phone: phone || null, address: address || null, notes: notes || null,
      created_by: me?.user.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("গ্রাহক যুক্ত হয়েছে");
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["customers-count"] });
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5"><Label>নাম *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>ফোন</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>ঠিকানা</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
      <div className="space-y-1.5"><Label>মন্তব্য</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} সংরক্ষণ</Button>
    </form>
  );
}
