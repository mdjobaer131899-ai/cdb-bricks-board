import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCog, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/staff-setup")({
  head: () => ({
    meta: [
      { title: "স্টাফ সেটআপ — CDB Bricks" },
      { name: "description", content: "স্টাফের ডিপার্টমেন্ট ও পদবির তালিকা ব্যবস্থাপনা।" },
      { property: "og:title", content: "স্টাফ সেটআপ — CDB Bricks" },
      { property: "og:description", content: "স্টাফের ডিপার্টমেন্ট ও পদবির তালিকা ব্যবস্থাপনা।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffSetupPage,
});

type Form = { id?: string; name: string; note: string };
const empty: Form = { name: "", note: "" };

function ListCard({
  title,
  table,
  queryKey,
  countField,
  isAdmin,
}: {
  title: string;
  table: "staff_departments" | "staff_designations";
  queryKey: string;
  countField: "department_id" | "designation_id";
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: Form }>({ open: false, mode: "new", form: empty });

  const listQ = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const workersQ = useQuery({
    queryKey: ["workers-assign"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workers").select("id,department_id,designation_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const f = dlg.form;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload = { name: f.name.trim(), note: f.note || null };
      if (dlg.mode === "edit" && f.id) {
        const { error } = await supabase.from(table).update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setDlg({ open: false, mode: "new", form: empty });
      qc.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: [queryKey] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {isAdmin && <Button size="sm" onClick={() => setDlg({ open: true, mode: "new", form: empty })}><Plus className="mr-1 h-4 w-4" /> নতুন</Button>}
      </CardHeader>
      <CardContent className="p-0">
        {listQ.isLoading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (listQ.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">তালিকা খালি</div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>নাম</TableHead>
              <TableHead>স্টাফ</TableHead>
              <TableHead>নোট</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(listQ.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{bn((workersQ.data ?? []).filter((w: any) => w[countField] === r.id).length)} জন</TableCell>
                  <TableCell>{r.note || "—"}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDlg({ open: true, mode: "edit", form: { id: r.id, name: r.name, note: r.note ?? "" } })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${r.name}" মুছে ফেলবেন?`)) del.mutate(r.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={dlg.form.name} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={dlg.form.note} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StaffSetupPage() {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><UserCog className="h-6 w-6 text-primary" /> স্টাফ সেটআপ</h1>
        <p className="text-sm text-muted-foreground">ডিপার্টমেন্ট ও পদবির তালিকা</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard title="ডিপার্টমেন্ট" table="staff_departments" queryKey="staff-departments" countField="department_id" isAdmin={isAdmin} />
        <ListCard title="পদবি" table="staff_designations" queryKey="staff-designations" countField="designation_id" isAdmin={isAdmin} />
      </div>
    </div>
  );
}
