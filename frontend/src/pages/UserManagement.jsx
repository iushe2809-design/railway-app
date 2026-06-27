import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Trash2, KeyRound, Power } from "lucide-react";
import { toast } from "sonner";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [stations, setStations] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async () => {
    const [u, s] = await Promise.all([api.get("/admin/users"), api.get("/stations")]);
    setUsers(u.data);
    setStations(s.data);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = users.filter((u) => {
    if (filter === "admin" && u.role !== "admin") return false;
    if (filter === "sm" && u.role !== "sm") return false;
    if (filter === "inactive" && u.active) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.station_name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleActive = async (u) => {
    await api.put(`/admin/users/${u.id}`, { active: !u.active });
    toast.success(`${u.username} ${u.active ? "deactivated" : "activated"}`);
    load();
  };

  const resetPassword = async (u) => {
    const newPwd = prompt(`Set new password for ${u.username}:`);
    if (!newPwd) return;
    await api.put(`/admin/users/${u.id}`, { password: newPwd });
    toast.success("Password updated");
  };

  const remove = async (u) => {
    if (!confirm(`Delete ${u.username}?`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="user-management-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-blue-400 mb-2">User control</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Station Masters & Admins
          </h1>
        </div>
        <NewUserDialog stations={stations} onCreated={load} />
      </div>

      <div className="surface rounded-xl p-4 md:p-5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username, or station"
            className="bg-[#0B1120] border-slate-800 text-slate-100 pl-8"
            data-testid="users-search"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 sm:w-48" data-testid="users-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100">
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="admin">Admins only</SelectItem>
            <SelectItem value="sm">Station Masters</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-400 text-xs uppercase tracking-[0.12em]">
              <tr>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Station</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40" data-testid={`user-row-${u.username}`}>
                  <td className="px-5 py-3">
                    <div className="text-slate-100">{u.full_name}</div>
                    <div className="text-xs text-slate-500 font-mono">{u.username}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{u.station_name || "—"}</td>
                  <td className="px-5 py-3">
                    <Badge
                      variant="secondary"
                      className={
                        u.role === "admin"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/25"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                      }
                    >
                      {u.role === "admin" ? "Admin" : "Station Master"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {u.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resetPassword(u)}
                        className="text-slate-400 hover:text-white"
                        data-testid={`reset-pwd-${u.username}`}
                        aria-label="Reset password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive(u)}
                        className="text-slate-400 hover:text-white"
                        data-testid={`toggle-active-${u.username}`}
                        aria-label="Toggle active"
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(u)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        data-testid={`delete-user-${u.username}`}
                        aria-label="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewUserDialog({ stations, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "sm",
    station_id: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.username || !form.password || !form.full_name) {
      toast.error("Fill all required fields");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/users", {
        ...form,
        station_id: form.station_id || null,
      });
      toast.success("User created");
      setOpen(false);
      setForm({ username: "", password: "", full_name: "", role: "sm", station_id: "" });
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="new-user-btn">
          <Plus className="w-4 h-4 mr-1.5" /> New user
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription className="text-slate-400">
            Station Masters get assigned to one station.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v.toLowerCase() })} testid="new-user-username" />
          <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} testid="new-user-fullname" />
          <Field label="Password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} type="password" testid="new-user-password" />
          <div>
            <Label className="text-slate-300">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100">
                <SelectItem value="sm">Station Master</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.role === "sm" && (
            <div>
              <Label className="text-slate-300">Station</Label>
              <Select value={form.station_id} onValueChange={(v) => setForm({ ...form, station_id: v })}>
                <SelectTrigger className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1" data-testid="new-user-station">
                  <SelectValue placeholder="Select a station" />
                </SelectTrigger>
                <SelectContent className="bg-[#0B1120] border-slate-800 text-slate-100">
                  {stations.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-300">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="new-user-submit">
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text", testid }) {
  return (
    <div>
      <Label className="text-slate-300">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        data-testid={testid}
        className="bg-[#0B1120] border-slate-800 text-slate-100 mt-1"
      />
    </div>
  );
}
