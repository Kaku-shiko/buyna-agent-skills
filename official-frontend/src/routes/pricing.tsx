import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Check, Sparkles } from "lucide-react";
import { fetchPublicPlans, type PublicPlan } from "@/lib/api";
import {
  formatOfficialJPY,
  isRecommendedSubscriptionPlan,
  officialSiteMeta,
  pricingPageContent as defaultPricingPageContent,
  subscriptionPlanFeatures as defaultSubscriptionPlanFeatures,
} from "@/content/official-site";
import { useOfficialLanguage } from "@/hooks/use-official-language";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: officialSiteMeta.pricing.title },
      {
        name: "description",
        content: officialSiteMeta.pricing.description,
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { content, language } = useOfficialLanguage();
  const pricingCopy = content.pricingPage ?? defaultPricingPageContent;
  const featuresByPlan = content.subscriptionPlanFeatures ?? defaultSubscriptionPlanFeatures;

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPublicPlans(ctrl.signal)
      .then((list) => {
        const active = list.filter((p) => p.is_active !== false);
        active.sort((a, b) => (a.monthly_price ?? 0) - (b.monthly_price ?? 0));
        setPlans(active);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> {pricingCopy.eyebrow}
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-5xl">
          {pricingCopy.title}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">{pricingCopy.description}</p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive md:col-span-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {pricingCopy.errorPrefix}
              {error}
            </span>
          </div>
        )}
        {!error && plans == null && (
          <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center text-xs text-muted-foreground md:col-span-2">
            {pricingCopy.loadingLabel}
          </div>
        )}
        {(plans ?? []).map((p) => {
          const isRecommended = isRecommendedSubscriptionPlan(p.code);
          const promoPrice = p.promotional_monthly_price ?? null;
          const promoMonths = p.promotional_months ?? 0;
          const originalPrice = p.display_original_monthly_price ?? p.monthly_price;
          return (
            <div
              key={p.code}
              className={`glass relative overflow-hidden rounded-2xl p-8 ${
                isRecommended ? "ring-2 ring-primary/60" : ""
              }`}
            >
              {isRecommended && (
                <div className="absolute right-4 top-4 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                  {pricingCopy.recommendedLabel}
                </div>
              )}
              <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {p.name}
              </div>
              {promoPrice != null && promoMonths > 0 ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-medium text-muted-foreground line-through">
                      {formatOfficialJPY(originalPrice, language)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {pricingCopy.intervalLabel}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1 text-primary">
                      <span className="text-[10px] font-medium uppercase tracking-wider">
                        {pricingCopy.promoPrefix}
                        {promoMonths}
                        {pricingCopy.promoMonthsSuffix}
                      </span>
                      <span className="text-4xl font-semibold">
                        {formatOfficialJPY(promoPrice, language)}
                      </span>
                      <span className="text-sm">{pricingCopy.intervalLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {promoMonths}
                      {pricingCopy.promoAfterSuffix} {formatOfficialJPY(p.monthly_price, language)}{" "}
                      {pricingCopy.intervalLabel}
                    </div>
                  </div>
                </>
              ) : originalPrice != null && originalPrice !== p.monthly_price ? (
                <>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-medium text-muted-foreground line-through">
                      {formatOfficialJPY(originalPrice, language)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {pricingCopy.intervalLabel}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1 text-primary">
                    <span className="text-4xl font-semibold">
                      {formatOfficialJPY(p.monthly_price, language)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {pricingCopy.intervalLabel}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-2 flex items-baseline gap-1 text-primary">
                  <span className="text-4xl font-semibold">
                    {formatOfficialJPY(p.monthly_price, language)}
                  </span>
                  <span className="text-sm text-muted-foreground">{pricingCopy.intervalLabel}</span>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">
                {pricingCopy.setupFeePrefix} {formatOfficialJPY(p.setup_fee, language)}
              </div>

              <ul className="mt-6 space-y-2 text-sm">
                {(featuresByPlan[p.code.toLowerCase()] ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-none text-primary" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/subscribe/$plan"
                params={{ plan: p.code }}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-lg py-3 text-sm font-semibold ${
                  isRecommended
                    ? "btn-primary"
                    : "border border-border bg-secondary/60 hover:bg-secondary"
                }`}
              >
                {pricingCopy.selectPrefix} {p.name}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-xs text-muted-foreground">{pricingCopy.footerNote}</p>
    </main>
  );
}
