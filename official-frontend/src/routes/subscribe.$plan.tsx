import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { fetchPublicPlans, type PublicPlan } from "@/lib/api";
import { startRecurringSubscription } from "@/lib/buyna-recurring.functions";
import { formatOfficialJPY, type SubscribeFieldKey } from "@/content/official-site";
import { useOfficialLanguage } from "@/hooks/use-official-language";

export const Route = createFileRoute("/subscribe/$plan")({
  head: () => ({
    meta: [
      { title: "开通订阅 - Buyna.ai" },
      { name: "description", content: "使用 GlobePay 信用卡月费扣款订阅 Buyna.ai。" },
    ],
  }),
  component: SubscribePage,
});

type Form = Record<SubscribeFieldKey, string>;

function emptyForm(country: string): Form {
  return {
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    company_address: "",
    country,
    website_url: "",
    notes: "",
  };
}

function SubscribePage() {
  const { plan: planCode } = Route.useParams();
  const { content, language } = useOfficialLanguage();
  const subscribeCopy = content.subscribePage;
  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(subscribeCopy.defaultCountry));
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const start = useServerFn(startRecurringSubscription);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPublicPlans(ctrl.signal)
      .then((list) => {
        const m = list.find((p) => p.code?.toLowerCase() === planCode.toLowerCase());
        if (m) setPlan(m);
        else
          setPlanError(
            `${subscribeCopy.missingPlanPrefix} ${planCode} ${subscribeCopy.missingPlanSuffix}`,
          );
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setPlanError(e.message);
      });
    return () => ctrl.abort();
  }, [planCode, subscribeCopy.missingPlanPrefix, subscribeCopy.missingPlanSuffix]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.country && prev.country !== "日本" && prev.country !== "Japan") return prev;
      return { ...prev, country: subscribeCopy.defaultCountry };
    });
  }, [subscribeCopy.defaultCountry]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.email.trim()) {
      setSubmitError(subscribeCopy.validationRequired);
      return;
    }
    if (!agree) {
      setSubmitError(subscribeCopy.validationAgreement);
      return;
    }
    setSubmitting(true);
    try {
      const res = await start({
        data: {
          planCode,
          company_name: form.company_name.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          company_address: form.company_address.trim(),
          country: form.country.trim(),
          website_url: form.website_url.trim(),
          notes: form.notes.trim(),
          agree,
        },
      });
      if (res?.payUrl) {
        window.location.href = res.payUrl;
      } else {
        setSubmitError(subscribeCopy.noPayUrl);
        setSubmitting(false);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : subscribeCopy.submitFailed);
      setSubmitting(false);
    }
  }

  if (planError) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{planError}</span>
        </div>
        <div className="mt-4">
          <Link to="/pricing" className="text-sm underline text-primary">
            {"<-"} {subscribeCopy.backToPricing}
          </Link>
        </div>
      </main>
    );
  }
  if (!plan)
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-sm text-muted-foreground">
        {subscribeCopy.loadingLabel}
      </main>
    );

  const title = [subscribeCopy.titlePrefix, plan.name, subscribeCopy.titleSuffix]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link to="/pricing" className="text-xs text-muted-foreground hover:text-foreground">
        {"<-"} {subscribeCopy.backToPricing}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {subscribeCopy.monthlyPrefix}{" "}
        <span className="font-medium text-primary">
          {formatOfficialJPY(plan.monthly_price, language)}
        </span>{" "}
        {subscribeCopy.monthlySuffix} · {subscribeCopy.monthlyDescription}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {subscribeCopy.fields.map(({ key, label, required, placeholder, multiline }) => (
            <label key={key} className={multiline ? "sm:col-span-2 block" : "block"}>
              <span className="text-xs text-muted-foreground">
                {label}
                {required && <span className="text-destructive"> *</span>}
              </span>
              {multiline ? (
                <textarea
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              ) : (
                <input
                  type={key === "email" ? "email" : "text"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  required={required}
                  className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              )}
            </label>
          ))}
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {subscribeCopy.agreementPrefix}
            <span className="mx-1 font-medium text-primary">
              {formatOfficialJPY(plan.monthly_price, language)}
            </span>
            {subscribeCopy.agreementSuffix}
          </span>
        </label>

        {submitError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          {submitting ? subscribeCopy.submittingLabel : subscribeCopy.submitLabel}
        </button>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> {subscribeCopy.cardSecurityNote}
        </div>
      </form>
    </main>
  );
}
