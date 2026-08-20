import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { officialLanguageOptions, officialNavLinks } from "@/content/official-site";
import { useOfficialLanguage } from "@/hooks/use-official-language";

export function AppNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const atHome = path === "/" || path === "";
  const [email, setEmail] = useState<string | null>(null);
  const { content, language, setLanguage } = useOfficialLanguage();
  const navLinks = content.navLinks.length ? content.navLinks : officialNavLinks;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      router.invalidate();
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    toast.success(content.appNav.logoutSuccess);
    router.navigate({ to: "/login" });
  }
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 md:flex-nowrap md:gap-8 md:px-6">
        <button
          type="button"
          onClick={() => {
            if (atHome) return;
            if (window.history.length > 1) router.history.back();
            else router.navigate({ to: "/" });
          }}
          disabled={atHome}
          aria-label={content.appNav.backLabel}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md btn-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-wide">
            Buyna<span className="text-gradient"> AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((l) => {
            const active = path.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <div
            className="flex items-center rounded-md border border-border bg-secondary/40 p-0.5"
            aria-label={content.appNav.languageLabel}
          >
            {officialLanguageOptions.map((option) => {
              const active = option.code === language;
              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setLanguage(option.code)}
                  className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors md:text-[11px] ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={active}
                >
                  {option.shortLabel}
                </button>
              );
            })}
          </div>
          {email ? (
            <>
              <span className="hidden text-[11px] text-muted-foreground md:inline">{email}</span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3 w-3" /> {content.appNav.logout}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-md btn-primary px-3 py-1 text-[11px] font-semibold"
            >
              {content.appNav.sellerLogin}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
