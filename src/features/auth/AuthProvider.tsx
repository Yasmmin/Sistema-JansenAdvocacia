import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { apiFetch } from "@/services/api";
import { routes } from "@/routes/paths";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "FRANCISCO" | "BRUNO" | "YASMIN";
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
let initialSessionRequest: Promise<AuthUser | null> | null = null;

function loadInitialSession() {
  initialSessionRequest ??= apiFetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Falha ao validar a sessão.");
    return await response.json() as AuthUser;
  });
  return initialSessionRequest;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadInitialSession()
      .then((sessionUser) => { if (active) setUser(sessionUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });

    const clearExpiredSession = () => setUser(null);
    window.addEventListener("jansen:unauthorized", clearExpiredSession);
    return () => {
      active = false;
      window.removeEventListener("jansen:unauthorized", clearExpiredSession);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "E-mail ou senha incorretos.");
      setUser(data.user);
    },
    async logout() {
      const response = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Não foi possível sair.");
      initialSessionRequest = Promise.resolve(null);
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}

function AuthLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f5f6f8]" role="status" aria-label="Validando sessão">
      <span className="size-8 animate-spin rounded-full border-2 border-[#0b2138]/20 border-t-[#d89b2b] motion-reduce:animate-none" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  return user ? children : <Navigate to={routes.login} replace state={{ from: location }} />;
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  return user ? <Navigate to={routes.painel} replace /> : children;
}
