import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">设置</h1>
      <div className="glass rounded-xl p-5 text-sm">
        <h2 className="text-sm font-semibold">支付网关</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          GlobePay Japan · <code className="font-mono">https://pay.globepay.co.jp/api/v1.0</code>
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            <code>GLOBEPAY_PARTNER_CODE</code>、<code>GLOBEPAY_CREDENTIAL_CODE</code>{" "}
            仅存于服务器密钥库。
          </li>
          <li>
            异步回调 URL：<code className="font-mono">/api/public/globepay/notify</code>
          </li>
          <li>当前商户号不支持自动循环扣款；下一期月费需由管理员手动开单。</li>
        </ul>
      </div>
      <div className="glass rounded-xl p-5 text-sm">
        <h2 className="text-sm font-semibold">时间</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          数据库内统一 UTC。本后台所有列表与详情按 Asia/Tokyo 显示。
        </p>
      </div>
      <div className="glass rounded-xl p-5 text-sm">
        <h2 className="text-sm font-semibold">管理员账号</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          管理员账号由 Buyna.ai 内部通过 <code>user_roles</code> 表分配 <code>admin</code>{" "}
          角色后启用，不开放公开注册。
        </p>
      </div>
    </div>
  );
}
