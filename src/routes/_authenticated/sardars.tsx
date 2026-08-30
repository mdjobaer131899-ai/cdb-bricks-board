import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users2, Loader2, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { bn } from "@/lib/format";
import { useCurrentUser } from "@/lib/use-current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sardars")({
  head: () => ({
    meta: [
      { title: "সরদার — CDB Bricks" },
      { name: "description", content: "সরদার ও সরদার গ্রুপের তালিকা এবং কাঁচা ইটের হিসাব।" },
      { property: "og:title", content: "সরদার — CDB Bricks" },
      { property: "og:description", content: "সরদার ও সরদার গ্রুপের তালিকা এবং কাঁচা ইটের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SardarsPage,
});

type SardarForm = { id?: string; name: string; phone: string; address: string; group_id: string; note: string; is_active: boolean };
const NO_GROUP = "__none__";
const emptySardar: SardarForm = { name: "", phone: "", address: "", group_id: NO_GROUP, note: "", is_active: true };
type GroupForm = { id?: string; name: string; note: string };
const emptyGroup: GroupForm = { name: "", note: "" };

function SardarsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";
  const [search, setSearch] = useState("");
  const [dlg, setDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: SardarForm }>({ open: false, mode: "new", form: emptySardar });
  const [gDlg, setGDlg] = useState<{ open: boolean; mode: "new" | "edit"; form: GroupForm }>({ open: false, mode: "new", form: emptyGroup });

  const groupsQ = useQuery({
    queryKey: ["sardar-groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sardar_groups").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const sardarsQ = useQuery({
    queryKey: ["sardars"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sardars").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const kachaQ = useQuery({
    queryKey: ["kacha-by-sardar"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kacha_brick_entries").select("sardar_id,quantity,amount,entry_type");
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { qty: number; amount: number }>();
    (kachaQ.data ?? []).forEach((k: any) => {
      if (!k.sardar_id) return;
      const cur = m.get(k.sardar_id) ?? { qty: 0, amount: 0 };
      if (k.entry_type === "production") {
        cur.qty += Number(k.quantity || 0);
        cur.amount += Number(k.amount || 0);
      }
      m.set(k.sardar_id, cur);
    });
    return m;
  }, [kachaQ.data]);

  const groupName = (id: string | null) => (id ? (groupsQ.data ?? []).find((g: any) => g.id === id)?.name ?? "—" : "—");

  const filtered = useMemo(() => {
    const list = sardarsQ.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((s: any) => (s.name ?? "").toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q) || (s.address ?? "").toLowerCase().includes(q));
  }, [sardarsQ.data, search]);

  const saveSardar = useMutation({
    mutationFn: async () => {
      const f = dlg.form;
      if (!f.name.trim()) throw new Error("নাম দিন");
      const payload = {
        name: f.name.trim(),
        phone: f.phone || null,
        address: f.address || null,
        group_id: f.group_id === NO_GROUP ? null : f.group_id,
        note: f.note || null,
        is_active: f.is_active,
      };
      if (dlg.mode === "edit" && f.id) {
        const { error } = await supabase.from("sardars").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sardars").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setDlg({ open: false, mode: "new", form: emptySardar });
      qc.invalidateQueries({ queryKey: ["sardars"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delSardar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sardars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["sardars"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveGroup = useMutation({
    mutationFn: async () => {
      const f = gDlg.form;
      if (!f.name.trim()) throw new Error("গ্রুপের নাম দিন");
      const payload = { name: f.name.trim(), note: f.note || null };
      if (gDlg.mode === "edit" && f.id) {
        const { error } = await supabase.from("sardar_groups").update(payload).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sardar_groups").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("সংরক্ষিত");
      setGDlg({ open: false, mode: "new", form: emptyGroup });
      qc.invalidateQueries({ queryKey: ["sardar-groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sardar_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("মুছে ফেলা হয়েছে"); qc.invalidateQueries({ queryKey: ["sardar-groups"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl"><Users2 className="h-6 w-6 text-primary" /> সরদার</h1>
          <p className="text-sm text-muted-foreground">সরদার, গ্রুপ ও কাঁচা ইটের হিসাব</p>
        </div>
        {isAdmin && <Button onClick={() => setDlg({ open: true, mode: "new", form: emptySardar })}><Plus className="mr-1 h-4 w-4" /> নতুন সরদার</Button>}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">সরদার তালিকা</TabsTrigger>
          <TabsTrigger value="groups">গ্রুপ</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">সরদার</CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-8" placeholder="খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sardarsQ.isLoading ? (
                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো সরদার নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>নাম</TableHead>
                    <TableHead>গ্রুপ</TableHead>
                    <TableHead className="text-right">কাঁচা ইট</TableHead>
                    <TableHead className="text-right">মোট মজুরি</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((s: any) => {
                      const t = stats.get(s.id) ?? { qty: 0, amount: 0 };
                      return (
                        <TableRow key={s.id} className={s.is_active ? "" : "opacity-60"}>
                          <TableCell>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.phone || "—"}{s.address ? ` • ${s.address}` : ""}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{groupName(s.group_id)}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{bn(t.qty)}</TableCell>
                          <TableCell className="text-right tabular-nums">৳ {bn(t.amount)}</TableCell>
                          <TableCell className="text-right">
                            {isAdmin && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => setDlg({
                                  open: true, mode: "edit",
                                  form: { id: s.id, name: s.name, phone: s.phone ?? "", address: s.address ?? "", group_id: s.group_id ?? NO_GROUP, note: s.note ?? "", is_active: s.is_active },
                                })}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${s.name}" মুছে ফেলবেন?`)) delSardar.mutate(s.id); }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">সরদার গ্রুপ</CardTitle>
              {isAdmin && <Button size="sm" onClick={() => setGDlg({ open: true, mode: "new", form: emptyGroup })}><Plus className="mr-1 h-4 w-4" /> নতুন গ্রুপ</Button>}
            </CardHeader>
            <CardContent className="p-0">
              {(groupsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">কোনো গ্রুপ নেই</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>নাম</TableHead>
                    <TableHead>সদস্য</TableHead>
                    <TableHead>নোট</TableHead>
                    <TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(groupsQ.data ?? []).map((g: any) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium">{g.name}</TableCell>
                        <TableCell>{bn((sardarsQ.data ?? []).filter((s: any) => s.group_id === g.id).length)} জন</TableCell>
                        <TableCell>{g.note || "—"}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setGDlg({ open: true, mode: "edit", form: { id: g.id, name: g.name, note: g.note ?? "" } })}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`"${g.name}" মুছে ফেলবেন?`)) delGroup.mutate(g.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{dlg.mode === "edit" ? "সরদার সম্পাদনা" : "নতুন সরদার"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={dlg.form.name} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ফোন</Label><Input value={dlg.form.phone} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} /></div>
              <div>
                <Label>গ্রুপ</Label>
                <Select value={dlg.form.group_id} onValueChange={(v) => setDlg((s) => ({ ...s, form: { ...s.form, group_id: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_GROUP}>গ্রুপ নেই</SelectItem>
                    {(groupsQ.data ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>ঠিকানা</Label><Input value={dlg.form.address} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, address: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={dlg.form.note} onChange={(e) => setDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveSardar.mutate()} disabled={saveSardar.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gDlg.open} onOpenChange={(o) => setGDlg((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{gDlg.mode === "edit" ? "গ্রুপ সম্পাদনা" : "নতুন গ্রুপ"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>নাম</Label><Input value={gDlg.form.name} onChange={(e) => setGDlg((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} /></div>
            <div><Label>নোট</Label><Textarea rows={2} value={gDlg.form.note} onChange={(e) => setGDlg((s) => ({ ...s, form: { ...s.form, note: e.target.value } }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGDlg((s) => ({ ...s, open: false }))}>বাতিল</Button>
            <Button onClick={() => saveGroup.mutate()} disabled={saveGroup.isPending}>সংরক্ষণ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
