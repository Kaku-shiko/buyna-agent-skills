import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Users, Repeat, CreditCard, Tag, ShieldAlert, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Buyna 管理后台" }] }),
  component: AdminLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/customers", label: "商家", icon: Users },
  { to: "/admin/projects", label: "套餐价格", icon: Tag },
  { to: "/admin/subscriptions", label: "订阅", icon: Repeat },
  { to: "/admin/recurring", label: "月度订阅", icon: Repeat },
  { to: "/admin/payments", label: "扣款记录", icon: CreditCard },
];

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setAllowed(false);
        return;
      }
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setAllowed(!!roleRow);
    })();
  }, []);

  if (allowed === null) {
    return <main className="mx-auto max-w-5xl p-10 text-sm text-muted-foreground">加载中…</main>;
  }
  if (!allowed) {
    return (
      <main className="mx-auto max-w-lg p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-yellow-500" />
        <h1 className="mt-4 text-xl font-semibold">无权访问</h1>
        <p className="mt-2 text-sm text-muted-foreground">仅 Buyna.ai 内部管理员可访问此后台。</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md border border-border bg-secondary/60 px-4 py-2 text-xs hover:bg-secondary"
        >
          返回首页
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
      <aside className="glass h-fit rounded-2xl p-4">
        <div className="mb-4 px-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Buyna 管理后台
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = n.exact
              ? path === "/admin" || path === "/admin/"
              : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to as "/admin"}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            );
          })}
          <button
            onClick={() => {
              supabase.auth.signOut().then(() => {
                toast.success("已退出管理员登录");
                navigate({ to: "/login" });
              });
            }}
            className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> 退出
          </button>
        </nav>
        <div className="mt-6 rounded-md border border-border bg-background/40 p-3 text-[10px] text-muted-foreground">
          时间显示：Asia/Tokyo
          <br />
          内部存储：UTC
        </div>
      </aside>
      <section>
        <Outlet />
      </section>
    </div>
  );
}
