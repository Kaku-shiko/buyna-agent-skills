import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { verifyRecurringReturn } from "@/lib/buyna-recurring.functions";
import { useOfficialLanguage } from "@/hooks/use-official-language";

export const Route = createFileRoute("/subscription/return")({
  head: () => ({ meta: [{ title: "订阅结果 - Buyna.ai" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    agreement: typeof s.agreement === "string" ? s.agreement : "",
  }),
  component: ReturnPage,
});

function ReturnPage() {
  const { agreement } = Route.useSearch();
  const verify = useServerFn(verifyRecurringReturn);
  const { content } = useOfficialLanguage();
  const copy = content.subscriptionReturn;
  const [status, setStatus] = useState<
    "loading" | "active" | "pending" | "failed" | "unknown" | "error"
  >("loading");
  const [message, setMessage] = useState<string>("");

  const check = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    if (!agreement) {
      setStatus("error");
      setMessage(copy.missingAgreement);
      return;
    }
    try {
      const r = await verify({ data: { merchantAgreementId: agreement } });
      setStatus(r.status);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : copy.queryFailed);
    }
  }, [agreement, copy.missingAgreement, copy.queryFailed, verify]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      {status === "loading" && (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <h1 className="mt-4 text-lg font-semibold">{copy.loadingTitle}</h1>
        </>
      )}
      {status === "active" && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-xl font-semibold">{copy.activeTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.activeDescription}</p>
          <Link to="/" className="mt-6 inline-block text-sm text-primary underline">
            {copy.homeLink}
          </Link>
        </>
      )}
      {status === "pending" && (
        <>
          <Clock className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold">{copy.pendingTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.pendingDescription}</p>
          <button
            onClick={check}
            className="btn-primary mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {copy.retryLabel}
          </button>
        </>
      )}
      {status === "failed" && (
        <>
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">{copy.failedTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.failedDescription}</p>
          <Link to="/pricing" className="mt-6 inline-block text-sm text-primary underline">
            {copy.backToPricing}
          </Link>
        </>
      )}
      {status === "unknown" && (
        <>
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">{copy.unknownTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.unknownDescription}</p>
          <button
            onClick={check}
            className="btn-primary mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {copy.retryLabel}
          </button>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">{copy.errorTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message || copy.errorFallback}</p>
          <button
            onClick={check}
            className="btn-primary mt-6 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {copy.retryLabel}
          </button>
        </>
      )}
    </main>
  );
}
