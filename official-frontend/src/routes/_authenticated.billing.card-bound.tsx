import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/billing/card-bound")({
  head: () => ({ meta: [{ title: "Admin — Buyna.ai" }] }),
  component: PlaceholderPage,
});

function PlaceholderPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">This page is being rebuilt</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The subscription backend was migrated to a new data model (merchant_subscriptions /
        subscription_payment_attempts / recurring_charge_records). Admin views will be reconnected
        in a follow-up change.
      </p>
    </main>
  );
}
