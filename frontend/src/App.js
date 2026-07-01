import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import api, { getUser, clearSession, setSession } from "@/lib/api";
import Login from "@/pages/Login";
import SMDashboard from "@/pages/SMDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminInspections from "@/pages/AdminInspections";
import InspectionDetail from "@/pages/InspectionDetail";
import Reports from "@/pages/Reports";
import UserManagement from "@/pages/UserManagement";
import StationManagement from "@/pages/StationManagement";
import ShareLinks from "@/pages/ShareLinks";
import PublicUpload from "@/pages/PublicUpload";
import Analytics from "@/pages/Analytics";
import Layout from "@/components/Layout";

function Protected({ children, role }) {
  const user = getUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/upload"} replace />;
  }
  return children;
}

function App() {
  const [, setUser] = useState(getUser());

  useEffect(() => {
    // Verify token still valid
    const token = localStorage.getItem("rc_token");
    if (token) {
      api
        .get("/auth/me")
        .then((res) => {
          setSession(token, res.data);
          setUser(res.data);
        })
        .catch(() => {
          clearSession();
          setUser(null);
        });
    }
  }, []);

  return (
    <div className="App min-h-screen bg-[#060B14] text-slate-50">
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: { background: "#0B1120", border: "1px solid #1E293B", color: "#F8FAFC" },
        }}
      />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/share/:token" element={<PublicUpload />} />

          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/upload" element={<SMDashboard />} />
            <Route path="/admin" element={<Protected role="admin"><AdminDashboard /></Protected>} />
            <Route path="/admin/inspections" element={<Protected role="admin"><AdminInspections /></Protected>} />
            <Route path="/admin/inspections/:id" element={<Protected role="admin"><InspectionDetail /></Protected>} />
            <Route path="/admin/reports" element={<Protected role="admin"><Reports /></Protected>} />
            <Route path="/admin/analytics" element={<Protected role="admin"><Analytics /></Protected>} />
            <Route path="/admin/users" element={<Protected role="admin"><UserManagement /></Protected>} />
            <Route path="/admin/stations" element={<Protected role="admin"><StationManagement /></Protected>} />
            <Route path="/admin/share-links" element={<Protected role="admin"><ShareLinks /></Protected>} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

function RootRedirect() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/upload"} replace />;
}

export default App;
