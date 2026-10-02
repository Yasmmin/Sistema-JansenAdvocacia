import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, PublicOnly, RequireAuth } from "@/features/auth/AuthProvider";
import { AppShell } from "@/layouts/AppShell";
import { routes } from "@/routes/paths";

const PainelPage = lazy(() => import("@/pages/PainelPage"));
const IntimacoesPage = lazy(() => import("@/pages/IntimacoesPage"));
const ClientesPage = lazy(() => import("@/pages/ClientesPage"));
const ClienteDetalhesPage = lazy(() => import("@/pages/ClienteDetalhesPage"));
const ProcessoDetalhesPage = lazy(() => import("@/pages/ProcessoDetalhesPage"));
const TarefasPage = lazy(() => import("@/pages/TarefasPage"));
const CalendarioPage = lazy(() => import("@/pages/CalendarioPage"));
const AudienciasPage = lazy(() => import("@/pages/AudienciasPage"));
const SajulbraPage = lazy(() => import("@/pages/SajulbraPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));

function PageFallback() {
  return <div className="grid min-h-[60vh] place-items-center text-sm font-medium text-slate-500">Carregando…</div>;
}

function AuthenticatedShell() {
  return <RequireAuth><AppShell><Outlet /></AppShell></RequireAuth>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path={routes.login} element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route element={<AuthenticatedShell />}>
          <Route path={routes.inicio} element={<Navigate to={routes.painel} replace />} />
          <Route path={routes.dashboard} element={<Navigate to={routes.painel} replace />} />
          <Route path={routes.painel} element={<PainelPage />} />
          <Route path={routes.intimacoes} element={<IntimacoesPage />} />
          <Route path={routes.clientes} element={<ClientesPage />} />
          <Route path={routes.cliente} element={<ClienteDetalhesPage />} />
          <Route path={routes.processoDoCliente} element={<ProcessoDetalhesPage />} />
          <Route path={routes.processo} element={<ProcessoDetalhesPage />} />
          <Route path={routes.tarefas} element={<TarefasPage />} />
          <Route path={routes.calendario} element={<CalendarioPage />} />
          <Route path={routes.audiencias} element={<AudienciasPage />} />
          <Route path={routes.sajulbra} element={<SajulbraPage />} />
          <Route path="*" element={<Navigate to={routes.painel} replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
