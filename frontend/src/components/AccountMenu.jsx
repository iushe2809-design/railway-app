import { useState } from "react";
import api, { getUser, setSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const user = getUser();
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!currentPassword) {
      toast.error("Enter your current password to confirm");
      return;
    }
    if (!newUsername && !newPassword) {
      toast.error("Enter a new username or password");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/auth/change-credentials", {
        current_password: currentPassword,
        new_username: newUsername || undefined,
        new_password: newPassword || undefined,
      });
      if (res.data.token) {
        setSession(res.data.token, res.data.user);
      }
      toast.success("Credentials updated");
      setOpen(false);
      setNewUsername("");
      setNewPassword("");
      setCurrentPassword("");
      // Reload so header reflects new username
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-slate-800" data-testid="account-menu-btn">
          <UserCog className="w-4 h-4 mr-1.5" /> Account
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#0B1120] border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Change your credentials</DialogTitle>
          <DialogDescription className="text-slate-400">
            Keep the defaults or set your own. You&apos;ll stay signed in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-slate-300">Current username</Label>
            <div className="mt-1 h-10 px-3 rounded-md border border-slate-800 bg-[#060B14] text-slate-300 font-mono flex items-center">
              {user?.username}
            </div>
          </div>
          <div>
            <Label className="text-slate-300">New username (optional)</Label>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
              className="bg-[#060B14] border-slate-800 text-slate-100 mt-1"
              placeholder={user?.username}
              data-testid="account-new-username"
            />
          </div>
          <div>
            <Label className="text-slate-300">New password (optional)</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-[#060B14] border-slate-800 text-slate-100 mt-1"
              placeholder="Min 6 characters"
              data-testid="account-new-password"
            />
          </div>
          <div>
            <Label className="text-slate-300">Current password (required)</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="bg-[#060B14] border-slate-800 text-slate-100 mt-1"
              data-testid="account-current-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-slate-300">
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-500 hover:bg-blue-400 text-white" data-testid="account-save-btn">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
