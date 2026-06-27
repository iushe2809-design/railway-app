import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { getUser, clearSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Camera,
  FileBarChart2,
  Users,
  Train,
  Share2,
  LogOut,
  ClipboardList,
} from "lucide-react";

export default function Layout() {
  const user = getUser();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const links = isAdmin
    ? [
        { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true, id: "nav-overview" },
        { to: "/admin/inspections", label: "Inspections", icon: ClipboardList, id: "nav-inspections" },
        { to: "/admin/reports", label: "Reports", icon: FileBarChart2, id: "nav-reports" },
        { to: "/admin/users", label: "Users", icon: Users, id: "nav-users" },
        { to: "/admin/stations", label: "Stations", icon: Train, id: "nav-stations" },
        { to: "/admin/share-links", label: "Share Links", icon: Share2, id: "nav-share-links" },
      ]
    : [{ to: "/upload", label: "Upload", icon: Camera, id: "nav-upload" }];

  const logout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-40 border-b border-slate-800 bg-[#060B14]/85 backdrop-blur-md"
        data-testid="app-header"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
              <Train className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base sm:text-lg font-semibold tracking-tight truncate">
                Railway Cleanliness Inspector
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500 hidden sm:block">
                {isAdmin ? "Supervisor Console" : "Station Master Portal"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <div className="text-sm text-slate-200" data-testid="header-user-name">{user?.full_name}</div>
              <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500">
                {user?.role === "admin" ? "Super Admin" : user?.station_name || "Station Master"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              data-testid="logout-btn"
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4 mr-1.5" /> Logout
            </Button>
          </div>
        </div>
        <nav className="border-t border-slate-800 bg-[#060B14]/50">
          <div className="max-w-7xl mx-auto px-2 md:px-4 flex items-center gap-0.5 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={l.id}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 px-3 md:px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-blue-500 text-white"
                      : "border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/40"
                  }`
                }
              >
                <l.icon className="w-4 h-4" />
                {l.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
