import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("rc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      const onLogin = window.location.pathname === "/login";
      if (!onLogin) {
        localStorage.removeItem("rc_token");
        localStorage.removeItem("rc_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export function getToken() {
  return localStorage.getItem("rc_token");
}

export function getUser() {
  const raw = localStorage.getItem("rc_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem("rc_token", token);
  localStorage.setItem("rc_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("rc_token");
  localStorage.removeItem("rc_user");
}

export function fileUrl(path) {
  const token = getToken();
  return `${API}/files/${path}?auth=${encodeURIComponent(token || "")}`;
}

export function publicFileUrl(path, shareToken) {
  return `${API}/files/${path}?share_token=${encodeURIComponent(shareToken)}`;
}
