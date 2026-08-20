import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/merchant/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { orders, bookings } = useStore();
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Merchant</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Orders & Bookings</h1>
      </div>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold">订单</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-4">订单号</th>
                <th className="py-2 pr-4">商品</th>
                <th className="py-2 pr-4">用户</th>
                <th className="py-2 pr-4">支付</th>
                <th className="py-2 pr-4">库存</th>
                <th className="py-2 pr-4">物流</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 pr-4 text-primary">{o.id}</td>
                  <td className="py-3 pr-4 font-sans">{o.productName}</td>
                  <td className="py-3 pr-4">{o.user}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                      {o.paid ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{o.stockDeducted ? "Stock deducted" : "—"}</td>
                  <td className="py-3 pr-4">
                    {o.fulfillment === "shipped" ? "Shipped" : "Waiting for shipment"}
                  </td>
                  <td className="py-3">
                    <button className="text-xs text-primary hover:underline">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass mt-6 rounded-2xl p-6">
        <h2 className="text-sm font-semibold">预约</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-4">预约号</th>
                <th className="py-2 pr-4">服务</th>
                <th className="py-2 pr-4">用户</th>
                <th className="py-2 pr-4">时间</th>
                <th className="py-2 pr-4">支付</th>
                <th className="py-2 pr-4">核销</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-3 pr-4 text-primary">{b.id}</td>
                  <td className="py-3 pr-4 font-sans">{b.serviceName}</td>
                  <td className="py-3 pr-4">{b.user}</td>
                  <td className="py-3 pr-4">{b.time}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                      {b.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{b.status}</td>
                  <td className="py-3">
                    <button className="text-xs text-primary hover:underline">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
