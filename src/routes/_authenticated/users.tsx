import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, KeyRound, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  listAppUsers, createAppUser, updateAppUserPassword, updateAppUserRole, deleteAppUser,
} from "@/lib/users.functions";
import { bnDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "ইউজার ম্যানেজমেন্ট — CDB Bricks" }] }),
  component: UsersPage,
});

type AppUser = {
  id: string;
  email: string;
  created_at: string;
  full_name: string;
  phone: string;
  role: "admin" | "manager" | null;
};

function UsersPage() {
  const { data: me, loading } = useCurrentUser();
  const qc = useQueryClient();

  const list = useServerFn(listAppUsers);
  const create = useServerFn(createAppUser);
  const updPwd = useServerFn(updateAppUserPassword);
  const updRole = useServerFn(updateAppUserRole);
  const del = useServerFn(deleteAppUser);

  const usersQ = useQuery({
    queryKey: ["app-users"],
    queryFn: () => list() as Promise<AppUser[]>,
    enabled: !!me && me.role === "admin",
  });

  const [openCreate, setOpenCreate] = useState(false);
  const [pwdUser, setPwdUser] = useState<AppUser | null>(null);
  const [delUser, setDelUser] = useState<AppUser | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "manager" }) => updRole({ data: v }),
    onSuccess: () => { toast.success("ভূমিকা আপডেট হয়েছে"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (me?.role !== "admin") {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">এই পৃষ্ঠা শুধুমাত্র অ্যাডমিনদের জন্য।</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">ইউজার ম্যানেজমেন্ট</h2>
          <p className="text-sm text-muted-foreground">নতুন ইউজার যোগ করুন, পাসওয়ার্ড ও ভূমিকা পরিবর্তন করুন</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}><Plus className="mr-2 h-4 w-4" /> নতুন ইউজার</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">সকল ইউজার</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>নাম</TableHead>
                  <TableHead>ইমেইল</TableHead>
                  <TableHead>ফোন</TableHead>
                  <TableHead>ভূমিকা</TableHead>
                  <TableHead className="hidden sm:table-cell">যোগ হয়েছে</TableHead>
                  <TableHead className="text-right">অ্যাকশন</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQ.isLoading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  : (usersQ.data ?? []).map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.phone || "—"}</TableCell>
                      <TableCell>
                        <Select
                          value={u.role ?? "unassigned"}
                          onValueChange={(v) => {
                            if (v === "admin" || v === "manager") {
                              roleMut.mutate({ user_id: u.id, role: v });
                            }
                          }}
                          disabled={u.id === me.user.id}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue placeholder="ভূমিকা নেই" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned" disabled>
                              অনির্ধারিত
                            </SelectItem>
                            <SelectItem value="admin">অ্যাডমিন</SelectItem>
                            <SelectItem value="manager">ম্যানেজার</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{bnDate(u.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPwdUser(u)} aria-label="পাসওয়ার্ড">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDelUser(u)}
                            disabled={u.id === me.user.id}
                            aria-label="ডিলেট"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                {usersQ.data?.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">কোনো ইউজার নেই</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateUserDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreate={async (input) => {
          await create({ data: input });
          toast.success("ইউজার তৈরি হয়েছে");
          setOpenCreate(false);
          refresh();
        }}
      />

      <PasswordDialog
        user={pwdUser}
        onClose={() => setPwdUser(null)}
        onSave={async (pwd) => {
          if (!pwdUser) return;
          await updPwd({ data: { user_id: pwdUser.id, password: pwd } });
          toast.success("পাসওয়ার্ড পরিবর্তন হয়েছে");
          setPwdUser(null);
        }}
      />

      <AlertDialog open={!!delUser} onOpenChange={(o) => !o && setDelUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ইউজার মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{delUser?.full_name || delUser?.email}</span> স্থায়ীভাবে মুছে যাবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!delUser) return;
                try {
                  await del({ data: { user_id: delUser.id } });
                  toast.success("ইউজার মুছে ফেলা হয়েছে");
                  setDelUser(null);
                  refresh();
                } catch (err: any) { toast.error(err.message); }
              }}
            >মুছে ফেলুন</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateUserDialog({
  open, onClose, onCreate,
}: { open: boolean; onClose: () => void; onCreate: (i: { email: string; password: string; full_name: string; phone?: string; role: "admin" | "manager" }) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"admin" | "manager">("manager");
  const [busy, setBusy] = useState(false);

  function reset() { setEmail(""); setPassword(""); setFullName(""); setPhone(""); setRole("manager"); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserCog className="h-4 w-4" /> নতুন ইউজার</DialogTitle>
          <DialogDescription>নতুন অ্যাডমিন বা ম্যানেজার যোগ করুন</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>পূর্ণ নাম</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>ইমেইল</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ফোন (ঐচ্ছিক)</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>পাসওয়ার্ড (≥৬ অক্ষর)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>ভূমিকা</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "manager")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">ম্যানেজার</SelectItem>
                  <SelectItem value="admin">অ্যাডমিন</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>বাতিল</Button>
          <Button
            disabled={busy || !email || !password || !fullName || password.length < 6}
            onClick={async () => {
              setBusy(true);
              try { await onCreate({ email, password, full_name: fullName, phone: phone || undefined, role }); reset(); }
              catch (e: any) { toast.error(e.message); }
              finally { setBusy(false); }
            }}
          >{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}তৈরি করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onSave }: { user: AppUser | null; onClose: () => void; onSave: (pwd: string) => Promise<void> }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) { setPwd(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>পাসওয়ার্ড পরিবর্তন</DialogTitle>
          <DialogDescription>{user?.full_name || user?.email} এর জন্য নতুন পাসওয়ার্ড সেট করুন</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>নতুন পাসওয়ার্ড (≥৬ অক্ষর)</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setPwd(""); onClose(); }}>বাতিল</Button>
          <Button
            disabled={busy || pwd.length < 6}
            onClick={async () => {
              setBusy(true);
              try { await onSave(pwd); setPwd(""); }
              catch (e: any) { toast.error(e.message); }
              finally { setBusy(false); }
            }}
          >{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}সংরক্ষণ করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
