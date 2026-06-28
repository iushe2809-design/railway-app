import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import api, { setSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Train, ShieldCheck, ScanLine, Sparkles } from "lucide-react";

const BG_IMAGE =
  "https://images.pexels.com/photos/29654961/pexels-photo-29654961.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", {
        username: username.trim(),
        password,
      });
      setSession(res.data.token, res.data.user);
      toast.success(`Welcome, ${res.data.user.full_name}`);
      const dest =
        location.state?.from?.pathname ||
        (res.data.user.role === "admin" ? "/admin" : "/upload");
      navigate(dest, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.detail || "Login failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#060B14]">
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src={BG_IMAGE}
          alt="Railway station at night"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#060B14]/95 via-[#060B14]/75 to-[#060B14]/40" />
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="relative h-full flex flex-col p-12">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-md bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <Train className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <div className="font-display text-xl font-semibold">My Clean Station</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Indian Railways
              </div>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="text-xs uppercase tracking-[0.25em] text-blue-400 mb-4">
              Operational Intelligence
            </div>
            <h1 className="font-display text-4xl xl:text-5xl font-bold tracking-tight leading-[1.05]">
              Vision-grade hygiene audits<br />for Indian Railways.
            </h1>
            <p className="mt-6 text-slate-400 leading-relaxed">
              Station Masters submit photos. Claude vision rates each frame.
              Supervisors get a control-room view of every platform, in real time.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-4">
              <Feature icon={ScanLine} title="Auto analysis" subtitle="Score, area breakdown & issues per photo" />
              <Feature icon={ShieldCheck} title="Overrule controls" subtitle="Supervisors can override AI verdicts" />
              <Feature icon={Sparkles} title="Date & station reports" subtitle="Filter by date range, drill into any station" />
            </div>
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-600">
            Secured · Mobile-ready · Built on Claude vision
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <Train className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">My Clean Station</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Indian Railways</div>
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.25em] text-blue-400 mb-3">
            Sign in
          </div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Welcome back.
          </h2>
          <p className="text-slate-400 mt-2">
            Use your assigned ID. Station Masters & supervisors only.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5" data-testid="login-form">
            <div>
              <Label htmlFor="username" className="text-slate-300">
                User ID
              </Label>
              <Input
                id="username"
                data-testid="login-username-input"
                placeholder="admin or sm001"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-2 h-11 bg-[#0B1120] border-slate-800 text-slate-50 placeholder:text-slate-500"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-slate-300">
                Password
              </Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 h-11 bg-[#0B1120] border-slate-800 text-slate-50 placeholder:text-slate-500"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-btn"
              className="w-full h-11 bg-blue-500 hover:bg-blue-400 text-white font-medium tracking-tight"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-8 surface rounded-md p-4 text-xs text-slate-400">
            <div className="uppercase tracking-[0.2em] text-slate-500 mb-2">Demo credentials</div>
            <div>Admin: <span className="text-slate-200 font-mono">admin / Admin@123</span></div>
            <div>SM: <span className="text-slate-200 font-mono">sm001 … sm045 / Station@123</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 surface rounded-md p-4">
      <div className="w-9 h-9 rounded bg-blue-500/15 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-blue-400" />
      </div>
      <div>
        <div className="text-sm font-medium text-slate-100">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}
