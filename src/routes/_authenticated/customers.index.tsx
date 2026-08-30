import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { sdb } from "@/lib/season-db";
import { fetchAllCustomers } from "@/lib/sales-queries";
import { useCurrentUser } from "@/lib/use-current-user";
import { bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "গ্রাহক ব্যবস্থাপনা — CDB Bricks" },
      { name: "description", content: "CDB Bricks-এর সকল গ্রাহকের তালিকা, যোগাযোগের তথ্য ও চালান ইতিহাস এক জায়গায় ব্যবস্থাপনা করুন।" },
      { property: "og:title", content: "গ্রাহক ব্যবস্থাপনা — CDB Bricks" },
      { property: "og:description", content: "CDB Bricks-এর সকল গ্রাহকের তালিকা, যোগাযোগের তথ্য ও চালান ইতিহাস এক জায়গায় ব্যবস্থাপনা করুন।" },
      { property: "og:url", content: "/customers" },
    ],
    links: [{ rel: "canonical", href: "/customers" }],
  }),
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
};

function CustomersPage() {
  const { data: me } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["customers-all"], queryFn: fetchAllCustomers });
  const canManage = !!me;

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    const { error } = await sdb.from("customers").delete().eq("id", deleting.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("গ্রাহক মুছে ফেলা হয়েছে");
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["customers-count"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">গ্রাহক ব্যবস্থাপনা</h1>
          <p className="text-sm text-muted-foreground">সব গ্রাহকের তালিকা</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> নতুন গ্রাহক</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>নতুন গ্রাহক যোগ করুন</DialogTitle></DialogHeader>
              <CustomerForm onDone={() => setOpen(false)} />
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
                  {canManage && <TableHead className="text-right">অ্যাকশন</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: canManage ? 5 : 4 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : (q.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={canManage ? 5 : 4} className="py-10 text-center text-sm text-muted-foreground">কোনো গ্রাহক নেই</TableCell></TableRow>
                  ) : (q.data ?? []).map((c) => (
                    <TableRow
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate({ to: "/customers/$id", params: { id: c.id } });
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        <Link to="/customers/$id" params={{ id: c.id }} className="block w-full text-primary underline-offset-2 hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.address || "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{bnDate(c.created_at)}</TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="এডিট" onClick={(e) => { e.stopPropagation(); setEditing(c as Customer); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="মুছে ফেলুন" onClick={(e) => { e.stopPropagation(); setDeleting(c as Customer); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>গ্রাহক এডিট করুন</DialogTitle></DialogHeader>
          {editing && <CustomerForm customer={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>গ্রাহক মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.name}" মুছে ফেলা হবে। যদি এই গ্রাহকের সাথে কোনো চালান যুক্ত থাকে তবে মুছে ফেলা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>বাতিল</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDelete(); }} disabled={busy} className="bg-destructive hover:bg-destructive/90">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} মুছে ফেলুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const isEdit = !!customer;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("নাম দিন"); return; }
    if (!isEdit) {
      if (!phone.trim()) { toast.error("মোবাইল নাম্বার দিন"); return; }
      if (!address.trim()) { toast.error("ঠিকানা দিন"); return; }
    }
    setBusy(true);
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes || null,
    };
    const { error } = isEdit
      ? await sdb.from("customers").update(payload).eq("id", customer!.id)
      : await sdb.from("customers").insert({ ...payload, created_by: me?.user.id ?? null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "গ্রাহক আপডেট হয়েছে" : "গ্রাহক যুক্ত হয়েছে");
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["customers-count"] });
    onDone();
  }

  const contactsSupported = !isEdit && typeof window !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

  async function pickContact() {
    try {
      // @ts-expect-error - Contact Picker API is not in TS lib yet
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (!contacts || contacts.length === 0) return;
      const c = contacts[0];
      const pickedName = Array.isArray(c.name) ? c.name[0] : c.name;
      const pickedTel = Array.isArray(c.tel) ? c.tel[0] : c.tel;
      if (pickedName) setName(String(pickedName));
      if (pickedTel) setPhone(String(pickedTel).replace(/\s+/g, ""));
      toast.success("কন্টাক্ট থেকে তথ্য নেওয়া হয়েছে");
    } catch (err: any) {
      toast.error("কন্টাক্ট অ্যাক্সেস ব্যর্থ — ম্যানুয়ালি লিখুন");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {contactsSupported && (
        <Button type="button" variant="outline" className="w-full" onClick={pickContact}>
          📱 ফোন কন্টাক্ট থেকে নির্বাচন করুন
        </Button>
      )}
      <div className="space-y-1.5"><Label>নাম *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>মোবাইল {!isEdit && "*"}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required={!isEdit} /></div>
      <div className="space-y-1.5"><Label>ঠিকানা {!isEdit && "*"}</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} required={!isEdit} /></div>
      <div className="space-y-1.5"><Label>মন্তব্য</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} সংরক্ষণ</Button>
    </form>
  );
}