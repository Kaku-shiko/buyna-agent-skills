import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/admin",
  }),
  head: () => ({ meta: [{ title: "管理员登录 — Buyna AI" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // If already signed in, redirect away
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirect, replace: true });
    });
  }, [navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const identifier = email.trim();
      const loginEmail = identifier.includes("@") ? identifier : `${identifier}@buyna.ai`;
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      toast.success("欢迎回来");
      navigate({ to: redirect, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setGoogleBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + redirect,
      });
      if (result.error) {
        toast.error(result.error.message || "Google 登录失败");
        setGoogleBusy(false);
        return;
      }
      if (result.redirected) return; // browser navigating away
      navigate({ to: redirect, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google 登录失败");
      setGoogleBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md flex-col justify-center px-6 py-10">
      <div className="glass rounded-2xl p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md btn-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Admin
            </div>
            <h1 className="text-lg font-semibold">官方管理员登录</h1>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3 text-sm">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              管理员账号
            </span>
            <input
              required
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
              placeholder="admin"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">密码</span>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 outline-none focus:border-primary"
              placeholder="至少 6 位"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-lg btn-primary py-3 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "处理中…" : "登录后台"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          或
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={googleBusy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background/40 py-2.5 text-sm font-medium hover:bg-background/70 disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.2-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.7 2.9l5.7-5.7C33.6 6.3 29 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 43.5c5 0 9.5-1.7 13-4.6l-6-4.9c-2 1.3-4.4 2-7 2-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.5 39.1 16.2 43.5 24 43.5z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.3 5.4l6 4.9C40 35.4 43.5 30.2 43.5 24c0-1.2-.1-2.3-.4-3.5z"
            />
          </svg>
          {googleBusy ? "正在跳转 Google…" : "使用 Google 登录"}
        </button>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          仅限官方管理员使用。此处不再开放商家注册。
        </p>

        <div className="mt-4 text-center text-[10px] text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
