import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CreditCard,
  Globe,
  Layers,
  Network,
  Package,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Zap,
} from "lucide-react";
import { AIShoppingGuideInline } from "@/components/AIShoppingGuideInline";
import { useOfficialLanguage } from "@/hooks/use-official-language";
import {
  formatOfficialJPY,
  homeAiGuideSection,
  homeEcosystemSection,
  homeHeroContent,
  homeMerchantSection,
  homePricingSection,
  homepageSubscriptionPlans,
  homeStats,
  homeWhyChooseSection,
  isRecommendedSubscriptionPlan,
  officialSiteMeta,
  subscriptionPlanFeatures,
  type OfficialIconName,
} from "@/content/official-site";

const officialIconMap = {
  bot: Bot,
  calendar: Calendar,
  creditCard: CreditCard,
  globe: Globe,
  layers: Layers,
  package: Package,
  store: Store,
  users: Users,
  zap: Zap,
} satisfies Record<OfficialIconName, typeof Bot>;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: officialSiteMeta.home.title },
      {
        name: "description",
        content: officialSiteMeta.home.description,
      },
      { property: "og:title", content: officialSiteMeta.home.title },
      {
        property: "og:description",
        content: officialSiteMeta.home.ogDescription,
      },
    ],
  }),
  component: Index,
});

function IconCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: OfficialIconName;
  title: string;
  description: string;
  badge?: string;
}) {
  const Icon = officialIconMap[icon];

  return (
    <div className="glass relative rounded-2xl p-6">
      {badge && (
        <div className="absolute right-4 top-4 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
          {badge}
        </div>
      )}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg btn-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SectionEyebrow({ icon: Icon, children }: { icon: typeof Bot; children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
      <Icon className="h-3 w-3 text-primary" /> {children}
    </div>
  );
}

function Index() {
  const { content, language } = useOfficialLanguage();

  return (
    <main className="mx-auto max-w-7xl px-6 pb-24 pt-16">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <SectionEyebrow icon={Sparkles}>{content.hero.eyebrow}</SectionEyebrow>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {content.hero.brand}
            <br />
            <span className="text-gradient">{content.hero.headline}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground">
            {content.hero.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/pricing"
              className="group inline-flex items-center gap-2 rounded-lg btn-primary px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              {content.hero.primaryCta}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              {content.hero.secondaryCta}
            </Link>
          </div>

          <div className="mt-12 grid max-w-lg grid-cols-3 gap-4">
            {content.stats.map((s) => (
              <div key={s.label} className="glass rounded-xl p-4">
                <div className="text-2xl font-semibold text-gradient">{s.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <AIShoppingGuideInline />
      </section>

      <section className="mt-24">
        <div className="text-center">
          <SectionEyebrow icon={Network}>{content.ecosystem.eyebrow}</SectionEyebrow>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
            {content.ecosystem.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            {content.ecosystem.description}
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {content.ecosystem.items.map((item) => (
            <IconCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              description={item.description}
              badge={item.badge}
            />
          ))}
        </div>
      </section>

      <section className="mt-24">
        <div className="text-center">
          <SectionEyebrow icon={Store}>{content.merchant.eyebrow}</SectionEyebrow>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
            {content.merchant.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            {content.merchant.description}
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {content.merchant.items.map((item) => (
            <IconCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              description={item.description}
            />
          ))}
        </div>
      </section>

      <section id="pricing" className="mt-24">
        <div className="text-center">
          <SectionEyebrow icon={CreditCard}>{content.pricing.eyebrow}</SectionEyebrow>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
            {content.pricing.title}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">{content.pricing.description}</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {homepageSubscriptionPlans.map((p) => {
            const recommended = isRecommendedSubscriptionPlan(p.code);
            const features = content.subscriptionPlanFeatures[p.code] ?? [];

            return (
              <div
                key={p.code}
                className={`glass relative overflow-hidden rounded-2xl p-8 ${
                  recommended ? "ring-2 ring-primary/60" : ""
                }`}
              >
                {recommended && (
                  <div className="absolute right-4 top-4 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                    {content.pricing.recommendedLabel}
                  </div>
                )}
                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  {p.name}
                </div>
                {p.original != null && p.original !== p.monthly ? (
                  <>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-medium text-muted-foreground line-through">
                        {formatOfficialJPY(p.original, language)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {content.pricing.intervalLabel}
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1 text-primary">
                      <span className="text-4xl font-semibold">
                        {formatOfficialJPY(p.monthly, language)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {content.pricing.intervalLabel}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold">
                      {formatOfficialJPY(p.monthly, language)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {content.pricing.intervalLabel}
                    </span>
                  </div>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  {`${content.pricing.setupPrefix} ${formatOfficialJPY(p.setup, language)} ${content.pricing.setupSuffix} · ${content.pricing.currencyLabel}`}
                </div>
                <ul className="mt-6 space-y-2 text-sm">
                  {features.map((f) => (
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
                    recommended
                      ? "btn-primary"
                      : "border border-border bg-secondary/60 hover:bg-secondary"
                  }`}
                >
                  {content.pricing.selectPrefix} {p.name}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {content.pricing.providerNote}
        </div>
      </section>

      <section className="mt-24">
        <div className="text-center">
          <SectionEyebrow icon={Bot}>{content.aiGuideSection.eyebrow}</SectionEyebrow>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight md:text-4xl">
            {content.aiGuideSection.title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            {content.aiGuideSection.description}
          </p>
        </div>

        <div className="glass relative mt-10 rounded-2xl p-8 text-center md:p-12">
          <div className="absolute right-4 top-4 rounded-full bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-wider text-primary">
            {content.aiGuideSection.badge}
          </div>
          <h3 className="text-xl font-semibold">{content.aiGuideSection.cardTitle}</h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            {content.aiGuideSection.cardDescription}
          </p>

          <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
            {content.aiGuideSection.steps.map((s) => (
              <div key={s.step} className="rounded-xl border border-border bg-background/40 p-5">
                <div className="text-xs font-semibold text-primary">{s.step}</div>
                <div className="mt-2 text-sm font-medium">{s.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {content.whyChoose.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {content.whyChoose.description}
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {content.whyChoose.items.map((item) => (
            <IconCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              description={item.description}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
