import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/AuthProvider";
import { routes } from "@/routes/paths";
import { apiUrl } from "@/services/api";

const googleErrors: Record<string, string> = {
  google_denied: "Esta conta Google não está autorizada a acessar o sistema.",
  google_domain_denied: "Use uma conta @jansenadvocacia.com.br para acessar o sistema.",
  google_invalid: "Não foi possível autenticar com o Google. Tente novamente.",
  google_not_configured: "O login com Google ainda não foi configurado.",
};

function BrandLockup() {
  return (
    <div className="flex flex-col items-center opacity-70" role="img" aria-label="Jansen Advocacia">
      <div className="size-[190px] overflow-hidden sm:size-[220px]">
        <img src="/jansen-logo-horizontal.png" alt="" aria-hidden="true" className="h-full max-w-none" />
      </div>
      <div className="mt-7 h-[84px] w-[234px] overflow-hidden sm:h-[92px] sm:w-[256px]">
        <img src="/jansen-logo-horizontal.png" alt="" aria-hidden="true" className="h-full max-w-none -translate-x-[84px] sm:-translate-x-[92px]" />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.35l-3.24-2.55c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.63A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.93A6.01 6.01 0 0 1 6.08 12c0-.67.12-1.32.32-1.93V7.44H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.56l3.34-2.63Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.34 2.63c.79-2.37 3-4.13 5.6-4.13Z" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(() => googleErrors[searchParams.get("error") || ""] || "");
  const [help, setHelp] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    setHelp(false);
    try {
      await login(String(form.get("email") || ""), String(form.get("password") || ""));
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from && from !== routes.login ? from : routes.painel, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "E-mail ou senha incorretos.");
    } finally {
      setSubmitting(false);
    }
  }

  function loginWithGoogle() {
    setError("");
    setHelp(false);
    window.location.assign(apiUrl("/api/auth/google"));
  }

  return (
    <main className="flex min-h-dvh overflow-hidden bg-[#f8f9fb]">
      <section className="relative hidden w-[55.6%] overflow-hidden bg-[#082238] text-white lg:flex lg:items-center lg:justify-center" aria-label="Jansen Advocacia">
        <img src="/login-architecture.png" alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover object-center" />
        <div className="absolute inset-0 bg-[#052139]/10" aria-hidden="true" />
        <div className="relative z-10 flex -translate-y-[1.5vh] flex-col items-center text-center">
          <BrandLockup />
          <span className="mt-7 block h-[3px] w-[76px] bg-[#d5a147]" aria-hidden="true" />
        </div>
      </section>

      <section className="relative flex min-h-dvh flex-1 items-center justify-center px-5 py-10 sm:px-10 lg:w-[44.4%]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#d69a2d] lg:hidden" aria-hidden="true" />
        <div className="w-full max-w-[545px] rounded-xl border border-[#e3e7eb] bg-white px-6 py-9 shadow-[0_16px_45px_rgba(27,47,65,0.07)] sm:px-12 sm:py-12 xl:px-[70px] xl:py-[72px]">
          <img src="/jansen-logo-horizontal.png" alt="Jansen Advocacia" className="mx-auto mb-8 h-auto w-[172px] brightness-0 lg:hidden" />
          <header className="text-center">
            <h1 className="font-serif text-[42px] font-normal leading-none tracking-[-0.04em] text-[#0b3148]">Bem-vindo</h1>
            <p className="mt-3 text-[16px] text-[#738599]">Acesse sua conta para continuar</p>
          </header>

          <form className="mt-10 space-y-5" onSubmit={submit} noValidate>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
            {help && <div role="status" className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-[#244a69]">Solicite ao administrador do sistema a redefinição da sua senha.</div>}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-[#24394d]">E-mail</Label>
              <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus placeholder="seu@jansenadvocacia.com.br" className="h-[52px] rounded-md border-[#cbd5df] bg-white px-4 text-base shadow-none focus-visible:border-[#245078] focus-visible:ring-[#245078]/15" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-[#24394d]">Senha</Label>
              <div className="relative">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-[52px] rounded-md border-[#cbd5df] bg-white px-4 pr-12 text-base shadow-none focus-visible:border-[#245078] focus-visible:ring-[#245078]/15" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-[#68788a] hover:bg-slate-100 hover:text-[#10263c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245078]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="mt-7 h-[56px] w-full rounded-md bg-gradient-to-r from-[#07364d] to-[#0a5269] text-[16px] font-semibold text-white shadow-none hover:from-[#0a4059] hover:to-[#12647d]">
              {submitting && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {submitting ? "Entrando…" : "Entrar"}
            </Button>

            <div className="flex items-center gap-4 py-1" aria-hidden="true">
              <span className="h-px flex-1 bg-[#dfe4e9]" />
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#8a98a8]">ou</span>
              <span className="h-px flex-1 bg-[#dfe4e9]" />
            </div>

            <Button type="button" variant="outline" disabled={submitting} onClick={loginWithGoogle} className="h-[52px] w-full gap-3 rounded-md border-[#cbd5df] bg-white text-[15px] font-semibold text-[#24394d] shadow-none hover:border-[#9eabb8] hover:bg-[#f8fafc]">
              <GoogleIcon />
              Continuar com Google corporativo
            </Button>

            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => { setHelp(true); setError(""); }} className="text-sm font-semibold text-[#2f6683] underline underline-offset-4 hover:text-[#184c68] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315f7c]">Esqueci minha senha</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
